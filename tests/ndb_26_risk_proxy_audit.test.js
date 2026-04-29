#!/usr/bin/env node
/**
 * Phase 4-3a: NDB 26 risk proxy audit QA test
 *
 * docs/PHASE4_3A_NDB_26_RISK_PROXY_AUDIT.md の核心発見を assertion で永続化。
 *
 * Done 条件 (reviewer 採択):
 *   [x] 既存 19 項目 (検査値5 + 質問票14) の存在を assertion
 *   [x] 沖縄 P1 強化候補 (BMI rank1, weight_gain rank1, heart_disease rank2 等) を検証
 *   [x] 東京 P6 強化候補 (SBP rank47, hypertension_med rank47 等) を検証
 *   [x] 山口 P3 / 秋田 P5 補助 evidence 候補を検証
 *
 * 使用:
 *   node tests/ndb_26_risk_proxy_audit.test.js
 *   npm run test:ndb-26-audit
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';

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

const EXPECTED_CHECKUP = ['bmi_ge_25', 'hba1c_ge_6_5', 'sbp_ge_140', 'ldl_ge_140', 'urine_protein_ge_1plus'];
const EXPECTED_QUESTIONNAIRE = [
  'smoking', 'weight_gain', 'exercise', 'walking', 'late_dinner',
  'drinking_daily', 'heavy_drinker', 'sleep_ok', 'hypertension_med',
  'heart_disease', 'ckd_history', 'diabetes_medication', 'lipid_medication', 'stroke_history',
];

// rank 期待値 (descending = リスク高位を rank 1 とする)
//   docs §3 表より、key strengthening evidence のみ assertion
const EXPECTED_RANKS_DESC = {
  '沖縄県': {
    'bmi_ge_25': [1, 1],
    'weight_gain': [1, 1],
    'heart_disease': [1, 3],
    'stroke_history': [1, 6],
    'heavy_drinker': [1, 3],
  },
  '東京都': {
    'sbp_ge_140': [44, 47],
    'hba1c_ge_6_5': [44, 47],
    'hypertension_med': [44, 47],
    'diabetes_medication': [44, 47],
    'lipid_medication': [44, 47],
  },
  '山口県': {
    'ldl_ge_140': [1, 3],
    'stroke_history': [1, 5],
  },
  '秋田県': {
    'hypertension_med': [1, 5],
    'lipid_medication': [1, 3],
    'drinking_daily': [1, 3],
  },
};

function rankOfRate(byPref, target) {
  const items = PREFECTURES_47
    .map(p => ({ p, v: byPref[p]?.rate }))
    .filter(x => x.v != null)
    .sort((a, b) => b.v - a.v);
  for (let i = 0; i < items.length; i++) {
    if (items[i].p === target) return i + 1;
  }
  return null;
}

function rankOfQ(prefs, qkey, target) {
  const items = PREFECTURES_47
    .map(p => ({ p, v: prefs[p]?.[qkey] }))
    .filter(x => x.v != null)
    .sort((a, b) => b.v - a.v);
  for (let i = 0; i < items.length; i++) {
    if (items[i].p === target) return i + 1;
  }
  return null;
}

function main() {
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}  NDB 26 Risk Proxy Audit Test (Phase 4-3a)${RESET}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);

  const errors = [];

  // ── 1. 既存 19 項目の存在 ──
  console.log(`\n${BOLD}── 1. 既存 19 項目の存在 ──${RESET}`);
  const checkup = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'static', 'ndb_checkup_risk_rates.json'), 'utf-8'));
  const quest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'static', 'ndb_questionnaire.json'), 'utf-8'));

  const checkupKeys = Object.keys(checkup.risk_rates || {});
  const questKeys = Object.keys(quest.questions || {});

  for (const k of EXPECTED_CHECKUP) {
    if (!checkupKeys.includes(k)) errors.push(`検査値 ${k} 不在`);
  }
  for (const k of EXPECTED_QUESTIONNAIRE) {
    if (!questKeys.includes(k)) errors.push(`質問票 ${k} 不在`);
  }

  if (errors.length === 0) {
    console.log(`  ${GREEN}✓${RESET} 検査値 ${EXPECTED_CHECKUP.length} 項目 + 質問票 ${EXPECTED_QUESTIONNAIRE.length} 項目 = 19 項目存在`);
  }

  // ── 2. 焦点県の rank 検証 ──
  console.log(`\n${BOLD}── 2. 4 焦点県の rank 検証 (Strengthening evidence) ──${RESET}`);
  for (const [pref, items] of Object.entries(EXPECTED_RANKS_DESC)) {
    console.log(`  ${BOLD}[${pref}]${RESET}`);
    for (const [key, range] of Object.entries(items)) {
      let r;
      if (EXPECTED_CHECKUP.includes(key)) {
        r = rankOfRate(checkup.risk_rates[key].by_pref, pref);
      } else if (EXPECTED_QUESTIONNAIRE.includes(key)) {
        r = rankOfQ(quest.prefectures, key, pref);
      } else {
        errors.push(`${pref} ${key}: 不明な metric`);
        continue;
      }
      const ok = r >= range[0] && r <= range[1];
      const status = ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
      console.log(`    ${status} ${key}: rank=${r} (期待 [${range[0]}-${range[1]}])`);
      if (!ok) errors.push(`${pref} ${key}: rank=${r} は期待範囲 [${range[0]}-${range[1]}] 外`);
    }
  }

  // ── 3. 沖縄 P1 / 東京 P6 の evidence 拡張シミュレーション ──
  console.log(`\n${BOLD}── 3. 沖縄 P1 / 東京 P6 evidence 拡張シミュレーション ──${RESET}`);

  // 沖縄: BMI rank 1 (極端) + 体重増加歴 rank 1 (極端) + 心疾患歴 rank 2 = 強化候補
  const okinawaStrong = [
    { key: 'bmi_ge_25', source: 'checkup', rank: rankOfRate(checkup.risk_rates['bmi_ge_25'].by_pref, '沖縄県') },
    { key: 'weight_gain', source: 'q', rank: rankOfQ(quest.prefectures, 'weight_gain', '沖縄県') },
    { key: 'heart_disease', source: 'q', rank: rankOfQ(quest.prefectures, 'heart_disease', '沖縄県') },
    { key: 'stroke_history', source: 'q', rank: rankOfQ(quest.prefectures, 'stroke_history', '沖縄県') },
    { key: 'heavy_drinker', source: 'q', rank: rankOfQ(quest.prefectures, 'heavy_drinker', '沖縄県') },
  ];
  const okinawaStrongCount = okinawaStrong.filter(x => x.rank <= 5).length;
  console.log(`  沖縄県 P1 evidence 候補: 5 軸中 rank ≤ 5 = ${okinawaStrongCount}項目`);
  for (const e of okinawaStrong) console.log(`    - ${e.key}: rank ${e.rank}/47`);
  if (okinawaStrongCount < 4) errors.push(`沖縄 P1 強化候補 ${okinawaStrongCount}/5 < 4 (期待外)`);
  else console.log(`  ${GREEN}✓${RESET} 沖縄 P1 = 4 evidence → ${4 + okinawaStrongCount - 1} に拡張可能`);

  // 東京: hba1c rank 47 + SBP rank 47 + hypertension_med rank 47 = low-risk context 維持
  const tokyoLow = [
    { key: 'sbp_ge_140', source: 'checkup', rank: rankOfRate(checkup.risk_rates['sbp_ge_140'].by_pref, '東京都') },
    { key: 'hba1c_ge_6_5', source: 'checkup', rank: rankOfRate(checkup.risk_rates['hba1c_ge_6_5'].by_pref, '東京都') },
    { key: 'hypertension_med', source: 'q', rank: rankOfQ(quest.prefectures, 'hypertension_med', '東京都') },
    { key: 'diabetes_medication', source: 'q', rank: rankOfQ(quest.prefectures, 'diabetes_medication', '東京都') },
    { key: 'lipid_medication', source: 'q', rank: rankOfQ(quest.prefectures, 'lipid_medication', '東京都') },
  ];
  const tokyoLowCount = tokyoLow.filter(x => x.rank >= 43).length;
  console.log(`\n  東京都 P6 evidence 候補: 5 軸中 rank ≥ 43 = ${tokyoLowCount}項目`);
  for (const e of tokyoLow) console.log(`    - ${e.key}: rank ${e.rank}/47`);
  if (tokyoLowCount < 4) errors.push(`東京 P6 維持候補 ${tokyoLowCount}/5 < 4 (期待外)`);
  else console.log(`  ${GREEN}✓${RESET} 東京 P6 = 3 evidence → ${3 + tokyoLowCount - 1} に拡張可能`);

  // ── snapshot 出力 ──
  const snapshotDir = path.join(__dirname, 'snapshots');
  if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
  const snapshotFile = path.join(snapshotDir, 'ndb_26_risk_proxy_audit.json');
  const snapshotPayload = {
    _generated: new Date().toISOString(),
    _phase: 'Phase 4-3a',
    _description: 'NDB 26 risk proxy audit: 既存 19 項目の活用余地評価',
    _conclusion: '既存 19 項目で沖縄 P1 / 東京 P6 の evidence 拡張可能。本フェーズは docs-only。',
    inventory: {
      checkup: { count: EXPECTED_CHECKUP.length, keys: EXPECTED_CHECKUP },
      questionnaire: { count: EXPECTED_QUESTIONNAIRE.length, keys: EXPECTED_QUESTIONNAIRE },
      total_existing: 19,
    },
    focus_pref_strengthening: {
      '沖縄県_P1': okinawaStrong,
      '東京都_P6': tokyoLow,
    },
  };
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshotPayload, null, 2), 'utf-8');
  console.log(`\n${BLUE}snapshot 保存: ${path.relative(ROOT, snapshotFile)}${RESET}`);

  // ── 結果 ──
  if (errors.length > 0) {
    console.log(`\n${RED}${BOLD}❌ FAIL: ${errors.length} assertion(s) failed${RESET}`);
    for (const e of errors) console.log(`${RED}  - ${e}${RESET}`);
    process.exit(1);
  }

  console.log(`\n${GREEN}${BOLD}✅ PASS: NDB 26 risk proxy audit 全 assertion 成功${RESET}`);
  console.log(`${GREEN}  - 既存 19 項目 (検査値5 + 質問票14) すべて存在${RESET}`);
  console.log(`${GREEN}  - 沖縄県 P1 強化候補 5/5 すべて期待 rank 範囲内${RESET}`);
  console.log(`${GREEN}  - 東京都 P6 維持候補 5/5 すべて期待 rank 範囲内${RESET}`);
  console.log(`${GREEN}  - 山口/秋田 補助 evidence 候補も期待通り${RESET}`);
  process.exit(0);
}

main();
