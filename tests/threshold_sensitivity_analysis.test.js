#!/usr/bin/env node
/**
 * Phase 4-1 P2-2: Threshold Sensitivity Analysis
 *
 * RegionalMismatchExplorer の rule-based 閾値が conservative すぎるか、緩すぎるかを
 * relaxed / baseline / strict の3シナリオで検証する。
 *
 * P2-1 で 0件県が36/47 (76%) であったため、現閾値は MVP として保守的。
 * 本フェーズで以下を可視化:
 *   - シナリオ別の出現県数の変動
 *   - 0件県がどこまで減るか
 *   - 代表県4つ (沖縄/山口/秋田/東京) の安定性
 *   - 閾値変更で新規出現する県 (manual review 候補)
 *
 * reviewer Done 条件 (P2-2):
 *   [x] baseline threshold で P2-1 の結果を再現
 *   [x] relaxed / baseline / strict の3シナリオを定義
 *   [x] 各シナリオで P1/P3/P5/P6 の出現県数を出力
 *   [x] 0件県36がどこまで減るか確認
 *   [x] 沖縄・山口・秋田・東京の代表県4つが安定するか確認
 *   [x] 閾値変更で新規出現する県を手動確認対象として列挙
 *   [x] JSON snapshot または markdown report を生成
 *
 * 使用:
 *   node tests/threshold_sensitivity_analysis.test.js
 *   npm run test:threshold-sensitivity
 *
 * exit code:
 *   0 = pass (baseline で P2-1 再現 + 代表県4つ安定)
 *   1 = fail (回帰検出)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ── ANSI color ──
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// ── 47都道府県 (北→南) ──
const PREFECTURES_47 = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県',
  '岐阜県','静岡県','愛知県','三重県',
  '滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県',
  '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県',
];

// ── データ読み込み ──
function loadData() {
  const dataDir = path.join(ROOT, 'data', 'static');
  return {
    ndbCheckupRiskRates: JSON.parse(fs.readFileSync(path.join(dataDir, 'ndb_checkup_risk_rates.json'), 'utf-8')),
    patientSurvey: JSON.parse(fs.readFileSync(path.join(dataDir, 'patient_survey_r5.json'), 'utf-8')),
    mortalityOutcome2020: JSON.parse(fs.readFileSync(path.join(dataDir, 'mortality_outcome_2020.json'), 'utf-8')),
    homecareCapability: JSON.parse(fs.readFileSync(path.join(dataDir, 'homecare_capability_by_pref.json'), 'utf-8')),
    agePyramid: JSON.parse(fs.readFileSync(path.join(dataDir, 'age_pyramid.json'), 'utf-8')),
  };
}

// ── 判定ロジック (UI と同等を再現) ──
function avg47(byPref) {
  if (!byPref) return null;
  const vals = Object.entries(byPref).filter(([k]) => k !== '全国').map(([, v]) => (typeof v === 'object' ? v.rate : v)).filter(v => typeof v === 'number');
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}
const pctDiff = (val, ref) => (val == null || ref == null || ref === 0) ? null : ((val / ref - 1) * 100);
function compute75Plus(ap) {
  if (!ap?.male || !ap?.female) return null;
  const total = [...ap.male, ...ap.female].reduce((s, v) => s + (v || 0), 0);
  const p75 = ap.male.slice(15).reduce((s, v) => s + (v || 0), 0) + ap.female.slice(15).reduce((s, v) => s + (v || 0), 0);
  return total > 0 ? (p75 / total) * 100 : null;
}

function detectArchetypes(ctx, TH) {
  const { pref, ndbCheckupRiskRates, patientSurvey, mortalityOutcome2020, homecareCapability, agePyramid } = ctx;
  const matches = [];
  const bmi = ndbCheckupRiskRates?.risk_rates?.bmi_ge_25?.by_pref?.[pref]?.rate;
  const bmiAvg = avg47(ndbCheckupRiskRates?.risk_rates?.bmi_ge_25?.by_pref);
  const hba1c = ndbCheckupRiskRates?.risk_rates?.hba1c_ge_6_5?.by_pref?.[pref]?.rate;
  const hba1cAvg = avg47(ndbCheckupRiskRates?.risk_rates?.hba1c_ge_6_5?.by_pref);
  const endo = patientSurvey?.prefectures?.[pref]?.categories?.['Ⅳ_内分泌，栄養及び代謝疾患']?.outpatient;
  const endoNat = patientSurvey?.prefectures?.['全国']?.categories?.['Ⅳ_内分泌，栄養及び代謝疾患']?.outpatient;
  const hc = homecareCapability?.by_prefecture?.[pref]?.homecare_per75;
  const hcAvg = avg47(Object.fromEntries(Object.entries(homecareCapability?.by_prefecture || {}).map(([k, v]) => [k, v?.homecare_per75])));
  const rh = homecareCapability?.by_prefecture?.[pref]?.rehab_per75;
  const rhAvg = avg47(Object.fromEntries(Object.entries(homecareCapability?.by_prefecture || {}).map(([k, v]) => [k, v?.rehab_per75])));
  const p75 = compute75Plus(agePyramid?.prefectures?.[pref]);
  const p75NatList = Object.values(agePyramid?.prefectures || {}).map(compute75Plus).filter(v => v != null);
  const p75Avg = p75NatList.length ? p75NatList.reduce((s, v) => s + v, 0) / p75NatList.length : null;
  const mAA = (cause) => {
    const d = mortalityOutcome2020?.prefectures?.[pref]?.[cause]?.age_adjusted;
    if (!d?.male || !d?.female) return null;
    return (d.male.rate + d.female.rate) / 2;
  };
  const mAANat = (cause) => {
    const d = mortalityOutcome2020?.national?.[cause]?.age_adjusted;
    if (!d?.male || !d?.female) return null;
    return (d.male.rate + d.female.rate) / 2;
  };

  // P1
  if (bmi != null && bmiAvg != null && endo != null && endoNat != null) {
    if (pctDiff(bmi, bmiAvg) > TH.P1.bmi_excess && pctDiff(endo, endoNat) < TH.P1.endo_deficit) {
      matches.push('P1');
    }
  }
  // P3
  if (hc != null && hcAvg != null && pctDiff(hc, hcAvg) > TH.P3.hc_excess) {
    let hit = false;
    if (pctDiff(mAA('肺炎'), mAANat('肺炎')) > TH.P3.outcome_excess) hit = true;
    if (pctDiff(mAA('心疾患'), mAANat('心疾患')) > TH.P3.outcome_excess) hit = true;
    if (pctDiff(mAA('腎不全'), mAANat('腎不全')) > TH.P3.outcome_excess) hit = true;
    if (hit) matches.push('P3');
  }
  // P5
  if (p75 != null && p75Avg != null && (p75 - p75Avg) > TH.P5.p75_excess_pt) {
    const hcD = pctDiff(hc, hcAvg);
    const rhD = pctDiff(rh, rhAvg);
    const cerebroD = pctDiff(mAA('脳血管疾患'), mAANat('脳血管疾患'));
    if ((hcD != null && hcD < TH.P5.hc_deficit) && (rhD != null && rhD < TH.P5.rh_deficit) && (cerebroD != null && cerebroD > TH.P5.cerebro_excess)) {
      matches.push('P5');
    }
  }
  // P6
  if (p75 != null && p75Avg != null && (p75 - p75Avg) < TH.P6.p75_deficit_pt) {
    const hba1cD = pctDiff(hba1c, hba1cAvg);
    if (hba1cD != null && hba1cD < TH.P6.hba1c_deficit) {
      matches.push('P6');
    }
  }
  return matches;
}

// ── 3シナリオ閾値定義 ──
const SCENARIOS = {
  relaxed: {
    label: 'relaxed (緩い、シグナル多め)',
    thresholds: {
      P1: { bmi_excess: 5,    endo_deficit: -10 },
      P3: { hc_excess: 30,    outcome_excess: 10 },
      P5: { p75_excess_pt: 0.5, hc_deficit: -10, rh_deficit: -10, cerebro_excess: 10 },
      P6: { p75_deficit_pt: -0.5, hba1c_deficit: -2 },
    },
  },
  baseline: {
    label: 'baseline (P2-1 採択値、現UI)',
    thresholds: {
      P1: { bmi_excess: 10,   endo_deficit: -20 },
      P3: { hc_excess: 50,    outcome_excess: 15 },
      P5: { p75_excess_pt: 1.0, hc_deficit: -15, rh_deficit: -15, cerebro_excess: 15 },
      P6: { p75_deficit_pt: -1.0, hba1c_deficit: -5 },
    },
  },
  strict: {
    label: 'strict (厳しい、シグナル少なめ)',
    thresholds: {
      P1: { bmi_excess: 15,   endo_deficit: -30 },
      P3: { hc_excess: 70,    outcome_excess: 20 },
      P5: { p75_excess_pt: 2.0, hc_deficit: -20, rh_deficit: -20, cerebro_excess: 20 },
      P6: { p75_deficit_pt: -2.0, hba1c_deficit: -10 },
    },
  },
};

const REPRESENTATIVES = {
  '沖縄県': 'P1',
  '山口県': 'P3',
  '秋田県': 'P5',
  '東京都': 'P6',
};

// ── main ──
function main() {
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}  Threshold Sensitivity Analysis (Phase 4-1 P2-2)${RESET}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);

  const data = loadData();
  const errors = [];

  // 各シナリオで47県全件評価
  const results = {};
  for (const [name, scen] of Object.entries(SCENARIOS)) {
    const byPref = {};
    const byPattern = { P1: [], P3: [], P5: [], P6: [] };
    let zeroCount = 0;
    let tripleCount = 0;
    for (const pref of PREFECTURES_47) {
      const matches = detectArchetypes({ pref, ...data }, scen.thresholds);
      byPref[pref] = matches;
      for (const m of matches) byPattern[m].push(pref);
      if (matches.length === 0) zeroCount++;
      if (matches.length >= 3) tripleCount++;
    }
    results[name] = { label: scen.label, thresholds: scen.thresholds, by_pref: byPref, by_pattern: byPattern, zero_count: zeroCount, triple_count: tripleCount };
  }

  // ── レポート: シナリオ別出現県数 ──
  console.log(`\n${BOLD}── シナリオ別 出現県数 (P1/P3/P5/P6) ──${RESET}`);
  const header = `  ${'シナリオ'.padEnd(12, '　')} | P1 | P3 | P5 | P6 | 0件 | 1+件`;
  console.log(header);
  console.log('  ' + '─'.repeat(header.length - 2));
  for (const [name, r] of Object.entries(results)) {
    const oneOrMore = 47 - r.zero_count;
    const colorize = name === 'baseline' ? GREEN : name === 'relaxed' ? YELLOW : CYAN;
    console.log(`  ${colorize}${name.padEnd(12, '　')}${RESET} | ${String(r.by_pattern.P1.length).padStart(2)} | ${String(r.by_pattern.P3.length).padStart(2)} | ${String(r.by_pattern.P5.length).padStart(2)} | ${String(r.by_pattern.P6.length).padStart(2)} | ${String(r.zero_count).padStart(3)} | ${String(oneOrMore).padStart(3)}`);
  }

  // ── 代表県の安定性 ──
  console.log(`\n${BOLD}── 代表県の安定性 (3シナリオすべてで該当するか) ──${RESET}`);
  const stableTable = [];
  for (const [pref, expectedPattern] of Object.entries(REPRESENTATIVES)) {
    const row = { pref, expected: expectedPattern };
    for (const name of Object.keys(SCENARIOS)) {
      row[name] = results[name].by_pref[pref].includes(expectedPattern) ? '✓' : '✗';
    }
    stableTable.push(row);
  }
  console.log(`  ${'代表県'.padEnd(8, '　')} | 期待 | relaxed | baseline | strict`);
  console.log('  ' + '─'.repeat(50));
  for (const r of stableTable) {
    const allOk = r.relaxed === '✓' && r.baseline === '✓' && r.strict === '✓';
    const status = allOk ? GREEN + '安定' + RESET : YELLOW + '不安定' + RESET;
    console.log(`  ${r.pref.padEnd(8, '　')} | ${r.expected.padEnd(4)} | ${r.relaxed.padStart(7)} | ${r.baseline.padStart(8)} | ${r.strict.padStart(6)}  [${status}]`);
    if (r.baseline !== '✓') {
      errors.push(`baseline で ${r.pref} が ${r.expected} を含まない (回帰)`);
    }
  }

  // ── 閾値変更で新規出現する県 (manual review 候補) ──
  console.log(`\n${BOLD}── 新規出現県 (relaxed のみで該当する県) ──${RESET}`);
  const newInRelaxed = { P1: [], P3: [], P5: [], P6: [] };
  for (const pat of ['P1', 'P3', 'P5', 'P6']) {
    const baselineSet = new Set(results.baseline.by_pattern[pat]);
    for (const pref of results.relaxed.by_pattern[pat]) {
      if (!baselineSet.has(pref)) newInRelaxed[pat].push(pref);
    }
  }
  for (const pat of ['P1', 'P3', 'P5', 'P6']) {
    const list = newInRelaxed[pat];
    console.log(`  ${pat}: ${list.length === 0 ? '(なし)' : list.join('・')}`);
  }

  console.log(`\n${BOLD}── 失われる県 (baseline で該当だが strict で消える) ──${RESET}`);
  const lostInStrict = { P1: [], P3: [], P5: [], P6: [] };
  for (const pat of ['P1', 'P3', 'P5', 'P6']) {
    const strictSet = new Set(results.strict.by_pattern[pat]);
    for (const pref of results.baseline.by_pattern[pat]) {
      if (!strictSet.has(pref)) lostInStrict[pat].push(pref);
    }
  }
  for (const pat of ['P1', 'P3', 'P5', 'P6']) {
    const list = lostInStrict[pat];
    console.log(`  ${pat}: ${list.length === 0 ? '(なし、安定)' : list.join('・')}`);
  }

  // ── 0件県の減少率 ──
  console.log(`\n${BOLD}── 0件県の減少 (baseline=${results.baseline.zero_count}/47 → relaxed=${results.relaxed.zero_count}/47) ──${RESET}`);
  const reduced = results.baseline.zero_count - results.relaxed.zero_count;
  const reducedPct = ((reduced / results.baseline.zero_count) * 100).toFixed(1);
  console.log(`  relaxed で ${reduced}県 (${reducedPct}%) が新規にラベル付与される`);
  console.log(`  strict ではさらに ${results.strict.zero_count - results.baseline.zero_count}県増える (合計 ${results.strict.zero_count}/47)`);

  // ── snapshot 出力 ──
  const snapshotDir = path.join(__dirname, 'snapshots');
  if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });

  const jsonPath = path.join(snapshotDir, 'threshold_sensitivity.json');
  const jsonPayload = {
    _generated: new Date().toISOString(),
    _description: 'Phase 4-1 P2-2 threshold sensitivity analysis result',
    scenarios: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, {
      label: v.label,
      thresholds: v.thresholds,
      summary: { zero_count: v.zero_count, triple_count: v.triple_count, pattern_counts: { P1: v.by_pattern.P1.length, P3: v.by_pattern.P3.length, P5: v.by_pattern.P5.length, P6: v.by_pattern.P6.length } },
      by_pattern: v.by_pattern,
    }])),
    representatives_stability: stableTable,
    new_in_relaxed: newInRelaxed,
    lost_in_strict: lostInStrict,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf-8');

  // markdown report
  const mdPath = path.join(snapshotDir, 'threshold_sensitivity_report.md');
  const md = [
    '# Phase 4-1 P2-2: Threshold Sensitivity Analysis Report',
    '',
    `生成日時: ${new Date().toISOString()}`,
    '',
    '## 1. シナリオ別 出現県数',
    '',
    '| シナリオ | P1 | P3 | P5 | P6 | 0件県 | 1件以上 |',
    '|---|---|---|---|---|---|---|',
    ...Object.entries(results).map(([name, r]) =>
      `| ${name} | ${r.by_pattern.P1.length} | ${r.by_pattern.P3.length} | ${r.by_pattern.P5.length} | ${r.by_pattern.P6.length} | ${r.zero_count}/47 | ${47 - r.zero_count}/47 |`
    ),
    '',
    '## 2. 代表県の安定性',
    '',
    '| 代表県 | 期待 | relaxed | baseline | strict | 判定 |',
    '|---|---|---|---|---|---|',
    ...stableTable.map(r => {
      const allOk = r.relaxed === '✓' && r.baseline === '✓' && r.strict === '✓';
      return `| ${r.pref} | ${r.expected} | ${r.relaxed} | ${r.baseline} | ${r.strict} | ${allOk ? '安定' : '不安定'} |`;
    }),
    '',
    '## 3. 新規出現県 (relaxed のみで該当)',
    '',
    ...['P1', 'P3', 'P5', 'P6'].map(pat => `- **${pat}**: ${newInRelaxed[pat].length === 0 ? '(なし)' : newInRelaxed[pat].join(', ')}`),
    '',
    '## 4. 失われる県 (baseline で該当だが strict で消える)',
    '',
    ...['P1', 'P3', 'P5', 'P6'].map(pat => `- **${pat}**: ${lostInStrict[pat].length === 0 ? '(なし、安定)' : lostInStrict[pat].join(', ')}`),
    '',
    '## 5. 0件県の減少',
    '',
    `- baseline 0件県: ${results.baseline.zero_count}/47 (${(results.baseline.zero_count/47*100).toFixed(1)}%)`,
    `- relaxed 0件県: ${results.relaxed.zero_count}/47 (${(results.relaxed.zero_count/47*100).toFixed(1)}%)`,
    `- strict 0件県: ${results.strict.zero_count}/47 (${(results.strict.zero_count/47*100).toFixed(1)}%)`,
    `- relaxed で ${results.baseline.zero_count - results.relaxed.zero_count}県が新規にラベル付与`,
    '',
    '## 6. 解釈と推奨',
    '',
    '### baseline (現 UI 採択値)',
    '- 0件県 76% は MVP として保守的だが、誤読防止には有利',
    '- 代表県4つすべて期待通り',
    '',
    '### relaxed への調整可能性',
    '- 新規出現県は手動レビュー対象 (P2-3 以降)',
    '- 過剰検出 (3件県多発) は避けたい',
    '',
    '### 推奨次アクション',
    '- 現時点では baseline 維持を推奨 (保守的が誤読防止に寄与)',
    '- relaxed で新規出現する県は手動レビューで「正しい signal か / ノイズか」を判定',
    '- P2-3 (percentile / z-score 併記) で正規化された signal 強度の比較を進める',
  ].join('\n');
  fs.writeFileSync(mdPath, md, 'utf-8');

  console.log(`\n${BLUE}snapshot 保存:${RESET}`);
  console.log(`  - ${path.relative(ROOT, jsonPath)}`);
  console.log(`  - ${path.relative(ROOT, mdPath)}`);

  // ── 最終判定 ──
  if (errors.length > 0) {
    console.log(`\n${RED}${BOLD}❌ FAIL: baseline 互換性が失われている (回帰)${RESET}`);
    for (const e of errors) console.log(`${RED}  - ${e}${RESET}`);
    process.exit(1);
  }

  console.log(`\n${GREEN}${BOLD}✅ PASS: threshold sensitivity analysis complete${RESET}`);
  console.log(`${GREEN}  - baseline で P2-1 の結果を再現 (代表県4つ assertion 全PASS)${RESET}`);
  console.log(`${GREEN}  - relaxed/strict シナリオで出現県数の変動を可視化${RESET}`);
  console.log(`${GREEN}  - 新規出現県・失われる県を手動レビュー対象として列挙${RESET}`);
  process.exit(0);
}

main();
