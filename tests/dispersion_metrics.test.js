#!/usr/bin/env node
/**
 * lib/dispersionMetrics.js 単体 test
 *
 * Phase 4-3 R1 (UI 改善: CV / max-min 比 KPI 併記) の core utility 検証。
 *
 * 検証:
 *   1. computeDispersion 基本動作 (n, mean, sd, cv, min, max, IQR)
 *   2. dispersionForCause で vital_stats 形式から計算
 *   3. classifyDispersion 閾値 (low/medium/high)
 *   4. 実 data: 47県の causes で 6 死因を計算、合理性確認
 *
 * 使用: node tests/dispersion_metrics.test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RED='\x1b[31m', GREEN='\x1b[32m', BLUE='\x1b[34m', RESET='\x1b[0m', BOLD='\x1b[1m';

// dynamic import (ES module)
let computeDispersion, dispersionForCause, classifyDispersion;

async function main() {
  console.log(`${BOLD}${BLUE}═══ lib/dispersionMetrics 単体 test ═══${RESET}`);
  
  const lib = await import(path.join(ROOT, 'lib/dispersionMetrics.js'));
  computeDispersion = lib.computeDispersion;
  dispersionForCause = lib.dispersionForCause;
  classifyDispersion = lib.classifyDispersion;
  
  const errors = [];
  
  // ── 1. computeDispersion 基本動作 ──
  console.log(`\n${BOLD}── 1. computeDispersion 基本 ──${RESET}`);
  // 既知の値 [1, 2, 3, 4, 5] mean=3, SD=1.5811 (sample), CV=52.7%, IQR=2 (Q1=2, Q3=4)
  const r1 = computeDispersion([1, 2, 3, 4, 5]);
  console.log(`  n=${r1.n} mean=${r1.mean} sd=${r1.sd} cv=${r1.cv_pct}% min=${r1.min} max=${r1.max} q1=${r1.q1} median=${r1.median} q3=${r1.q3}`);
  if (r1.n !== 5) errors.push('n != 5');
  if (Math.abs(r1.mean - 3) > 0.01) errors.push(`mean ${r1.mean} != 3`);
  if (Math.abs(r1.sd - 1.58) > 0.05) errors.push(`sd ${r1.sd} ≈ 1.58 expected`);
  if (Math.abs(r1.cv_pct - 52.7) > 0.5) errors.push(`cv ${r1.cv_pct} ≈ 52.7 expected`);
  if (r1.median !== 3) errors.push(`median ${r1.median} != 3`);
  if (r1.iqr !== 2) errors.push(`iqr ${r1.iqr} != 2`);
  if (r1.max_min_ratio !== 5) errors.push(`max_min_ratio ${r1.max_min_ratio} != 5`);
  if (errors.length === 0) console.log(`  ${GREEN}✓${RESET} 基本値 (n/mean/sd/cv/median/iqr/比) 全て正しい`);
  
  // ── 2. オブジェクト配列で pref labels ──
  console.log(`\n${BOLD}── 2. pref label 付与 ──${RESET}`);
  const r2 = computeDispersion([
    {pref: 'A', value: 10}, {pref: 'B', value: 20}, {pref: 'C', value: 30}, {pref: 'D', value: 40},
  ]);
  if (r2.pref_max !== 'D' || r2.pref_min !== 'A') {
    errors.push(`pref_max=${r2.pref_max} pref_min=${r2.pref_min}`);
  } else {
    console.log(`  ${GREEN}✓${RESET} pref_max=D, pref_min=A`);
  }
  
  // ── 3. classifyDispersion ──
  console.log(`\n${BOLD}── 3. classifyDispersion 閾値 ──${RESET}`);
  // CV < 10 = low, < 20 = medium, >= 20 = high
  const lowDisp = computeDispersion([100, 102, 98, 101, 99]); // CV 約 1.6%
  const medDisp = computeDispersion([10, 12, 14, 11, 13]); // CV 約 13%
  const highDisp = computeDispersion([1, 5, 10, 20, 50]); // CV 約 100%
  const lc = classifyDispersion(lowDisp);
  const mc = classifyDispersion(medDisp);
  const hc = classifyDispersion(highDisp);
  console.log(`  low (CV ${lowDisp.cv_pct}%): level=${lc.level}`);
  console.log(`  med (CV ${medDisp.cv_pct}%): level=${mc.level}`);
  console.log(`  high (CV ${highDisp.cv_pct}%): level=${hc.level}`);
  if (lc.level !== 'low') errors.push(`low classified as ${lc.level}`);
  if (mc.level !== 'medium') errors.push(`med classified as ${mc.level}`);
  if (hc.level !== 'high') errors.push(`high classified as ${hc.level}`);
  if (errors.length === 0 || errors.length < 3) {
    if (lc.level === 'low' && mc.level === 'medium' && hc.level === 'high') {
      console.log(`  ${GREEN}✓${RESET} 閾値分類 正しい`);
    }
  }
  
  // ── 4. 実 data: vital_stats_pref で 6 死因の dispersion ──
  console.log(`\n${BOLD}── 4. 実 data: vital_stats_pref 6 死因 ──${RESET}`);
  const vsPath = path.join(ROOT, 'data', 'static', 'vital_stats_pref.json');
  const vs = JSON.parse(fs.readFileSync(vsPath, 'utf-8'));
  const causes = ['がん', '心疾患', '脳血管疾患', '肺炎', '糖尿病', '腎不全'];
  const results = [];
  for (const c of causes) {
    const d = dispersionForCause(vs.prefectures, c);
    if (d) {
      results.push({ cause: c, ...d });
      console.log(`  ${c.padEnd(10)} CV=${d.cv_pct.toFixed(2)}% 比=${d.max_min_ratio?.toFixed(2)} (mean=${d.mean}, max=${d.pref_max}, min=${d.pref_min})`);
    }
  }
  if (results.length !== 6) errors.push(`6 死因の dispersion 計算失敗 (got ${results.length})`);
  
  // ── 5. ガンが他疾患より CV 小さいか ──
  console.log(`\n${BOLD}── 5. 仮説検証: ガンが他疾患より CV 小 ──${RESET}`);
  const cancer = results.find(x => x.cause === 'がん');
  const others = results.filter(x => x.cause !== 'がん');
  let cancerSmaller = 0;
  for (const o of others) {
    const ok = cancer.cv_pct < o.cv_pct;
    console.log(`  ${ok ? GREEN+'✓'+RESET : RED+'✗'+RESET} ガン CV ${cancer.cv_pct.toFixed(2)}% < ${o.cause} CV ${o.cv_pct.toFixed(2)}%`);
    if (ok) cancerSmaller++;
  }
  if (cancerSmaller !== others.length) {
    errors.push(`ガンが ${cancerSmaller}/${others.length} で CV 最小、期待: 全 ${others.length}`);
  } else {
    console.log(`  ${GREEN}✓${RESET} ガンは ${others.length}/${others.length} 死因より CV 小、仮説実証 (粗死亡率 vital_stats_pref)`);
  }
  
  if (errors.length > 0) {
    console.log(`\n${RED}${BOLD}❌ FAIL: ${errors.length} 件${RESET}`);
    for (const e of errors) console.log(`${RED}  - ${e}${RESET}`);
    process.exit(1);
  }
  console.log(`\n${GREEN}${BOLD}✅ PASS: lib/dispersionMetrics 全 assertion 成功${RESET}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
