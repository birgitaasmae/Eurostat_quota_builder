const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, 'analysis-2024-23-52.json');
let raw = fs.readFileSync(file);
let text = raw.toString('utf8');
if (text.charCodeAt(0) === 0xfffd || text.includes('\u0000')) {
  text = raw.toString('utf16le');
}
if (text.charCodeAt(0) === 0xfeff) {
  text = text.slice(1);
}
const data = JSON.parse(text);

const educationZero = data.filter((row) => row.education && row.education.total === 0);
const regionZero = data.filter((row) => row.region && row.region.zeroRegions > 0);
const deltas = data
  .filter((row) => row.nationalPopulation && row.region && row.region.sum)
  .map((row) => ({
    country: row.country,
    name: row.name,
    national: row.nationalPopulation,
    regional: row.region.sum,
    deltaPct: Number((((row.region.sum - row.nationalPopulation) / row.nationalPopulation) * 100).toFixed(1))
  }))
  .sort((a, b) => b.deltaPct - a.deltaPct);

console.log('Countries:', data.length);
console.log('Education zero totals:', educationZero.length, educationZero.map((row) => row.country).join(', '));
console.log('Countries with zero-value NUTS3 rows:', regionZero.length);
for (const row of regionZero) {
  console.log(`REGION_ZERO\t${row.country}\t${row.name}\tzero=${row.region.zeroRegions}/${row.region.totalRegions}\t${row.region.examplesZero.join('; ')}`);
}
console.log('Largest regional vs national delta (partial-band effect):');
for (const row of deltas.slice(0, 15)) {
  console.log(`DELTA\t${row.country}\t${row.name}\t${row.deltaPct}%\tnational=${row.national}\tregional=${row.regional}`);
}
