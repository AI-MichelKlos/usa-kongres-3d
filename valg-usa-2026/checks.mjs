import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const readAsset = name => fs.readFileSync(path.join(root, 'dist/assets', name), 'utf8');
const sandbox = vm.createContext({ window: {}, URL, URLSearchParams });
for (const file of ['data.js', 'math.js', 'topojson-client.min.js']) vm.runInContext(readAsset(file), sandbox, { filename: file, timeout: 3000 });
const data = sandbox.window.ELECTION_DATA;
const M = sandbox.window.ElectionMath;
const plain = value => JSON.parse(JSON.stringify(value));
assert.ok(data.elections, 'Build the v2 data.js with data.elections before running these checks.');
const E = data.elections;
const kinds = ['senate', 'house', 'governors'];
const byKey = Object.fromEntries(kinds.map(kind => [kind, new Map(E[kind].races.map(r => [M.keyFor(r), r]))]));
const tally = (kind, choices = {}) => plain(M.tallyElection(E[kind], choices));
const indexFor = (kind, key, party) => {
  const race = byKey[kind].get(key);
  assert.ok(race, `${kind}:${key} must exist`);
  const index = race.candidates.findIndex(c => c.party === party);
  assert.ok(index >= 0, `${kind}:${key} must have a ${party} candidate`);
  return index;
};
const retainedSenate = M.retainElection(E.senate);
const decode = href => plain(M.decodeState(data, href));
const encode = (state, href = 'https://example.invalid/') => M.encodeState(data, state, href);
const baseState = () => decode('https://example.invalid/').state;
function allocateParty(kind, party, count) {
  const eligible = E[kind].races.filter(r => r.candidates.some(c => c.party === party));
  assert.ok(eligible.length >= count, `${kind} must have at least ${count} ${party} candidates`);
  return Object.fromEntries(eligible.slice(0, count).map(r => [M.keyFor(r), r.candidates.findIndex(c => c.party === party)]));
}
function invariant(kind, counts) {
  assert.equal(counts.total, E[kind].total, `${kind}: total`);
  assert.equal(counts.D + counts.R + counts.O + counts.U, E[kind].total, `${kind}: sum`);
  assert.ok([counts.D, counts.R, counts.O, counts.U, counts.V].every(n => Number.isInteger(n) && n >= 0));
  assert.equal(counts.V, 0, 'Unallocated future races are open, not current vacancies');
}
let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, error }); console.error(`FAIL ${name}: ${error.message}`); }
}

test('Published JavaScript parses and the v2 APIs exist', () => {
  for (const file of ['data.js', 'math.js', 'app.js']) new vm.Script(readAsset(file), { filename: file });
  for (const name of ['sanitizeElection','tallyElection','retainElection','decodeState','encodeState']) assert.equal(typeof M[name], 'function', name);
});
test('Data has 50 states, 35 Senate races, 435 House races and 36 governor races', () => {
  assert.equal(data.states.length, 50);
  assert.equal(new Set(data.states.map(s => s.abbr)).size, 50);
  assert.equal(new Set(data.states.map(s => s.fips)).size, 50);
  assert.equal(E.senate.races.length, 35); assert.equal(E.house.races.length, 435); assert.equal(E.governors.races.length, 36);
  assert.equal(E.senate.races.reduce((sum, r) => sum + r.candidates.length, 0), 123);
  for (const kind of kinds) assert.equal(new Set(E[kind].races.map(M.keyFor)).size, E[kind].races.length, kind);
});
test('States exclude DC and territories and each has published geometry', () => {
  const expected = new Set(['01','02','04','05','06','08','09','10','12','13','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39','40','41','42','44','45','46','47','48','49','50','51','53','54','55','56']);
  assert.deepEqual(new Set(data.states.map(s => s.fips)), expected);
  assert.ok(!data.states.some(s => s.abbr === 'DC'));
  const ids = new Set(data.topology.objects.states.geometries.map(g => String(g.id).padStart(2, '0')));
  for (const state of data.states) assert.ok(ids.has(state.fips), state.name);
  for (const kind of kinds) for (const race of E[kind].races) assert.ok(data.states.some(s => s.abbr === race.abbr), `${kind}:${M.keyFor(race)}`);
});
test('All races have named candidates and traceable source links', () => {
  for (const kind of kinds) for (const race of E[kind].races) {
    const key = `${kind}:${M.keyFor(race)}`;
    assert.ok(race.sources?.length > 0, `${key}: sources missing`);
    assert.ok(race.candidates.length > 0, `${key}: candidates missing`);
    for (const source of race.sources) { assert.ok(source.label?.trim(), `${key}: source label`); assert.equal(new URL(source.url).protocol, 'https:', key); }
    for (const c of race.candidates) assert.ok(c.name?.trim() && c.party?.trim(), `${key}: candidate incomplete`);
  }
});
test('435 House races join exactly 435 geometries with matching identifiers', () => {
  assert.equal(data.houseTopology.type, 'Topology');
  const features = sandbox.topojson.feature(data.houseTopology, data.houseTopology.objects.districts).features;
  assert.equal(features.length, 435); assert.equal(new Set(features.map(f => f.id)).size, 435);
  assert.deepEqual(new Set(features.map(f => f.id)), new Set(E.house.races.map(M.keyFor)));
  for (const f of features) {
    const p = f.properties, race = byKey.house.get(f.id);
    assert.equal(p.districtId, f.id); assert.equal(p.stateAbbr, race.abbr);
    assert.equal(p.stateFips, data.states.find(s => s.abbr === race.abbr).fips);
    assert.equal(p.district, String(race.district).padStart(2, '0'));
    assert.ok(f.geometry?.coordinates?.length > 0, f.id);
  }
  assert.deepEqual([...features.filter(f => f.properties.district === '00').map(f => f.id)].sort(), ['AK-00','DE-00','ND-00','SD-00','VT-00','WY-00']);
  assert.equal(features.filter(f => f.properties.stateAbbr === 'MO').length, 8);
});
test('Election baselines and current distributions sum to their own totals', () => {
  for (const kind of kinds) {
    const e = E[kind];
    assert.equal(e.fixed.D + e.fixed.R + e.fixed.O + e.races.length, e.total, `${kind}: fixed base`);
    assert.equal(e.current.D + e.current.R + e.current.O + e.current.V, e.total, `${kind}: current seats`);
    invariant(kind, tally(kind));
  }
});
test('Senate has 33 regular races, FL/OH special races and 13 D plus 22 R defended seats', () => {
  assert.equal(E.senate.races.filter(r => r.type === 'regular').length, 33);
  assert.deepEqual([...E.senate.races.filter(r => r.type === 'special').map(r => r.abbr)].sort(), ['FL','OH']);
  assert.equal(E.senate.races.filter(r => r.incumbentParty === 'D').length, 13);
  assert.equal(E.senate.races.filter(r => r.incumbentParty === 'R').length, 22);
});
test('Senate base is 34 D-group, 31 R and 35 open seats', () => {
  assert.deepEqual(tally('senate'), { D:34, R:31, O:0, U:35, V:0, total:100, control:'unresolved' });
});
test('Retaining Senate parties gives 47 D-group and 53 R', () => {
  assert.equal(Object.keys(retainedSenate).length, 35);
  assert.deepEqual(tally('senate',retainedSenate), { D:47, R:53, O:0, U:0, V:0, total:100, control:'R' });
});
test('Illinois switched from D to R transfers one Senate seat', () => {
  assert.deepEqual(tally('senate',{...retainedSenate,IL:indexFor('senate','IL','R')}), {D:46,R:54,O:0,U:0,V:0,total:100,control:'R'});
});
test('A new Nebraska independent winner remains outside both caucuses', () => {
  assert.deepEqual(tally('senate',{...retainedSenate,NE:indexFor('senate','NE','I')}), {D:47,R:52,O:1,U:0,V:0,total:100,control:'R'});
});
test('Senate 50-50 gives R control via the vice president and D needs 51', () => {
  const choices = {...retainedSenate};
  for (const abbr of ['AL','AK','AR']) choices[abbr]=indexFor('senate',abbr,'D');
  assert.deepEqual(tally('senate',choices), {D:50,R:50,O:0,U:0,V:0,total:100,control:'R'});
  choices.FL=indexFor('senate','FL','D');
  assert.deepEqual(tally('senate',choices), {D:51,R:49,O:0,U:0,V:0,total:100,control:'D'});
});
test('A fully assigned Senate with unknown independent caucuses remains unresolved', () => {
  const choices={...retainedSenate,NE:indexFor('senate','NE','I'),FL:indexFor('senate','FL','I')};
  for (const abbr of ['AL','AK']) choices[abbr]=indexFor('senate',abbr,'D');
  assert.deepEqual(tally('senate',choices), {D:49,R:49,O:2,U:0,V:0,total:100,control:'unresolved'});
});
test('House starts with no fixed seats and all 435 races open', () => {
  assert.deepEqual(plain(E.house.fixed),{D:0,R:0,O:0});
  assert.deepEqual(plain(E.house.threshold),{D:218,R:218});
  assert.deepEqual(tally('house'),{D:0,R:0,O:0,U:435,V:0,total:435,control:'unresolved'});
});
test('House 217 seats are unresolved and 218 establish control for either party', () => {
  for (const party of ['D','R']) {
    const below=tally('house',allocateParty('house',party,217)),above=tally('house',allocateParty('house',party,218));
    assert.equal(below[party],217);assert.equal(below.control,'unresolved');
    assert.equal(above[party],218);assert.equal(above.control,party);
    invariant('house',below);invariant('house',above);
  }
});
test('Current House vacancies remain open when incumbent parties are retained', () => {
  const choices=M.retainElection(E.house),vacant=E.house.races.filter(r=>r.vacant);
  for (const race of vacant) assert.ok(!Object.hasOwn(choices,M.keyFor(race)),M.keyFor(race));
  assert.ok(tally('house',choices).U>=vacant.length);invariant('house',tally('house',choices));
});
test('Governors start at 6 D, 8 R and 36 open positions with no national control', () => {
  assert.equal(E.governors.threshold,null);
  assert.deepEqual(tally('governors'),{D:6,R:8,O:0,U:36,V:0,total:50,control:null});
  assert.equal(new Set(E.governors.races.map(r=>r.abbr)).size,36);
});
test('Governor scenarios never declare a national majority or control', () => {
  assert.equal(tally('governors',M.retainElection(E.governors)).control,null);
  for (const party of ['D','R']) {
    const n=E.governors.races.filter(r=>r.candidates.some(c=>c.party===party)).length;
    const result=tally('governors',allocateParty('governors',party,n));
    assert.equal(result.control,null);invariant('governors',result);
  }
});
test('Every election ignores negative, fractional, string and injected candidate indexes', () => {
  const invalid=[-1,-100,0.5,NaN,Infinity,-Infinity,null,undefined,true,false,'0','1','0;alert(1)','<script>alert(1)</script>',{},[],Symbol('candidate')];
  for (const kind of kinds) {
    const race=E[kind].races[0],key=M.keyFor(race),expected=tally(kind);
    for (const i of invalid) assert.deepEqual(tally(kind,{[key]:i}),expected,`${kind}:${String(i)}`);
    assert.deepEqual(tally(kind,{[key]:race.candidates.length}),expected);
    assert.deepEqual(tally(kind,{[key]:Number.MAX_SAFE_INTEGER}),expected);
    assert.deepEqual(tally(kind,JSON.parse('{"__proto__":{"IL":1},"constructor":0,"ZZ":0,"ZZ-99":0}')),expected);
    assert.deepEqual(tally(kind,Object.create({[key]:0})),expected,'Inherited choices must not count');
    for (const input of [null,undefined,'IL.0',false,5]) assert.deepEqual(tally(kind,input),expected);
  }
});
test('Calculations do not mutate choices or election data', () => {
  const before=JSON.stringify(data);
  for (const kind of kinds) {
    const choices=Object.freeze({...M.retainElection(E[kind]),ZZ:0}),snapshot=JSON.stringify(choices);
    tally(kind,choices);M.sanitizeElection(E[kind],choices);M.retainElection(E[kind]);
    assert.equal(JSON.stringify(choices),snapshot);
  }
  assert.equal(JSON.stringify(data),before);
});
test('Every candidate can win their race without losing or duplicating a seat', () => {
  for (const kind of kinds) for (const race of E[kind].races) for (let i=0;i<race.candidates.length;i++) {
    const result=tally(kind,{[M.keyFor(race)]:i});invariant(kind,result);
    assert.equal(result.U,E[kind].races.length-1);
    if (!['D','R'].includes(race.candidates[i].party)) assert.equal(result.O,E[kind].fixed.O+1);
  }
});
test('Mixed partial and complete scenarios preserve each election total', () => {
  let seed=20261103;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for (const kind of kinds) for (let sample=0;sample<100;sample++) {
    const choices={};
    for (const race of E[kind].races) if (random()>0.22) choices[M.keyFor(race)]=Math.floor(random()*race.candidates.length);
    const result=tally(kind,choices);invariant(kind,result);
    assert.equal(result.U,E[kind].races.length-Object.keys(choices).length);
    if (kind==='governors') assert.equal(result.control,null);
  }
});
test('URL defaults are a Senate guide for Illinois with separate empty scenarios', () => {
  const {state,notices}=decode('https://example.invalid/');
  assert.equal(state.view,'senate');assert.equal(state.mode,'guide');assert.equal(state.selected,'IL');assert.equal(state.area,'US');
  assert.equal(byKey.house.get(state.district).abbr,'IL');
  assert.deepEqual(state.selections,{senate:{},house:{},governors:{}});assert.deepEqual(notices,[]);
});
test('Existing v1 Senate URLs restore their original choices', () => {
  const {state,notices}=decode('https://example.invalid/?view=senate&mode=scenario&state=NE&rev=20261031&s=IL.1,NE.1');
  assert.equal(state.view,'senate');assert.equal(state.mode,'scenario');assert.equal(state.selected,'NE');
  assert.deepEqual(state.selections.senate,{IL:1,NE:1});assert.deepEqual(state.selections.house,{});assert.deepEqual(state.selections.governors,{});
  assert.equal(notices.length,0);assert.equal(E.senate.races.find(r=>r.abbr==='NE').candidates[1].party,'I');
});
test('Malformed URL choices and unknown navigation values fall back safely', () => {
  const {state}=decode('https://example.invalid/?view=evil&mode=result&state=ZZ&area=ZZ&district=ZZ-99&s=IL.-1,NE.999,ZZ.0,IL.0%3Balert(1)&h=IL.0,IL-07.-1,CA-99.0&g=IL.NaN,ZZ.0');
  assert.equal(state.view,'senate');assert.equal(state.mode,'guide');assert.equal(state.selected,'IL');assert.equal(state.area,'US');
  assert.equal(byKey.house.get(state.district).abbr,'IL');assert.deepEqual(state.selections,{senate:{},house:{},governors:{}});
});
test('Prototype names cannot become views, states, areas, districts or candidate keys', () => {
  for (const name of ['__proto__','constructor','toString','valueOf','hasOwnProperty']) {
    const x=encodeURIComponent(name),{state}=decode(`https://example.invalid/?view=${x}&state=${x}&area=${x}&district=${x}&s=${x}.0&h=${x}.0&g=${x}.0`);
    assert.equal(state.view,'senate');assert.equal(state.selected,'IL');assert.equal(state.area,'US');
    assert.equal(byKey.house.get(state.district).abbr,'IL');assert.deepEqual(state.selections,{senate:{},house:{},governors:{}});
  }
});
test('House district and selected state stay consistent', () => {
  const good=decode('https://example.invalid/?view=house&state=IL&district=IL-07&area=IL').state;
  assert.equal(good.district,'IL-07');assert.equal(good.area,'IL');
  const mismatch=decode('https://example.invalid/?view=house&state=IL&district=TX-01').state;
  assert.equal(byKey.house.get(mismatch.district).abbr,'IL');
});
test('A mismatched revision resets all three scenarios once', () => {
  const result=decode(`https://example.invalid/?rev=old-${data.revision}&view=house&mode=scenario&state=IL&district=IL-07&s=IL.0&h=IL-07.0&g=IL.0`);
  assert.deepEqual(result.state.selections,{senate:{},house:{},governors:{}});assert.equal(result.notices.length,1);
  assert.equal(result.state.view,'house');assert.equal(result.state.mode,'scenario');assert.equal(result.state.district,'IL-07');
});
test('Senate, House and governor scenarios stay separate for overlapping states', () => {
  const state=baseState();Object.assign(state,{view:'house',mode:'scenario',selected:'IL',district:'IL-07',area:'IL'});
  state.selections={senate:{IL:indexFor('senate','IL','R')},house:{'IL-07':indexFor('house','IL-07','R')},governors:{IL:indexFor('governors','IL','D')}};
  const restored=decode(encode(state)).state;assert.deepEqual(restored.selections,plain(state.selections));
  assert.equal(tally('senate',restored.selections.senate).R,32);assert.equal(tally('house',restored.selections.house).R,1);assert.equal(tally('governors',restored.selections.governors).D,7);
  restored.selections.house={};assert.deepEqual(restored.selections.senate,state.selections.senate);assert.deepEqual(restored.selections.governors,state.selections.governors);
});
test('A full three-election scenario round-trips choices and every total', () => {
  const state=baseState();Object.assign(state,{view:'house',mode:'scenario',selected:'IL',district:'IL-07',area:'IL'});
  for (const kind of kinds) state.selections[kind]=plain(M.retainElection(E[kind]));
  state.selections.senate.NE=indexFor('senate','NE','I');
  const saved=encode(state,'https://example.invalid/?other=preserved#overview'),url=new URL(saved);
  assert.equal(url.searchParams.get('rev'),data.revision);assert.equal(url.searchParams.get('other'),'preserved');assert.equal(url.hash,'#overview');
  const restored=decode(saved);assert.deepEqual(restored.state,state);assert.deepEqual(restored.notices,[]);
  for (const kind of kinds) assert.deepEqual(tally(kind,restored.state.selections[kind]),tally(kind,state.selections[kind]));
});
test('Sharing another view retains scenarios but omits House-only navigation', () => {
  const state=baseState();Object.assign(state,{view:'chicago',mode:'scenario',district:'IL-07',area:'IL'});
  state.selections={senate:{IL:0},house:{'IL-07':0},governors:{IL:0}};
  const url=new URL(encode(state));assert.equal(url.searchParams.has('district'),false);assert.equal(url.searchParams.has('area'),false);
  const restored=decode(url.href).state;assert.equal(restored.view,'chicago');assert.deepEqual(restored.selections,state.selections);
});
test('Encoding removes empty or invalid choices from sharing parameters', () => {
  const state=baseState(),clean=new URL(encode(state,'https://example.invalid/?s=IL.0&h=IL-07.0&g=IL.0'));
  for (const param of ['s','h','g']) assert.equal(clean.searchParams.has(param),false);
  state.selections={senate:{IL:-1,ZZ:0},house:{'IL-07':'0','ZZ-99':0},governors:{IL:1000000}};
  const invalid=new URL(encode(state));for (const param of ['s','h','g']) assert.equal(invalid.searchParams.has(param),false);
});

console.log(`\n${passed} checks passed; ${failures.length} failed.`);
if (failures.length) process.exitCode=1;
