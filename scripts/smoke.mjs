import { readFileSync } from 'node:fs';
import { buildStateGeometries } from '../src/geo.js';
import { buildModel, houseStyle, senateStyle, COLORS } from '../src/analyze.js';
import { federalElectionDate, majorityLine, seatElection } from '../src/format.js';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

assert(iso(federalElectionDate(2020)) === '2020-11-03', 'valgdag 2020');
assert(iso(federalElectionDate(2024)) === '2024-11-05', 'valgdag 2024');
assert(iso(federalElectionDate(2026)) === '2026-11-03', 'valgdag 2026');
assert(seatElection('2027-01-03', '2026-10-28')?.status === 'upcoming', 'på valg');
assert(seatElection('2027-01-03', '2026-11-03')?.status === 'upcoming', 'selve valgdagen');
assert(seatElection('2027-01-03', '2026-11-04')?.status === 'passed', 'dagen efter');
assert(seatElection('2027-01-03', '2027-01-03')?.status === 'ended', 'ny kongres');

const bothD = senateStyle([{ party: 'Democrat' }, { party: 'Democrat' }], []);
assert(bothD.color === COLORS.D && bothD.independent === false, 'to demokrater');

const vt = senateStyle([
  { party: 'Independent', caucus: 'Democrat' },
  { party: 'Democrat' },
], []);
assert(vt.color === COLORS.D && vt.independent === true, 'Vermont-mønster');

const me = senateStyle([
  { party: 'Independent', caucus: 'Democrat' },
  { party: 'Republican' },
], []);
assert(me.color === COLORS.split && me.independent === true, 'Maine-mønster');
assert(me.color !== COLORS.D && me.color !== COLORS.R, 'delt er ikke ensfarvet');

const onlyI = senateStyle([{ party: 'Independent' }, { party: 'Independent' }], []);
assert(onlyI.color === COLORS.I && onlyI.independent === true, 'to uafhængige uden caucus');

const vacantSeat = senateStyle([{ party: 'Democrat' }], [{}]);
assert(vacantSeat.color !== COLORS.D, 'én ledig plads dæmper farven');
assert(senateStyle([], [{}]).color === COLORS.vacant, 'tomt senat er gråt');

const pureD = houseStyle([{ party: 'Democrat' }]);
const withI = houseStyle([{ party: 'Democrat' }, { party: 'Independent', caucus: 'Republican' }]);
assert(withI.color === pureD.color && withI.independent === true, 'uafhængig trækker ikke husfarven');
const blend = houseStyle([{ party: 'Democrat' }, { party: 'Republican' }]);
assert(blend.color === COLORS.split, 'lige delt hus er lilla');
assert(houseStyle([]).color === COLORS.vacant, 'tomt hus er gråt');

const topo = JSON.parse(readFileSync(new URL('../public/geo/states-10m.json', import.meta.url)));
const built = buildStateGeometries(topo);
assert(built.states.length === 50, `forventede 50 stater, fik ${built.states.length}`);
const by = Object.fromEntries(built.states.map((state) => [state.abbr, state]));
for (const state of built.states) {
  assert(state.geometries.length > 0, `${state.abbr} mangler geometri`);
  const width = state.bounds.maxX - state.bounds.minX;
  const depth = state.bounds.maxZ - state.bounds.minZ;
  assert(width < 6 && depth < 6, `${state.abbr} er for stor (${width.toFixed(2)} x ${depth.toFixed(2)})`);
  assert(Number.isFinite(state.lon), `${state.abbr} mangler længdegrad`);
}
assert(by.NY.anchor.x > by.CA.anchor.x, 'New York skal ligge øst for Californien');
assert(by.ME.anchor.z < by.FL.anchor.z, 'Maine skal ligge nord for Florida');
assert(by.AK.anchor.x < by.TX.anchor.x, 'Alaska skal ligge i indhakket til venstre');
assert(by.ME.lon > by.CA.lon && by.CA.lon > by.HI.lon, 'valgnat-rækkefølge øst mod vest');
assert(built.footprint.width > 8 && built.footprint.width < 12, 'kortbredde');

const data = JSON.parse(readFileSync(new URL('../public/data/congress.json', import.meta.url)));
const model = buildModel(data);
assert(model.houseTotals.seats === 435, '435 huspladser');
assert(model.senateTotals.seats === 100, '100 senatspladser');
assert(model.houseTotals.imbalance === 0, `hus hænger ikke sammen (${model.houseTotals.imbalance})`);
assert(model.senateTotals.imbalance === 0, `senat hænger ikke sammen (${model.senateTotals.imbalance})`);
assert(model.states.CA.houseSeats === 52, 'Californien har 52 pladser');
assert(model.delegates.every((person) => !model.states[person.state]), 'delegerede er ikke delstater');
const ids = [
  ...model.delegates,
  ...model.unplaced,
  ...Object.values(model.states).flatMap((state) => [...state.house, ...state.senate]),
].map((person) => person.bioguide);
assert(new Set(ids).size === ids.length, 'bioguide er ikke unikt');

const houseLine = majorityLine(model.houseTotals, model.houseTotals.seats);
const senateLine = majorityLine(model.senateTotals, model.senateTotals.seats);
console.log(JSON.stringify({
  fetchedAt: model.fetchedAt,
  congress: model.congress,
  house: model.houseTotals,
  senate: model.senateTotals,
  delegates: model.delegates.length,
  houseLine,
  senateLine,
  droppedPoints: built.stats.dropped,
  failedPolygons: built.stats.failed,
  footprint: built.footprint,
  sample: {
    ME: { z: by.ME.anchor.z, x: by.ME.anchor.x },
    FL: { z: by.FL.anchor.z, x: by.FL.anchor.x },
    CA: { z: by.CA.anchor.z, x: by.CA.anchor.x },
    AK: { z: by.AK.anchor.z, x: by.AK.anchor.x },
    HI: { z: by.HI.anchor.z, x: by.HI.anchor.x },
    NY: { x: by.NY.anchor.x },
  },
}, null, 2));
console.log('smoke ok');
