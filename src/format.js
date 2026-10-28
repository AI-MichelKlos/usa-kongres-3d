/** Danish labels and the statutory federal election day. No member names live here. */

export function federalElectionDate(year) {
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const monday = 1 + ((8 - nov1.getUTCDay()) % 7);
  return new Date(Date.UTC(year, 10, monday + 1));
}

export function todayInNewYork(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Seats whose term ends on 3 January are on the ballot the previous November. */
export function seatElection(termEnd, todayISO) {
  if (!termEnd || !/^\d{4}-01-03$/.test(termEnd)) return null;
  const year = Number(termEnd.slice(0, 4)) - 1;
  const electionISO = federalElectionDate(year).toISOString().slice(0, 10);
  let status = 'ended';
  if (todayISO <= electionISO) status = 'upcoming';
  else if (todayISO < termEnd) status = 'passed';
  return { electionISO, endISO: termEnd, status };
}

export function danishDate(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function danishStamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || '';
  const day = date.toLocaleDateString('da-DK', {
    timeZone: 'Europe/Copenhagen',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString('da-DK', {
    timeZone: 'Europe/Copenhagen',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${day} kl. ${time}`;
}

export function partyBadge(party) {
  if (party === 'Democrat') return 'Demokrat';
  if (party === 'Republican') return 'Republikaner';
  if (party === 'Independent') return 'Uafhængig';
  if (!party) return 'Uoplyst';
  return party;
}

export function caucusPhrase(member) {
  if (!member?.caucus) return '';
  if (member.party === 'Democrat' && member.caucus === 'Democrat') return '';
  if (member.party === 'Republican' && member.caucus === 'Republican') return '';
  if (member.caucus === 'Democrat') return 'caucus med Demokraterne';
  if (member.caucus === 'Republican') return 'caucus med Republikanerne';
  return `caucus: ${member.caucus}`;
}

function groupLabel(party, caucus, count) {
  if (party === 'Democrat') return count === 1 ? 'demokrat' : 'demokrater';
  if (party === 'Republican') return count === 1 ? 'republikaner' : 'republikanere';
  if (party === 'Independent') {
    const base = count === 1 ? 'uafhængig' : 'uafhængige';
    if (caucus === 'Democrat') return `${base} (dem. caucus)`;
    if (caucus === 'Republican') return `${base} (rep. caucus)`;
    if (caucus) return `${base} (caucus: ${caucus})`;
    return base;
  }
  if (!party) return count === 1 ? 'uoplyst parti' : 'uoplyste partier';
  return party;
}

export function rosterPhrase(members, vacancies = 0) {
  const groups = new Map();
  for (const member of members) {
    const key = `${member.party || ''}|${member.caucus || ''}`;
    const current = groups.get(key) || { party: member.party, caucus: member.caucus, count: 0 };
    current.count += 1;
    groups.set(key, current);
  }
  const parts = [...groups.values()].map((group) => `${group.count} ${groupLabel(group.party, group.caucus, group.count)}`);
  if (vacancies === 1) parts.push('1 ledig');
  else if (vacancies > 1) parts.push(`${vacancies} ledige`);
  return parts.join(' · ') || 'ingen medlemmer i kilden';
}

export function rankLabel(rank) {
  if (rank === 'senior') return 'Seniorsenator';
  if (rank === 'junior') return 'Juniorsenator';
  return '';
}

export function districtLabel(district) {
  if (district === 0) return 'Hele staten';
  if (district == null) return '';
  return `Distrikt ${district}`;
}

export function yearSpan(start, end) {
  if (!start || !end) return '';
  return `${start.slice(0, 4)}–${end.slice(0, 4)}`;
}

export function initials(person) {
  const first = (person.first || person.name || '?').trim().charAt(0) || '?';
  const last = (person.last || '').trim().charAt(0) || '';
  return `${first}${last}`.toLocaleUpperCase('da');
}

function caucusNote(count, side) {
  if (!count) return '';
  const who = count === 1 ? '1 uafhængig sidder' : `${count} uafhængige sidder`;
  const group = side === 'D' ? 'demokraternes caucus' : 'republikanernes caucus';
  return `${who} i ${group}`;
}

/** Caucus counts and the majority line (218 in the House, 51 in the Senate). */
export function tugFigures(totals) {
  const seats = Number(totals.seats) || 0;
  const need = Math.floor(seats / 2) + 1;
  const d = (totals.Democrat || 0) + (totals.caucusDemocrat || 0);
  const r = (totals.Republican || 0) + (totals.caucusRepublican || 0);
  const pct = (count) => (seats ? (count / seats) * 100 : 0);
  return { seats, need, d, r, dPct: pct(d), rPct: pct(r), needPct: pct(need) };
}

export function mascotMajorityLine(totals) {
  const { d, r, seats, need } = tugFigures(totals);
  if (r >= need && r > d) return `Flertal: elefanterne · ${r} af ${seats}`;
  if (d >= need && d > r) return `Flertal: æslerne · ${d} af ${seats}`;
  return `Ingen har flertal · æslerne ${d}, elefanterne ${r} af ${seats}`;
}

/** Which mascot pops onto a state. House uses party, Senate uses caucus. */
export function delegationMascot(counts, mode) {
  const d = mode === 'senate' ? counts.Democrat + counts.caucusDemocrat : counts.Democrat;
  const r = mode === 'senate' ? counts.Republican + counts.caucusRepublican : counts.Republican;
  if (d === 0 && r === 0) return counts.seated > 0 ? 'I' : null;
  if (d > r) return 'D';
  if (r > d) return 'R';
  return 'split';
}

export function majorityLine(totals, seats) {
  const need = Math.floor(seats / 2) + 1;
  const democrats = totals.Democrat + totals.caucusDemocrat;
  const republicans = totals.Republican + totals.caucusRepublican;
  let lead;
  if (republicans >= need && republicans > democrats) {
    lead = `Republikanerne har flertal af de ${seats} pladser (${republicans}).`;
  } else if (democrats >= need && democrats > republicans) {
    lead = `Demokraterne har flertal af de ${seats} pladser (${democrats}).`;
  } else {
    lead = `Ingen har flertal af de ${seats} pladser. Demokraterne ${democrats}, Republikanerne ${republicans}.`;
  }
  const notes = [
    caucusNote(totals.caucusDemocrat, 'D'),
    caucusNote(totals.caucusRepublican, 'R'),
  ].filter(Boolean);
  return notes.length ? `${lead} ${notes.join('. ')}.` : lead;
}

export function electionBanner(model, todayISO) {
  let houseUp = 0;
  let senateUp = 0;
  let houseSeated = 0;
  let electionISO = null;
  let passed = null;
  for (const state of Object.values(model.states)) {
    for (const member of state.house) {
      houseSeated += 1;
      const info = seatElection(member.termEnd, todayISO);
      if (!info) continue;
      if (info.status === 'upcoming') {
        houseUp += 1;
        electionISO = info.electionISO;
      } else if (info.status === 'passed') passed = info;
    }
    for (const member of state.senate) {
      const info = seatElection(member.termEnd, todayISO);
      if (!info) continue;
      if (info.status === 'upcoming') {
        senateUp += 1;
        electionISO = info.electionISO;
      } else if (info.status === 'passed') passed = info;
    }
  }
  if (electionISO && (houseUp || senateUp)) {
    const housePhrase = houseUp === houseSeated && houseUp > 0
      ? 'alle besatte pladser i Huset'
      : `${houseUp} pladser i Huset`;
    const bits = [];
    if (houseUp) bits.push(housePhrase);
    if (senateUp) bits.push(`${senateUp} senatorer`);
    return `Valgdag ${danishDate(electionISO)}: ${bits.join(' og ')} er på valg. Kortet viser dem, der sidder nu — ikke et resultat.`;
  }
  if (passed) {
    return `Valgdagen ${danishDate(passed.electionISO)} er passeret. Kortet viser stadig de medlemmer, kilden har som siddende.`;
  }
  return '';
}
