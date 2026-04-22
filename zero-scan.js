const API_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/';

const COUNTRIES = {
  AT:'Austria',BE:'Belgium',BG:'Bulgaria',HR:'Croatia',CY:'Cyprus',CZ:'Czechia',
  DK:'Denmark',EE:'Estonia',FI:'Finland',FR:'France',DE:'Germany',EL:'Greece',
  HU:'Hungary',IE:'Ireland',IT:'Italy',LV:'Latvia',LT:'Lithuania',LU:'Luxembourg',
  MT:'Malta',NL:'Netherlands',PL:'Poland',PT:'Portugal',RO:'Romania',SK:'Slovakia',
  SI:'Slovenia',ES:'Spain',SE:'Sweden',IS:'Iceland',LI:'Liechtenstein',NO:'Norway',CH:'Switzerland'
};

const YEARS = ['2022', '2023', '2024'];
const AGE_CASES = [
  { min: 18, max: 64, label: '18-64' },
  { min: 23, max: 52, label: '23-52' },
  { min: 25, max: 49, label: '25-49' }
];
const SEX_CASES = ['MF', 'M', 'F'];

const AGE_BANDS_5 = [
  'Y_LT5','Y5-9','Y10-14','Y15-19','Y20-24','Y25-29','Y30-34','Y35-39',
  'Y40-44','Y45-49','Y50-54','Y55-59','Y60-64','Y65-69','Y70-74','Y75-79',
  'Y80-84','Y85-89','Y_GE90'
];
const LFS_AGE_5Y = ['Y15-19','Y20-24','Y25-29','Y30-34','Y35-39','Y40-44','Y45-49','Y50-54','Y55-59','Y60-64','Y65-69','Y70-74'];
const LFS_AGE_BANDS = ['Y15-24','Y25-49','Y50-64','Y_GE65'];

const EDUC_LEVELS = { 'ED0-2':'Low', 'ED3_4':'Medium', 'ED5-8':'High' };
const EMPLOY_STATUSES = { 'EMP':'Employed', 'UNE':'Unemployed', 'INAC':'Inactive' };
const URBAN_DEGREES = { 'DEG1':'Cities', 'DEG2':'Towns', 'DEG3':'Rural' };
const ISCO_CODES = {
  'OC1':'Managers','OC2':'Professionals','OC3':'Technicians','OC4':'Clerical',
  'OC5':'Service','OC6':'Agriculture','OC7':'Craft','OC8':'Operators','OC9':'Elementary','OC0':'Armed'
};
const CITIZEN_CODES = { 'NAT':'National', 'EU27_2020_FOR':'EU', 'NEU27_2020_FOR':'Non-EU' };
const COB_CODES = { 'NAT':'Born in country', 'EU27_2020_FOR':'Born in EU', 'NEU27_2020_FOR':'Born outside EU' };

function buildUrl(dataset, params) {
  const search = new URLSearchParams({ format: 'JSON', lang: 'en' });
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else {
      search.append(key, value);
    }
  }
  return `${API_BASE}${dataset}?${search.toString()}`;
}

async function apiFetch(dataset, params) {
  const response = await fetch(buildUrl(dataset, params));
  if (!response.ok) throw new Error(`${dataset} ${response.status}`);
  return response.json();
}

function parseJsonStat(data) {
  const dims = data.id;
  const sizes = data.size;
  const values = data.value;
  const strides = new Array(dims.length);
  strides[dims.length - 1] = 1;
  for (let i = dims.length - 2; i >= 0; i--) strides[i] = strides[i + 1] * sizes[i + 1];
  const dimIndex = {};
  for (const dim of dims) dimIndex[dim] = data.dimension[dim].category.index;
  return { dims, strides, values, dimIndex };
}

function lookupValue(parsed, coords) {
  let idx = 0;
  for (let i = 0; i < parsed.dims.length; i++) {
    const dim = parsed.dims[i];
    const pos = parsed.dimIndex[dim][coords[dim]];
    if (pos === undefined) return null;
    idx += pos * parsed.strides[i];
  }
  const value = parsed.values[idx];
  return value === undefined ? null : value;
}

function exactAgeCode(age) {
  return age === 0 ? 'Y_LT1' : `Y${age}`;
}

function bandRange(code) {
  if (code === 'Y_LT5') return [0, 4];
  if (code === 'Y_GE90') return [90, 120];
  if (code === 'Y_GE65') return [65, 120];
  if (code === 'Y_GE75') return [75, 120];
  const match = code.match(/Y(\d+)-(\d+)/);
  if (match) return [Number(match[1]), Number(match[2])];
  const single = code.match(/^Y(\d+)$/);
  if (single) return [Number(single[1]), Number(single[1])];
  return null;
}

function getOverlappingBands(codes, minAge, maxAge) {
  return codes.filter((code) => {
    const range = bandRange(code);
    return range && Math.min(range[1], 99) >= minAge && range[0] <= maxAge;
  });
}

function sexesFromCase(sexCase) {
  return sexCase === 'MF' ? ['M', 'F'] : [sexCase];
}

class CountryYearData {
  constructor(country, year) {
    this.country = country;
    this.year = year;
    this.lfs = {};
  }
}

async function loadCountryYear(country, year) {
  const loaded = new CountryYearData(country, year);
  const nationalAges = [];
  for (let age = 0; age <= 99; age++) nationalAges.push(exactAgeCode(age));

  loaded.lfs.educ = parseJsonStat(await apiFetch('demo_pjanedu', {
    sex: ['M', 'F'],
    isced11: Object.keys(EDUC_LEVELS),
    age: nationalAges,
    geo: country,
    unit: 'NR',
    time: year
  }));

  loaded.lfs.labour = parseJsonStat(await apiFetch('lfsa_pgauws', {
    sex: ['M', 'F'],
    wstatus: Object.keys(EMPLOY_STATUSES),
    deg_urb: 'TOTAL',
    age: LFS_AGE_5Y,
    geo: country,
    unit: 'THS_PER',
    time: year
  }));

  loaded.lfs.urban = parseJsonStat(await apiFetch('lfsa_pgauws', {
    sex: ['M', 'F'],
    wstatus: 'POP',
    deg_urb: Object.keys(URBAN_DEGREES),
    age: LFS_AGE_5Y,
    geo: country,
    unit: 'THS_PER',
    time: year
  }));

  loaded.lfs.occupation = parseJsonStat(await apiFetch('lfsa_egais', {
    sex: ['M', 'F'],
    wstatus: 'EMP',
    isco08: Object.keys(ISCO_CODES),
    age: LFS_AGE_BANDS,
    geo: country,
    unit: 'THS_PER',
    time: year
  }));

  loaded.lfs.citizenship = parseJsonStat(await apiFetch('lfsa_pganws', {
    sex: ['M', 'F'],
    citizen: Object.keys(CITIZEN_CODES),
    wstatus: 'POP',
    age: LFS_AGE_5Y,
    geo: country,
    unit: 'THS_PER',
    time: year
  }));

  loaded.lfs.birth = parseJsonStat(await apiFetch('lfsa_pgacws', {
    sex: ['M', 'F'],
    c_birth: Object.keys(COB_CODES),
    wstatus: 'POP',
    age: LFS_AGE_5Y,
    geo: country,
    unit: 'THS_PER',
    time: year
  }));

  return loaded;
}

function sumEducation(parsed, sexes, minAge, maxAge, code) {
  let total = 0;
  for (const sex of sexes) {
    for (let age = minAge; age <= Math.min(maxAge, 99); age++) {
      total += lookupValue(parsed, {
        freq: 'A', unit: 'NR', sex, age: exactAgeCode(age), isced11: code, geo: parsed.country, time: parsed.year
      }) || 0;
    }
  }
  return Math.round(total);
}

function aggregateLfs(parsed, coordsBaseBuilder, sexes, ageCodes, codeDim, code) {
  let total = 0;
  for (const sex of sexes) {
    for (const age of ageCodes) {
      const coords = coordsBaseBuilder(sex, age);
      coords[codeDim] = code;
      total += (lookupValue(parsed, coords) || 0) * 1000;
    }
  }
  return Math.round(total);
}

function availableAny(parsed, coordList) {
  return coordList.some(coords => {
    const value = lookupValue(parsed, coords);
    return value !== null && value > 0;
  });
}

async function main() {
  const cache = new Map();
  const findings = [];
  const summary = {
    education: { zeroRows: 0, shownTables: 0 },
    labour: { zeroRows: 0, shownTables: 0 },
    urban: { zeroRows: 0, shownTables: 0 },
    occupation: { zeroRows: 0, shownTables: 0 },
    citizenship: { zeroRows: 0, shownTables: 0 },
    country_of_birth: { zeroRows: 0, shownTables: 0 }
  };

  for (const [country] of Object.entries(COUNTRIES)) {
    for (const year of YEARS) {
      let data;
      try {
        data = await loadCountryYear(country, year);
      } catch (error) {
        findings.push({ country, year, category: 'load', issue: error.message });
        continue;
      }
      data.lfs.educ.country = country; data.lfs.educ.year = year;

      for (const ageCase of AGE_CASES) {
        for (const sexCase of SEX_CASES) {
          const sexes = sexesFromCase(sexCase);
          const age5 = getOverlappingBands(LFS_AGE_5Y, ageCase.min, ageCase.max);
          const ageOcc = getOverlappingBands(LFS_AGE_BANDS, ageCase.min, ageCase.max);

          const educRows = Object.keys(EDUC_LEVELS).map(code => {
            let total = 0;
            for (const sex of sexes) {
              for (let age = ageCase.min; age <= Math.min(ageCase.max, 99); age++) {
                total += lookupValue(data.lfs.educ, {
                  freq:'A', unit:'NR', sex, age: exactAgeCode(age), isced11: code, geo: country, time: year
                }) || 0;
              }
            }
            return { code, total: Math.round(total) };
          });
          const educTotal = educRows.reduce((s, r) => s + r.total, 0);
          if (educTotal > 0) {
            summary.education.shownTables++;
            for (const row of educRows.filter(r => r.total === 0)) {
              summary.education.zeroRows++;
              findings.push({ country, year, ages: ageCase.label, sex: sexCase, category: 'education', code: row.code, reason: 'zero row in shown table' });
            }
          }

          const labourRows = Object.keys(EMPLOY_STATUSES).map(code => ({
            code,
            total: aggregateLfs(
              data.lfs.labour,
              (sex, age) => ({ freq:'A', unit:'THS_PER', sex, age, deg_urb:'TOTAL', geo: country, time: year }),
              sexes, age5, 'wstatus', code
            )
          }));
          const labourTotal = labourRows.reduce((s, r) => s + r.total, 0);
          if (labourTotal > 0) {
            summary.labour.shownTables++;
            for (const row of labourRows.filter(r => r.total === 0)) {
              summary.labour.zeroRows++;
              findings.push({ country, year, ages: ageCase.label, sex: sexCase, category: 'labour', code: row.code, reason: 'zero row in shown table' });
            }
          }

          const urbanRows = Object.keys(URBAN_DEGREES).map(code => ({
            code,
            total: aggregateLfs(
              data.lfs.urban,
              (sex, age) => ({ freq:'A', unit:'THS_PER', sex, age, wstatus:'POP', geo: country, time: year }),
              sexes, age5, 'deg_urb', code
            )
          }));
          const urbanTotal = urbanRows.reduce((s, r) => s + r.total, 0);
          if (urbanTotal > 0) {
            summary.urban.shownTables++;
            for (const row of urbanRows.filter(r => r.total === 0)) {
              summary.urban.zeroRows++;
              findings.push({ country, year, ages: ageCase.label, sex: sexCase, category: 'urban', code: row.code, reason: 'zero row in shown table' });
            }
          }

          const occupRows = Object.keys(ISCO_CODES).map(code => ({
            code,
            total: aggregateLfs(
              data.lfs.occupation,
              (sex, age) => ({ freq:'A', unit:'THS_PER', sex, age, wstatus:'EMP', geo: country, time: year }),
              sexes, ageOcc, 'isco08', code
            )
          }));
          const occupTotal = occupRows.reduce((s, r) => s + r.total, 0);
          if (occupTotal > 0) {
            summary.occupation.shownTables++;
            for (const row of occupRows.filter(r => r.total === 0)) {
              summary.occupation.zeroRows++;
              findings.push({ country, year, ages: ageCase.label, sex: sexCase, category: 'occupation', code: row.code, reason: 'zero row in shown table' });
            }
          }

          const citizenRows = Object.keys(CITIZEN_CODES).map(code => ({
            code,
            total: aggregateLfs(
              data.lfs.citizenship,
              (sex, age) => ({ freq:'A', unit:'THS_PER', sex, age, wstatus:'POP', geo: country, time: year }),
              sexes, age5, 'citizen', code
            )
          }));
          const citizenTotal = citizenRows.reduce((s, r) => s + r.total, 0);
          if (citizenTotal > 0 && citizenRows.every(r => r.total > 0)) {
            summary.citizenship.shownTables++;
          } else if (citizenTotal > 0) {
            for (const row of citizenRows.filter(r => r.total === 0)) {
              summary.citizenship.zeroRows++;
              findings.push({ country, year, ages: ageCase.label, sex: sexCase, category: 'citizenship', code: row.code, reason: 'zero row causes table suppression in app' });
            }
          }

          const cobRows = Object.keys(COB_CODES).map(code => ({
            code,
            total: aggregateLfs(
              data.lfs.birth,
              (sex, age) => ({ freq:'A', unit:'THS_PER', sex, age, wstatus:'POP', geo: country, time: year }),
              sexes, age5, 'c_birth', code
            )
          }));
          const cobTotal = cobRows.reduce((s, r) => s + r.total, 0);
          if (cobTotal > 0 && cobRows.every(r => r.total > 0)) {
            summary.country_of_birth.shownTables++;
          } else if (cobTotal > 0) {
            for (const row of cobRows.filter(r => r.total === 0)) {
              summary.country_of_birth.zeroRows++;
              findings.push({ country, year, ages: ageCase.label, sex: sexCase, category: 'country_of_birth', code: row.code, reason: 'zero row causes table suppression in app' });
            }
          }
        }
      }
    }
  }

  console.log(JSON.stringify({
    scope: { years: YEARS, ages: AGE_CASES.map(a => a.label), sexes: SEX_CASES, countries: Object.keys(COUNTRIES).length },
    summary,
    findings
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
