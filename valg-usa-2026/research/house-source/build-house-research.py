"""Extract the 2026 House nominees and current members from official Clerk files.

Inputs are preserved locally. This script intentionally does not use FEC candidate
filings as proof of ballot status, and does not retain candidate hometowns.
"""

import json
import re
from collections import Counter
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parent
CHECKED = "2026-10-31"
NOMINEES_PUBLISHED = "2026-10-08"
MEMBERS_PUBLISHED = "2026-10-01"
NOMINEES_URL = "https://clerk.house.gov/member_info/electionInfo/2026/120-nominations.pdf"
MEMBERS_URL = "https://clerk.house.gov/xml/lists/MemberData.xml"
BREAKDOWN_URL = "https://radiotv.house.gov/house-data/party-breakdown"
VACANCIES_URL = "https://clerk.house.gov/Members/ViewVacancies"

EXCLUDED = {"AS", "DC", "GU", "MP", "PR", "VI"}
FIPS = dict(zip(
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(),
    "01 02 04 05 06 08 09 10 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56".split(),
))

tree = etree.parse(str(ROOT / "house-members.xml"))
assert tree.getroot().get("publish-date") == "October 1, 2026"
members = {}
state_by_heading = {}
state_names = {}
for node in tree.findall(".//members/member"):
    info = node.find("member-info")
    state = info.find("state").get("postal-code")
    if state in EXCLUDED:
        continue
    state_name = info.findtext("state/state-fullname")
    state_names[state] = state_name
    state_by_heading[state_name.upper()] = state
    raw_district = node.findtext("statedistrict")
    assert raw_district[:2] == state
    district = int(raw_district[2:])
    district_id = f"{state}-{district:02d}"
    members[district_id] = {
        "name": info.findtext("official-name") or None,
        "party": info.findtext("party") or None,
        "caucus": info.findtext("caucus") or None,
        "bioguideId": info.findtext("bioguideID") or None,
    }

assert len(members) == 435
current_by_party = Counter(m["party"] or "vacant" for m in members.values())
assert dict(current_by_party) == {"R": 218, "D": 214, "I": 1, "vacant": 2}

def party_fields(raw):
    """Keep the exact source label; codes/groups are only display helpers."""
    if raw.startswith("Republican"):
        suffix = raw.removeprefix("Republican").lstrip(", ")
        label = "Republikanerne" + (" / " + suffix if suffix else "")
        return {"party": "R", "partyLabel": label, "group": "R", "partyRaw": raw}
    if raw.startswith("Democrat"):
        if raw == "Democratic-Farmer-Labor":
            label = "Democratic-Farmer-Labor (DFL)"
        elif raw == "Democratic-Nonpartisan League":
            label = "Democratic-Nonpartisan League (Dem-NPL)"
        else:
            suffix = raw.removeprefix("Democrat").lstrip(", ")
            label = "Demokraterne" + (" / " + suffix if suffix else "")
        return {"party": "D", "partyLabel": label, "group": "D", "partyRaw": raw}
    mapping = {
        "Libertarian": ("L", "Libertarian Party"),
        "Independent": ("I", "Uafhængig"),
        "Independent, Unenrolled": ("I", "Independent / Unenrolled"),
        "Unaffiliated": ("I", "Unaffiliated (uden partitilknytning)"),
        "Unenrolled": ("I", "Unenrolled (uden partitilknytning)"),
        "No Party Affiliation": ("I", "No Party Affiliation (uden partitilknytning)"),
        "No Party": ("I", "No Party (uden partitilknytning)"),
        "No Political Party": ("I", "No Political Party (uden partitilknytning)"),
        "Nonpartisan": ("I", "Nonpartisan (partiløs)"),
        "Green": ("G", "Green Party"),
        "Wisconsin Green": ("G", "Wisconsin Green"),
        "Pacific Green": ("G", "Pacific Green"),
        "Pacific Green, Progressive": ("PROG", "Pacific Green / Progressive"),
        "Constitution": ("CON", "Constitution Party"),
        "American Constitution": ("CON", "American Constitution"),
        "Independent American": ("IAP", "Independent American Party"),
        "No Labels Party": ("NL", "No Labels Party"),
        "Unity Party": ("UNITY", "Unity Party"),
        "Florida Forward Party": ("FWD", "Florida Forward Party"),
        "Kentucky Party": ("KYP", "Kentucky Party"),
        "Natural Law": ("NLP", "Natural Law Party"),
        "U.S. Taxpayers": ("UST", "U.S. Taxpayers Party"),
        "America First": ("AF", "America First"),
        "Nebraska Working People": ("NWP", "Nebraska Working People"),
        "Legal Marijuana NOW": ("LMN", "Legal Marijuana NOW"),
        "Socialist Workers": ("SWP", "Socialist Workers Party"),
        "Socialism and Liberation": ("PSL", "Socialism and Liberation"),
        "Working Class": ("WCP", "Working Class Party"),
        "Conservative": ("C", "Conservative"),
    }
    code, label = mapping.get(raw, ("O", raw))
    return {"party": code, "partyLabel": label, "group": "O", "partyRaw": raw}

candidate_scope = (
    "Alle kandidatnavne for distriktet i House Clerk's officielle nomineringsliste "
    "udgivet 8. oktober 2026, inklusive de øvrige partier. Eventuelle senere ændringer "
    "og særskilt registrerede write-in-kandidater er ikke selvstændigt verificeret."
)
incumbent_basis = (
    "Nuværende medlem og parti i 119. Kongres for samme distriktsnummer. "
    "Distriktsgrænser kan være ændret til valget i 2026."
)

races = {}
state = None
office = None
district = None
errors = []
source = (ROOT / "house-120-nominations.txt").read_text()
assert "Published on October 8, 2026" in source
stop = False
for page_number, page in enumerate(source.split("\f"), start=1):
    for line in page.splitlines():
        text = line.strip()
        heading = text.split("—")[0]
        if text == "AMERICAN SAMOA":
            stop = True
            break
        if heading in state_by_heading:
            state = state_by_heading[heading]
            continue
        if text.startswith("FOR UNITED STATES SENATOR"):
            office = "senate"
            district = None
            continue
        if text.startswith("FOR UNITED STATES REPRESENTATIVE"):
            office = "house"
            continue
        if text == "AT LARGE":
            district = 0
            continue
        if office != "house" or state is None or not re.search(r"\.{3,}", text):
            continue
        head = re.split(r"\.{3,}", text)[0].strip()
        # Names can have commas before Jr./Sr.; split at the comma before the party.
        match = re.match(r"^(?:(\d{1,2})\s+)?(.+?),([*†‡]?)\s+(?!Jr\.|Sr\.)(.+)$", head)
        if not match:
            errors.append({"page": page_number, "state": state, "text": head})
            continue
        if match[1]:
            district = int(match[1])
        assert district is not None
        district_id = f"{state}-{district:02d}"
        incumbent = members[district_id]
        if district_id not in races:
            races[district_id] = {
                "id": district_id,
                "districtId": district_id,
                "state": state_names[state],
                "stateDa": state_names[state],
                "stateAbbr": state,
                "abbr": state,
                "fips": FIPS[state],
                "district": district,
                "districtLabel": "Hele delstaten" if district == 0 else f"Distrikt {district}",
                "type": "open_primary" if state == "LA" else "general",
                "typeLabel": "Åbent primærvalg" if state == "LA" else "Ordinært valg",
                "electionDate": "2026-11-03",
                "incumbent": incumbent["name"],
                "incumbentParty": incumbent["party"],
                "incumbentCaucus": incumbent["caucus"],
                "incumbentBioguideId": incumbent["bioguideId"],
                "vacant": incumbent["name"] is None,
                "incumbentBasis": incumbent_basis,
                "candidates": [],
                "candidateScope": candidate_scope,
                "candidateOfficialSource": True,
                "candidateSourcePublishedOn": NOMINEES_PUBLISHED,
                "incumbentSourcePublishedOn": MEMBERS_PUBLISHED,
                "sources": [
                    {"label": "U.S. House Clerk, officielle kandidater til 120. Kongres (8. oktober 2026)", "url": NOMINEES_URL},
                    {"label": "U.S. House Clerk, medlemmer af 119. Kongres (1. oktober 2026)", "url": MEMBERS_URL},
                ],
                "sourcePdfPages": [],
                "checkedOn": CHECKED,
            }
            if state == "LA":
                races[district_id]["possibleRunoffDate"] = "2026-12-12"
                races[district_id]["electionSystemNote"] = (
                    "Louisiana afholder åbent House-primærvalg 3. november. "
                    "En kandidat med flertal vælges. Ellers, eller ved stemmelighed, "
                    "er en ny valgrunde planlagt 12. december 2026."
                )
        race = races[district_id]
        if page_number not in race["sourcePdfPages"]:
            race["sourcePdfPages"].append(page_number)
        candidate = {
            "name": match[2],
            **party_fields(match[4]),
            "isCurrentMember": match[3] == "*",
        }
        if match[3] == "‡":
            candidate["isFormerMember"] = True
        race["candidates"].append(candidate)
    if stop:
        break

assert not errors, errors
assert set(races) == set(members), (set(races) - set(members), set(members) - set(races))
assert len(races) == 435
assert set(r["stateAbbr"] for r in races.values()) == set(FIPS)
assert {r["districtId"] for r in races.values() if r["district"] == 0} == {
    "AK-00", "DE-00", "ND-00", "SD-00", "VT-00", "WY-00"
}
assert all(r["candidates"] for r in races.values())
assert all(len({c["name"] for c in r["candidates"]}) == len(r["candidates"]) for r in races.values())
all_candidates = [c for r in races.values() for c in r["candidates"]]
renominated = Counter(c["party"] for c in all_candidates if c["isCurrentMember"])
assert dict(renominated) == {"R": 177, "D": 183, "I": 1}, renominated

data = {
    "checkedOn": CHECKED,
    "electionDate": "2026-11-03",
    "office": "U.S. House of Representatives",
    "congress": 120,
    "raceCount": len(races),
    "candidateCount": len(all_candidates),
    "totalVotingSeats": 435,
    "seatsUp": 435,
    "fixedBase": {"D": 0, "R": 0, "I": 0, "O": 0},
    "majorityTarget": 218,
    "majorityExplanation": "218 af de 435 stemmeberettigede mandater giver flertal i et fuldt besat Hus efter valget.",
    "currentByParty": {"D": 214, "R": 218, "I": 1, "vacant": 2},
    "currentFilledSeats": 433,
    "currentIndependent": {"name": "Kevin Kiley", "districtId": "CA-03", "party": "I", "caucus": "R"},
    "vacantDistricts": ["FL-20", "TX-23"],
    "candidateSourcePublishedOn": NOMINEES_PUBLISHED,
    "incumbentSourcePublishedOn": MEMBERS_PUBLISHED,
    "candidateScope": candidate_scope,
    "incumbentBasis": incumbent_basis,
    "method": (
        "Kandidatnavne, originale partibetegnelser og markeringer af nuværende medlemmer er "
        "udtrukket fra House Clerk's officielle nominerings-PDF for 3. november 2026. "
        "Nuværende medlemmer er sammenkoblet på delstat og distriktsnummer med Clerk's "
        "MemberData.xml. DC og territorier er udeladt. Der bruges ikke FEC-registreringer "
        "som dokumentation for kandidatur på valgdagen. Partikoder og D/R/O-grupper er "
        "visningsfelter; partyRaw bevarer kildens fulde partibetegnelse."
    ),
    "validation": {
        "districtIdsMatchClerkMembership": True,
        "states": 50,
        "districts": 435,
        "candidates": len(all_candidates),
        "currentMembersRenominated": dict(renominated),
        "renominatedCountMatchesOfficialPdfRecapitulation": True,
        "unparsedCandidateLines": len(errors),
        "districtsWithoutCandidates": 0,
    },
    "notes": [
        "Kandidatlisten er en officiel national status udgivet 8. oktober 2026, ikke en live-opdatering fra samtlige delstater.",
        "Nuværende partifarve følger medlemmet for samme distriktsnummer i 119. Kongres. Den angiver ikke et beregnet tidligere valgresultat inden for nye 2026-grænser.",
        "Et nuværende medlem kan stille op i et andet distriktsnummer. Kandidatfeltet isCurrentMember følger den officielle nomineringslistes stjernemarkering, og er ikke en påstand om samme distriktsnummer.",
        "Enkelte distrikter har ingen kandidat fra det ene store parti eller har flere kandidater fra samme parti. Der er ikke tilføjet manglende D/R-kandidater.",
        "Louisianas seks House-valg er åbne primærvalg 3. november, med muligt runoff 12. december 2026. Senatsvalget i Louisiana følger et andet system.",
        "Kevin Kiley tælles som uafhængig. Hans republikanske caucus-tilknytning ændrer ikke currentByParty.",
        "Vacancies tælles særskilt, og ikke under partiet hos det seneste medlem.",
    ],
    "races": sorted(races.values(), key=lambda r: (r["stateAbbr"], r["district"])),
    "nationalSourceUrls": [NOMINEES_URL, MEMBERS_URL, BREAKDOWN_URL, VACANCIES_URL],
    "nationalSources": [
        {"label": "U.S. House Clerk, Nominees for the 120th Congress", "url": NOMINEES_URL, "publishedOn": NOMINEES_PUBLISHED, "checkedOn": CHECKED},
        {"label": "U.S. House Clerk, MemberData.xml for the 119th Congress", "url": MEMBERS_URL, "publishedOn": MEMBERS_PUBLISHED, "checkedOn": CHECKED},
        {"label": "U.S. House Radio-TV Gallery, Party Breakdown", "url": BREAKDOWN_URL, "updatedOn": "2026-09-02", "checkedOn": CHECKED},
        {"label": "U.S. House Clerk, Current Vacancies", "url": VACANCIES_URL, "checkedOn": CHECKED},
    ],
}
output = ROOT / "house-races-research.json"
output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({
    "file": str(output),
    "bytes": output.stat().st_size,
    "races": data["raceCount"],
    "candidates": data["candidateCount"],
    "currentByParty": data["currentByParty"],
    "renominated": data["validation"]["currentMembersRenominated"],
}, ensure_ascii=False))
