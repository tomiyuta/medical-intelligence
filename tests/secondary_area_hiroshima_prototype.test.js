#!/usr/bin/env node
/**
 * Phase 4-3c-B-lite: 広島県二次医療圏 prototype QA test
 *
 * scope (reviewer 採択):
 *   - 広島県 7 圏域のみ
 *   - Supply + Population
 *   - NDB Risk side 実装なし
 *   - UI 変更なし
 *
 * 確認項目:
 *   1. JMAP fixture が 7 圏域 = 227 hospitals
 *   2. 既存 ETL 3 つの圏域数が 7 で一致
 *   3. 圏域名が EXPECTED_HIROSHIMA_AREAS と一致
 *   4. JMAP 値: 広島 92, 広島西 12, 呉 28, 広島中央 19, 尾三 21, 福山・府中 45, 備北 10
 *   5. 市区町村→圏域集計が prototype として動作
 *   6. NDB Risk side が implemented=false で記録
 *
 * 使用:
 *   node tests/secondary_area_hiroshima_prototype.test.js
 *   npm run test:hiroshima-prototype
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';

const EXPECTED_HIROSHIMA_AREAS = ['広島', '広島西', '呉', '広島中央', '尾三', '福山・府中', '備北'];
const EXPECTED_JMAP_HOSPITALS = {
  '広島': 92,
  '広島西': 12,
  '呉': 28,
  '広島中央': 19,
  '尾三': 21,
  '福山・府中': 45,
  '備北': 10,
};
const EXPECTED_JMAP_TOTAL = 227;

function main() {
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}  Phase 4-3c-B-lite: 広島県二次医療圏 prototype 検証${RESET}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);

  const errors = [];

  // ── prototype JSON load ──
  const protoPath = path.join(ROOT, 'data', 'static', 'secondary_area_hiroshima_prototype.json');
  if (!fs.existsSync(protoPath)) {
    console.error(`${RED}prototype file not found: ${protoPath}${RESET}`);
    console.error(`${RED}Did you run: python3 scripts/prototype_secondary_area_hiroshima.py ?${RESET}`);
    process.exit(1);
  }
  const proto = JSON.parse(fs.readFileSync(protoPath, 'utf-8'));

  // ── 1. 圏域数 7 一致 ──
  console.log(`\n${BOLD}── 1. 圏域数の整合性 ──${RESET}`);
  const counts = proto.area_count;
  const expected = 7;
  for (const [k, v] of Object.entries(counts)) {
    if (k === 'consistent') continue;
    const ok = v === expected;
    console.log(`  ${ok ? GREEN+'✓'+RESET : RED+'✗'+RESET} ${k}: ${v} (期待 ${expected})`);
    if (!ok) errors.push(`area_count.${k} = ${v}, expected ${expected}`);
  }
  if (!counts.consistent) errors.push('area_count.consistent = false');

  // ── 2. 圏域名一致 ──
  console.log(`\n${BOLD}── 2. 圏域名一致 ──${RESET}`);
  const expectedNames = JSON.stringify([...EXPECTED_HIROSHIMA_AREAS].sort());
  const actualNames = JSON.stringify([...proto.expected_area_names].sort());
  if (expectedNames !== actualNames) {
    errors.push(`圏域名不一致: actual=${actualNames}, expected=${expectedNames}`);
    console.log(`  ${RED}✗${RESET} 圏域名不一致`);
  } else {
    console.log(`  ${GREEN}✓${RESET} 7 圏域すべて期待通り`);
  }

  // ── 3. JMAP fixture 値検証 ──
  console.log(`\n${BOLD}── 3. JMAP fixture 値検証 ──${RESET}`);
  const jmapBy = {};
  for (const a of proto.cross_reference) {
    jmapBy[a.area] = a.supply.jmap_hospitals;
  }
  for (const [area, expected_v] of Object.entries(EXPECTED_JMAP_HOSPITALS)) {
    const actual_v = jmapBy[area];
    const ok = actual_v === expected_v;
    console.log(`  ${ok ? GREEN+'✓'+RESET : RED+'✗'+RESET} ${area}: ${actual_v} (期待 ${expected_v})`);
    if (!ok) errors.push(`JMAP ${area}: ${actual_v} != ${expected_v}`);
  }
  // 合計
  const totalJmap = proto.totals.jmap_hospitals;
  const okTotal = totalJmap === EXPECTED_JMAP_TOTAL;
  console.log(`  ${okTotal ? GREEN+'✓'+RESET : RED+'✗'+RESET} 合計: ${totalJmap} (期待 ${EXPECTED_JMAP_TOTAL})`);
  if (!okTotal) errors.push(`JMAP total ${totalJmap} != ${EXPECTED_JMAP_TOTAL}`);

  // ── 4. 市区町村→圏域集計 prototype ──
  console.log(`\n${BOLD}── 4. 市区町村→圏域集計 prototype ──${RESET}`);
  let aggregateOK = 0;
  for (const area of EXPECTED_HIROSHIMA_AREAS) {
    const agg = proto.municipality_aggregation?.[area];
    if (!agg) {
      errors.push(`municipality_aggregation 欠落: ${area}`);
      continue;
    }
    if (agg.muni_count > 0 && agg.agg_pop > 0 && agg.agg_p65 > 0 && agg.agg_aging_ratio != null) {
      aggregateOK++;
      console.log(`  ${GREEN}✓${RESET} ${area}: munis=${agg.muni_count}, pop=${agg.agg_pop}, aging=${agg.agg_aging_ratio}%`);
    } else {
      errors.push(`${area} 集計値が不完全: ${JSON.stringify(agg)}`);
    }
  }

  // ── 5. NDB Risk side が implemented=false ──
  console.log(`\n${BOLD}── 5. NDB Risk side scope 確認 ──${RESET}`);
  const ndbStatus = proto.ndb_risk_side_status;
  if (ndbStatus?.implemented === false) {
    console.log(`  ${GREEN}✓${RESET} NDB Risk side: implemented=false (reviewer 採択方針)`);
    console.log(`  ${GREEN}✓${RESET} deferred_to: ${ndbStatus.deferred_to}`);
  } else {
    errors.push('NDB Risk side が implemented=false でない (scope 違反)');
  }

  // ── 6. JMAP fixture 出典明記 ──
  console.log(`\n${BOLD}── 6. JMAP fixture 出典明記 ──${RESET}`);
  const jmapMeta = proto._data_sources?.jmap_fixture;
  if (jmapMeta?._source && jmapMeta?._source_url && jmapMeta?._confirmed_at) {
    console.log(`  ${GREEN}✓${RESET} _source: ${jmapMeta._source.substring(0, 60)}`);
    console.log(`  ${GREEN}✓${RESET} _source_url: ${jmapMeta._source_url}`);
    console.log(`  ${GREEN}✓${RESET} _confirmed_at: ${jmapMeta._confirmed_at}`);
  } else {
    errors.push('JMAP fixture に出典 (_source / _source_url / _confirmed_at) が完全に記載されていない');
  }

  // ── 7. ETL vs JMAP 差分 (informational) ──
  console.log(`\n${BOLD}── 7. ETL vs JMAP 差分 (informational) ──${RESET}`);
  console.log(`  JMAP 合計: ${proto.totals.jmap_hospitals}, ETL 合計: ${proto.totals.etl_hospitals}, 差: ${proto.totals.diff > 0 ? '+' : ''}${proto.totals.diff}`);
  console.log(`  → ${proto.totals.diff_explanation}`);

  // ── 結果 ──
  if (errors.length > 0) {
    console.log(`\n${RED}${BOLD}❌ FAIL: ${errors.length} assertion(s) failed${RESET}`);
    for (const e of errors) console.log(`${RED}  - ${e}${RESET}`);
    process.exit(1);
  }

  console.log(`\n${GREEN}${BOLD}✅ PASS: 広島県 prototype 全 assertion 成功${RESET}`);
  console.log(`${GREEN}  - 7 圏域 ETL × 3 ファイル + JMAP fixture 整合${RESET}`);
  console.log(`${GREEN}  - JMAP 値 7/7 = 227 hospitals 一致${RESET}`);
  console.log(`${GREEN}  - 市区町村→圏域集計 ${aggregateOK}/7 完了${RESET}`);
  console.log(`${GREEN}  - NDB Risk side 実装なし (reviewer 採択 scope 厳守)${RESET}`);
  process.exit(0);
}

main();
