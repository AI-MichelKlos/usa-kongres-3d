import '@fontsource/outfit/latin-400.css';
import '@fontsource/outfit/latin-500.css';
import '@fontsource/outfit/latin-600.css';
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/fraunces/latin-600-italic.css';
import './style.css';

import { COLORS, SENATE_HEIGHT, buildModel, houseHeight } from './analyze.js';
import { buildStateGeometries } from './geo.js';
import { createScene } from './scene.js';
import { territoryInfo } from './fips.js';
import { mascotSvg } from './mascots.js';
import {
  caucusPhrase,
  danishDate,
  danishStamp,
  delegationMascot,
  districtLabel,
  electionBanner,
  majorityLine,
  mascotMajorityLine,
  partyBadge,
  rankLabel,
  rosterPhrase,
  seatElection,
  todayInNewYork,
  tugFigures,
  yearSpan,
} from './format.js';

const $ = (id) => document.getElementById(id);

const boot = $('boot');
const bootStatus = $('boot-status');
const summary = $('summary');
const footer = $('footer');
const tooltip = $('tooltip');
const stage = $('stage');
const call = $('call');
const callText = $('call-text');
const callCount = $('call-count');
const callBar = $('call-bar');
const hint = $('hint');
const panelScroll = $('panel-scroll');
const sheetLabel = $('sheet-label');
const sheetToggle = $('sheet-toggle');
const panelClose = $('panel-close');
const stateSelect = $('state-select');
const valgnatBtn = $('valgnat');
const live = $('live');
const dialog = $('delegates-dialog');

let model = null;
let names = {};
let scene = null;
let mode = 'house';
let selected = null;
let playing = false;
let todayISO = todayInNewYork();
const phoneMq = window.matchMedia('(max-width: 979px)');
const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function lookFor(nextMode) {
  const look = {};
  for (const [abbr, state] of Object.entries(model.states)) {
    const style = nextMode === 'senate' ? state.senateStyle : state.houseStyle;
    const counts = nextMode === 'senate' ? state.senateCounts : state.houseCounts;
    look[abbr] = {
      color: style.color,
      height: nextMode === 'senate' ? SENATE_HEIGHT : houseHeight(state.houseSeats),
      marker: style.independent,
      mascot: delegationMascot(counts, nextMode),
    };
  }
  return look;
}

function totalsFor(nextMode) {
  return nextMode === 'senate' ? model.senateTotals : model.houseTotals;
}

function segments(totals) {
  const items = [
    ['Demokrater', totals.Democrat, 'var(--d)'],
    ['Uafhængige', totals.Independent, 'var(--i)'],
    ['Andre', totals.other + totals.unknown, '#d7c4e8'],
    ['Republikanere', totals.Republican, 'var(--r)'],
    ['Ledige', totals.vacant, 'var(--v)'],
  ].filter(([, count]) => count > 0);
  const weights = items.map(([, count]) => Math.max((count / totals.seats) * 100, 0.9));
  const sum = weights.reduce((acc, value) => acc + value, 0);
  return items.map(([label, count, color], index) => ({
    label, count, color, width: (weights[index] / sum) * 100,
  }));
}

function renderSummary() {
  const totals = totalsFor(mode);
  const bars = segments(totals);
  const stats = [
    [totals.Democrat, 'Demokrater', 'd'],
    [totals.Republican, 'Republikanere', 'r'],
    [totals.Independent, totals.Independent === 1 ? 'Uafhængig' : 'Uafhængige', 'i'],
    [totals.vacant, totals.vacant === 1 ? 'Ledig' : 'Ledige', 'v'],
  ];
  if (totals.other) stats.splice(3, 0, [totals.other, 'Andre', 'o']);
  const chamber = mode === 'senate'
    ? `Senatet · ${totals.seats} pladser`
    : `Repræsentanternes Hus · ${totals.seats} stemmeberettigede pladser`;
  const legend = mode === 'senate'
    ? 'Samme højde i alle stater. Blå er demokratisk caucus, rød er republikansk, lilla er delt. Dæmpet farve er en ledig plads. Mærket U er en uafhængig.'
    : 'Højden er antal pladser. Farven blander rød og blå efter andelen af demokrater og republikanere. Mærket U er en uafhængig og trækker ikke farven.';
  const banner = electionBanner(model, todayISO);
  const imbalance = totals.imbalance
    ? `<p class="warn">Optællingen stemmer ikke med mandatfordelingen (forskel ${totals.imbalance}).</p>`
    : '';
  const tug = tugFigures(totals);
  const barLabel = [
    `Tovtrækning. Æslerne ${tug.d}, elefanterne ${tug.r}, af ${tug.seats}.`,
    `Flertal ved ${tug.need}.`,
    bars.map((part) => `${part.count} ${part.label.toLowerCase()}`).join(', '),
  ].join(' ');
  const tugHtml = `
    <div class="tug" role="img" aria-label="${esc(barLabel)}">
      <span class="tug-animal tug-donkey">${mascotSvg('D')}</span>
      <div class="tug-track">
        <span class="tug-rope tug-rope-d"></span>
        <span class="tug-rope tug-rope-r"></span>
        <span class="tug-stake" style="left:${tug.needPct}%">
          <span class="tug-stake-label">${tug.need}</span>
        </span>
        <span class="tug-knot"></span>
      </div>
      <span class="tug-animal tug-elephant">${mascotSvg('R')}</span>
    </div>`;
  const statsHtml = `
    <div class="stats">
      ${stats.map(([count, label, tone]) => {
        const icon = tone === 'd' ? mascotSvg('D') : tone === 'r' ? mascotSvg('R') : tone === 'i' ? mascotSvg('I') : '';
        return `<div class="stat tone-${tone}"><b>${icon}${count}</b><span>${esc(label)}</span></div>`;
      }).join('')}
    </div>`;
  const story = `
    <div class="story">
      <p class="chamber-label">${esc(chamber)}. Delegerede er ikke talt med. Tovet er caucus-sæder, og stregen er flertal ved ${tug.need}.</p>
      <p class="majority">${esc(majorityLine(totals, totals.seats))}</p>
      <p class="legend"><span class="u-dot" aria-hidden="true">U</span> ${esc(legend)}</p>
      ${imbalance}
      ${banner ? `<p class="election">${esc(banner)}</p>` : ''}
      <p class="disclaimer">Valgnat animerer den siddende kongres, stat for stat. Det er ikke en prognose.</p>
      <button type="button" id="open-delegates" class="text-btn">Delegerede uden stemmeret (${model.delegates.length})</button>
    </div>`;
  if (phoneMq.matches) {
    summary.innerHTML = tugHtml + statsHtml;
    $('about-body').innerHTML = story;
  } else {
    summary.innerHTML = tugHtml + statsHtml + story;
    $('about-body').innerHTML = '';
  }
  animateTug(summary.querySelector('.tug'), tug);
  $('open-delegates').addEventListener('click', openDelegates);
}

function animateTug(root, tug) {
  const ropeD = root.querySelector('.tug-rope-d');
  const ropeR = root.querySelector('.tug-rope-r');
  const knot = root.querySelector('.tug-knot');
  const apply = (dPct, rPct) => {
    ropeD.style.width = `${dPct}%`;
    ropeR.style.width = `${rPct}%`;
    knot.style.left = `${dPct}%`;
  };
  if (reducedMq.matches) {
    apply(tug.dPct, tug.rPct);
    return;
  }
  apply(tug.needPct, 100 - tug.needPct);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => apply(tug.dPct, tug.rPct));
  });
}

function renderFooter() {
  const warnings = model.warnings.length
    ? `<p class="warn">${model.warnings.map((warning) => esc(warning)).join(' ')}</p>`
    : '';
  const unplaced = model.unplaced.length
    ? `<p class="warn">${model.unplaced.length} medlemmer kunne ikke placeres og står i listen over delegerede.</p>`
    : '';
  footer.innerHTML = `
    <p>Kilde: <a href="${esc(model.sourceRepo)}">unitedstates/congress-legislators</a>
      (<a href="${esc(model.source)}">legislators-current</a>).
      Hentet ${esc(danishStamp(model.fetchedAt))} dansk tid.
      Kortgeometri: <a href="https://github.com/topojson/us-atlas">us-atlas</a>, projiceret med d3-geo Albers USA.
      Huspladser følger folketællingen i 2020.</p>
    <p>D.C. og territorierne har delegerede uden stemmeret. De er ikke tegnet på kortet og tæller ikke med i mandatstallene.</p>
    ${warnings}${unplaced}
  `;
}

function fillSelect() {
  const options = Object.keys(model.states)
    .map((abbr) => ({ abbr, name: names[abbr] || abbr }))
    .sort((a, b) => a.name.localeCompare(b.name, 'da'));
  stateSelect.innerHTML = `<option value="">Find en stat…</option>${options.map((option) => (
    `<option value="${option.abbr}">${esc(option.name)}</option>`
  )).join('')}`;
}

function syncUrl() {
  const url = new URL(location.href);
  url.searchParams.set('kammer', mode === 'senate' ? 'senat' : 'hus');
  if (selected) url.searchParams.set('stat', selected);
  else url.searchParams.delete('stat');
  history.replaceState(null, '', url);
}

function syncModeButtons() {
  $('mode-house').setAttribute('aria-pressed', mode === 'house' ? 'true' : 'false');
  $('mode-senate').setAttribute('aria-pressed', mode === 'senate' ? 'true' : 'false');
  document.body.dataset.mode = mode;
}

function setMode(next, { animate = true } = {}) {
  mode = next === 'senate' ? 'senate' : 'house';
  if (playing) stopShow();
  syncModeButtons();
  const look = lookFor(mode);
  if (animate) scene.animateLook(look);
  else scene.setLook(look);
  renderSummary();
  if (selected) {
    document.documentElement.style.setProperty('--accent', look[selected].color);
    renderPanel();
  }
  syncUrl();
}

function updateInset(refocus) {
  if (!scene) return;
  let overlap = 0;
  if (phoneMq.matches && document.body.classList.contains('sheet-open')) {
    const canvas = $('c').getBoundingClientRect();
    const panel = $('panel').getBoundingClientRect();
    overlap = Math.max(0, Math.min(canvas.height, canvas.bottom - panel.top));
  }
  scene.setBottomInset(overlap);
  if (refocus && selected) scene.focus(selected);
}

function selectState(abbr, { fly = true } = {}) {
  if (!model.states[abbr]) return;
  selected = abbr;
  scene.setSelected(abbr);
  stateSelect.value = abbr;
  const label = `${names[abbr] || abbr} · ${abbr}`;
  sheetLabel.textContent = label;
  panelClose.hidden = false;
  document.body.classList.add('sheet-open');
  sheetToggle.setAttribute('aria-expanded', 'true');
  const style = mode === 'senate' ? model.states[abbr].senateStyle : model.states[abbr].houseStyle;
  document.documentElement.style.setProperty('--accent', style.color);
  renderPanel();
  syncUrl();
  const state = model.states[abbr];
  const lead = mode === 'senate'
    ? `Senat: ${rosterPhrase(state.senate, state.senateVacancies.length)}`
    : `Hus: ${rosterPhrase(state.house, state.houseVacancies.length)}`;
  live.textContent = `${names[abbr]}. ${lead}.`;
  requestAnimationFrame(() => updateInset(fly));
}

function clearSelection() {
  selected = null;
  scene.setSelected(null);
  stateSelect.value = '';
  sheetLabel.textContent = 'Vælg en stat';
  panelClose.hidden = true;
  document.body.classList.remove('sheet-open');
  sheetToggle.setAttribute('aria-expanded', 'false');
  renderPanel();
  syncUrl();
  updateInset(false);
}

function toggleSheet() {
  const open = !document.body.classList.contains('sheet-open');
  document.body.classList.toggle('sheet-open', open);
  sheetToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  requestAnimationFrame(() => updateInset(open && !!selected));
}

function memberBits(member) {
  const bits = [partyBadge(member.party)];
  const caucus = caucusPhrase(member);
  if (caucus) bits.push(caucus);
  return bits;
}

function electionBadge(member) {
  const info = seatElection(member.termEnd, todayISO);
  if (!info || info.status !== 'upcoming') return '';
  return '<span class="badge">På valg</span>';
}

function partyMark(member) {
  if (member.party === 'Democrat') return mascotSvg('D');
  if (member.party === 'Republican') return mascotSvg('R');
  return mascotSvg('I');
}

function personArticle(member, meta, { badge = true } = {}) {
  const link = member.url
    ? `<a href="${esc(member.url)}" target="_blank" rel="noopener noreferrer">Officiel side</a>`
    : '';
  const flag = badge ? electionBadge(member) : '';
  return `<article class="person">
    <span class="avatar" data-party="${esc(member.party || 'unknown')}">${partyMark(member)}</span>
    <div>
      <header><strong>${esc(member.name)}</strong> ${flag}</header>
      <p class="meta">${memberBits(member).map(esc).join(' · ')}${meta ? ` · ${esc(meta)}` : ''}</p>
      ${link}
    </div>
  </article>`;
}

function vacantArticle(title, detail) {
  return `<article class="person vacant">
    <span class="avatar" data-party="vacant">–</span>
    <div>
      <header><strong>${esc(title)}</strong></header>
      ${detail ? `<p class="meta">${esc(detail)}</p>` : ''}
    </div>
  </article>`;
}

function houseBlock(state, { primary = false, heading = true } = {}) {
  const rows = [
    ...(state.house || []).map((member) => ({ kind: 'member', district: member.district, member })),
    ...state.houseVacancies.map((vacancy) => ({ kind: 'vacant', district: vacancy.district, vacancy })),
  ].sort((a, b) => {
    const rank = (district) => (district == null ? 9999 : district === 0 ? -1 : district);
    return rank(a.district) - rank(b.district);
  });
  const upcoming = (state.house || []).map((member) => seatElection(member.termEnd, todayISO));
  const allUp = state.house.length > 0 && upcoming.every((info) => info?.status === 'upcoming');
  const note = allUp
    ? `<p class="note">Alle pladserne er på valg ${esc(danishDate(upcoming[0].electionISO))}.</p>`
    : '';
  const inferred = state.houseVacancies.some((vacancy) => vacancy.inferred && vacancy.district != null);
  const unnamed = state.houseVacancies.some((vacancy) => !vacancy.inferred || vacancy.district == null);
  const notes = [];
  if (inferred) notes.push('Distriktnummeret er udledt, fordi kilden ikke har et medlem på pladsen.');
  if (unnamed) notes.push('Kilden har færre medlemmer end mandater. Distriktnummeret kan ikke udledes sikkert.');
  if (state.house.length > state.houseSeats) {
    notes.push(`Kilden har ${state.house.length} medlemmer, men staten har ${state.houseSeats} mandater.`);
  }
  const body = rows.map((row) => {
    if (row.kind === 'vacant') {
      const place = districtLabel(row.district);
      return vacantArticle('Ledig plads', place);
    }
    const place = districtLabel(row.member.district);
    return personArticle(row.member, place, { badge: !allUp });
  }).join('');
  const title = primary ? 'Repræsentanter' : 'Repræsentanternes Hus';
  return `<section class="block${primary ? ' is-primary' : ''}">
    ${heading ? `<h3>${title} · ${state.houseSeats}</h3>` : ''}
    <p class="roster">${esc(rosterPhrase(state.house, state.houseVacancies.length))}</p>
    ${note}
    ${body}
    ${notes.map((line) => `<p class="note">${esc(line)}</p>`).join('')}
  </section>`;
}

function senateBlock(state, { primary = false, heading = true } = {}) {
  const rows = [
    ...(state.senate || []).map((member) => ({ kind: 'member', senateClass: member.senateClass, member })),
    ...state.senateVacancies.map((vacancy) => ({ kind: 'vacant', senateClass: vacancy.senateClass, vacancy })),
  ].sort((a, b) => (a.senateClass ?? 9) - (b.senateClass ?? 9));
  const inferred = state.senateVacancies.some((vacancy) => vacancy.inferred && vacancy.senateClass != null);
  const body = rows.map((row) => {
    if (row.kind === 'vacant') {
      const detail = row.senateClass ? `Klasse ${row.senateClass}` : '';
      return vacantArticle('Ledig plads', detail);
    }
    const bits = [];
    const rank = rankLabel(row.member.stateRank);
    if (rank) bits.push(rank);
    if (row.member.senateClass) bits.push(`klasse ${row.member.senateClass}`);
    if (row.member.termEnd) bits.push(`sidder til ${danishDate(row.member.termEnd)}`);
    return personArticle(row.member, bits.join(' · '));
  }).join('');
  const note = inferred
    ? '<p class="note">Klassen er den faste senatsklasse, der mangler i kilden. Der er ikke sat et navn på pladsen.</p>'
    : '';
  const title = primary ? 'Senatorer' : 'Senatet';
  return `<section class="block${primary ? ' is-primary' : ''}">
    ${heading ? `<h3>${title}</h3>` : ''}
    <p class="roster">${esc(rosterPhrase(state.senate, state.senateVacancies.length))}</p>
    ${body}
    ${note}
  </section>`;
}

function renderPanel() {
  if (!selected) {
    panelScroll.innerHTML = `
      <div class="empty">
        <p>Vælg en stat på kortet eller i listen for at se senatorer og repræsentanter.</p>
      </div>`;
    return;
  }
  const state = model.states[selected];
  const phone = phoneMq.matches;
  const senate = senateBlock(state, {
    primary: mode === 'senate',
    heading: !(phone && mode !== 'senate'),
  });
  const house = houseBlock(state, {
    primary: mode === 'house',
    heading: !(phone && mode !== 'house'),
  });
  const body = phone
    ? (mode === 'senate'
      ? `<div class="primary-chamber">${senate}</div><details class="secondary-chamber"><summary>Repræsentanter · ${state.houseSeats}</summary>${house}</details>`
      : `<div class="primary-chamber">${house}</div><details class="secondary-chamber"><summary>Senatorer</summary>${senate}</details>`)
    : (mode === 'senate' ? senate + house : house + senate);
  panelScroll.innerHTML = `${body}<p class="note">Kilde: congress-legislators, hentet ${esc(danishStamp(model.fetchedAt))}.</p>`;
  panelScroll.scrollTop = 0;
}

function openDelegates() {
  const groups = new Map();
  for (const person of model.delegates) {
    const list = groups.get(person.state) || [];
    list.push(person);
    groups.set(person.state, list);
  }
  const codes = [...groups.keys()].sort((a, b) => (
    territoryInfo(a).name.localeCompare(territoryInfo(b).name, 'da')
  ));
  const blocks = codes.map((code) => {
    const info = territoryInfo(code);
    const people = groups.get(code).map((person) => {
      const span = yearSpan(person.termStart, person.termEnd);
      return personArticle(person, span ? `${info.office} · ${span}` : info.office);
    }).join('');
    return `<section class="block"><h3>${esc(info.name)}</h3>${people}</section>`;
  }).join('');
  const unplaced = model.unplaced.length
    ? `<section class="block"><h3>Ikke placeret</h3>${model.unplaced.map((person) => personArticle(person, person.state || '')).join('')}</section>`
    : '';
  dialog.innerHTML = `
    <header class="dialog-head">
      <h2 id="delegates-title">Delegerede uden stemmeret</h2>
      <button type="button" id="close-delegates" class="text-btn">Luk</button>
    </header>
    <p class="note">De repræsenterer District of Columbia og de amerikanske territorier. De stemmer ikke i Repræsentanternes Hus og sidder ikke i Senatet, så de er ikke tegnet som stater og indgår ikke i mandatstallene.</p>
    ${blocks}${unplaced}
  `;
  $('close-delegates').addEventListener('click', () => dialog.close());
  dialog.showModal();
}

function showTooltip(abbr, event) {
  if (!abbr || !event || event.pointerType === 'touch') {
    tooltip.hidden = true;
    return;
  }
  const state = model.states[abbr];
  tooltip.innerHTML = `<strong>${esc(names[abbr] || abbr)}</strong>
    <span>Hus · ${esc(rosterPhrase(state.house, state.houseVacancies.length))}</span>
    <span>Senat · ${esc(rosterPhrase(state.senate, state.senateVacancies.length))}</span>`;
  tooltip.hidden = false;
  const rect = stage.getBoundingClientRect();
  let x = event.clientX - rect.left + 14;
  let y = event.clientY - rect.top + 16;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  const box = tooltip.getBoundingClientRect();
  if (x + box.width > rect.width - 8) x = event.clientX - rect.left - box.width - 14;
  if (y + box.height > rect.height - 8) y = event.clientY - rect.top - box.height - 16;
  tooltip.style.left = `${Math.max(8, x)}px`;
  tooltip.style.top = `${Math.max(8, y)}px`;
}

function stopShow() {
  playing = false;
  scene.stopValgnat();
  scene.clearMascots();
  call.hidden = true;
  valgnatBtn.querySelector('span').textContent = 'Valgnat';
  valgnatBtn.setAttribute('aria-pressed', 'false');
}

function startValgnat() {
  if (playing) {
    stopShow();
    return;
  }
  playing = true;
  valgnatBtn.querySelector('span').textContent = 'Stop';
  valgnatBtn.setAttribute('aria-pressed', 'true');
  callText.textContent = 'Den siddende kongres — ikke en prognose';
  call.hidden = false;
  callBar.style.width = '0%';
  scene.playValgnat({
    onProgress(done, total) {
      callCount.textContent = `${done} af ${total}`;
      callBar.style.width = `${(done / total) * 100}%`;
      if (done === 1 || done === total || done % 10 === 0) {
        live.textContent = `Valgnat. ${done} af ${total} stater. Ikke en prognose.`;
      }
    },
    onDone() {
      playing = false;
      valgnatBtn.querySelector('span').textContent = 'Valgnat';
      valgnatBtn.setAttribute('aria-pressed', 'false');
      const line = mascotMajorityLine(totalsFor(mode));
      callText.textContent = `${line}. Ikke en prognose.`;
      live.textContent = `${line}. Ikke en prognose.`;
      window.setTimeout(() => {
        if (!playing) {
          call.hidden = true;
          scene.clearMascots();
        }
      }, 5200);
    },
  });
}

function showError(message) {
  bootStatus.textContent = message;
  const bar = boot.querySelector('.boot-bar');
  if (bar) bar.hidden = true;
}

async function bootApp() {
  const root = document.documentElement;
  root.style.setProperty('--d', COLORS.D);
  root.style.setProperty('--r', COLORS.R);
  root.style.setProperty('--i', COLORS.I);
  root.style.setProperty('--v', COLORS.vacant);
  root.style.setProperty('--split', COLORS.split);

  const [congressRes, topoRes] = await Promise.all([
    fetch('./data/congress.json'),
    fetch('./geo/states-10m.json'),
  ]);
  if (!congressRes.ok || !topoRes.ok) throw new Error('Kunne ikke hente datafilerne');
  const [congress, topo] = await Promise.all([congressRes.json(), topoRes.json()]);
  model = buildModel(congress);
  todayISO = todayInNewYork();
  await document.fonts.ready;
  bootStatus.textContent = 'Tegner staterne…';
  await new Promise((resolve) => { requestAnimationFrame(() => resolve()); });
  const built = buildStateGeometries(topo);
  names = Object.fromEntries(built.states.map((state) => [state.abbr, state.name]));

  $('kicker').textContent = `${model.congress}. kongres`;
  fillSelect();
  renderFooter();

  if (!phoneMq.matches) $('about').open = true;
  scene = await createScene($('c'), {
    onHover: showTooltip,
    onPick: (abbr) => selectState(abbr),
  });
  scene.setGeometries(built);

  const params = new URLSearchParams(location.search);
  const requested = (params.get('kammer') === 'senat' || params.get('kammer') === 'senate') ? 'senate' : 'house';
  const abbr = (params.get('stat') || '').toUpperCase();
  mode = requested;
  syncModeButtons();
  scene.setLook(lookFor(mode), { intro: !model.states[abbr] });
  renderSummary();
  renderPanel();
  if (model.states[abbr]) selectState(abbr);
  else syncUrl();

  boot.classList.add('done');
  window.setTimeout(() => boot.remove(), 480);
  window.setTimeout(() => hint.classList.add('gone'), 6800);
}

$('mode-house').addEventListener('click', () => { if (mode !== 'house') setMode('house'); });
$('mode-senate').addEventListener('click', () => { if (mode !== 'senate') setMode('senate'); });
valgnatBtn.addEventListener('click', startValgnat);
$('home').addEventListener('click', () => scene?.frameAll());
stateSelect.addEventListener('change', () => {
  if (!stateSelect.value) clearSelection();
  else selectState(stateSelect.value);
});
panelClose.addEventListener('click', (event) => {
  event.stopPropagation();
  clearSelection();
});
sheetToggle.addEventListener('click', () => {
  if (phoneMq.matches) toggleSheet();
});
phoneMq.addEventListener('change', () => {
  if (!phoneMq.matches) $('about').open = true;
  if (model) renderSummary();
  updateInset(false);
});
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !dialog.open && selected) clearSelection();
});

bootApp().catch((error) => {
  console.error(error);
  showError('Kortet kunne ikke indlæses. Prøv at genindlæse siden.');
});
