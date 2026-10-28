#!/usr/bin/env python3
"""One-time compilation of public individual polls for the 3 Nov 2026 midterms.

Reads Wikipedia's published poll tables (not aggregator averages) and writes
public/data/polls.json. Re-run manually when updating the file. The site does
not fetch polls on its own, and this script is not part of CI.

Numbers are copied from the table cells. Missing sample sizes and margins of
error stay null. Aggregator rows (270toWin, Silver Bulletin, RCP, DDHQ,
FiftyPlusOne, and any "Average" line) are skipped.
"""

from __future__ import annotations

import json
import re
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "polls.json"
CACHE = Path("/tmp/poll-cache")
UA = "KongreskortetPollCompile/1.0 (one-time public poll table transcription)"
WINDOW_START = "2026-09-28"
WINDOW_END = "2026-10-28"
UPDATED = "2026-10-28"

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}

# General-election nominees as named in the Wikipedia poll headers.
# dem/rep are substrings that must appear with (D) / (R).
RACES = [
    ("AK", "2026 United States Senate election in Alaska", "Peltola", "Dan S."),
    ("FL", "2026 United States Senate special election in Florida", "Nixon", "Moody"),
    ("GA", "2026 United States Senate election in Georgia", "Ossoff", "Collins"),
    ("IA", "2026 United States Senate election in Iowa", "Turek", "Hinson"),
    ("KS", "2026 United States Senate election in Kansas", "Hamilton", "Marshall"),
    ("ME", "2026 United States Senate election in Maine", "Jackson", "Collins"),
    ("MI", "2026 United States Senate election in Michigan", "El-Sayed", "Rogers"),
    ("MN", "2026 United States Senate election in Minnesota", "Flanagan", "Tafoya"),
    ("NC", "2026 United States Senate election in North Carolina", "Cooper", "Whatley"),
    ("NH", "2026 United States Senate election in New Hampshire", "Pappas", "Sununu"),
    ("OH", "2026 United States Senate special election in Ohio", "Brown", "Husted"),
    ("SC", "2026 United States Senate election in South Carolina", "Andrews", "Graham"),
    ("TX", "2026 United States Senate election in Texas", "Talarico", "Paxton"),
]

GENERIC_TITLE = "Template:2026 United States elections/polling"
GENERIC_LISTING = "https://en.wikipedia.org/wiki/2026_United_States_elections#Polling"


def fetch_wikitext(title: str) -> tuple[str, int]:
    CACHE.mkdir(parents=True, exist_ok=True)
    key = re.sub(r"[^A-Za-z0-9._-]+", "_", title)[:180]
    cache_path = CACHE / f"{key}.json"
    if cache_path.exists():
        cached = json.loads(cache_path.read_text())
        return cached["text"], cached["revid"]
    params = urllib.parse.urlencode({
        "action": "parse",
        "page": title,
        "prop": "wikitext",
        "format": "json",
        "redirects": 1,
    })
    req = urllib.request.Request(
        "https://en.wikipedia.org/w/api.php?" + params,
        headers={"User-Agent": UA},
    )
    with urllib.request.urlopen(req, timeout=90, context=ssl.create_default_context()) as response:
        payload = json.load(response)
    text = payload["parse"]["wikitext"]["*"]
    rev_params = urllib.parse.urlencode({
        "action": "query",
        "titles": payload["parse"].get("title") or title,
        "prop": "revisions",
        "rvprop": "ids",
        "format": "json",
        "redirects": 1,
    })
    rev_req = urllib.request.Request(
        "https://en.wikipedia.org/w/api.php?" + rev_params,
        headers={"User-Agent": UA},
    )
    with urllib.request.urlopen(rev_req, timeout=60, context=ssl.create_default_context()) as response:
        rev_payload = json.load(response)
    pages = rev_payload["query"]["pages"]
    page = next(iter(pages.values()))
    revid = int(page["revisions"][0]["revid"])
    cache_path.write_text(json.dumps({"revid": revid, "text": text}))
    return text, revid


def oldid_url(title: str, revid: int) -> str:
    params = urllib.parse.urlencode({"title": title, "oldid": str(revid)})
    return "https://en.wikipedia.org/w/index.php?" + params


def split_top(text: str, sep: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    i = 0
    curly = 0
    link = 0
    while i < len(text):
        if text.startswith("{{", i):
            curly += 1
            buf.append("{{")
            i += 2
            continue
        if text.startswith("}}", i) and curly:
            curly -= 1
            buf.append("}}")
            i += 2
            continue
        if text.startswith("[[", i):
            link += 1
            buf.append("[[")
            i += 2
            continue
        if text.startswith("]]", i) and link:
            link -= 1
            buf.append("]]")
            i += 2
            continue
        if text[i] == sep and curly == 0 and link == 0:
            parts.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(text[i])
        i += 1
    parts.append("".join(buf))
    return parts


def remove_templates(text: str) -> str:
    out: list[str] = []
    i = 0
    while i < len(text):
        if text.startswith("{{", i):
            depth = 1
            j = i + 2
            while j < len(text) and depth:
                if text.startswith("{{", j):
                    depth += 1
                    j += 2
                elif text.startswith("}}", j):
                    depth -= 1
                    j += 2
                else:
                    j += 1
            i = j
            continue
        out.append(text[i])
        i += 1
    return "".join(out)


def link_text(text: str) -> str:
    return re.sub(r"\[\[([^\[\]]+)\]\]", lambda match: match.group(1).split("|")[-1], text)


def visible(text: str) -> str:
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    text = re.sub(
        r"\{\{\s*(?:nowrap|small|nobold|nobr)\s*\|([^{}]*)\}\}",
        r"\1",
        text,
        flags=re.I,
    )
    text = re.sub(r"<ref\b[^>]*>.*?</ref>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<ref\b[^>]*/>", " ", text, flags=re.I)
    text = remove_templates(text)
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = link_text(text)
    text = text.replace("'''", "").replace("''", "")
    text = text.replace("&nbsp;", " ").replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip(" |")
    return text.strip()


def ref_map(text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    pattern = re.compile(
        r"<ref\s+name\s*=\s*(?:\"([^\"]+)\"|'([^']+)'|([^\s>/]+))\s*>",
        flags=re.I,
    )
    for match in pattern.finditer(text):
        name = match.group(1) or match.group(2) or match.group(3)
        end = text.lower().find("</ref>", match.end())
        if end < 0:
            continue
        if name not in found:
            found[name] = text[match.end():end]
    return found


def expand_refs(text: str, refs: dict[str, str]) -> str:
    def repl(match: re.Match[str]) -> str:
        return refs.get(match.group(2), "")

    return re.sub(
        r"<ref\s+name\s*=\s*([\"'])(.+?)\1\s*/>",
        repl,
        text,
        flags=re.I,
    )


def source_from(cell: str, refs: dict[str, str]) -> tuple[str | None, str | None]:
    raw = expand_refs(cell, refs)
    url_match = re.search(r"[|]\s*url\s*=\s*(\S+?)(?:\s*[|}])", raw, flags=re.I)
    title_match = re.search(r"[|]\s*title\s*=\s*([^|}]+)", raw, flags=re.I)
    url = url_match.group(1).strip() if url_match else None
    title = visible(title_match.group(1)) if title_match else None
    if url and url.startswith("//"):
        url = "https:" + url
    if not url:
        tweet = re.search(
            r"\{\{\s*cite tweet\b([^}]*)\}\}",
            raw,
            flags=re.I,
        )
        if tweet:
            body = tweet.group(1)
            user = re.search(r"[|]\s*user\s*=\s*([^|}]+)", body, flags=re.I)
            number = re.search(r"[|]\s*number\s*=\s*(\d+)", body, flags=re.I)
            if user and number:
                url = f"https://x.com/{visible(user.group(1))}/status/{number.group(1)}"
                if not title:
                    title_match = re.search(r"[|]\s*title\s*=\s*([^|}]+)", body, flags=re.I)
                    title = visible(title_match.group(1)) if title_match else "Opslag på X"
    if url:
        url = url.rstrip(".,")
    return url, title or None


def cell_body(raw: str) -> str:
    parts = split_top(raw.strip(), "|")
    index = 0
    while index < len(parts) - 1:
        part = parts[index].strip()
        if re.match(r"^(rowspan|colspan|style|align|valign|class|scope|width|bgcolor)\b", part, re.I):
            index += 1
            continue
        if re.match(r"^\{\{\s*[Pp]arty shading\b", part):
            index += 1
            continue
        break
    return parts[index] if index < len(parts) else raw


def row_cells(row: str) -> list[str]:
    lines = row.replace("||", "\n|").replace("!!", "\n!").splitlines()
    kept = []
    for index, line in enumerate(lines):
        # `|- valign=bottom` leaves the attribute on the first line. It is not a cell.
        if index == 0 and not re.match(r"\s*[!|]", line):
            continue
        kept.append(line)
    text = "\n".join(kept)
    if not text.startswith("\n"):
        text = "\n" + text
    chunks = re.split(r"\n\s*[!|]", text)
    cells = []
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk or chunk == "-" or chunk.startswith("- "):
            continue
        if chunk.startswith('{|') or chunk.startswith("|}"):
            continue
        cells.append(chunk)
    return cells


def extract_tables(text: str) -> list[str]:
    tables = []
    pos = 0
    while True:
        start = text.find("{|", pos)
        if start < 0:
            break
        depth = 0
        i = start
        end = None
        while i < len(text):
            if text.startswith("{|", i):
                depth += 1
                i += 2
                continue
            if text.startswith("|}", i):
                depth -= 1
                i += 2
                if depth == 0:
                    end = i
                    break
                continue
            i += 1
        if end is None:
            break
        tables.append(text[start:end])
        pos = end
    return tables


def apply_rowspan(rows: list[list[str]]) -> list[list[str]]:
    pending: dict[int, list] = {}
    output = []
    for raw_cells in rows:
        col = 0
        consumed = 0
        result: list[str] = []
        while consumed < len(raw_cells) or col in pending:
            if col in pending:
                result.append(pending[col][0])
                pending[col][1] -= 1
                if pending[col][1] <= 0:
                    del pending[col]
                col += 1
                continue
            if consumed >= len(raw_cells):
                break
            cell = raw_cells[consumed]
            consumed += 1
            result.append(cell)
            match = re.search(r"rowspan\s*=\s*\"?(\d+)", cell, flags=re.I)
            span = int(match.group(1)) if match else 1
            if span > 1:
                pending[col] = [cell, span - 1]
            col += 1
        if result:
            output.append(result)
    return output


def table_rows(table: str) -> list[list[str]]:
    parts = re.split(r"\n\|-", table)
    parsed = []
    for part in parts:
        if "{|" in part:
            part = part.split("{|", 1)[-1]
        cells = row_cells(part)
        if cells:
            parsed.append(cells)
    return apply_rowspan(parsed)


def iso(year: str, month_name: str, day: str) -> str | None:
    month = MONTHS.get(month_name.lower())
    if not month:
        return None
    return f"{int(year):04d}-{month:02d}-{int(day):02d}"


def parse_dates(text: str) -> tuple[str | None, str | None]:
    cleaned = visible(text).replace("–", "-").replace("—", "-").replace("−", "-")
    cleaned = re.sub(r"\s+", " ", cleaned)
    match = re.search(
        r"([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*-\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})",
        cleaned,
    )
    if match:
        return iso(match.group(3), match.group(1), match.group(2)), iso(match.group(6), match.group(4), match.group(5))
    match = re.search(
        r"([A-Za-z]+)\s+(\d{1,2})\s*-\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})",
        cleaned,
    )
    if match:
        return iso(match.group(5), match.group(1), match.group(2)), iso(match.group(5), match.group(3), match.group(4))
    match = re.search(r"([A-Za-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2}),\s*(\d{4})", cleaned)
    if match:
        return iso(match.group(4), match.group(1), match.group(2)), iso(match.group(4), match.group(1), match.group(3))
    match = re.search(r"([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})", cleaned)
    if match:
        day = iso(match.group(3), match.group(1), match.group(2))
        return day, day
    return None, None


def parse_sample(text: str) -> tuple[int | None, str | None]:
    cleaned = visible(text)
    pop_match = re.search(r"\((LV|RV|A|V)\)", cleaned)
    population = pop_match.group(1) if pop_match else None
    number = re.search(r"(\d[\d,]*)", cleaned)
    sample = int(number.group(1).replace(",", "")) if number else None
    return sample, population


def parse_moe(text: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)\s*%", visible(text))
    if not match:
        return None
    return float(match.group(1))


def parse_pct(text: str) -> float | None:
    cleaned = visible(text)
    if re.search(r"<\s*\d", cleaned):
        return None
    match = re.search(r"(\d+(?:\.\d+)?)\s*%", cleaned)
    if not match:
        return None
    return float(match.group(1))


def as_number(value: float | None):
    if value is None:
        return None
    if abs(value - round(value)) < 1e-9:
        return int(round(value))
    return round(value, 2)


def footnote_blobs(raw_row: str) -> list[str]:
    return re.findall(r"\{\{[Ee]fn[^{}]*\}\}", raw_row)


def variant_of(raw_row: str) -> str | None:
    blobs = " ".join(footnote_blobs(raw_row))
    if re.search(r"name\s*=\s*\"?Strict\"?", blobs):
        return "strict"
    if re.search(r"name\s*=\s*\"?Loose\"?", blobs):
        return "loose"
    if re.search(r"name\s*=\s*\"?lean\"?|leaners", blobs, flags=re.I):
        return "leaners"
    if re.search(r"two-way|tovej", blobs, flags=re.I):
        return "two-way"
    return None


def hypothetical_row(raw_row: str) -> bool:
    return any(re.search(r"hypothetical", blob, flags=re.I) for blob in footnote_blobs(raw_row))


def ranked_choice(raw_row: str) -> bool:
    return bool(re.search(r"name\s*=\s*\"?First\"?", raw_row))


def sponsor_of(name: str) -> str | None:
    flags = set(re.findall(r"\(([DR])\)", name))
    if flags == {"D"}:
        return "D"
    if flags == {"R"}:
        return "R"
    return None


def pollster_key(name: str) -> str:
    key = re.sub(r"\s*\([DR]\)", "", name)
    key = re.sub(r"[^a-z0-9]+", " ", key.lower()).strip()
    return key


def header_index(headers: list[str], pred) -> int | None:
    for index, header in enumerate(headers):
        if pred(header):
            return index
    return None


def general_election_chunk(text: str) -> str:
    match = re.search(r"^==\s*General election\s*==\s*$", text, flags=re.I | re.M)
    if not match:
        return ""
    rest = text[match.end():]
    nxt = re.search(r"^==[^=].*==\s*$", rest, flags=re.M)
    chunk = rest[: nxt.start()] if nxt else rest
    return without_banned_sections(chunk)


def without_banned_sections(chunk: str) -> str:
    pattern = re.compile(r"^(=+)\s*(.*?)\s*\1\s*$", re.M)
    pieces = []
    cursor = 0
    skipping_until = None
    for match in pattern.finditer(chunk):
        heading = match.group(2).strip().lower()
        level = len(match.group(1))
        if skipping_until is not None:
            if level <= skipping_until:
                skipping_until = None
            else:
                cursor = match.end()
                continue
        if any(token in heading for token in ("ranked-choice", "ranked choice", "exit poll")):
            pieces.append(chunk[cursor:match.start()])
            skipping_until = level
            cursor = match.end()
            continue
    if skipping_until is None:
        pieces.append(chunk[cursor:])
    return "".join(pieces)


def parse_poll_table(table: str, refs: dict[str, str], dem_key: str | None, rep_key: str | None):
    rows = table_rows(table)
    if not rows:
        return []
    header_row = None
    header_at = None
    for index, row in enumerate(rows):
        labels = [visible(cell_body(cell)).lower() for cell in row]
        if any("poll source" in label for label in labels) and not any("aggregation" in label for label in labels):
            header_row = labels
            header_at = index
            break
    if header_row is None:
        return []
    if any("aggregation" in label for label in header_row):
        return []

    def meta(label: str) -> bool:
        return any(token in label for token in (
            "poll source", "date", "sample", "margin of error", "other", "undecided", "lead",
        )) or label.strip() in {"margin", "other/undecided"}

    source_i = header_index(header_row, lambda label: "poll source" in label)
    date_i = header_index(header_row, lambda label: "date" in label)
    sample_i = header_index(header_row, lambda label: "sample" in label)
    moe_i = header_index(header_row, lambda label: "margin" in label and "error" in label)
    if None in (source_i, date_i, sample_i, moe_i):
        return []

    dem_i = rep_i = None
    if dem_key is None:
        dem_i = header_index(header_row, lambda label: "democratic" in label)
        rep_i = header_index(header_row, lambda label: "republican" in label)
        dem_name = "Demokraterne"
        rep_name = "Republikanerne"
    else:
        dem_name = rep_name = None
        for index, label in enumerate(header_row):
            dem_party = "(d)" in label or "(dfl)" in label
            rep_party = "(r)" in label and "(dfl)" not in label
            if dem_key.lower() in label and dem_party:
                dem_i = index
                dem_name = visible(cell_body(rows[header_at][index]))
            if rep_key.lower() in label and rep_party:
                rep_i = index
                rep_name = visible(cell_body(rows[header_at][index]))
        if dem_i is None or rep_i is None:
            return []
    if dem_i is None or rep_i is None:
        return []

    other_indexes = [
        index for index, label in enumerate(header_row)
        if index not in {source_i, date_i, sample_i, moe_i, dem_i, rep_i} and not meta(label)
    ]
    parsed = []
    for row in rows[header_at + 1:]:
        if len(row) <= max(source_i, date_i, sample_i, moe_i, dem_i, rep_i):
            continue
        pollster = visible(cell_body(row[source_i]))
        if not pollster or pollster.lower() in {"average", "poll average"}:
            continue
        start, end = parse_dates(cell_body(row[date_i]))
        if not start or not end:
            continue
        sample, population = parse_sample(cell_body(row[sample_i]))
        moe = parse_moe(cell_body(row[moe_i]))
        dem = parse_pct(cell_body(row[dem_i]))
        rep = parse_pct(cell_body(row[rep_i]))
        if dem is None or rep is None:
            continue
        raw = "\n".join(row)
        if hypothetical_row(raw):
            continue
        multi = False
        for index in other_indexes:
            if index < len(row) and parse_pct(cell_body(row[index])) is not None:
                multi = True
                break
        url, title = source_from(row[source_i], refs)
        parsed.append({
            "pollster": pollster,
            "pollsterKey": pollster_key(pollster),
            "sponsor": sponsor_of(pollster),
            "fieldStart": start,
            "fieldEnd": end,
            "sampleSize": sample,
            "population": population,
            "marginOfError": as_number(moe),
            "democratPct": as_number(dem),
            "republicanPct": as_number(rep),
            "democratName": re.sub(r"\s+", " ", dem_name or "").strip(),
            "republicanName": re.sub(r"\s+", " ", rep_name or "").strip(),
            "variant": variant_of(raw),
            "rankedChoiceFirst": ranked_choice(raw),
            "multicandidate": multi,
            "sourceUrl": url,
            "sourceTitle": title,
        })
    return parsed


def in_window(row: dict) -> bool:
    return WINDOW_START <= row["fieldEnd"] <= WINDOW_END


def dedupe(rows: list[dict]) -> list[dict]:
    kept = []
    seen = set()
    for row in rows:
        key = (
            row.get("state"),
            row["pollsterKey"],
            row["fieldStart"],
            row["fieldEnd"],
            row.get("population"),
            row.get("democratPct"),
            row.get("republicanPct"),
            row.get("variant"),
            row.get("sampleSize"),
            row.get("rankedChoiceFirst"),
            row.get("multicandidate"),
        )
        if key in seen:
            continue
        seen.add(key)
        kept.append(row)
    return kept


def rmg_from_release() -> list[dict]:
    """Napolitan's 13–14 Oct 2026 release states several cuts. Wikipedia's single
    RV 51–43 cell does not match the LV headline, so the release is transcribed
    directly and the Wikipedia row is dropped."""
    url = "https://napolitannews.org/posts/generic-ballot-likely-voters-dem-54-gop-43"
    common = {
        "pollster": "RMG Research",
        "pollsterKey": "rmg research",
        "sponsor": None,
        "fieldStart": "2026-10-13",
        "fieldEnd": "2026-10-14",
        "democratName": "Demokraterne",
        "republicanName": "Republikanerne",
        "rankedChoiceFirst": False,
        "multicandidate": False,
        "sourceUrl": url,
        "sourceTitle": "Generic Ballot, Likely Voters: Dem 54, GOP 43",
    }
    cuts = [
        ("LV", None, None, 54, 43, "leaners"),
        ("LV", None, None, 52, 41, None),
        ("RV", 2000, 2.2, 51, 43, "leaners"),
        ("RV", 2000, 2.2, 48, 40, None),
    ]
    rows = []
    for population, sample, moe, dem, rep, variant in cuts:
        row = dict(common)
        row.update({
            "population": population,
            "sampleSize": sample,
            "marginOfError": moe,
            "democratPct": dem,
            "republicanPct": rep,
            "variant": variant,
        })
        rows.append(row)
    return rows


def compile_generic() -> tuple[list[dict], str]:
    text, revid = fetch_wikitext(GENERIC_TITLE)
    refs = ref_map(text)
    rows = []
    for table in extract_tables(text):
        rows.extend(parse_poll_table(table, refs, None, None))
    rows = [row for row in rows if row["pollsterKey"] != "rmg research"]
    rows.extend(rmg_from_release())
    listing = oldid_url(GENERIC_TITLE, revid)
    kept = []
    for row in dedupe(rows):
        if not in_window(row):
            continue
        row["state"] = None
        if row["pollsterKey"] == "rmg research":
            row["listingUrl"] = row["sourceUrl"]
            row["listingLabel"] = "Napolitan News Service"
        else:
            row["listingUrl"] = listing
            row["listingLabel"] = "Wikipedia, generisk kongresmåling"
        kept.append(row)
    kept.sort(key=lambda row: (row["fieldEnd"], row["pollster"]), reverse=True)
    return kept, listing


def compile_senate() -> list[dict]:
    compiled = []
    for abbr, title, dem_key, rep_key in RACES:
        text, revid = fetch_wikitext(title)
        chunk = general_election_chunk(text)
        if not chunk:
            print(f"MISSING general election: {abbr} {title}")
            continue
        refs = ref_map(text)
        rows = []
        for table in extract_tables(chunk):
            rows.extend(parse_poll_table(table, refs, dem_key, rep_key))
        listing = oldid_url(title, revid)
        matched = [row for row in dedupe(rows) if in_window(row)]
        if not matched:
            dated = [row["fieldEnd"] for row in rows if row.get("fieldEnd")]
            latest = max(dated) if dated else "ingen tabel"
            print(f"NO WINDOW POLLS {abbr} latest={latest} tables_rows={len(rows)}")
        for row in matched:
            row["state"] = abbr
            row["listingUrl"] = listing
            row["listingLabel"] = f"Wikipedia, senatsvalg i {abbr}"
            compiled.append(row)
        print(f"{abbr}: {len(matched)} polls in window")
    compiled.sort(key=lambda row: (row["state"], row["fieldEnd"], row["pollster"]), reverse=True)
    return compiled


def assign_ids(rows: list[dict], prefix: str) -> None:
    for index, row in enumerate(rows, start=1):
        state = row["state"] or "US"
        pop = row.get("population") or "na"
        variant = row.get("variant") or "base"
        row["id"] = f"{prefix}-{state}-{index}-{row['fieldEnd']}-{pop}-{variant}"


def main() -> None:
    generic, generic_listing = compile_generic()
    senate = compile_senate()
    assign_ids(generic, "g")
    assign_ids(senate, "s")
    suspicious = []
    for row in generic + senate:
        dem = row["democratPct"]
        rep = row["republicanPct"]
        if dem is not None and rep is not None and dem + rep > 100.5:
            suspicious.append(row["id"] + f" {dem}+{rep}")
        if not row.get("sourceUrl"):
            suspicious.append(row["id"] + " mangler direkte kilde-URL")
    payload = {
        "updated": UPDATED,
        "election": "2026-11-03",
        "windowStart": WINDOW_START,
        "windowEnd": WINDOW_END,
        "compilation": "manual",
        "compilationNote": (
            "Engangsindlæsning 28. oktober 2026 fra Wikipedias offentlige tabeller over "
            "enkelte meningsmålinger. Aggregater og prognoser er ikke kopieret. "
            "Tomme felter manglede i tabellen. Siden henter ikke målinger automatisk."
        ),
        "genericListingUrl": generic_listing,
        "publicListingUrl": GENERIC_LISTING,
        "generic": generic,
        "senate": senate,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"generic {len(generic)} senate {len(senate)} suspicious {len(suspicious)}")
    for line in suspicious:
        print(" !", line)


if __name__ == "__main__":
    main()
