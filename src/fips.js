/** Postal abbreviations for the 50 states. DC and the territories are omitted on purpose. */
export const FIPS_TO_ABBR = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
  '10': 'DE', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA',
  '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV',
  '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN',
  '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY',
};

const DISPLAY = {
  CA: 'Californien',
};

export function fipsCode(id) {
  return String(id).padStart(2, '0');
}

export function stateName(abbr, atlasName) {
  return DISPLAY[abbr] || atlasName || abbr;
}

export const TERRITORIES = {
  AS: { name: 'Amerikansk Samoa', office: 'Delegeret' },
  DC: { name: 'District of Columbia', office: 'Delegeret' },
  GU: { name: 'Guam', office: 'Delegeret' },
  MP: { name: 'Nordmarianerne', office: 'Delegeret' },
  PR: { name: 'Puerto Rico', office: 'Residentkommissær' },
  VI: { name: 'De Amerikanske Jomfruøer', office: 'Delegeret' },
};

export function territoryInfo(code) {
  return TERRITORIES[code] || { name: code || 'Ukendt område', office: 'Delegeret' };
}
