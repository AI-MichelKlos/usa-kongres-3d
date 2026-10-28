import { danishDate } from './format.js';
import { mascotSvg } from './mascots.js';
import {
  CLOSE_POINTS,
  POPULATION_TITLE,
  averagePolls,
  formatAveragePct,
  formatField,
  formatMoe,
  formatSample,
  formatSourcePct,
  isClose,
  rowNotes,
} from './polls.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
  } catch {
    return '';
  }
  return '';
}

function shareBar(average) {
  const total = average.democratPct + average.republicanPct;
  if (!total) return '';
  return `<div class="poll-share" role="img" aria-label="Demokrater ${formatAveragePct(average.democratPct)} procent, republikanere ${formatAveragePct(average.republicanPct)} procent">
    <span class="poll-share-d" style="flex:${average.democratPct} 1 0"></span>
    <span class="poll-share-r" style="flex:${average.republicanPct} 1 0"></span>
  </div>
  <p class="poll-share-note">Søjlen sammenligner kun de to gennemsnit. Den er ikke et mandatresultat, og den tomme rest i de enkelte målinger er ikke tegnet med.</p>`;
}

function averageBlock(average, noun) {
  if (!average) {
    return '<p class="poll-empty">Ingen målinger i perioden opfylder reglen for gennemsnittet.</p>';
  }
  const ahead = average.margin === 0
    ? 'De to tal er lige store.'
    : average.margin > 0
      ? `Demokraterne ligger ${formatAveragePct(Math.abs(average.margin))} point foran i dette gennemsnit.`
      : `Republikanerne ligger ${formatAveragePct(Math.abs(average.margin))} point foran i dette gennemsnit.`;
  return `<div class="poll-avg">
    <div class="poll-avg-side tone-d">${mascotSvg('D', { decorative: false })}<b>${formatAveragePct(average.democratPct)} %</b><span>Demokrater</span></div>
    <div class="poll-avg-mid"><b>${average.count}</b><span>${noun}</span></div>
    <div class="poll-avg-side tone-r">${mascotSvg('R', { decorative: false })}<b>${formatAveragePct(average.republicanPct)} %</b><span>Republikanere</span></div>
  </div>
  ${shareBar(average)}
  <p class="poll-ahead">${esc(ahead)} Ikke en prognose.</p>`;
}

function table(rows, average, { candidates = false } = {}) {
  const head = `<tr>
    <th scope="col">Institut</th>
    <th scope="col">Feltperiode</th>
    <th scope="col">n</th>
    <th scope="col">Gruppe</th>
    <th scope="col">Fejlmargin</th>
    ${candidates ? '<th scope="col">Demokrat</th>' : ''}
    <th scope="col">D %</th>
    ${candidates ? '<th scope="col">Republikaner</th>' : ''}
    <th scope="col">R %</th>
    <th scope="col">Kilde</th>
  </tr>`;
  const body = rows.map((row) => {
    const notes = rowNotes(row);
    const inAvg = average?.ids.has(row.id);
    const href = safeUrl(row.sourceUrl);
    const pop = row.population
      ? `<abbr title="${esc(POPULATION_TITLE[row.population] || row.population)}">${esc(row.population)}</abbr>`
      : '';
    const link = href
      ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${esc(row.sourceTitle || '')}">Kilde</a>`
      : '';
    return `<tr class="${inAvg ? 'in-avg' : ''}">
      <th scope="row">${esc(row.pollster)}${inAvg ? ' <span class="avg-mark">i gennemsnit</span>' : ''}${notes.length ? `<span class="poll-notes">${notes.map(esc).join(' · ')}</span>` : ''}</th>
      <td>${esc(formatField(row.fieldStart, row.fieldEnd))}</td>
      <td>${esc(formatSample(row.sampleSize))}</td>
      <td>${pop}</td>
      <td>${esc(formatMoe(row.marginOfError))}</td>
      ${candidates ? `<td>${esc(row.democratName || '')}</td>` : ''}
      <td class="num d">${esc(formatSourcePct(row.democratPct))}</td>
      ${candidates ? `<td>${esc(row.republicanName || '')}</td>` : ''}
      <td class="num r">${esc(formatSourcePct(row.republicanPct))}</td>
      <td>${link}</td>
    </tr>`;
  }).join('');
  return `<div class="poll-scroll"><table class="poll-table">${head}${body}</table></div>`;
}

function byState(rows) {
  const groups = new Map();
  for (const row of rows) {
    const list = groups.get(row.state) || [];
    list.push(row);
    groups.set(row.state, list);
  }
  return groups;
}

export function closeStateAbbrs(polls) {
  if (!polls) return [];
  const groups = byState(polls.senate || []);
  return [...groups.keys()].filter((abbr) => isClose(averagePolls(groups.get(abbr))));
}

export function renderPolls(container, polls, names) {
  if (!polls) {
    container.innerHTML = '<p class="poll-empty">Målingerne kunne ikke hentes.</p>';
    return;
  }
  const genericAvg = averagePolls(polls.generic || []);
  const groups = byState(polls.senate || []);
  const states = [...groups.keys()].sort((a, b) => {
    const aAvg = averagePolls(groups.get(a));
    const bAvg = averagePolls(groups.get(b));
    const aClose = isClose(aAvg) ? 0 : 1;
    const bClose = isClose(bAvg) ? 0 : 1;
    if (aClose !== bClose) return aClose - bClose;
    return Math.abs(aAvg?.margin ?? 99) - Math.abs(bAvg?.margin ?? 99);
  });
  const blocks = states.map((abbr) => {
    const rows = [...groups.get(abbr)].sort((a, b) => b.fieldEnd.localeCompare(a.fieldEnd) || a.pollster.localeCompare(b.pollster, 'da'));
    const average = averagePolls(rows);
    const close = isClose(average);
    const name = names[abbr] || abbr;
    const pair = rows[0];
    const matchup = pair ? `${pair.democratName} og ${pair.republicanName}` : '';
    return `<article class="poll-race" id="poll-${esc(abbr)}">
      <header>
        <h3>${esc(name)} <span>${esc(abbr)}</span></h3>
        ${close ? '<p class="tight-label">tæt løb</p>' : '<p class="wide-label">uden for mærket på kortet</p>'}
      </header>
      <p class="matchup">${esc(matchup)}</p>
      ${averageBlock(average, average?.count === 1 ? 'måling i gennemsnittet' : 'institutter i gennemsnittet')}
      ${table(rows, average, { candidates: true })}
    </article>`;
  }).join('');

  const genericRows = [...(polls.generic || [])].sort((a, b) => b.fieldEnd.localeCompare(a.fieldEnd) || a.pollster.localeCompare(b.pollster, 'da'));
  container.innerHTML = `
    <p class="polls-sep">Adskilt fra kortet over den siddende kongres</p>
    <p class="polls-lead">Offentliggjorte meningsmålinger til midtvejsvalget <strong>3. november 2026</strong>. Det er ikke valgresultater, og det er ikke en prognose.</p>
    <p class="polls-updated">Senest opdateret ${esc(danishDate(polls.updated))}.</p>
    <p class="polls-caveat">Hver måling har sin egen statistiske usikkerhed. Fejlmarginen står i tabellen, når kilden har offentliggjort den, og cellen er tom, når den ikke gjorde. Gennemsnittet har ikke én samlet fejlmargin. Et resultat kan godt ligge uden for flere målingers usikkerhed. Tallene er afskrevet fra offentlige tabeller og bliver ikke hentet automatisk.</p>
    <h3 class="poll-sub">Generisk kongresmåling</h3>
    <p class="poll-method">Gennemsnittet er vores eget, uvægtede middel af én måling pr. institut med feltarbejde afsluttet fra ${esc(danishDate(polls.windowStart))} til ${esc(danishDate(polls.windowEnd))}. Den nyeste måling bruges. Har instituttet flere tal for samme periode, foretrækkes sandsynlige vælgere (LV) frem for registrerede vælgere (RV) og voksne (A), et tal uden leaners frem for et tal med, og hos YouGov «strict likely voters», når det findes. Målinger med flere navngivne kandidater og førstevalg fra ranked choice vises, men tæller ikke med. Partistøttede målinger er mærket (D) eller (R) og tæller med. Ingen andres gennemsnit eller prognose er kopieret.</p>
    ${averageBlock(genericAvg, 'institutter')}
    ${table(genericRows, genericAvg)}
    <h3 class="poll-sub">Senatsvæddeløb</h3>
    <p class="poll-method">Samme regel som ovenfor, regnet for sig i hvert væddeløb. «Tæt løb» betyder, at det gennemsnit ligger inden for ${CLOSE_POINTS} point. Mærket på kortet, i Senatet, åbner målingen for den stat. Stater uden for de ${CLOSE_POINTS} point står her, men får ikke mærket.</p>
    <div class="poll-races">${blocks}</div>
    <p class="polls-how">Kilderne er de enkelte institutters udgivelser, eller Wikipedias tabel når den er registreringen. Opdatering står i README: filen <code>public/data/polls.json</code> rettes i hånden eller med <code>scripts/compile_polls.py</code>. Tomme felter må ikke gættes.</p>
  `;
}
