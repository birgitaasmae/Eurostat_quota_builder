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
const SAMPLE_SIZES = [100, 1000, 2000];
const SEX_CASES = ['MF', 'M', 'F'];
const NUTS_LEVELS = [1, 2, 3];
const GROUPINGS = [5, 10];

const AGE_BANDS_5 = [
  'Y_LT5','Y5-9','Y10-14','Y15-19','Y20-24','Y25-29','Y30-34','Y35-39',
  'Y40-44','Y45-49','Y50-54','Y55-59','Y60-64','Y65-69','Y70-74','Y75-79',
  'Y80-84','Y85-89','Y_GE90'
];
const LFS_AGE_BANDS = ['Y15-24','Y25-49','Y50-64','Y_GE65'];

const EDUC_LEVELS = { 'ED0-2':'Low', 'ED3_4':'Medium', 'ED5-8':'High' };
const EMPLOY_STATUSES = { 'EMP':'Employed', 'UNE':'Unemployed', 'INAC':'Inactive' };
const URBAN_DEGREES = { 'DEG1':'Cities', 'DEG2':'Towns', 'DEG3':'Rural' };
const ISCO_CODES = { 'OC1':'Managers','OC2':'Professionals','OC3':'Technicians','OC4':'Clerical','OC5':'Service','OC6':'Agriculture','OC7':'Craft','OC8':'Operators','OC9':'Elementary','OC0':'Armed' };
const CITIZEN_CODES = { 'NAT':'National', 'EU27_2020_FOR':'EU', 'NEU27_2020_FOR':'Non-EU' };
const COB_CODES = { 'NAT':'Born in country', 'EU27_2020_FOR':'Born in EU', 'NEU27_2020_FOR':'Born outside EU' };

function exactAgeCode(age) {
  return age === 0 ? 'Y_LT1' : `Y${age}`;
}

function bandRange(code) {
  if (code === 'Y_LT5') return [0, 4];
  if (code === 'Y_GE90') return [90, 120];
  if (code === 'Y_GE65') return [65, 120];
  const match = code.match(/Y(\d+)-(\d+)/);
  if (match) return [Number(match[1]), Number(match[2])];
  const single = code.match(/^Y(\d+)$/);
  if (single) return [Number(single[1]), Number(single[1])];
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
  const fractions = raw.map((value, index) => ({ index, frac: value - floors[index] })).sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < remainder; i++) floors[fractions[i].index] += 1;
  return floors;
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
    if (ages.length) bands.push({ code, ages, label: code === 'Y_GE90' ? `${low}+` : `${low}-${high}` });
  }
  return bands;
}

function mergeAgeBands(bands, grouping) {
  if (grouping === 5) return bands.map((band) => ({ ...band, ages: band.ages.slice(), codes: [band.code] }));
  const merged = [];
  let i = 0;
  while (i < bands.length) {
    const r1 = bandRange(bands[i].code);
    if (i + 1 < bands.length) {
      const r2 = bandRange(bands[i + 1].code);
      if (r1 && r2 && r1[0] % 10 === 0 && r2[0] === r1[0] + 5) {
        const hi = bands[i + 1].label.includes('+') ? bands[i + 1].label : bands[i + 1].label.split('-')[1];
        merged.push({
          codes: [bands[i].code, bands[i + 1].code],
          ages: [...bands[i].ages, ...bands[i + 1].ages],
          label: bands[i + 1].label.includes('+') ? `${bands[i].label.split('-')[0]}+` : `${bands[i].label.split('-')[0]}-${hi}`
        });
        i += 2;
        continue;
      }
    }
    merged.push({ codes: [bands[i].code], ages: bands[i].ages.slice(), label: bands[i].label });
    i += 1;
  }
  return merged;
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
    this.national = new Map();
    this.regionCatalog = {};
    this.regionMap = new Map();
    this.lfs = {};
  }
}

async function loadCountryYear(country, year) {
  const loaded = new CountryYearData(country, year);

  const nationalAges = [];
  for (let age = 0; age <= 99; age++) nationalAges.push(exactAgeCode(age));
  const nationalData = await apiFetch('demo_pjan', {
    sex: ['M', 'F'],
    age: nationalAges,
    geo: country,
    unit: 'NR',
    time: year
  });
  const nationalParsed = parseJsonStat(nationalData);
  for (const sex of ['M', 'F']) {
    for (let age = 0; age <= 99; age++) {
      const value = lookupValue(nationalParsed, { freq: 'A', unit: 'NR', sex, age: exactAgeCode(age), geo: country, time: year });
      if (value > 0) loaded.national.set(`${sex}|${age}`, value);
    }
  }

  const regionCatalogData = await apiFetch('demo_r_pjangrp3', { sex: 'T', age: 'TOTAL', unit: 'NR', time: year });
  const regionCatalogParsed = parseJsonStat(regionCatalogData);
  loaded.regionCatalog = regionCatalogParsed.dimLabels.geo || {};
  const regionGeos = Object.keys(loaded.regionCatalog).filter((geo) =>
    geo.startsWith(country) && geo.length >= 3 && !/\(NUTS\s/.test(loaded.regionCatalog[geo])
  );
  const regionData = await apiFetch('demo_r_pjangrp3', {
    sex: ['M', 'F'],
    age: AGE_BANDS_5,
    geo: regionGeos,
    unit: 'NR',
    time: year
  });
  const regionParsed = parseJsonStat(regionData);
  for (const geo of regionGeos) {
    for (const sex of ['M', 'F']) {
      for (const age of AGE_BANDS_5) {
        const value = lookupValue(regionParsed, { freq: 'A', unit: 'NR', sex, age, geo, time: year });
        if (value > 0) loaded.regionMap.set(`${sex}|${age}|${geo}`, value);
      }
    }
  }

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
    age: getOverlappingBands(AGE_BANDS_5, 15, 99),
    geo: country,
    unit: 'THS_PER',
    time: year
  }));

  loaded.lfs.urban = parseJsonStat(await apiFetch('lfsa_pgauws', {
    sex: ['M', 'F'],
    wstatus: 'POP',
    deg_urb: Object.keys(URBAN_DEGREES),
    age: getOverlappingBands(AGE_BANDS_5, 15, 99),
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
    age: getOverlappingBands(AGE_BANDS_5, 15, 99),
    geo: country,
    unit: 'THS_PER',
    time: year
  }));

  loaded.lfs.birth = parseJsonStat(await apiFetch('lfsa_pgacws', {
    sex: ['M', 'F'],
    c_birth: Object.keys(COB_CODES),
    wstatus: 'POP',
    age: getOverlappingBands(AGE_BANDS_5, 15, 99),
    geo: country,
    unit: 'THS_PER',
    time: year
  }));

  return loaded;
}

function aggregateNational(data, sexes, ageBands) {
  let total = 0;
  for (const sex of sexes) for (const band of ageBands) for (const age of band.ages) total += data.national.get(`${sex}|${age}`) || 0;
  return Math.round(total);
}

function getNutsGeos(data, nutsLevel) {
  const geoLen = 2 + nutsLevel;
  return Object.keys(data.regionCatalog).filter((geo) =>
    geo.startsWith(data.country) && geo.length === geoLen && !/\(NUTS\s/.test(data.regionCatalog[geo])
  );
}

function aggregateRegional(data, sexes, ageCodes, geos) {
  const rows = [];
  for (const geo of geos) {
    let total = 0;
    for (const sex of sexes) for (const age of ageCodes) total += data.regionMap.get(`${sex}|${age}|${geo}`) || 0;
    rows.push({ geo, total });
  }
  return rows;
}

function aggregateEducation(data, sexes, minAge, maxAge) {
  const rows = [];
  for (const code of Object.keys(EDUC_LEVELS)) {
    let total = 0;
    for (const sex of sexes) {
      for (let age = minAge; age <= Math.min(maxAge, 99); age++) {
        total += lookupValue(data.lfs.educ, { freq: 'A', unit: 'NR', sex, age: exactAgeCode(age), isced11: code, geo: data.country, time: data.year }) || 0;
      }
    }
    rows.push({ code, total });
  }
  return rows;
}

function aggregateLfs(parsed, data, sexes, ageCodes, codes, dimName, extraCoords) {
  const rows = [];
  for (const code of codes) {
    let total = 0;
    for (const sex of sexes) {
      for (const age of ageCodes) {
        total += (lookupValue(parsed, { freq: 'A', sex, age, geo: data.country, time: data.year, ...extraCoords(code) }) || 0) * 1000;
      }
    }
    rows.push({ code, total: Math.round(total) });
  }
  return rows;
}

function recordFailure(summary, type, detail) {
  summary.failures.push({ type, ...detail });
}

async function main() {
  const summary = {
    testedCountryYears: 0,
    testedCombos: 0,
    failures: [],
    educationUnavailable: new Set(),
    regionZeroRows: []
  };

  for (const country of Object.keys(COUNTRIES)) {
    for (const year of YEARS) {
      let data;
      try {
        data = await loadCountryYear(country, year);
        summary.testedCountryYears += 1;
      } catch (error) {
        recordFailure(summary, 'load_error', { country, year, error: error.message });
        continue;
      }

      const regionZeroByLevel = {};
      for (const nutsLevel of NUTS_LEVELS) {
        const geos = getNutsGeos(data, nutsLevel);
        const allRows = aggregateRegional(data, ['M', 'F'], AGE_BANDS_5, geos);
        const zeroRows = allRows.filter((row) => row.total === 0);
        if (zeroRows.length) {
          regionZeroByLevel[nutsLevel] = zeroRows.length;
          summary.regionZeroRows.push({
            country,
            year,
            nutsLevel,
            zeroRows: zeroRows.length,
            totalRows: geos.length,
            examples: zeroRows.slice(0, 5).map((row) => `${row.geo} ${data.regionCatalog[row.geo]}`)
          });
        }
      }

      for (const ageCase of AGE_CASES) {
        const national5 = getNationalAgeBands(ageCase.min, ageCase.max);
        const national10 = mergeAgeBands(national5, 10);
        const overlapping5 = getOverlappingBands(AGE_BANDS_5, ageCase.min, ageCase.max);
        const overlappingOcc = getOverlappingBands(LFS_AGE_BANDS, ageCase.min, ageCase.max);

        for (const sexCase of SEX_CASES) {
          const sexes = sexesFromCase(sexCase);

          const nationalTotal5 = aggregateNational(data, sexes, national5);
          const nationalTotal10 = aggregateNational(data, sexes, national10);
          if (nationalTotal5 !== nationalTotal10) {
            recordFailure(summary, 'grouping_population_mismatch', { country, year, ages: ageCase.label, sexCase, total5: nationalTotal5, total10: nationalTotal10 });
          }

          const educRows = aggregateEducation(data, sexes, ageCase.min, ageCase.max);
          const educTotal = educRows.reduce((sum, row) => sum + row.total, 0);
          if (educTotal === 0) summary.educationUnavailable.add(`${country}:${year}`);

          const labourRows = aggregateLfs(data.lfs.labour, data, sexes, overlapping5, Object.keys(EMPLOY_STATUSES), 'wstatus', (code) => ({ unit: 'THS_PER', wstatus: code, deg_urb: 'TOTAL' }));
          const urbanRows = aggregateLfs(data.lfs.urban, data, sexes, overlapping5, Object.keys(URBAN_DEGREES), 'deg_urb', (code) => ({ unit: 'THS_PER', wstatus: 'POP', deg_urb: code }));
          const occRows = aggregateLfs(data.lfs.occupation, data, sexes, overlappingOcc, Object.keys(ISCO_CODES), 'isco08', (code) => ({ unit: 'THS_PER', wstatus: 'EMP', isco08: code }));
          const citizenRows = aggregateLfs(data.lfs.citizenship, data, sexes, overlapping5, Object.keys(CITIZEN_CODES), 'citizen', (code) => ({ unit: 'THS_PER', wstatus: 'POP', citizen: code }));
          const birthRows = aggregateLfs(data.lfs.birth, data, sexes, overlapping5, Object.keys(COB_CODES), 'c_birth', (code) => ({ unit: 'THS_PER', wstatus: 'POP', c_birth: code }));

          const extraSets = [
            { name: 'education', rows: educRows },
            { name: 'labour', rows: labourRows },
            { name: 'urban', rows: urbanRows },
            { name: 'occupation', rows: occRows },
            { name: 'citizenship', rows: citizenRows },
            { name: 'birth', rows: birthRows }
          ];

          for (const nutsLevel of NUTS_LEVELS) {
            const geos = getNutsGeos(data, nutsLevel);
            const regionRows = aggregateRegional(data, sexes, overlapping5, geos);
            const nonzeroRows = regionRows.filter((row) => row.total > 0);
            const regionTotal = nonzeroRows.reduce((sum, row) => sum + row.total, 0);

            if (nonzeroRows.length === 0) {
              recordFailure(summary, 'region_all_zero', { country, year, ages: ageCase.label, sexCase, nutsLevel });
            }

            for (const sampleSize of SAMPLE_SIZES) {
              if (regionTotal > 0) {
                const quotas = largestRemainder(nonzeroRows.map((row) => row.total / regionTotal), sampleSize);
                const sum = quotas.reduce((a, b) => a + b, 0);
                if (sum !== sampleSize) {
                  recordFailure(summary, 'region_quota_sum', { country, year, ages: ageCase.label, sexCase, nutsLevel, sampleSize, sum });
                }
              }

              for (const grouping of GROUPINGS) {
                const nationalBands = grouping === 5 ? national5 : national10;
                const ageTotals = nationalBands.map((band) => aggregateNational(data, sexes, [band]));
                if (ageTotals.reduce((a, b) => a + b, 0) !== (grouping === 5 ? nationalTotal5 : nationalTotal10)) {
                  recordFailure(summary, 'age_total_sum', { country, year, ages: ageCase.label, sexCase, grouping });
                }
                const ageQuotas = largestRemainder(ageTotals.map((value) => value / Math.max(1, ageTotals.reduce((a, b) => a + b, 0))), sampleSize);
                if (ageQuotas.reduce((a, b) => a + b, 0) !== sampleSize) {
                  recordFailure(summary, 'age_quota_sum', { country, year, ages: ageCase.label, sexCase, grouping, sampleSize });
                }
                summary.testedCombos += 1;
              }
            }
          }

          for (const set of extraSets) {
            const total = set.rows.reduce((sum, row) => sum + row.total, 0);
            if (set.name !== 'education' && total === 0) {
              recordFailure(summary, 'extra_zero_total', { country, year, ages: ageCase.label, sexCase, dataset: set.name });
            }
            for (const sampleSize of SAMPLE_SIZES) {
              if (total > 0) {
                const quotas = largestRemainder(set.rows.map((row) => row.total / total), sampleSize);
                if (quotas.reduce((a, b) => a + b, 0) !== sampleSize) {
                  recordFailure(summary, 'extra_quota_sum', { country, year, ages: ageCase.label, sexCase, dataset: set.name, sampleSize });
                }
              }
            }
          }
        }
      }
    }
  }

  const output = {
    testedCountryYears: summary.testedCountryYears,
    testedCombos: summary.testedCombos,
    failureCount: summary.failures.length,
    failures: summary.failures,
    educationUnavailable: Array.from(summary.educationUnavailable).sort(),
    regionZeroRows: summary.regionZeroRows
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
