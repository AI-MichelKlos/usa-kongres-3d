(function(root){
  'use strict';
  const bloc = party => party === 'D' ? 'D' : party === 'R' ? 'R' : 'O';
  function sanitizeChoices(races, input) {
    const clean = {};
    for (const race of races) {
      const index = input && input[race.abbr];
      if (Number.isInteger(index) && index >= 0 && index < race.candidates.length) clean[race.abbr] = index;
    }
    return clean;
  }
  function tally(races, choices, baseline) {
    const c = sanitizeChoices(races, choices);
    const result = { D: baseline.seatsNotUpByCaucus.D, R: baseline.seatsNotUpByCaucus.R, O: 0, U: races.length };
    for (const race of races) {
      if (Object.prototype.hasOwnProperty.call(c, race.abbr)) {
        result[bloc(race.candidates[c[race.abbr]].party)]++;
        result.U--;
      }
    }
    result.control = result.D >= 51 ? 'D' : result.R >= 50 ? 'R' : 'unresolved';
    result.total = result.D + result.R + result.O + result.U;
    return result;
  }
  function retain(races) {
    const choices = {};
    races.forEach(race => { const i = race.candidates.findIndex(c => c.party === race.incumbentParty); if (i >= 0) choices[race.abbr] = i; });
    return choices;
  }
  const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
  const keyFor = race => race.key || race.districtId || race.abbr;
  function sanitizeElection(election,input){
    const clean={};
    for(const race of election.races){
      const key=keyFor(race),index=input && own(input,key) ? input[key] : null;
      if(Number.isInteger(index)&&index>=0&&index<race.candidates.length)clean[key]=index;
    }
    return clean;
  }
  function tallyElection(election,input){
    const choices=sanitizeElection(election,input);
    const counts={D:election.fixed.D||0,R:election.fixed.R||0,O:election.fixed.O||0,U:election.races.length,V:0};
    for(const race of election.races){
      const key=keyFor(race);
      if(own(choices,key)){counts[bloc(race.candidates[choices[key]].party)]++;counts.U--;}
    }
    counts.total=counts.D+counts.R+counts.O+counts.U;
    counts.control=election.kind==='governors' ? null : counts.D>=election.threshold.D ? 'D' : counts.R>=election.threshold.R ? 'R' : 'unresolved';
    return counts;
  }
  function retainElection(election){
    const choices={};
    election.races.forEach(race=>{if(!race.vacant&&race.incumbentParty){const i=race.candidates.findIndex(c=>c.party===race.incumbentParty);if(i>=0)choices[keyFor(race)]=i;}});
    return choices;
  }
  function decodeState(data,href){
    const p=new URL(href,'https://example.invalid/').searchParams;
    const states=new Set(data.states.map(s=>s.abbr));
    const kinds=['senate','house','governors'];
    const view=[...kinds,'chicago'].includes(p.get('view'))?p.get('view'):'senate';
    const selected=states.has(p.get('state'))?p.get('state'):'IL';
    const result={view,mode:p.get('mode')==='scenario'?'scenario':'guide',selected,district:'',area:states.has(p.get('area'))&&p.get('area')===selected?p.get('area'):'US',selections:{senate:{},house:{},governors:{}}};
    const notices=[];
    const compatible=!p.has('rev')||p.get('rev')===data.revision;
    for(const [kind,param] of [['senate','s'],['house','h'],['governors','g']]){
      const raw={};
      if(compatible)(p.get(param)||'').split(',').forEach(entry=>{const m=entry.match(/^([A-Z]{2}(?:-\d{2})?)\.(\d{1,2})$/);if(m)raw[m[1]]=Number(m[2]);});
      result.selections[kind]=sanitizeElection(data.elections[kind],raw);
    }
    if(!compatible&&(p.has('s')||p.has('h')||p.has('g')))notices.push('Scenariet brugte en anden kandidatliste og er nulstillet.');
    const district=data.elections.house.races.find(r=>keyFor(r)===p.get('district')&&r.abbr===selected)||data.elections.house.races.find(r=>r.abbr===selected);
    result.district=district?keyFor(district):keyFor(data.elections.house.races[0]);
    return {state:result,notices};
  }
  function encodeState(data,state,href){
    const url=new URL(href,'https://example.invalid/');
    url.searchParams.set('view',state.view);url.searchParams.set('state',state.selected);url.searchParams.set('mode',state.mode);url.searchParams.set('rev',data.revision);
    if(state.view==='house'){url.searchParams.set('district',state.district);if(state.area!=='US')url.searchParams.set('area',state.area);else url.searchParams.delete('area');}
    else {url.searchParams.delete('district');url.searchParams.delete('area');}
    for(const [kind,param] of [['senate','s'],['house','h'],['governors','g']]){
      const choices=sanitizeElection(data.elections[kind],state.selections[kind]);
      const packed=data.elections[kind].races.filter(r=>own(choices,keyFor(r))).map(r=>`${keyFor(r)}.${choices[keyFor(r)]}`).join(',');
      if(packed)url.searchParams.set(param,packed);else url.searchParams.delete(param);
    }
    return url.href;
  }
  root.ElectionMath = { bloc, sanitizeChoices, tally, retain, own, keyFor, sanitizeElection, tallyElection, retainElection, decodeState, encodeState };
})(typeof window !== 'undefined' ? window : globalThis);
