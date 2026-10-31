"""Compile reviewed election snapshots without changing the legacy Senate fields.

The browser receives the original Senate data alongside a common election schema
for the Senate, House and governors. Research fields and source notes are retained;
display helpers never replace the original candidate party labels.
"""

import copy
import csv
import json
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
research = ROOT / 'research'


def read_snapshot(name):
    return json.loads((research / name).read_text(encoding='utf-8'))


senate_source = read_snapshot('senate-races.json')
baseline = read_snapshot('senate-baseline.json')
chicago = read_snapshot('chicago-panel.json')
statehood = read_snapshot('statehood.json')
topology = read_snapshot('us-states-topology.json')
house_source = read_snapshot('house-races.json')
house_geometry = read_snapshot('house-geometry.json')
house_topology = read_snapshot('house-districts-2026.json')
governor_source = read_snapshot('governor-races.json')

fips_abbr = dict(x.split(':') for x in '01:AL 02:AK 04:AZ 05:AR 06:CA 08:CO 09:CT 10:DE 12:FL 13:GA 15:HI 16:ID 17:IL 18:IN 19:IA 20:KS 21:KY 22:LA 23:ME 24:MD 25:MA 26:MI 27:MN 28:MS 29:MO 30:MT 31:NE 32:NV 33:NH 34:NJ 35:NM 36:NY 37:NC 38:ND 39:OH 40:OK 41:OR 42:PA 44:RI 45:SC 46:SD 47:TN 48:TX 49:UT 50:VT 51:VA 53:WA 54:WV 55:WI 56:WY'.split())
all_state_abbrs = set(fips_abbr.values())
assert set(statehood['states']) == all_state_abbrs
assert {item['order'] for item in statehood['states'].values()} == set(range(1, 51))
with (research / 'NST-EST2025-ALLDATA.csv').open(encoding='utf-8-sig', newline='') as source:
    population_by_fips = {
        row['STATE']: int(row['POPESTIMATE2025'])
        for row in csv.DictReader(source)
        if row['SUMLEV'] == '040' and row['STATE'] in fips_abbr
    }
assert set(population_by_fips) == set(fips_abbr)
assert all(value > 0 for value in population_by_fips.values())
states = []
by_abbr = {r['abbr']: r for r in senate_source['races']}
for geometry in topology['objects']['states']['geometries']:
    fips = str(geometry['id']).zfill(2)
    if fips in fips_abbr:
        abbr = fips_abbr[fips]
        states.append({
            'fips': fips,
            'abbr': abbr,
            'name': by_abbr.get(abbr, {}).get('stateDa', geometry['properties']['name']),
            'population2025': population_by_fips[fips],
            'statehood': statehood['states'][abbr],
        })
state_names = {state['abbr']: state['name'] for state in states}
changed_states = set(house_geometry['changedStates2026'])


def sources_from(*collections):
    """Deduplicate real source URLs while retaining each source's metadata."""
    sources = {}
    for collection in collections:
        for item in collection:
            source = copy.deepcopy(item) if isinstance(item, dict) else {'url': item}
            url = source['url']
            parsed = urlsplit(url)
            assert parsed.scheme in ('http', 'https') and parsed.netloc, url
            source.setdefault('label', parsed.netloc)
            if url not in sources:
                sources[url] = source
            else:
                for key, value in source.items():
                    sources[url].setdefault(key, value)
    return list(sources.values())


def collect_notes(value):
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, list):
        return [note for item in value for note in collect_notes(item)]
    return []


def normalize_race(original, kind):
    race = copy.deepcopy(original)
    abbr = race.get('stateAbbr') or race['abbr']
    assert abbr in all_state_abbrs, abbr
    race['abbr'] = abbr
    race['stateDa'] = race.get('stateDa') or race.get('state') or state_names[abbr]
    race['vacant'] = bool(race.get('vacant', not race.get('incumbent')))
    if kind == 'house':
        district = int(race['district'])
        race['districtNumber'] = district
        race['district'] = f'{district:02d}'
        race['key'] = race['districtId']
        assert race['key'] == f'{abbr}-{district:02d}'
        race['redistricted'] = abbr in changed_states
    else:
        race['key'] = abbr

    # Keep the underlying notes in place and expose their text through one field.
    notes = []
    for field in ('note', 'notes', 'electionTypeNote', 'electionSystemNote'):
        for note in collect_notes(race.get(field)):
            if note not in notes:
                notes.append(note)
    if 'note' in race and not isinstance(race['note'], str):
        race['sourceNote'] = copy.deepcopy(race['note'])
    race['note'] = ' '.join(notes)

    for candidate in race['candidates']:
        assert isinstance(candidate['party'], str) and candidate['party']
        candidate.setdefault('partyLabel', {
            'D': 'Demokraterne', 'R': 'Republikanerne', 'I': 'Uafhængig',
        }.get(candidate['party'], candidate.get('partyRaw', candidate['party'])))
        candidate.setdefault('group', candidate['party'] if candidate['party'] in ('D', 'R') else 'O')
        assert candidate['group'] in ('D', 'R', 'O')
    return race


def election(source, kind, total, fixed, current, threshold, extra_sources=()):
    # Preserve source-specific fields, including notes and verification scope.
    result = copy.deepcopy(source)
    result.update({
        'kind': kind,
        'races': [normalize_race(race, kind) for race in source['races']],
        'total': total,
        'fixed': fixed,
        'current': current,
        'threshold': threshold,
        'sources': sources_from(
            source.get('sources', []),
            source.get('nationalSources', []),
            source.get('nationalSourceUrls', []),
            extra_sources,
        ),
    })
    result.setdefault('asOf', source.get('checkedOn', baseline['asOf']))
    assert len({race['key'] for race in result['races']}) == len(result['races'])
    assert sum(fixed.values()) + len(result['races']) == total
    assert sum(current.values()) == total
    return result


assert baseline['seatsNotUpByCaucus'] == {'D': 34, 'R': 31}
assert baseline['currentByCaucus'] == {'D': 47, 'R': 53}
assert house_source['currentByParty'] == {'D': 214, 'R': 218, 'I': 1, 'vacant': 2}
assert governor_source['baseline']['fixedByParty'] == {'D': 6, 'R': 8, 'O': 0}
assert governor_source['baseline']['currentByParty'] == {'D': 24, 'R': 26, 'O': 0}

elections = {
    'senate': election(
        senate_source, 'senate', 100,
        fixed={'D': 34, 'R': 31, 'O': 0},
        current={'D': 47, 'R': 53, 'O': 0, 'V': 0},
        threshold={'D': 51, 'R': 50},
        extra_sources=baseline['sources'],
    ),
    'house': election(
        house_source, 'house', 435,
        fixed={'D': 0, 'R': 0, 'O': 0},
        current={'D': 214, 'R': 218, 'O': 1, 'V': 2},
        threshold={'D': 218, 'R': 218},
        extra_sources=house_geometry['sources'],
    ),
    'governors': election(
        governor_source, 'governors', 50,
        fixed={'D': 6, 'R': 8, 'O': 0},
        current={'D': 24, 'R': 26, 'O': 0, 'V': 0},
        threshold=None,
        extra_sources=governor_source['baseline']['sources'],
    ),
}
elections['senate']['currentBasis'] = (
    'Partigrupper: Demokraterne omfatter de to nuværende uafhængige senatorer, '
    'der samarbejder med Demokraterne. Nye øvrige vindere holdes særskilt.'
)
elections['senate']['baseline'] = copy.deepcopy(baseline)

house_races = elections['house']['races']
district_geometries = house_topology['objects'][house_geometry['objectName']]['geometries']
race_ids = {race['key'] for race in house_races}
geometry_ids = {geometry['id'] for geometry in district_geometries}
assert len(states) == 50 and set(state_names) == all_state_abbrs
assert len(elections['senate']['races']) == 35
assert len(house_races) == len(race_ids) == len(district_geometries) == len(geometry_ids) == 435
assert race_ids == geometry_ids
assert {race['abbr'] for race in house_races} == all_state_abbrs
assert {geometry['properties']['stateAbbr'] for geometry in district_geometries} == all_state_abbrs
for geometry in district_geometries:
    properties = geometry['properties']
    assert geometry['id'] == properties['districtId']
    assert geometry['id'] == f"{properties['stateAbbr']}-{properties['district']}"
assert Counter(race['abbr'] for race in house_races) == Counter(
    geometry['properties']['stateAbbr'] for geometry in district_geometries
)
assert len(elections['governors']['races']) == 36
governor_race_states = {race['abbr'] for race in elections['governors']['races']}
governor_fixed_states = {state['abbr'] for state in governor_source['fixedStates']}
assert not (governor_race_states & governor_fixed_states)
assert governor_race_states | governor_fixed_states == all_state_abbrs
assert len(governor_fixed_states) == 14

data = {
    # Existing links and saved Senate choices depend on these original fields.
    'revision': '20261031',
    'asOf': baseline['asOf'],
    'electionDate': baseline['electionDate'],
    'states': states,
    'races': senate_source['races'],
    'baseline': baseline,
    'chicago': chicago,
    'topology': topology,
    'houseTopology': house_topology,
    'houseGeometry': house_geometry,
    'elections': elections,
}

out = ROOT / 'dist/assets/data.js'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(
    'window.ELECTION_DATA=' +
    json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') +
    ';\n',
    encoding='utf-8',
)
counts = ', '.join(
    f'{kind}: {len(item["races"])} races / {sum(len(r["candidates"]) for r in item["races"])} candidates'
    for kind, item in elections.items()
)
print(f'Compiled {len(states)} states and 435 matching House geometries; {counts}.')
print(f'Wrote {out.name} ({out.stat().st_size:,} bytes), revision {data["revision"]}.')
