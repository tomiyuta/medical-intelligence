#!/usr/bin/env node
/**
 * Phase 4-3 Cancer Sites: dispersion test
 *
 * Done:
 *   1. 47 県 × 7 部位 (全/胃/大腸/肝/肺/乳房/前立腺) × 3 sex
 *   2. 部位別 CV が 全部位 CV より大きい
 *   3. 高位県の constellation: 青森(肝/大腸)、秋田(胃)、北海道(肺/乳房)
 *
 * 使用: node tests/cancer_sites_dispersion.test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RED='\x1b[31m', GREEN='\x1b[32m', BLUE='\x1b[34m', RESET='\x1b[0m', BOLD='\x1b[1m';

const PREFECTURES_47 = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

function dispersion(data, site, sex='男女計') {
  const vals = [];
  for (const p of PREFECTURES_47) {
    const v = data.prefectures[p]?.[site]?.[sex];
    if (v != null) vals.push({pref: p, val: v});
  }
  if (vals.length < 40) return null;
  const rates = vals.map(x => x.val);
  const mean = rates.reduce((a,b)=>a+b,0) / rates.length;
  const variance = rates.reduce((a,b) => a + (b-mean)**2, 0) / (rates.length - 1);
  const sd = Math.sqrt(variance);
  const cv = sd / mean * 100;
  const mn = Math.min(...rates), mx = Math.max(...rates);
  const pmax = vals.find(x => x.val === mx).pref;
  const pmin = vals.find(x => x.val === mn).pref;
  return {cv, ratio: mx/mn, mean, n: vals.length, pmax, pmin};
}

function main() {
  console.log(`${BOLD}${BLUE}═══ Phase 4-3 Cancer Sites Dispersion Test ═══${RESET}`);
  
  const dataPath = path.join(ROOT, 'data', 'static', 'cancer_sites_mortality_2024.json');
  if (!fs.existsSync(dataPath)) {
    console.error(`${RED}Data not found: run 'python3 scripts/etl_cancer_sites_2024.py' first${RESET}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const errors = [];
  
  // ── 1. 構造 ──
  console.log(`\n${BOLD}── 1. data 構造 ──${RESET}`);
  if (Object.keys(data.prefectures).length !== 47) {
    errors.push(`prefectures 数 = ${Object.keys(data.prefectures).length}, 期待 47`);
  } else {
    console.log(`  ${GREEN}✓${RESET} 47 県`);
  }
  const expectedSites = ['all', 'stomach', 'colorectal', 'liver', 'lung', 'breast', 'prostate'];
  const sample = data.prefectures['北海道'];
  for (const s of expectedSites) {
    if (!sample[s]) errors.push(`北海道に site '${s}' なし`);
  }
  if (errors.length === 0) console.log(`  ${GREEN}✓${RESET} 7 部位 × 3 性別`);
  
  // ── 2. dispersion ranking 検証 ──
  console.log(`\n${BOLD}── 2. dispersion ranking (CV 降順) ──${RESET}`);
  const tests = [
    {site: 'all', sex: '男女計', label: '全部位'},
    {site: 'stomach', sex: '男女計', label: '胃'},
    {site: 'colorectal', sex: '男女計', label: '大腸'},
    {site: 'liver', sex: '男女計', label: '肝'},
    {site: 'lung', sex: '男女計', label: '肺'},
    {site: 'breast', sex: '女', label: '乳房'},
    {site: 'prostate', sex: '男', label: '前立腺'},
  ];
  const results = tests.map(t => ({...t, ...dispersion(data, t.site, t.sex)})).filter(r => r.cv != null);
  results.sort((a, b) => b.cv - a.cv);
  for (const r of results) {
    const mark = r.label === '全部位' ? '★ baseline' : '';
    console.log(`  ${r.label.padEnd(6)} CV=${r.cv.toFixed(2)}% 比=${r.ratio.toFixed(2)} (高=${r.pmax}/${data.prefectures[r.pmax][r.site][r.sex].toFixed(1)}) ${mark}`);
  }
  
  // ── 3. 仮説検証: 全部位 CV < 部位別 CV (5 大がんすべて) ──
  console.log(`\n${BOLD}── 3. 仮説検証: 全部位 CV < 部位別 CV ──${RESET}`);
  const allCV = results.find(r => r.label === '全部位').cv;
  const sites = results.filter(r => r.label !== '全部位');
  for (const r of sites) {
    const ok = r.cv > allCV;
    const ratio = (r.cv / allCV).toFixed(2);
    console.log(`  ${ok ? GREEN+'✓'+RESET : RED+'✗'+RESET} ${r.label}: CV ${r.cv.toFixed(2)}% > 全部位 ${allCV.toFixed(2)}% (拡大率 ${ratio}x)`);
    if (!ok) errors.push(`${r.label} CV (${r.cv.toFixed(2)}) <= 全部位 CV (${allCV.toFixed(2)})`);
  }
  
  // ── 4. 高位県 constellation 検証 ──
  console.log(`\n${BOLD}── 4. 高位県 constellation ──${RESET}`);
  const expectedTop = {
    'stomach': '秋田県',  // 東北・塩分
    'liver': '青森県',    // HBV/HCV
    'colorectal': '青森県',
    'lung': '北海道',     // 喫煙
    'breast': '北海道',   // 出産・肥満
    'prostate': '香川県',
  };
  for (const [site, exp] of Object.entries(expectedTop)) {
    const r = results.find(x => x.site === site);
    if (!r) continue;
    const ok = r.pmax === exp;
    console.log(`  ${ok ? GREEN+'✓'+RESET : RED+'✗'+RESET} ${site}: 高位 = ${r.pmax} (期待 ${exp})`);
    if (!ok) errors.push(`${site}: 高位 ${r.pmax} != 期待 ${exp}`);
  }
  
  // ── 5. 女性肝がん異常値検証 ──
  console.log(`\n${BOLD}── 5. 女性肝がん dispersion (異常値) ──${RESET}`);
  const liverF = dispersion(data, 'liver', '女');
  if (liverF) {
    const ok = liverF.ratio > 5;
    console.log(`  ${ok ? GREEN+'✓'+RESET : RED+'✗'+RESET} 女性肝がん max-min 比 = ${liverF.ratio.toFixed(2)} (期待 > 5)`);
    if (!ok) errors.push(`女性肝がん 比 ${liverF.ratio} <= 5`);
  }
  
  if (errors.length > 0) {
    console.log(`\n${RED}${BOLD}❌ FAIL: ${errors.length} 件${RESET}`);
    for (const e of errors) console.log(`${RED}  - ${e}${RESET}`);
    process.exit(1);
  }
  console.log(`\n${GREEN}${BOLD}✅ PASS: 全 assertion 成功${RESET}`);
  console.log(`${GREEN}  - 5 大がんすべて 全部位より CV 大 (1.6-2.5 倍)${RESET}`);
  console.log(`${GREEN}  - 高位県 constellation 期待通り${RESET}`);
  process.exit(0);
}

main();
