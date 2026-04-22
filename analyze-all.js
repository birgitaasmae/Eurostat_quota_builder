const API_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/';

const COUNTRIES = {
  AT:'Austria',BE:'Belgium',BG:'Bulgaria',HR:'Croatia',CY:'Cyprus',CZ:'Czechia',
  DK:'Denmark',EE:'Estonia',FI:'Finland',FR:'France',DE:'Germany',EL:'Greece',
  HU:'Hungary',IE:'Ireland',IT:'Italy',LV:'Latvia',LT:'Lithuania',LU:'Luxembourg',
  MT:'Malta',NL:'Netherlands',PL:'Poland',PT:'Portugal',RO:'Romania',SK:'Slovakia',
  SI:'Slovenia',ES:'Spain',SE:'Sweden',IS:'Iceland',LI:'Liechtenstein',NO:'Norway',CH:'Switzerland'
};

const AGE_BANDS_5 = [
  'Y_LT5','Y5-9','Y10-14','Y15-19','Y20-24','Y25-29','Y30-34','Y35-39',
  'Y40-44','Y45-49','Y50-54','Y55-59','Y60-64','Y65-69','Y70-74','Y75-79',
  'Y80-84','Y85-89','Y_GE90'
];
const LFS_AGE_BANDS = ['Y15-24','Y25-49','Y50-64','Y_GE65'];

const DATASETS = {
  labour: { dataset: 'lfsa_pgauws', params: { wstatus: ['EMP','UNE','INAC'], deg_urb: 'TOTAL', unit: 'THS_PER' } },
  urban: { dataset: 'lfsa_pgauws', params: { wstatus: 'POP', deg_urb: ['DEG1','DEG2','DEG3'], unit: 'THS_PER' } },
  education: { dataset: 'demo_pjanedu', params: { isced11: ['ED0-2','ED3_4','ED5-8'], unit: 'NR' } },
  occupation: { dataset: 'lfsa_egais', params: { wstatus: 'EMP', isco08: ['OC1','OC2','OC3','OC4','OC5','OC6','OC7','OC8','OC9','OC0'], unit: 'THS_PER' } },
  citizenship: { dataset: 'lfsa_pganws', params: { citizen: ['NAT','EU27_2020_FOR','NEU27_2020_FOR'], wstatus: 'POP', unit: 'THS_PER' } },
  birth: { dataset: 'lfsa_pgacws', params: { c_birth: ['NAT','EU27_2020_FOR','NEU27_2020_FOR'], wstatus: 'POP', unit: 'THS_PER' } }
};

function exactAgeCode(age) {
  return age === 0 ? 'Y_LT1' : `Y${age}`;
}

function bandRange(code) {
  if (code === 'Y_LT5') return [0, 4];
  if (code === 'Y_GE90') return [90, 120];
  if (code === 'Y_GE65') return [65, 120];
  const match = code.match(/Y(\d+)-(\d+)/);
  if (match) return [Number(match[1]), Number(match[2])];
  return null;
}

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
  if (!response.ok) {
    throw new Error(`${dataset} ${response.status}`);
  }
  return response.json();
}

function parseJsonStat(data) {
  const dims = data.id;
  const sizes = data.size;
  const values = data.value;
  const strides = new Array(dims.length);
  strides[dims.length - 1] = 1;
  for (let i = dims.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }
  const dimIndex = {};
  const dimLabels = {};
  for (const dim of dims) {
    const category = data.dimension[dim].category;
    dimIndex[dim] = category.index;
    dimLabels[dim] = category.label || {};
  }
  return { dims, strides, values, dimIndex, dimLabels };
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

async function fetchNationalPopulation(country, year, minAge, maxAge) {
  const ages = [];
  for (let age = Math.max(0, minAge); age <= Math.min(99, maxAge); age++) ages.push(exactAgeCode(age));
  const data = await apiFetch('demo_pjan', {
    sex: ['M', 'F'],
    age: ages,
    geo: country,
    unit: 'NR',
    time: year
  });
  const parsed = parseJsonStat(data);
  let total = 0;
  for (const sex of ['M', 'F']) {
    for (const age of ages) {
      total += lookupValue(parsed, { freq: 'A', unit: 'NR', sex, age, geo: country, time: year }) || 0;
    }
  }
  return Math.round(total);
}

async function fetchRegionStats(country, year, minAge, maxAge, nutsLevel) {
  const geoData = await apiFetch('demo_r_pjangrp3', {
    sex: 'T',
    age: 'TOTAL',
    unit: 'NR',
    time: year
  });
  const geoParsed = parseJsonStat(geoData);
  const catalog = geoParsed.dimLabels.geo;
  const geoLen = 2 + nutsLevel;
  const geos = Object.keys(catalog).filter((geo) =>
    geo.startsWith(country) && geo.length === geoLen && !/\(NUTS\s/.test(catalog[geo])
  );

  const overlappingBands = AGE_BANDS_5.filter((code) => {
    const range = bandRange(code);
    return range && Math.min(range[1], 99) >= minAge && range[0] <= maxAge;
  });

  const data = await apiFetch('demo_r_pjangrp3', {
    sex: ['M', 'F'],
    age: overlappingBands,
    geo: geos,
    unit: 'NR',
    time: year
  });
  const parsed = parseJsonStat(data);
  const rows = geos.map((geo) => {
    let total = 0;
    for (const sex of ['M', 'F']) {
      for (const age of overlappingBands) {
        total += lookupValue(parsed, { freq: 'A', unit: 'NR', sex, age, geo, time: year }) || 0;
      }
    }
    return { geo, label: catalog[geo], total: Math.round(total) };
  });

  const nonzero = rows.filter((row) => row.total > 0);
  const zero = rows.filter((row) => row.total === 0);
  return {
    totalRegions: rows.length,
    nonzeroRegions: nonzero.length,
    zeroRegions: zero.length,
    sum: rows.reduce((sum, row) => sum + row.total, 0),
    examplesZero: zero.slice(0, 10).map((row) => `${row.geo} ${row.label}`)
  };
}

async function fetchDatasetTotal(kind, country, year, minAge, maxAge) {
  const sexes = ['M', 'F'];
  if (kind === 'education') {
    const ages = [];
    for (let age = Math.max(0, minAge); age <= Math.min(99, maxAge); age++) ages.push(exactAgeCode(age));
    const data = await apiFetch(DATASETS[kind].dataset, {
      sex: sexes,
      age: ages,
      geo: country,
      time: year,
      ...DATASETS[kind].params
    });
    const parsed = parseJsonStat(data);
    let total = 0;
    for (const sex of sexes) {
      for (const age of ages) {
        for (const isced11 of DATASETS[kind].params.isced11) {
          total += lookupValue(parsed, { freq: 'A', unit: 'NR', sex, age, isced11, geo: country, time: year }) || 0;
        }
      }
    }
    return { total: Math.round(total), ageBandsUsed: ages.length, exactAge: true };
  }

  const candidateBands = kind === 'occupation' ? LFS_AGE_BANDS : AGE_BANDS_5;
  const ageBands = candidateBands.filter((code) => {
    const range = bandRange(code);
    return range && Math.min(range[1], 99) >= minAge && range[0] <= maxAge;
  });

  const params = {
    sex: sexes,
    age: ageBands,
    geo: country,
    time: year,
    ...DATASETS[kind].params
  };
  const data = await apiFetch(DATASETS[kind].dataset, params);
  const parsed = parseJsonStat(data);
  let total = 0;

  if (kind === 'labour') {
    for (const sex of sexes) for (const age of ageBands) for (const wstatus of DATASETS[kind].params.wstatus) {
      total += (lookupValue(parsed, { freq: 'A', unit: 'THS_PER', sex, age, wstatus, deg_urb: 'TOTAL', geo: country, time: year }) || 0) * 1000;
    }
  } else if (kind === 'urban') {
    for (const sex of sexes) for (const age of ageBands) for (const deg_urb of DATASETS[kind].params.deg_urb) {
      total += (lookupValue(parsed, { freq: 'A', unit: 'THS_PER', sex, age, wstatus: 'POP', deg_urb, geo: country, time: year }) || 0) * 1000;
    }
  } else if (kind === 'occupation') {
    for (const sex of sexes) for (const age of ageBands) for (const isco08 of DATASETS[kind].params.isco08) {
      total += (lookupValue(parsed, { freq: 'A', unit: 'THS_PER', sex, age, wstatus: 'EMP', isco08, geo: country, time: year }) || 0) * 1000;
    }
  } else if (kind === 'citizenship') {
    for (const sex of sexes) for (const age of ageBands) for (const citizen of DATASETS[kind].params.citizen) {
      total += (lookupValue(parsed, { freq: 'A', unit: 'THS_PER', sex, age, wstatus: 'POP', citizen, geo: country, time: year }) || 0) * 1000;
    }
  } else if (kind === 'birth') {
    for (const sex of sexes) for (const age of ageBands) for (const c_birth of DATASETS[kind].params.c_birth) {
      total += (lookupValue(parsed, { freq: 'A', unit: 'THS_PER', sex, age, wstatus: 'POP', c_birth, geo: country, time: year }) || 0) * 1000;
    }
  }

  return { total: Math.round(total), ageBandsUsed: ageBands, exactAge: false };
}

async function analyzeCountry(country, year, minAge, maxAge, nutsLevel) {
  const result = {
    country,
    name: COUNTRIES[country],
    year,
    ages: `${minAge}-${maxAge}`
  };

  try {
    result.nationalPopulation = await fetchNationalPopulation(country, year, minAge, maxAge);
  } catch (error) {
    result.nationalPopulationError = error.message;
  }

  try {
    result.region = await fetchRegionStats(country, year, minAge, maxAge, nutsLevel);
  } catch (error) {
    result.regionError = error.message;
  }

  for (const kind of Object.keys(DATASETS)) {
    try {
      result[kind] = await fetchDatasetTotal(kind, country, year, minAge, maxAge);
    } catch (error) {
      result[`${kind}Error`] = error.message;
    }
  }

  return result;
}

async function main() {
  const year = process.argv[2] || '2024';
  const minAge = Number(process.argv[3] || '23');
  const maxAge = Number(process.argv[4] || '52');
  const nutsLevel = Number(process.argv[5] || '3');
  const countries = Object.keys(COUNTRIES);
  const results = [];

  for (const country of countries) {
    results.push(await analyzeCountry(country, year, minAge, maxAge, nutsLevel));
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
