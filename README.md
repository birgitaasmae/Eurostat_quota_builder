# Eurostat Quota Builder

A web-based tool for generating survey quotas based on European demographic data from Eurostat.

**Live:** https://birgitaasmae.github.io/javascript-sprint/quotabuilder/

## What it does

The Quota Builder helps you create statistically representative sample quotas for surveys by:
- Fetching population distributions from Eurostat's public demographic databases
- Breaking down populations by sex, age, region, education, employment, and other variables
- Calculating survey quotas using the **largest remainder method** for accurate distribution
- Allowing you to filter by age range, country, NUTS region level, and sample size
- Exporting results as Excel files or TSV for use in survey tools

## How to use

1. **Select a country** — choose from all EU member states + Iceland, Liechtenstein, Norway, Switzerland
2. **Pick a year** — the tool shows available years from Eurostat data
3. **Set your age range** — define min and max age for your survey population
4. **Choose sample size** — enter your target sample size (e.g., 1000 respondents)
5. **Optional: Add extra variables** — select demographic breakdowns (education, employment, urbanisation, occupation, citizenship, country of birth)
6. **Select NUTS level** — choose regional breakdown level (NUTS1, NUTS2, NUTS3)
7. **Click "Build Quotas"** — the tool fetches data and generates tables

## Output tables

- **Sex Distribution** — male/female split
- **Age Group Distribution** — quotas by age band (5-year, 10-year, or 15-year grouping)
- **Regional Distribution** — breakdowns by NUTS region
- **Cross-tab (Sex × Age)** — interlocked quotas combining sex and age
- **Additional variables** — education, labour status, urbanisation, occupation, citizenship, country of birth (when selected and available)

## Data sources

All data comes from **Eurostat public APIs**:
- Sex & age: `demo_pjan` (national), `demo_r_pjangrp3` (regional)
- Education: `demo_pjanedu`
- Labour status & urbanisation: `lfsa_pgauws`
- Occupation: `lfsa_egais`
- Citizenship: `lfsa_pganws`
- Country of birth: `lfsa_pgacws`

## Features

✅ Real-time data from Eurostat  
✅ Multiple demographic breakdowns  
✅ Regional (NUTS) analysis  
✅ Flexible age grouping (5/10/15-year bands)  
✅ Download to Excel or copy to clipboard  
✅ Availability checker — shows which variables have data for your selection  
✅ No server required — runs entirely in your browser  

## Technical details

- **Frontend:** HTML5 + vanilla JavaScript
- **Data format:** JSON-stat (Eurostat's standard)
- **Export:** SheetJS (XLSX)
- **Browser support:** Modern browsers with ES6+ support

## Local development

Run a local server on port 4173:
```bash
node server.js
```

Then open http://localhost:4173

## Notes

- Regional data (`demo_r_pjangrp3`) is only published for full 5-year age bands, so some custom age ranges may show limited regional breakdowns
- Some extra variables (e.g., occupation) only have published broad age bands rather than exact ages
- Data availability varies by country and year — the tool shows warnings when estimates are based on broader age groupings
