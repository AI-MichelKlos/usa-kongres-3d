import { readFileSync } from 'node:fs';
import { buildStateGeometries } from '../src/geo.js';
import { buildModel, houseStyle, senateStyle, COLORS } from '../src/analyze.js';
import { delegationMascot, federalElectionDate, majorityLine, mascotMajorityLine, seatElection, tugFigures } from '../src/format.js';
import { averagePolls, isClose, round1 } from '../src/polls.js';

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

const elephants = mascotMajorityLine({
  Democrat: 214, Republican: 218, caucusDemocrat: 0, caucusRepublican: 1, seats: 435,
});
assert(elephants.includes('elefanterne') && elephants.includes('219') && elephants.includes('435'), elephants);
const donkeys = mascotMajorityLine({
  Democrat: 48, Republican: 49, caucusDemocrat: 3, caucusRepublican: 0, seats: 100,
});
assert(donkeys.includes('æslerne') && donkeys.includes('51'), donkeys);
assert(tugFigures({ Democrat: 1, Republican: 1, caucusDemocrat: 0, caucusRepublican: 0, seats: 100 }).need === 51, 'senatsflertal');
assert(tugFigures({ Democrat: 0, Republican: 0, caucusDemocrat: 0, caucusRepublican: 0, seats: 435 }).need === 218, 'husflertal');
assert(delegationMascot({
  Democrat: 0, Republican: 1, caucusDemocrat: 1, caucusRepublican: 0, seated: 2,
}, 'senate') === 'split', 'delt senat');
assert(delegationMascot({
  Democrat: 43, Republican: 8, caucusDemocrat: 0, caucusRepublican: 1, seated: 52,
}, 'house') === 'D', 'hus efter parti');

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
  assert(state.d && state.d.length > 20, `${state.abbr} mangler en sti`);
  assert(state.bounds.maxX > state.bounds.minX && state.bounds.maxY > state.bounds.minY, `${state.abbr} mangler udstrækning`);
  assert(Number.isFinite(state.lon), `${state.abbr} mangler længdegrad`);
}
assert(by.NY.anchor.x > by.CA.anchor.x, 'New York skal ligge øst for Californien');
assert(by.ME.anchor.y < by.FL.anchor.y, 'Maine skal ligge nord for Florida');
assert(by.AK.anchor.x < by.TX.anchor.x, 'Alaska skal ligge i indhakket til venstre');
assert(by.HI.anchor.y > by.CA.anchor.y, 'Hawaii skal ligge i indhakket mod syd');
assert(by.ME.lon > by.CA.lon && by.CA.lon > by.HI.lon, 'valgnat-rækkefølge øst mod vest');
assert(built.width === 960 && built.height === 600, 'viewBox');

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
const polls = JSON.parse(readFileSync(new URL('../public/data/polls.json', import.meta.url)));
assert(polls.updated === '2026-10-28', 'målinger har opdateringsdato');
assert(polls.windowStart === '2026-09-28' && polls.windowEnd === '2026-10-28', '30 dages vindue');
for (const row of [...polls.generic, ...polls.senate]) {
  assert(row.sourceUrl?.startsWith('http'), `${row.id} mangler kilde`);
  assert(row.democratPct != null && row.republicanPct != null, `${row.id} mangler procent`);
  assert(row.democratPct + row.republicanPct <= 100.5, `${row.id} summer over 100`);
  assert(row.fieldEnd >= polls.windowStart && row.fieldEnd <= polls.windowEnd, `${row.id} uden for vinduet`);
  assert(!/silver bulletin|realclear|270towin|fiftyplusone|ballotpedia/i.test(row.pollster), `${row.id} er et aggregat`);
}
const generic = averagePolls(polls.generic);
assert(generic.count === 27, `generisk gennemsnit bruger ${generic.count} institutter`);
assert(round1(generic.democratPct) === 50.9, `generisk D ${generic.democratPct}`);
assert(round1(generic.republicanPct) === 43, `generisk R ${generic.republicanPct}`);
const yougov = polls.generic.find((row) => generic.ids.has(row.id) && row.pollster.startsWith('The Economist'));
assert(yougov?.variant === 'strict' && yougov.democratPct === 52 && yougov.republicanPct === 41, 'YouGov strict LV');
const rmg = polls.generic.find((row) => generic.ids.has(row.id) && row.pollsterKey === 'rmg research');
assert(rmg?.population === 'LV' && rmg.democratPct === 52 && rmg.republicanPct === 41 && rmg.variant == null, 'RMG uden leaners');
const byState = new Map();
for (const row of polls.senate) {
  const list = byState.get(row.state) || [];
  list.push(row);
  byState.set(row.state, list);
}
assert(isClose(averagePolls(byState.get('ME'))), 'Maine er tæt');
assert(!isClose(averagePolls(byState.get('NC'))), 'North Carolina er uden for 8 point');
assert(!isClose(averagePolls(byState.get('GA'))), 'Georgia er uden for 8 point');

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
  viewBox: built.viewBox,
  sample: {
    ME: { y: by.ME.anchor.y, x: by.ME.anchor.x },
    FL: { y: by.FL.anchor.y, x: by.FL.anchor.x },
    CA: { y: by.CA.anchor.y, x: by.CA.anchor.x },
    AK: { y: by.AK.anchor.y, x: by.AK.anchor.x },
    HI: { y: by.HI.anchor.y, x: by.HI.anchor.x },
    NY: { x: by.NY.anchor.x },
  },
}, null, 2));
console.log('smoke ok');
