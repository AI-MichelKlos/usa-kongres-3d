#!/usr/bin/env python3
"""Build and check the compact Congress JSON used by Kongreskortet.

Membership comes only from legislators-current. Nothing in here invents a
person. House seat counts are the 2020 Census apportionment (U.S. Census
Bureau), in effect from the 118th Congress. Senate classes are the fixed
staggered-term assignment and are used only to name a vacant class when one
of a state's two senators is missing from the source. Both tables are checked
against the downloaded file.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "public" / "data" / "congress.json"

CANONICAL_SOURCE = "https://unitedstates.github.io/congress-legislators/legislators-current.json"
SOURCE_REPO = "https://github.com/unitedstates/congress-legislators"
SOURCE_URLS = (
    CANONICAL_SOURCE,
    "https://raw.githubusercontent.com/unitedstates/congress-legislators/gh-pages/legislators-current.json",
)

# 2020 Census apportionment. Sum must be 435.
APPORTIONMENT = {
    "AL": 7, "AK": 1, "AZ": 9, "AR": 4, "CA": 52, "CO": 8, "CT": 5, "DE": 1,
    "FL": 28, "GA": 14, "HI": 2, "ID": 2, "IL": 17, "IN": 9, "IA": 4, "KS": 4,
    "KY": 6, "LA": 6, "ME": 2, "MD": 8, "MA": 9, "MI": 13, "MN": 8, "MS": 4,
    "MO": 8, "MT": 2, "NE": 3, "NV": 4, "NH": 2, "NJ": 12, "NM": 3, "NY": 26,
    "NC": 14, "ND": 1, "OH": 15, "OK": 5, "OR": 6, "PA": 17, "RI": 2, "SC": 7,
    "SD": 1, "TN": 9, "TX": 38, "UT": 4, "VT": 1, "VA": 11, "WA": 10, "WV": 2,
    "WI": 8, "WY": 1,
}

# Fixed Senate class pair for each state (classes 1, 2 and 3).
SENATE_CLASSES = {
    "AK": (2, 3), "AL": (2, 3), "AR": (2, 3), "AZ": (1, 3), "CA": (1, 3),
    "CO": (2, 3), "CT": (1, 3), "DE": (1, 2), "FL": (1, 3), "GA": (2, 3),
    "HI": (1, 3), "IA": (2, 3), "ID": (2, 3), "IL": (2, 3), "IN": (1, 3),
    "KS": (2, 3), "KY": (2, 3), "LA": (2, 3), "MA": (1, 2), "MD": (1, 3),
    "ME": (1, 2), "MI": (1, 2), "MN": (1, 2), "MO": (1, 3), "MS": (1, 2),
    "MT": (1, 2), "NC": (2, 3), "ND": (1, 3), "NE": (1, 2), "NH": (2, 3),
    "NJ": (1, 2), "NM": (1, 2), "NV": (1, 3), "NY": (1, 3), "OH": (1, 3),
    "OK": (2, 3), "OR": (2, 3), "PA": (1, 3), "RI": (1, 2), "SC": (2, 3),
    "SD": (2, 3), "TN": (1, 2), "TX": (1, 2), "UT": (1, 3), "VA": (1, 2),
    "VT": (1, 3), "WA": (1, 3), "WI": (1, 3), "WV": (1, 2), "WY": (1, 2),
}

VOTING_STATES = set(APPORTIONMENT)


def congress_number(day: date) -> int:
    """Congress in session on `day`. Terms begin 3 January of odd years."""
    start_year = day.year if day.year % 2 == 1 else day.year - 1
    if day < date(start_year, 1, 3):
        start_year -= 2
    return (start_year - 1789) // 2 + 1


def parse_day(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def term_is_current(term: dict, today: date) -> bool:
    """The dataset's term end is the day the next term starts, so it is exclusive."""
    start = parse_day(term.get("start"))
    end = parse_day(term.get("end"))
    if start is None or end is None:
        return False
    return start <= today < end


def current_party(term: dict, today: date) -> tuple[str | None, str | None]:
    """Party covering `today`. Affiliations override a stale term-level party.

    Affiliation end dates in this dataset are the last day of that party, so
    they are inclusive. If several overlap, the one that started latest wins.
    """
    chosen: tuple[date, dict] | None = None
    for aff in term.get("party_affiliations") or []:
        if not isinstance(aff, dict):
            continue
        start = parse_day(aff.get("start"))
        if start is None or start > today:
            continue
        end = parse_day(aff.get("end")) if aff.get("end") else None
        if aff.get("end") and end is None:
            continue
        if end is not None and today > end:
            continue
        if chosen is None or start >= chosen[0]:
            chosen = (start, aff)
    if chosen:
        aff = chosen[1]
        party = aff.get("party") or term.get("party")
        caucus = aff.get("caucus") or term.get("caucus")
        return _clean_str(party), _clean_str(caucus)
    return _clean_str(term.get("party")), _clean_str(term.get("caucus"))


def active_term(person: dict, today: date) -> dict | None:
    best = None
    for term in person.get("terms") or []:
        if not isinstance(term, dict):
            continue
        if term.get("type") not in ("sen", "rep"):
            continue
        if not term_is_current(term, today):
            continue
        if best is None or str(term.get("start") or "") >= str(best.get("start") or ""):
            best = term
    return best


def clean_url(url) -> str | None:
    if not isinstance(url, str):
        return None
    url = url.strip()
    if url.startswith("https://") or url.startswith("http://"):
        return url
    return None


def _clean_str(value) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def member_record(person: dict, term: dict, today: date) -> dict:
    party, caucus = current_party(term, today)
    name = person.get("name") or {}
    official = _clean_str(name.get("official_full"))
    first = _clean_str(name.get("first")) or ""
    last = _clean_str(name.get("last")) or ""
    if not official:
        official = " ".join(part for part in (first, last) if part) or "Ukendt navn"
    rec = {
        "bioguide": person["id"]["bioguide"],
        "name": official,
        "first": first,
        "last": last,
        "party": party,
        "termStart": term.get("start"),
        "termEnd": term.get("end"),
    }
    if caucus:
        rec["caucus"] = caucus
    url = clean_url(term.get("url"))
    if url:
        rec["url"] = url
    if term.get("type") == "rep":
        district = term.get("district")
        rec["district"] = int(district) if isinstance(district, int) and not isinstance(district, bool) else None
    else:
        senate_class = term.get("class")
        if isinstance(senate_class, int) and not isinstance(senate_class, bool):
            rec["senateClass"] = int(senate_class)
        rank = _clean_str(term.get("state_rank"))
        if rank:
            rec["stateRank"] = rank
    return rec


def house_vacancies(members: list[dict], seats: int) -> list[dict]:
    """Name missing districts only when the seated set is a clean subset of 1..N.

    At-large states (one seat) use district 0 in the source. A missing single
    seat is therefore reported as district 0. If the numbers don't line up,
    the vacancy is listed without a district so we don't invent one.
    """
    missing_count = seats - len(members)
    if missing_count <= 0:
        return []
    if seats == 1:
        return [{"district": 0, "inferred": True}]
    districts = [m.get("district") for m in members]
    if any(not isinstance(d, int) or isinstance(d, bool) for d in districts):
        return [{"district": None, "inferred": False} for _ in range(missing_count)]
    expected = set(range(1, seats + 1))
    counts = Counter(districts)
    if any(n > 1 for n in counts.values()) or any(d not in expected for d in districts):
        return [{"district": None, "inferred": False} for _ in range(missing_count)]
    missing = sorted(expected - set(districts))
    if len(missing) != missing_count:
        return [{"district": None, "inferred": False} for _ in range(missing_count)]
    return [{"district": d, "inferred": True} for d in missing]


def senate_vacancies(abbr: str, members: list[dict], warnings: list[str]) -> list[dict]:
    missing_count = 2 - len(members)
    if missing_count < 0:
        warnings.append(
            f"{abbr}: kilden har {len(members)} senatorer. De vises alle; ingen plads er skjult."
        )
        return []
    expected = set(SENATE_CLASSES[abbr])
    classes = []
    for member in members:
        senate_class = member.get("senateClass")
        if not isinstance(senate_class, int):
            warnings.append(f"{abbr}: en senator mangler klasse i kilden. Ledige pladser vises uden klassenummer.")
            return [{"senateClass": None, "inferred": False} for _ in range(missing_count)]
        classes.append(senate_class)
    if any(c not in expected for c in classes) or len(classes) != len(set(classes)):
        warnings.append(
            f"{abbr}: senatsklasse stemmer ikke med den faste inddeling. Ledige pladser vises uden klassenummer."
        )
        return [{"senateClass": None, "inferred": False} for _ in range(missing_count)]
    missing = sorted(expected - set(classes))
    if len(missing) != missing_count:
        return [{"senateClass": None, "inferred": False} for _ in range(missing_count)]
    return [{"senateClass": c, "inferred": True} for c in missing]


def _house_sort(member: dict):
    district = member.get("district")
    return (district is None, district if isinstance(district, int) else 999, member.get("name") or "")


def _senate_sort(member: dict):
    senate_class = member.get("senateClass")
    return (senate_class is None, senate_class if isinstance(senate_class, int) else 9, member.get("name") or "")


def build_payload(raw: list, today: date, retrieved_from: str, fetched_at: str) -> dict:
    if not isinstance(raw, list):
        raise ValueError("legislators-current skal være en liste")

    warnings: list[str] = []
    states = {
        abbr: {
            "houseSeats": seats,
            "senateClasses": list(SENATE_CLASSES[abbr]),
            "senate": [],
            "house": [],
            "senateVacancies": [],
            "houseVacancies": [],
        }
        for abbr, seats in sorted(APPORTIONMENT.items())
    }
    delegates: list[dict] = []
    unplaced: list[dict] = []
    seen: dict[str, str] = {}

    for person in raw:
        if not isinstance(person, dict):
            warnings.append("Sprang et element over, der ikke er et objekt.")
            continue
        bioguide = ((person.get("id") or {}).get("bioguide"))
        if not isinstance(bioguide, str) or not bioguide.strip():
            warnings.append("Sprang en person over uden bioguide-id.")
            continue
        term = active_term(person, today)
        if term is None:
            label = ((person.get("name") or {}).get("official_full")) or bioguide
            warnings.append(f"Sprang {label} over: ingen periode dækker {today.isoformat()}.")
            continue
        state = _clean_str(term.get("state"))
        if not state:
            warnings.append(f"{bioguide} har ingen stat på den aktuelle periode.")
            continue
        try:
            rec = member_record(person, term, today)
        except (KeyError, TypeError, ValueError) as exc:
            warnings.append(f"Kunne ikke læse {bioguide}: {exc}")
            continue
        if bioguide in seen:
            warnings.append(f"Bioguide {bioguide} optræder mere end én gang. Den seneste periode beholdes.")
        seen[bioguide] = state

        kind = term.get("type")
        if kind == "sen" and state in VOTING_STATES:
            states[state]["senate"].append(rec)
        elif kind == "rep" and state in VOTING_STATES:
            states[state]["house"].append(rec)
        elif kind == "rep":
            rec["state"] = state
            delegates.append(rec)
        else:
            rec["state"] = state
            rec["type"] = kind
            unplaced.append(rec)
            warnings.append(f"{rec['name']} ({state}) kunne ikke placeres som senator, repræsentant eller delegeret.")

    for abbr, state in states.items():
        state["senate"].sort(key=_senate_sort)
        state["house"].sort(key=_house_sort)
        state["senateVacancies"] = senate_vacancies(abbr, state["senate"], warnings)
        state["houseVacancies"] = house_vacancies(state["house"], state["houseSeats"])
        if len(state["house"]) > state["houseSeats"]:
            warnings.append(
                f"{abbr}: kilden har {len(state['house'])} repræsentanter og {state['houseSeats']} mandater. Alle vises."
            )

    delegates.sort(key=lambda m: (m.get("state") or "", m.get("name") or ""))
    unplaced.sort(key=lambda m: m.get("name") or "")

    return {
        "fetchedAt": fetched_at,
        "asOf": today.isoformat(),
        "source": CANONICAL_SOURCE,
        "sourceRepo": SOURCE_REPO,
        "retrievedFrom": retrieved_from,
        "congress": congress_number(today),
        "recordVersion": 1,
        "apportionment": {
            "houseSeats": 435,
            "senateSeats": 100,
            "note": "Huspladser er folketællingen 2020 (U.S. Census Bureau). Senatet har to pladser pr. stat.",
        },
        "states": states,
        "delegates": delegates,
        "unplaced": unplaced,
        "warnings": warnings,
    }


def validate_payload(payload: dict) -> None:
    """Raise ValueError if the compact file breaks its contract."""
    if payload.get("recordVersion") != 1:
        raise ValueError("recordVersion skal være 1")
    if not isinstance(payload.get("fetchedAt"), str):
        raise ValueError("fetchedAt mangler")
    datetime.fromisoformat(payload["fetchedAt"].replace("Z", "+00:00"))
    as_of = parse_day(payload.get("asOf"))
    if as_of is None:
        raise ValueError("asOf er ikke en dato")
    if payload.get("congress") != congress_number(as_of):
        raise ValueError("kongresnummer stemmer ikke med asOf")
    if payload.get("source") != CANONICAL_SOURCE:
        raise ValueError("kilden er ændret")
    states = payload.get("states")
    if not isinstance(states, dict) or set(states) != VOTING_STATES:
        raise ValueError("states skal være præcis de 50 delstater")
    if sum(APPORTIONMENT.values()) != 435:
        raise ValueError("apportionment summer ikke til 435")
    if set(SENATE_CLASSES) != VOTING_STATES:
        raise ValueError("senatsklasser dækker ikke de 50 stater")
    for classes in SENATE_CLASSES.values():
        if sorted(classes) != sorted(set(classes)) or any(c not in (1, 2, 3) for c in classes) or len(classes) != 2:
            raise ValueError(f"ugyldigt klassepar: {classes}")

    seen = []
    for abbr, state in states.items():
        if state.get("houseSeats") != APPORTIONMENT[abbr]:
            raise ValueError(f"{abbr}: huspladser afviger fra folketællingen 2020")
        if tuple(state.get("senateClasses") or ()) != tuple(SENATE_CLASSES[abbr]):
            raise ValueError(f"{abbr}: senatsklasser afviger")
        senate = state.get("senate") or []
        house = state.get("house") or []
        s_vac = state.get("senateVacancies") or []
        h_vac = state.get("houseVacancies") or []
        if len(senate) <= 2 and len(senate) + len(s_vac) != 2:
            raise ValueError(f"{abbr}: senatspladser går ikke op")
        if len(senate) > 2 and s_vac:
            raise ValueError(f"{abbr}: overskydende senatorer og ledige pladser samtidig")
        seats = state["houseSeats"]
        if len(house) <= seats and len(house) + len(h_vac) != seats:
            raise ValueError(f"{abbr}: huspladser går ikke op ({len(house)} + {len(h_vac)} != {seats})")
        if len(house) > seats and h_vac:
            raise ValueError(f"{abbr}: overskydende repræsentanter og ledige pladser samtidig")
        _check_people(abbr, senate, seen, "sen")
        _check_people(abbr, house, seen, "rep")
        for vac in h_vac:
            district = vac.get("district")
            if district is not None and (not isinstance(district, int) or district < 0 or district > seats):
                raise ValueError(f"{abbr}: ugyldigt ledigt distrikt {district}")
        for vac in s_vac:
            senate_class = vac.get("senateClass")
            if senate_class is not None and senate_class not in SENATE_CLASSES[abbr]:
                raise ValueError(f"{abbr}: ugyldig ledig senatsklasse {senate_class}")

    for person in payload.get("delegates") or []:
        if person.get("state") in VOTING_STATES:
            raise ValueError(f"delegeret ligger i en delstat: {person.get('state')}")
        _check_person(person, seen)
    for person in payload.get("unplaced") or []:
        _check_person(person, seen)
    if len(seen) != len(set(seen)):
        raise ValueError("bioguide-id er ikke unikt")


def _check_people(abbr: str, people: list, seen: list, kind: str) -> None:
    districts = []
    classes = []
    for person in people:
        _check_person(person, seen)
        if kind == "rep":
            district = person.get("district")
            if district is not None:
                districts.append(district)
        else:
            senate_class = person.get("senateClass")
            if senate_class is not None:
                if senate_class not in SENATE_CLASSES[abbr]:
                    raise ValueError(f"{abbr}: senator {person.get('bioguide')} har klasse {senate_class}")
                classes.append(senate_class)
    if len(districts) != len(set(districts)):
        raise ValueError(f"{abbr}: to repræsentanter har samme distrikt")
    if len(classes) != len(set(classes)):
        raise ValueError(f"{abbr}: to senatorer har samme klasse")


def _check_person(person: dict, seen: list) -> None:
    bioguide = person.get("bioguide")
    if not isinstance(bioguide, str) or not bioguide.strip():
        raise ValueError("medlem uden bioguide")
    seen.append(bioguide)
    if not isinstance(person.get("name"), str) or not person["name"].strip():
        raise ValueError(f"{bioguide} mangler navn")
    url = person.get("url")
    if url is not None and clean_url(url) != url:
        raise ValueError(f"{bioguide} har en url der ikke er http(s)")
    party = person.get("party")
    if party is not None and not isinstance(party, str):
        raise ValueError(f"{bioguide} har et parti der ikke er tekst")


def dump_payload(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def summarize(payload: dict) -> str:
    def tally(people: list[dict]) -> Counter:
        counts: Counter = Counter()
        for person in people:
            party = person.get("party") or "unknown"
            counts[party] += 1
            if party not in ("Democrat", "Republican") and person.get("caucus"):
                counts[f"caucus:{person['caucus']}"] += 1
        return counts

    house = []
    senate = []
    h_vac = 0
    s_vac = 0
    vacancy_labels = []
    for abbr, state in payload["states"].items():
        house.extend(state["house"])
        senate.extend(state["senate"])
        h_vac += len(state["houseVacancies"])
        s_vac += len(state["senateVacancies"])
        for vac in state["houseVacancies"]:
            district = vac.get("district")
            label = f"{abbr}-{district}" if isinstance(district, int) else abbr
            vacancy_labels.append(label)
    ht = tally(house)
    st = tally(senate)
    lines = [
        f"Kongres {payload['congress']} pr. {payload['asOf']} (hentet {payload['fetchedAt']})",
        (
            "Hus (stemmeberettigede): "
            f"D {ht['Democrat']}, R {ht['Republican']}, U {ht['Independent']}, "
            f"andre {sum(n for k, n in ht.items() if k not in ('Democrat', 'Republican', 'Independent') and not str(k).startswith('caucus') and k != 'unknown')}, "
            f"uoplyst {ht['unknown']}, ledige {h_vac}, "
            f"i alt {len(house) + h_vac} af 435"
        ),
        f"  uafhængige i caucus: D {ht['caucus:Democrat']}, R {ht['caucus:Republican']}",
        f"  ledige huspladser: {', '.join(vacancy_labels) if vacancy_labels else 'ingen'}",
        (
            "Senat: "
            f"D {st['Democrat']}, R {st['Republican']}, U {st['Independent']}, "
            f"ledige {s_vac}, i alt {len(senate) + s_vac} af 100"
        ),
        f"  uafhængige i caucus: D {st['caucus:Democrat']}, R {st['caucus:Republican']}",
        f"Delegerede: {len(payload.get('delegates') or [])}",
        f"Uplacerede: {len(payload.get('unplaced') or [])}",
        f"Advarsler: {len(payload.get('warnings') or [])}",
    ]
    for warning in payload.get("warnings") or []:
        lines.append(f"  - {warning}")
    return "\n".join(lines)


def run_self_tests() -> None:
    assert congress_number(date(2026, 10, 28)) == 119
    assert congress_number(date(2025, 1, 3)) == 119
    assert congress_number(date(2025, 1, 2)) == 118
    assert congress_number(date(2027, 1, 2)) == 119
    assert congress_number(date(2027, 1, 3)) == 120
    assert sum(APPORTIONMENT.values()) == 435

    assert term_is_current({"start": "2025-01-03", "end": "2027-01-03"}, date(2026, 10, 28))
    assert not term_is_current({"start": "2025-01-03", "end": "2027-01-03"}, date(2027, 1, 3))
    assert not term_is_current({"start": "2027-01-03", "end": "2029-01-03"}, date(2026, 10, 28))

    term = {
        "party": "Independent",
        "party_affiliations": [
            {"start": "2025-01-03", "end": "2026-03-08", "party": "Republican"},
            {"start": "2026-03-09", "end": "2027-01-03", "party": "Independent", "caucus": "Republican"},
        ],
    }
    assert current_party(term, date(2026, 3, 8)) == ("Republican", None)
    assert current_party(term, date(2026, 10, 28)) == ("Independent", "Republican")
    assert current_party({"party": "Democrat"}, date(2026, 10, 28)) == ("Democrat", None)

    assert clean_url("https://example.gov") == "https://example.gov"
    assert clean_url("javascript:alert(1)") is None
    assert clean_url("http://example.gov/a") == "http://example.gov/a"

    assert house_vacancies([{"district": 1}, {"district": 2}], 4) == [
        {"district": 3, "inferred": True},
        {"district": 4, "inferred": True},
    ]
    assert house_vacancies([{"district": 1}, {"district": 1}], 3) == [
        {"district": None, "inferred": False},
    ]
    assert house_vacancies([], 1) == [{"district": 0, "inferred": True}]
    assert house_vacancies([{"district": 0}], 1) == []


if __name__ == "__main__":
    run_self_tests()
    print("self tests ok")
