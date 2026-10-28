/** Average of individual published polls. No external average is read or stored. */

const POP_RANK = { LV: 0, RV: 1, A: 2, V: 3 };

/** States whose own unweighted average is within this many points get the map badge. */
export const CLOSE_POINTS = 8;

function variantRank(variant) {
  if (variant === 'strict') return 0;
  if (variant === 'loose') return 3;
  if (variant === 'leaners') return 2;
  return 1;
}

function betterPoll(a, b) {
  if (a.fieldEnd !== b.fieldEnd) return a.fieldEnd > b.fieldEnd ? -1 : 1;
  const leanA = a.variant === 'leaners' ? 1 : 0;
  const leanB = b.variant === 'leaners' ? 1 : 0;
  if (leanA !== leanB) return leanA - leanB;
  const popA = POP_RANK[a.population] ?? 9;
  const popB = POP_RANK[b.population] ?? 9;
  if (popA !== popB) return popA - popB;
  const varA = variantRank(a.variant);
  const varB = variantRank(b.variant);
  if (varA !== varB) return varA - varB;
  return (b.sampleSize ?? -1) - (a.sampleSize ?? -1);
}

export function pollsInAverage(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (row.democratPct == null || row.republicanPct == null) continue;
    if (row.rankedChoiceFirst || row.multicandidate) continue;
    const list = groups.get(row.pollsterKey) || [];
    list.push(row);
    groups.set(row.pollsterKey, list);
  }
  const chosen = [];
  for (const list of groups.values()) {
    chosen.push([...list].sort(betterPoll)[0]);
  }
  chosen.sort((a, b) => a.pollster.localeCompare(b.pollster, 'da') || a.id.localeCompare(b.id));
  return chosen;
}

export function averagePolls(rows) {
  const chosen = pollsInAverage(rows);
  if (!chosen.length) return null;
  const democratPct = chosen.reduce((sum, row) => sum + row.democratPct, 0) / chosen.length;
  const republicanPct = chosen.reduce((sum, row) => sum + row.republicanPct, 0) / chosen.length;
  return {
    count: chosen.length,
    democratPct,
    republicanPct,
    margin: democratPct - republicanPct,
    ids: new Set(chosen.map((row) => row.id)),
  };
}

export function round1(value) {
  return Math.round(value * 10) / 10;
}

export function isClose(average) {
  return !!average && Math.abs(average.margin) <= CLOSE_POINTS;
}

export function formatAveragePct(value) {
  return round1(value).toFixed(1).replace('.', ',');
}

export function formatSourcePct(value) {
  if (value == null) return '';
  return String(value).replace('.', ',');
}

export function formatSample(value) {
  if (value == null) return '';
  return new Intl.NumberFormat('da-DK').format(value);
}

export function formatMoe(value) {
  if (value == null) return '';
  return `±${String(value).replace('.', ',')}`;
}

const MONTHS = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];

function parts(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

export function formatField(start, end) {
  if (!start || !end) return '';
  const a = parts(start);
  const b = parts(end);
  if (start === end) return `${b.day}. ${MONTHS[b.month - 1]} ${b.year}`;
  if (a.year === b.year && a.month === b.month) {
    return `${a.day}.–${b.day}. ${MONTHS[b.month - 1]} ${b.year}`;
  }
  if (a.year === b.year) {
    return `${a.day}. ${MONTHS[a.month - 1]}–${b.day}. ${MONTHS[b.month - 1]} ${b.year}`;
  }
  return `${a.day}. ${MONTHS[a.month - 1]} ${a.year}–${b.day}. ${MONTHS[b.month - 1]} ${b.year}`;
}

export function rowNotes(row) {
  const notes = [];
  if (row.variant === 'strict') notes.push('strict LV');
  if (row.variant === 'loose') notes.push('loose LV');
  if (row.variant === 'leaners') notes.push('med leaners');
  if (row.variant === 'two-way') notes.push('tovejs');
  if (row.rankedChoiceFirst) notes.push('førstevalg i ranked choice');
  if (row.multicandidate) notes.push('flere kandidater');
  return notes;
}

export const POPULATION_TITLE = {
  LV: 'LV, sandsynlige vælgere',
  RV: 'RV, registrerede vælgere',
  A: 'A, voksne',
  V: 'V, kilden angiver ikke gruppen tydeligt',
};
