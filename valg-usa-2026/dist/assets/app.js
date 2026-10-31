(function(){
  'use strict';
  const data=window.ELECTION_DATA,M=window.ElectionMath,$=id=>document.getElementById(id);
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stateByAbbr=Object.fromEntries(data.states.map(s=>[s.abbr,s]));
  const stateByFips=Object.fromEntries(data.states.map(s=>[s.fips,s]));
  const lookups=Object.fromEntries(Object.entries(data.elections).map(([kind,e])=>[kind,Object.fromEntries(e.races.map(r=>[M.keyFor(r),r]))]));
  const stateFeatures=topojson.feature(data.topology,data.topology.objects.states).features.filter(f=>M.own(stateByFips,String(f.id).padStart(2,'0')));
  const stateFeatureByAbbr=Object.fromEntries(stateFeatures.map(f=>[stateByFips[String(f.id).padStart(2,'0')].abbr,f]));
  const districtFeatures=topojson.feature(data.houseTopology,data.houseTopology.objects.districts).features;
  const colors={D:'#3b6e93',R:'#b45d43',O:'#88713f',U:'#c3c6b8',N:'#e5dfd3',V:'#e5dfd3'};
  const copy={
    senate:{title:'Hvem får magten i Senatet?',kicker:'MIDTVEJSVALGET I USA · SENATET',intro:'Se partiernes mandatfordeling, hvilke sæder der er på valg, og kandidaterne i hver delstat.',guide:'Senatet før valget',unit:'mandater',dLabel:'Demokrater + 2 uafhængige',explanation:'51 mandater giver flertal. Ved 50 mod 50 har den republikanske vicepræsident J.D. Vance den afgørende stemme. Republikanerne kan derfor få kontrol med 50, mens Demokraternes gruppe skal nå 51. De to uafhængige samarbejder med Demokraterne.'},
    house:{title:'Hvem får flertallet i Huset?',kicker:'USA · REPRÆSENTANTERNES HUS',intro:'Alle 435 pladser er på valg. Klik dig ind i en delstat, udforsk distrikterne og se kandidaterne.',guide:'Repræsentanternes Hus før valget',unit:'mandater',dLabel:'Demokrater',explanation:'218 af de 435 stemmeberettigede pladser giver flertal i et fuldt Repræsentanternes Hus. Alle pladser er på valg. Det nuværende hus har to ledige pladser. Uafhængige tælles særskilt, og der bruges ingen vicepræsidentregel.'},
    governors:{title:'Hvem skal lede delstaterne?',kicker:'USA · GUVERNØRVALGENE',intro:'36 delstater vælger guvernør. Se kandidaterne, og hvilke partier der har guvernørposterne før valget.',guide:'Guvernørposter før valget',unit:'guvernørposter',dLabel:'Demokrater',explanation:'Hver delstat har sin egen guvernør. Optællingen viser partiernes guvernørposter i de 50 delstater og giver ikke et fælles regeringsflertal. 36 poster er på valg. 6 demokratiske og 8 republikanske poster er ikke på valg. Territorier er ikke med.'}
  };
  let state,toastTimer;
  const kind=()=>state.view==='chicago'?'senate':state.view;
  const election=()=>data.elections[kind()];
  const sourceLink=(s,label)=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(label||s.label)} <span aria-hidden="true">↗</span></a>`;
  const partyName=p=>p==='D'?'Demokraterne':p==='R'?'Republikanerne':p==='I'?'Uafhængig':'Andre partier / uafhængige';
  const stName=abbr=>stateByAbbr[abbr]?.name||abbr;
  const districtLabel=r=>String(r.district).padStart(2,'0')==='00'?'Hele delstaten':`${Number(r.district)}. distrikt`;
  const activeKey=()=>kind()==='house'?state.district:state.selected;
  const activeRace=()=>lookups[kind()][activeKey()];
  const motion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
  function showToast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},3800);}
  function readUrl(){state=M.decodeState(data,location.href).state;state.mode='guide';state.selections={senate:{},house:{},governors:{}};}
  function saveUrl(){const url=new URL(M.encodeState(data,state,location.href));for(const p of ['mode','s','h','g'])url.searchParams.delete(p);history.replaceState(null,'',url.href);}
  function ensureDistrict(){if(!M.own(lookups.house,state.district)||lookups.house[state.district].abbr!==state.selected){const r=data.elections.house.races.find(r=>r.abbr===state.selected);state.district=r?M.keyFor(r):M.keyFor(data.elections.house.races[0]);}}
  function setView(view){state.view=view;if(view==='house'){ensureDistrict();if(state.area!=='US')state.area=state.selected;}render();saveUrl();window.scrollTo({top:0,behavior:motion()});}
  function selectState(abbr,scroll){
    if(!M.own(stateByAbbr,abbr))return;state.selected=abbr;
    if(kind()==='house'){ensureDistrict();state.area=abbr;renderSelectors();renderMapHeading();drawMap();}else updateMapColors();
    renderDetail();$('state-select').value=abbr;saveUrl();
    if(scroll&&matchMedia('(max-width:780px)').matches)$('state-detail').scrollIntoView({behavior:motion(),block:'start'});
  }
  function selectDistrict(id,scroll){
    const r=lookups.house[id];if(!r)return;const changedArea=state.area!==r.abbr;
    state.district=id;state.selected=r.abbr;state.area=r.abbr;renderSelectors();renderMapHeading();renderDetail();
    if(changedArea)drawMap();else updateMapColors();saveUrl();
    if(scroll&&matchMedia('(max-width:780px)').matches)$('state-detail').scrollIntoView({behavior:motion(),block:'start'});
  }
  function raceGroup(key){const race=lookups[kind()][key];return race?race.vacant?'V':M.bloc(race.incumbentParty):'N';}
  function mapText(key){
    const race=lookups[kind()][key],label=kind()==='house'&&race?`${stName(race.abbr)}, ${districtLabel(race)}`:stName(key);
    if(!race)return `${label}: Intet ${kind()==='governors'?'guvernørvalg':'senatsvalg'} i 2026`;
    return race.vacant?`${label}: Nuværende plads er ledig`:`${label}: Nuværende parti: ${partyName(race.incumbentParty)}`;
  }
  function renderBalance(){
    const k=kind(),e=election(),c=copy[k],count={...e.current};
    $('count-d').textContent=count.D;$('count-r').textContent=count.R;$('label-d').textContent=c.dLabel;
    $('balance-heading').textContent=c.guide;$('balance-tag').textContent='FORDELING PR. 31.10.2026';
    const extra=[count.O?`${count.O} ${count.O===1?'anden':'andre'}`:'',count.V?`${count.V} ledige`:''].filter(Boolean).join(' · ');
    $('unassigned-label').innerHTML=`<strong>${e.races.length}</strong><span>${k==='governors'?'poster på valg':'pladser på valg'}</span>${extra?`<div class="minor-count">${extra}</div>`:''}`;
    const seats=[];$('seat-bar').classList.toggle('house-seats',k==='house');
    if(k==='house')for(const group of ['D','O','V','R']){if(count[group])seats.push(`<span class="seat-segment ${group.toLowerCase()}" style="width:${count[group]/e.total*100}%" aria-hidden="true"></span>`);}
    else for(const group of ['D','O','V','R'])for(let i=0;i<(count[group]||0);i++)seats.push(`<span class="seat ${group.toLowerCase()}" aria-hidden="true"></span>`);
    $('seat-bar').innerHTML=seats.join('');$('seat-bar').setAttribute('aria-label',`${count.D} ${k==='senate'?'i Demokraternes gruppe':'demokratiske'}, ${count.R} republikanske, ${count.O||0} andre, ${count.V||0} ledige. ${e.total} ${c.unit} i alt.`);
    $('seat-midline').hidden=k==='governors';
    $('majority-explanation').textContent=c.explanation;$('explain-majority').textContent=k==='governors'?'Om fordelingen':'Hvor går grænsen?';
    $('balance-description').textContent=k==='senate'?'Demokraternes gruppe omfatter 45 demokrater og 2 uafhængige.':k==='house'?'435 stemmeberettigede pladser, heraf 2 ledige. Uafhængige vises særskilt.':'50 guvernørposter i delstaterne. 36 er på valg i 2026.';
    $('senate-up-summary').hidden=k!=='senate';
    if(k==='senate'){
      const up=e.races.reduce((counts,r)=>{counts[M.bloc(r.incumbentParty)]++;return counts;},{D:0,R:0,O:0});
      $('senate-up-d').textContent=up.D;$('senate-up-r').textContent=up.R;
      $('senate-up-note').textContent=`${e.races.length} sæder i alt, inklusive suppleringsvalgene i Florida og Ohio. Tallene følger partiet, som har sædet før valget. De øvrige ${e.total-e.races.length} sæder er ikke på valg.`;
    }
  }
  function candidateContent(c){const cls=M.bloc(c.party).toLowerCase(),symbol=c.party==='D'?'D':c.party==='R'?'R':c.party==='I'?'U':'A';return `<span class="candidate-symbol ${cls}" aria-hidden="true">${symbol}</span><span><span class="candidate-name">${esc(c.name)}${c.runningMate?`<br><span class="candidate-party">med ${esc(c.runningMate)}</span>`:''}</span><span class="candidate-party" style="display:block">${esc(c.partyLabel||c.partyDa||partyName(c.party))}</span>${c.note?`<span class="candidate-party" style="display:block">${esc(c.note)}</span>`:''}</span>`;}
  function renderDetail(){
    const k=kind(),race=activeRace(),name=stName(state.selected);
    const type=race?k==='house'?`${districtLabel(race)} · 1 plads`:k==='governors'?'Guvernørvalg · 1 post':`1 sæde på valg · ${race.typeLabel||'Ordinært valg'}`:`Intet ${k==='governors'?'guvernørvalg':'senatsvalg'} i 2026`;
    const population=new Intl.NumberFormat('da-DK').format(stateByAbbr[state.selected].population2025);
    const joined=stateByAbbr[state.selected].statehood;
    const header=`<div class="state-detail-header"><div><h2 class="${name.length>15?'long-title':''}">${esc(name)}</h2><p class="state-type">${esc(type)}</p><p class="state-type">Indbyggere (2025): ${population}</p><p class="state-type">Optaget i USA: ${joined.year} (${joined.order}. delstat)</p></div><span class="state-code">${k==='house'?esc(state.district):esc(state.selected)}</span></div>`;
    if(!race){$('state-detail').innerHTML=header+`<p class="no-election">${k==='governors'?'Guvernørposten er ikke på valg denne gang. Den indgår i den nuværende fordeling.':'Ingen af delstatens to senatspladser er på valg denne gang. De indgår i den nuværende mandatfordeling.'}</p><button class="button button-dark state-action" id="choose-illinois" type="button">Se valget i Illinois ↗</button>`;$('choose-illinois').addEventListener('click',()=>selectState('IL',false));return;}
    const current=race.vacant?'Den nuværende plads er ledig ved datatjekket.':k==='house'?`Nuværende medlem, samme distriktsnummer:<br><strong>${esc(race.incumbent)}</strong> · ${partyName(race.incumbentParty)}.`:k==='governors'?`Nuværende guvernør:<br><strong>${esc(race.incumbent)}</strong> · ${partyName(race.incumbentParty)}.`:`Sædet tilhører <strong>${partyName(race.incumbentParty)}</strong>.<br>Siddende senator: <strong>${esc(race.incumbent)}</strong>.`;
    const boundary=k==='house'&&race.redistricted?'<span class="boundary-note">Distriktets grænser er ændret til 2026. Medlemsoplysningerne følger det nuværende distriktsnummer.</span>':'';
    const candidates=race.candidates.map(c=>`<div class="candidate-row">${candidateContent(c)}</div>`).join('');
    const note=(race.note||'').replace(/; en scenarievælger[^.]*\./g,'.').trim();
    $('state-detail').innerHTML=`${header}<p class="incumbent">${current}${boundary}</p><p class="candidate-heading">Kandidater</p><div class="candidate-list">${candidates}</div><p class="candidate-scope">${esc(race.candidateScope)}</p>${note?`<p class="candidate-scope">${esc(note)}</p>`:''}${race.abbr==='IL'?'<button type="button" class="text-button state-chicago-link" data-open-chicago>Hvad stemmer Chicago ellers om? ↗</button>':''}<div class="state-source-links">${(race.sources||[]).map(s=>sourceLink(s)).join('')}</div>`;
    $('state-detail').querySelectorAll('[data-open-chicago]').forEach(b=>b.addEventListener('click',()=>setView('chicago')));
  }
  function renderSelectors(){
    const k=kind(),sorted=[...data.states].sort((a,b)=>a.name.localeCompare(b.name,'da'));
    const option=s=>`<option value="${s.abbr}">${esc(s.name)}</option>`;
    $('state-select').innerHTML=k==='house'?sorted.map(option).join(''):`<optgroup label="${k==='senate'?'Senatsvalg':'Guvernørvalg'} i 2026">${sorted.filter(s=>M.own(lookups[k],s.abbr)).map(option).join('')}</optgroup><optgroup label="Intet valg til denne post i 2026">${sorted.filter(s=>!M.own(lookups[k],s.abbr)).map(option).join('')}</optgroup>`;
    $('state-select').value=state.selected;$('district-control').hidden=k!=='house';
    if(k==='house'){$('district-select').innerHTML=election().races.filter(r=>r.abbr===state.selected).map(r=>`<option value="${esc(M.keyFor(r))}">${esc(districtLabel(r))}</option>`).join('');$('district-select').value=state.district;}
  }
  function renderMapHeading(){
    const k=kind(),house=k==='house';
    $('map-kicker').textContent=house?'DE 435 KONGRESDISTRIKTER':'DE 50 DELSTATER';
    $('map-title').textContent=house?(state.area==='US'?'Fra delstat til distrikt.':stName(state.area)):'Ét klik. Ét valg.';
    $('map-description').textContent=house?'2026-grænser. Farven viser nuværende parti for samme distriktsnummer.':k==='governors'?'Farven viser den nuværende guvernørs parti i stater med valg.':'Farven viser, hvilket parti der har sædet på valg.';
    $('house-map-toolbar').hidden=!house;
    $('house-map-location').textContent=state.area==='US'?'Alle 435 distrikter':`${stName(state.area)} · ${data.elections.house.races.filter(r=>r.abbr===state.area).length} distrikter`;
    $('map-all-states').disabled=state.area==='US';
    document.querySelector('.map-zoom-hint').textContent=state.area==='US'?'Klik et distrikt for at zoome ind':'Klik et distrikt eller brug listen nedenfor';
    $('map-note').textContent=house&&state.area!=='US'?'Distrikter til 2026-valget.':'Alaska og Hawaii vises som indsatser.';
    $('map-access-title').textContent=house?'Kongresdistrikter i USA 2026':k==='governors'?'Guvernørvalg i USA 2026':"USA's senatsvalg 2026";
    $('map-access-desc').textContent=house?'Klik et distrikt for at zoome til delstaten. Brug også delstats- og distriktslisterne under kortet.':'Vælg en delstat for at se kandidater. Du kan også bruge listen under kortet.';
  }
  function drawMap(){
    if(state.view==='chicago')return;
    const k=kind(),house=k==='house',width=$('us-map').parentElement.clientWidth;if(width<1)return;
    const small=width<480,height=Math.round(width*(small?.76:.66)),focused=house&&state.area!=='US';
    const features=house?districtFeatures.filter(f=>!focused||f.properties.stateAbbr===state.area):stateFeatures;
    const outlines=focused?[stateFeatureByAbbr[state.area]]:stateFeatures;
    const collection={type:'FeatureCollection',features:[...features,...outlines]};
    let projection;
    if(focused){const center=d3.geoCentroid(stateFeatureByAbbr[state.area]);projection=d3.geoMercator().rotate([-center[0],0]).center([0,center[1]]).fitExtent([[16,16],[width-16,height-16]],collection);}
    else projection=d3.geoAlbersUsa().fitExtent([[5,12],[width-(small?23:40),height-10]],collection);
    const path=d3.geoPath(projection),svg=d3.select('#us-map').attr('viewBox',`0 0 ${width} ${height}`);
    svg.selectAll('g').remove();
    if(focused)svg.append('g').attr('aria-hidden','true').selectAll('path').data(outlines).join('path').attr('d',path).attr('fill',colors.N);
    const keyForFeature=f=>house?f.id:stateByFips[String(f.id).padStart(2,'0')].abbr;
    const shapes=svg.append('g').attr('class','map-shapes').selectAll('path').data(features).join('path').attr('d',path).attr('class',house?'district-boundary':'state-shape').attr('data-map-key',keyForFeature).attr('id',f=>`${house?'district':'state'}-${keyForFeature(f)}`).attr('role','button').attr('tabindex',0)
      .on('click',(event,f)=>{if(house)selectDistrict(keyForFeature(f),focused);else selectState(keyForFeature(f),true);})
      .on('keydown',(event,f)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(house)selectDistrict(keyForFeature(f),focused);else selectState(keyForFeature(f),true);}})
      .on('pointerenter',(event,f)=>{if(event.pointerType==='touch')return;$('map-tooltip').textContent=mapText(keyForFeature(f));$('map-tooltip').hidden=false;positionTooltip(event);}).on('pointermove',positionTooltip).on('pointerleave',()=>{$('map-tooltip').hidden=true;});
    shapes.append('title').text(f=>mapText(keyForFeature(f)));
    if(house)svg.append('g').attr('aria-hidden','true').selectAll('path').data(outlines).join('path').attr('d',path).attr('class','state-outline');
    const labels=svg.append('g').attr('aria-hidden','true');
    if(focused){
      const taken=[];const labelData=features.map(f=>({f,key:f.id,p:path.centroid(f),bounds:path.bounds(f)})).filter(d=>d.p.every(Number.isFinite)).sort((a,b)=>path.area(b.f)-path.area(a.f)).filter(d=>{const [a,b]=d.bounds;if(b[0]-a[0]<21||b[1]-a[1]<17)return false;const lonlat=projection.invert(d.p);if(!lonlat||!d3.geoContains(d.f,lonlat))return false;const box={x:d.p[0]-10,y:d.p[1]-8,w:20,h:16};if(taken.some(t=>Math.abs(t.x-box.x)<22&&Math.abs(t.y-box.y)<17))return false;taken.push(box);return true;});
      labels.selectAll('text').data(labelData).join('text').attr('class','map-label district-label').attr('x',d=>d.p[0]).attr('y',d=>d.p[1]).text(d=>Number(d.f.properties.district)||d.f.properties.stateAbbr);
    }else{
      const rail=['VT','NH','MA','RI','CT','NJ','DE','MD'];
      const labelData=stateFeatures.map(f=>({f,meta:stateByFips[String(f.id).padStart(2,'0')],p:path.centroid(f)})).filter(d=>d.p.every(Number.isFinite));
      const external=labelData.filter(d=>rail.includes(d.meta.abbr)).sort((a,b)=>a.p[1]-b.p[1]);
      if(!small){let y=height*.10;external.forEach(d=>{d.ly=Math.max(d.p[1],y+17);y=d.ly;d.lx=width-13;});labels.selectAll('path').data(external).join('path').attr('class','map-callout').attr('d',d=>`M${d.p[0]},${d.p[1]}L${width-35},${d.ly}L${width-24},${d.ly}`);}
      labels.selectAll('text').data(labelData.filter(d=>!small||!rail.includes(d.meta.abbr))).join('text').attr('class',`map-label ${house?'national-house-label':''}`).attr('data-abbr',d=>d.meta.abbr).attr('x',d=>d.lx||d.p[0]).attr('y',d=>d.ly||d.p[1]).text(d=>d.meta.abbr);
    }
    updateMapColors();
  }
  function positionTooltip(event){const tip=$('map-tooltip');if(tip.hidden)return;const box=$('us-map').parentElement.getBoundingClientRect();tip.style.left=`${Math.max(4,Math.min(event.clientX-box.left+13,box.width-tip.offsetWidth-4))}px`;tip.style.top=`${Math.max(0,event.clientY-box.top-tip.offsetHeight-12)}px`;}
  function updateMapColors(){
    const k=kind(),house=k==='house';
    d3.select('#us-map').selectAll('[data-map-key]').attr('fill',function(){return colors[raceGroup(this.getAttribute('data-map-key'))];}).attr('aria-label',function(){return mapText(this.getAttribute('data-map-key'));}).attr('aria-pressed',function(){return this.getAttribute('data-map-key')===activeKey();}).classed('selected',function(){return this.getAttribute('data-map-key')===activeKey();});
    d3.select('#us-map').selectAll('[data-map-key] title').text(function(){return mapText(this.parentNode.getAttribute('data-map-key'));});
    if(!house)d3.select('#us-map').selectAll('.map-label').attr('fill',d=>d.lx?'#3c342b':['D','R','O'].includes(raceGroup(d.meta.abbr))?'#fffaf2':'#665f52');
    d3.select('#us-map').selectAll('.map-shapes .selected').raise();
    const legends=[['d','Demokratisk'],['r','Republikansk'],...(house?[['o','Uafhængig'],['v','Ledig plads']]:[])];
    if(!house)legends.push(['n',`Intet ${k==='governors'?'guvernørvalg':'senatsvalg'}`]);
    $('map-legend').innerHTML=legends.map(([c,t])=>`<span><i class="dot ${c}"></i>${t}</span>`).join('');
  }
  function renderExplainers(){
    const k=kind();
    const notes=k==='senate'?[['To senatorer pr. delstat','Alle delstater har to pladser, uanset indbyggertal. Mandatbjælken viser magtbalancen uden at give store landområder ekstra vægt.'],['35 valg denne gang','33 ordinære valg og to suppleringsvalg i Florida og Ohio. De øvrige 65 pladser er ikke på valg.'],['De to uafhængige','De to nuværende uafhængige er med i Demokraternes gruppe. Deres sæder er ikke på valg i 2026.']]:k==='house'?[['435 distrikter, 435 pladser','Alle stemmeberettigede pladser er på valg. Et fuldt hus kræver 218 mandater til flertal. DC og territorier indgår ikke.'],['Zoom ind i delstaten','Klik et distrikt eller vælg en delstat. Brug distriktslisten til de små byområder, som er svære at ramme på landkortet.'],['Grænserne er til 2026','Flere distrikter er ændret. Nuværende medlemmer og farver følger distriktsnummeret, ikke nødvendigvis samme vælgerområde.']]:[['36 delstater vælger','Guvernøren leder delstatens administration. I denne opgørelse indgår kun de 50 delstater, ikke territorier.'],['14 poster er ikke på valg','6 demokratiske og 8 republikanske guvernørposter er ikke på valg. De indgår i den nuværende fordeling.'],['Ingen fælles flertalsgrænse','Fordelingen viser, hvor mange delstater hvert parti leder. Den giver ikke magten over en samlet regering.']];
    $('election-explainers').innerHTML=notes.map(([title,text],i)=>`<article><span class="explainer-number">0${i+1}</span><div><h3>${title}</h3><p>${text}</p></div></article>`).join('');
  }
  function renderChicago(){
    const c=data.chicago,sourceById=Object.fromEntries(c.sources.map(s=>[s.id,s]));
    $('chicago-statewide').innerHTML=c.statewideRaces.map(r=>`<article class="chicago-race"><h3>${esc(r.title)}</h3><p>${esc(r.description)}</p><div class="candidate-list">${r.candidates.map(k=>`<div class="candidate-row">${candidateContent(k)}</div>`).join('')}</div><p class="candidate-scope">${esc(r.candidateScope)}</p><div class="state-source-links">${r.sourceIds.filter(id=>sourceById[id]).slice(0,1).map(id=>sourceLink(sourceById[id])).join('')}</div></article>`).join('');
    $('chicago-offices').innerHTML=c.otherBallotSections.map(s=>`<article class="office-item"><h3>${esc(s.title)}</h3><p>${esc(s.description)}</p></article>`).join('');
    $('chicago-referendums').innerHTML=c.referendums.map((r,i)=>`<article class="referendum"><span class="referendum-number">${String(i+1).padStart(2,'0')}</span><div><p class="jurisdiction">${esc(r.jurisdictionDa)}</p><h3>${esc(r.title)}</h3><p>${esc(r.summary)}</p>${r.sourceIds.filter(id=>sourceById[id]).slice(0,1).map(id=>sourceLink(sourceById[id],'Læs kilden')).join('')}</div></article>`).join('');
    $('chicago-sources').innerHTML=c.sources.filter(s=>s.id!=='cook-results').map(s=>`<li>${sourceLink(s)}</li>`).join('');
    $('national-sources').innerHTML=data.baseline.sources.filter(s=>['party','daily-press','race-count','tie','oh-special','fl-ballot'].includes(s.id)).map(s=>`<li>${sourceLink(s)}</li>`).join('')+`<li>${sourceLink({label:'US Atlas: publicerede delstatsgrænser',url:data.baseline.geometry.sourceProjectUrl})}</li>`;
    const unique=list=>[...new Map(list.filter(s=>s.url&&s.label).map(s=>[s.url,s])).values()];
    $('house-sources').innerHTML=unique([...(data.elections.house.sources||[]),...data.houseGeometry.sources.filter(s=>['census-guidance','census-120','census-119-mo'].includes(s.id))]).map(s=>`<li>${sourceLink(s)}</li>`).join('');
    $('governor-sources').innerHTML=unique(data.elections.governors.sources||[]).map(s=>`<li>${sourceLink(s)}</li>`).join('');
    $('geometry-method').textContent='Kortet følger Census’ distriktsgrænser til 2026-valget. Missouri er rettet til den tidligere plan, som fortsat gælder efter retsafgørelsen i september. Farven viser det nuværende parti for samme distriktsnummer, ikke et tidligere resultat for præcis det viste område. Kortgrænserne er forenklet til visning.';
  }
  function render(){
    const chicago=state.view==='chicago',k=kind();
    $('senate-view').hidden=chicago;$('chicago-view').hidden=!chicago;
    document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===state.view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    $('page-title').textContent=chicago?'Én by. Mange valg.':copy[k].title;
    $('hero-kicker').textContent=chicago?'MIDTVEJSVALGET I USA · CHICAGO':copy[k].kicker;
    $('hero-copy').textContent=chicago?'Et overblik over valgene i Chicago den 3. november. Fra Senatet i Washington til Chicagos skolebestyrelse.':copy[k].intro;
    document.title=chicago?'Chicago | Valg USA 2026':`${k==='house'?'Repræsentanternes Hus':k==='governors'?'Guvernørvalg':'Senatet'} | Valg USA 2026`;
    renderSelectors();renderBalance();renderDetail();renderMapHeading();renderExplainers();if(!chicago)requestAnimationFrame(drawMap);
  }
  $('state-select').addEventListener('change',e=>selectState(e.target.value,false));$('district-select').addEventListener('change',e=>selectDistrict(e.target.value,false));
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  document.querySelectorAll('[data-open-chicago]').forEach(b=>b.addEventListener('click',()=>setView('chicago')));
  document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();setView('senate');});
  $('back-to-illinois').addEventListener('click',()=>{state.selected='IL';setView('senate');});
  $('map-all-states').addEventListener('click',()=>{state.area='US';renderMapHeading();drawMap();saveUrl();});
  $('explain-majority').setAttribute('aria-expanded','false');$('explain-majority').setAttribute('aria-controls','majority-explanation');$('explain-majority').addEventListener('click',()=>{const open=$('majority-explanation').hidden;$('majority-explanation').hidden=!open;$('explain-majority').setAttribute('aria-expanded',open);});
  $('share').addEventListener('click',async()=>{saveUrl();try{if(!navigator.clipboard)throw new Error('No clipboard');await navigator.clipboard.writeText(location.href);showToast('Link til den valgte visning er kopieret.');}catch(e){$('share-url').value=location.href;$('share-dialog').showModal();$('share-url').focus();$('share-url').select();}});
  $('close-share').addEventListener('click',()=>{$('share-dialog').close();});$('select-share').addEventListener('click',()=>{$('share-url').focus();$('share-url').select();});
  $('share-dialog').addEventListener('click',e=>{if(e.target===$('share-dialog')){const r=$('share-dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('share-dialog').close();}});
  window.addEventListener('popstate',()=>{readUrl();render();saveUrl();});
  readUrl();renderChicago();render();saveUrl();new ResizeObserver(()=>drawMap()).observe($('us-map').parentElement);
})();
