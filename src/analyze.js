/** Party colours and seat tallies. Every number is derived from the data file. */

export const COLORS = {
  D: '#3a6fe0',
  R: '#e24b4b',
  I: '#e6b34d',
  vacant: '#8e97ab',
  uncalled: '#6d7690',
};

export function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  const h = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** `t` = 0 keeps `a`, `t` = 1 becomes `b`. */
export function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca.map((v, i) => Math.round(v + (cb[i] - v) * t)));
}

COLORS.split = mixHex(COLORS.R, COLORS.D, 0.5);

export const SENATE_HEIGHT = 0.3;

export function houseHeight(seats) {
  return 0.07 + Number(seats) * 0.036;
}

function recognizedSide(member) {
  if (member.party === 'Democrat') return 'D';
  if (member.party === 'Republican') return 'R';
  if (member.caucus === 'Democrat') return 'D';
  if (member.caucus === 'Republican') return 'R';
  if (member.party === 'Independent') return 'I';
  return 'O';
}

export function isDistinctParty(member) {
  return member.party !== 'Democrat' && member.party !== 'Republican';
}

export function senateStyle(members, vacancies = []) {
  const distinct = members.some(isDistinctParty);
  if (!members.length) return { color: COLORS.vacant, independent: false };
  const sides = members.map(recognizedSide);
  const partisan = sides.filter((s) => s === 'D' || s === 'R');
  let color;
  if (!partisan.length) color = COLORS.I;
  else if (partisan.every((s) => s === 'D')) color = COLORS.D;
  else if (partisan.every((s) => s === 'R')) color = COLORS.R;
  else color = COLORS.split;
  if (vacancies.length) color = mixHex(color, COLORS.vacant, 0.32);
  return { color, independent: distinct };
}

export function houseStyle(members) {
  let democrats = 0;
  let republicans = 0;
  for (const member of members) {
    if (member.party === 'Democrat') democrats += 1;
    else if (member.party === 'Republican') republicans += 1;
  }
  const distinct = members.some(isDistinctParty);
  if (democrats + republicans === 0) {
    return { color: members.length ? COLORS.I : COLORS.vacant, independent: distinct };
  }
  return {
    color: mixHex(COLORS.R, COLORS.D, democrats / (democrats + republicans)),
    independent: distinct,
  };
}

function emptyTally() {
  return {
    Democrat: 0,
    Republican: 0,
    Independent: 0,
    other: 0,
    unknown: 0,
    vacant: 0,
    seated: 0,
    caucusDemocrat: 0,
    caucusRepublican: 0,
    otherParties: {},
  };
}

export function tally(members, vacancies = 0) {
  const totals = emptyTally();
  totals.vacant = vacancies;
  totals.seated = members.length;
  for (const member of members) {
    if (member.party === 'Democrat' || member.party === 'Republican' || member.party === 'Independent') {
      totals[member.party] += 1;
    } else if (!member.party) {
      totals.unknown += 1;
    } else {
      totals.other += 1;
      totals.otherParties[member.party] = (totals.otherParties[member.party] || 0) + 1;
    }
    if (isDistinctParty(member) && member.caucus === 'Democrat') totals.caucusDemocrat += 1;
    if (isDistinctParty(member) && member.caucus === 'Republican') totals.caucusRepublican += 1;
  }
  return totals;
}

function addTally(into, extra) {
  into.Democrat += extra.Democrat;
  into.Republican += extra.Republican;
  into.Independent += extra.Independent;
  into.other += extra.other;
  into.unknown += extra.unknown;
  into.vacant += extra.vacant;
  into.seated += extra.seated;
  into.caucusDemocrat += extra.caucusDemocrat;
  into.caucusRepublican += extra.caucusRepublican;
  for (const [party, count] of Object.entries(extra.otherParties)) {
    into.otherParties[party] = (into.otherParties[party] || 0) + count;
  }
}

export function buildModel(data) {
  if (!data || data.recordVersion !== 1 || !data.states) {
    throw new Error('congress.json har et ukendt format');
  }
  const states = {};
  const houseTotals = emptyTally();
  const senateTotals = emptyTally();
  let houseSeats = 0;

  for (const [abbr, state] of Object.entries(data.states)) {
    const houseVacancies = state.houseVacancies || [];
    const senateVacancies = state.senateVacancies || [];
    const view = {
      ...state,
      abbr,
      houseVacancies,
      senateVacancies,
      houseCounts: tally(state.house || [], houseVacancies.length),
      senateCounts: tally(state.senate || [], senateVacancies.length),
    };
    view.houseStyle = houseStyle(state.house || []);
    view.senateStyle = senateStyle(state.senate || [], senateVacancies);
    states[abbr] = view;
    addTally(houseTotals, view.houseCounts);
    addTally(senateTotals, view.senateCounts);
    houseSeats += state.houseSeats;
  }

  houseTotals.seats = houseSeats;
  senateTotals.seats = Object.keys(states).length * 2;
  houseTotals.imbalance = houseTotals.seated + houseTotals.vacant - houseTotals.seats;
  senateTotals.imbalance = senateTotals.seated + senateTotals.vacant - senateTotals.seats;

  return {
    fetchedAt: data.fetchedAt,
    asOf: data.asOf,
    source: data.source,
    sourceRepo: data.sourceRepo,
    congress: data.congress,
    states,
    delegates: data.delegates || [],
    unplaced: data.unplaced || [],
    warnings: data.warnings || [],
    houseTotals,
    senateTotals,
  };
}
