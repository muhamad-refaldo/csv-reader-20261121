# Fast CSV reader

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/muhamad-refaldo/csv-reader-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/muhamad-refaldo/csv-reader-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A dependency-free, fast drop-in for csv-reader 1.0.0: `run(input)` returns exactly
what csv-reader returns for every `{text, header}` — the same `{columns, rows,
errors}`, including every broken-row error (`stray_cr`, `quote_junk`,
`unterminated_quote`, `short_row`, `long_row`) with its line and row — but it
reads the text by jumping between delimiters with `indexOf` and cutting fields
out with `slice`, instead of walking it one character at a time.

## Files

- `solve.js` — the reader: `run(input)` returns `{columns, rows, errors}`.
- `main.ts` — the driver: reads `/input/cases.json`, answers each case with
  `run`, writes `/output/answers.json` (V8 incremental marking off, as the
  house baseline runs).

## Run

```sh
MAKEFUN_INPUT_DIR=./practice/input MAKEFUN_OUTPUT_DIR=./out node main.ts
```
