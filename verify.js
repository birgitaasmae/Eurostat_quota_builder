const API_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/';

const AGE_BANDS_5 = [
  'Y_LT5','Y5-9','Y10-14','Y15-19','Y20-24','Y25-29','Y30-34','Y35-39',
  'Y40-44','Y45-49','Y50-54','Y55-59','Y60-64','Y65-69','Y70-74','Y75-79',
  'Y80-84','Y85-89','Y_GE90'
];

const LFS_AGE_BANDS = ['Y15-24','Y25-49','Y50-64','Y_GE65'];
const EMPLOY_STATUSES = { EMP: 'Employed', UNE: 'Unemployed', INAC: 'Inactive' };
const URBAN_DEGREES = { DEG1: 'Cities', DEG2: 'Towns and suburbs', DEG3: 'Rural areas' };
const EDUC_LEVELS = { 'ED0-2': 'Low (ISCED 0-2)', ED3_4: 'Medium (ISCED 3-4)', 'ED5-8': 'High (ISCED 5-8)' };
const ISCO_CODES = {
  OC1: 'Managers',
  OC2: 'Professionals',
  OC3: 'Technicians and associate professionals',
  OC4: 'Clerical support workers',
  OC5: 'Service and sales workers',
  OC6: 'Skilled agricultural, forestry and fishery workers',
  OC7: 'Craft and related trades workers',
  OC8: 'Plant and machine operators and assemblers',
  OC9: 'Elementary occupations',
  OC0: 'Armed forces occupations'
};
const CITIZEN_CODES = { NAT: 'National', EU27_2020_FOR: 'Other EU citizen', NEU27_2020_FOR: 'Non-EU citizen' };
const COB_CODES = { NAT: 'Born in country', EU27_2020_FOR: 'Born in other EU country', NEU27_2020_FOR: 'Born outside EU' };

function exactAgeCode(age) {
  return age === 0 ? 'Y_LT1' : `Y${age}`;
}

function bandRange(code) {
  if (code === 'Y_LT5') return [0, 4];
  if (code === 'Y_GE90') return [90, 120];
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

function largestRemainder(proportions, total) {
  const raw = proportions.map((p) => p * total);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((sum, value) => sum + value, 0);
  const fractions = raw
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < remainder; i++) {
    floors[fractions[i].index] += 1;
  }
  return floors;
}

async function fetchNationalPopulation(country, year) {
  const ages = [];
  for (let age = 0; age <= 99; age++) ages.push(exactAgeCode(age));
  const data = await apiFetch('demo_pjan', {
    sex: ['M', 'F'],
    age: ages,
    geo: country,
    unit: 'NR',
    time: year
  });
  const parsed = parseJsonStat(data);
  const map = new Map();
  for (const sex of ['M', 'F']) {
    for (let age = 0; age <= 99; age++) {
      const value = lookupValue(parsed, {
        freq: 'A',
        unit: 'NR',
        sex,
        age: exactAgeCode(age),
        geo: country,
        time: year
      });
      if (value > 0) map.set(`${sex}|${age}`, value);
    }
  }
  return map;
}

async function fetchRegionalPopulation(country, year, nutsLevel) {
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

  const data = await apiFetch('demo_r_pjangrp3', {
    sex: ['M', 'F'],
    age: AGE_BANDS_5,
    geo: geos,
    unit: 'NR',
    time: year
  });
  const parsed = parseJsonStat(data);
  const map = new Map();
  for (const geo of geos) {
    for (const sex of ['M', 'F']) {
      for (const age of AGE_BANDS_5) {
        const value = lookupValue(parsed, {
          freq: 'A',
          unit: 'NR',
          sex,
          age,
          geo,
          time: year
        });
        if (value > 0) map.set(`${sex}|${age}|${geo}`, value);
      }
    }
  }
  return { geos, labels: catalog, map };
}

function getNationalAgeBands(minAge, maxAge) {
  const bands = [];
  for (const code of AGE_BANDS_5) {
    const range = bandRange(code);
    if (!range || range[1] < minAge || range[0] > maxAge) continue;
    const low = Math.max(range[0], minAge);
    const high = Math.min(range[1], maxAge, 99);
    const ages = [];
    for (let age = low; age <= high; age++) ages.push(age);
    bands.push({ code, ages, label: code === 'Y_GE90' ? `${low}+` : `${low}-${high}` });
  }
  return bands;
}

function getOverlappingRegionalBands(minAge, maxAge) {
  return AGE_BANDS_5
    .map((code) => ({ code, range: bandRange(code) }))
    .filter(({ range }) => range && Math.min(range[1], 99) >= minAge && range[0] <= maxAge)
    .map(({ code, range }) => ({
      code,
      exact: range[0] >= minAge && Math.min(range[1], 99) <= maxAge
    }));
}

function aggregateNational(map, sexes, ageBands) {
  let total = 0;
  for (const sex of sexes) {
    for (const band of ageBands) {
      for (const age of band.ages) {
        total += map.get(`${sex}|${age}`) || 0;
      }
    }
  }
  return Math.round(total);
}

function aggregateRegional(map, sexes, geos, ageBands, geoFilter = null) {
  let total = 0;
  const useGeos = geoFilter ? [geoFilter] : geos;
  for (const sex of sexes) {
    for (const band of ageBands) {
      for (const geo of useGeos) {
        total += map.get(`${sex}|${band.code}|${geo}`) || 0;
      }
    }
  }
  return Math.round(total);
}

async function fetchLfsMap(dataset, params, keyDims) {
  const data = await apiFetch(dataset, params);
  const parsed = parseJsonStat(data);
  const map = new Map();

  function walk(dimIndex, coords, keyParts) {
    if (dimIndex === parsed.dims.length) {
      const value = lookupValue(parsed, coords);
      if (value !== null && value > 0) map.set(keyParts.join('|'), value);
      return;
    }

    const dim = parsed.dims[dimIndex];
    const codes = Object.keys(parsed.dimIndex[dim]);
    for (const code of codes) {
      coords[dim] = code;
      if (keyDims.includes(dim)) {
        walk(dimIndex + 1, coords, [...keyParts, code]);
      } else {
        walk(dimIndex + 1, coords, keyParts);
      }
    }
  }

  walk(0, {}, []);
  return map;
}

function aggregateLfs(map, sexes, selectedAgeBands, code) {
  let total = 0;
  const selected = new Set(selectedAgeBands);
  for (const [key, value] of map) {
    const parts = key.split('|');
    const sex = parts.find((part) => part === 'M' || part === 'F');
    if (sex && !sexes.includes(sex)) continue;
    if (!parts.includes(code)) continue;
    const age = parts.find((part) => selected.has(part));
    if (age) total += value * 1000;
  }
  return Math.round(total);
}

function aggregateEducation(map, sexes) {
  return function (code) {
    let total = 0;
    for (const [key, value] of map) {
      const parts = key.split('|');
      const sex = parts.find((part) => part === 'M' || part === 'F');
      if (sex && !sexes.includes(sex)) continue;
      if (parts.includes(code)) total += value;
    }
    return Math.round(total);
  };
}

async function main() {
  const country = process.argv[2] || 'EE';
  const year = process.argv[3] || '2024';
  const minAge = Number(process.argv[4] || '23');
  const maxAge = Number(process.argv[5] || '52');
  const sampleSize = Number(process.argv[6] || '1000');
  const nutsLevel = Number(process.argv[7] || '3');
  const sexes = ['M', 'F'];

  const nationalPopulation = await fetchNationalPopulation(country, year);
  const regional = await fetchRegionalPopulation(country, year, nutsLevel);
  const nationalBands = getNationalAgeBands(minAge, maxAge);
  const regionalBands = getOverlappingRegionalBands(minAge, maxAge);

  const totalNational = aggregateNational(nationalPopulation, sexes, nationalBands);
  const regionalTotals = regional.geos.map((geo) =>
    aggregateRegional(regional.map, sexes, regional.geos, regionalBands, geo)
  );
  const regionalAll = regionalTotals.reduce((sum, value) => sum + value, 0);
  const regionalQuotas = largestRemainder(regionalTotals.map((value) => value / regionalAll), sampleSize);

  const lfsBands = regionalBands.map((band) => band.code).filter((code) => code !== 'Y_LT5');
  const employMap = await fetchLfsMap('lfsa_pgauws', {
    sex: sexes,
    wstatus: Object.keys(EMPLOY_STATUSES),
    deg_urb: 'TOTAL',
    age: lfsBands,
    geo: country,
    unit: 'THS_PER',
    time: year
  }, ['sex', 'wstatus', 'age']);

  const urbanMap = await fetchLfsMap('lfsa_pgauws', {
    sex: sexes,
    wstatus: 'POP',
    deg_urb: Object.keys(URBAN_DEGREES),
    age: lfsBands,
    geo: country,
    unit: 'THS_PER',
    time: year
  }, ['sex', 'deg_urb', 'age']);

  const employValues = Object.keys(EMPLOY_STATUSES).map((code) => aggregateLfs(employMap, sexes, lfsBands, code));
  const employTotal = employValues.reduce((sum, value) => sum + value, 0);
  const employQuotas = largestRemainder(employValues.map((value) => value / employTotal), sampleSize);

  const urbanValues = Object.keys(URBAN_DEGREES).map((code) => aggregateLfs(urbanMap, sexes, lfsBands, code));
  const urbanTotal = urbanValues.reduce((sum, value) => sum + value, 0);
  const urbanQuotas = largestRemainder(urbanValues.map((value) => value / urbanTotal), sampleSize);

  const educAges = [];
  for (let age = Math.max(0, minAge); age <= Math.min(99, maxAge); age++) educAges.push(exactAgeCode(age));
  const educMap = await fetchLfsMap('demo_pjanedu', {
    sex: sexes,
    isced11: Object.keys(EDUC_LEVELS),
    age: educAges,
    geo: country,
    unit: 'NR',
    time: year
  }, ['sex', 'isced11', 'age']);
  const educationAgg = aggregateEducation(educMap, sexes);
  const educValues = Object.keys(EDUC_LEVELS).map((code) => educationAgg(code));
  const educTotal = educValues.reduce((sum, value) => sum + value, 0);
  const educQuotas = largestRemainder(educValues.map((value) => value / educTotal), sampleSize);

  const occupBands = LFS_AGE_BANDS.filter((code) => {
    const range = code === 'Y_GE65' ? [65, 120] : bandRange(code);
    const high = Math.min(range[1], 99);
    return high >= minAge && range[0] <= maxAge;
  });
  const occupMap = await fetchLfsMap('lfsa_egais', {
    sex: sexes,
    wstatus: 'EMP',
    isco08: Object.keys(ISCO_CODES),
    age: occupBands,
    geo: country,
    unit: 'THS_PER',
    time: year
  }, ['sex', 'isco08', 'age']);
  const occupValues = Object.keys(ISCO_CODES).map((code) => aggregateLfs(occupMap, sexes, occupBands, code));
  const occupTotal = occupValues.reduce((sum, value) => sum + value, 0);
  const occupQuotas = largestRemainder(occupValues.map((value) => value / occupTotal), sampleSize);

  const citizenMap = await fetchLfsMap('lfsa_pganws', {
    sex: sexes,
    citizen: Object.keys(CITIZEN_CODES),
    wstatus: 'POP',
    age: lfsBands,
    geo: country,
    unit: 'THS_PER',
    time: year
  }, ['sex', 'citizen', 'age']);
  const citizenValues = Object.keys(CITIZEN_CODES).map((code) => aggregateLfs(citizenMap, sexes, lfsBands, code));
  const citizenTotal = citizenValues.reduce((sum, value) => sum + value, 0);
  const citizenQuotas = largestRemainder(citizenValues.map((value) => value / citizenTotal), sampleSize);

  const cobMap = await fetchLfsMap('lfsa_pgacws', {
    sex: sexes,
    c_birth: Object.keys(COB_CODES),
    wstatus: 'POP',
    age: lfsBands,
    geo: country,
    unit: 'THS_PER',
    time: year
  }, ['sex', 'c_birth', 'age']);
  const cobValues = Object.keys(COB_CODES).map((code) => aggregateLfs(cobMap, sexes, lfsBands, code));
  const cobTotal = cobValues.reduce((sum, value) => sum + value, 0);
  const cobQuotas = largestRemainder(cobValues.map((value) => value / cobTotal), sampleSize);

  console.log(JSON.stringify({
    country,
    year,
    ages: `${minAge}-${maxAge}`,
    nutsLevel,
    nationalPopulation: totalNational,
    regionalBandsUsed: regionalBands,
    labourBandsUsed: lfsBands,
    regionalTop: regional.geos.slice(0, 10).map((geo, index) => ({
      geo,
      label: regional.labels[geo],
      population: regionalTotals[index],
      quota: regionalQuotas[index]
    })),
    labourStatus: Object.keys(EMPLOY_STATUSES).map((code, index) => ({
      code,
      label: EMPLOY_STATUSES[code],
      population: employValues[index],
      quota: employQuotas[index]
    })),
    urbanisation: Object.keys(URBAN_DEGREES).map((code, index) => ({
      code,
      label: URBAN_DEGREES[code],
      population: urbanValues[index],
      quota: urbanQuotas[index]
    })),
    education: Object.keys(EDUC_LEVELS).map((code, index) => ({
      code,
      label: EDUC_LEVELS[code],
      population: educValues[index],
      quota: educQuotas[index]
    })),
    occupationBandsUsed: occupBands,
    occupation: Object.keys(ISCO_CODES).map((code, index) => ({
      code,
      label: ISCO_CODES[code],
      population: occupValues[index],
      quota: occupQuotas[index]
    })),
    citizenship: Object.keys(CITIZEN_CODES).map((code, index) => ({
      code,
      label: CITIZEN_CODES[code],
      population: citizenValues[index],
      quota: citizenQuotas[index]
    })),
    countryOfBirth: Object.keys(COB_CODES).map((code, index) => ({
      code,
      label: COB_CODES[code],
      population: cobValues[index],
      quota: cobQuotas[index]
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
