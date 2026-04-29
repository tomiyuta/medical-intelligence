#!/usr/bin/env node
/**
 * Phase 4-3e: Capability mapping audit QA test
 *
 * Phase 4-3e の核心発見を assertion で永続化:
 *   1. 5重点県の集中度 (1施設あたり患者数) が文書通り
 *   2. 宮崎県は集中度 ranking 1位 (異常値の構造的説明)
 *   3. 広島・山口は集中度 47/46 位 (最分散型)
 *   4. 岡山・秋田は中間 (positive/negative control)
 *
 * Done 条件 (reviewer 採択):
 *   [x] 5重点県の集中度を assertion
 *   [x] 47県の集中度 ranking 出力
 *   [x] capability_mapping.md keyword 6件と facility_taxonomy.json の一致確認
 *
 * 使用:
 *   node tests/capability_mapping_audit.test.js
 *   npm run test:capability-mapping
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

// 期待 keyword 一覧 (capability_mapping.md §5.1 + facility_taxonomy.json#homecare)
const EXPECTED_HOMECARE_KEYWORDS = ['在宅', '訪問診療', '訪問看護', '訪問リハ', '居宅', '往診'];

// 重点5県の集中度 (1施設あたり患者数) 期待値範囲
//   docs/PHASE4_3E_CAPABILITY_MAPPING_AUDIT.md §3.1 表より
const EXPECTED_CONCENTRATION = {
  '広島県':   { range: [15, 25],   rank_within: [45, 47] },  // 最分散型
  '山口県':   { range: [20, 30],   rank_within: [44, 47] },  // 分散型
  '岡山県':   { range: [30, 40],   rank_within: [30, 42] },  // 中間
  '秋田県':   { range: [45, 60],   rank_within: [15, 35] },  // 中間
  '宮崎県':   { range: [100, 130], rank_within: [1, 3] },    // 最集中型
};

function main() {
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}  Capability Mapping Audit Test (Phase 4-3e)${RESET}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);

  const errors = [];

  // ── 1. keyword definition の整合性 ──
  console.log(`\n${BOLD}── 1. keyword definition の整合性 (facility_taxonomy.json) ──${RESET}`);
  const taxPath = path.join(ROOT, 'data', 'static', 'facility_taxonomy.json');
  const tax = JSON.parse(fs.readFileSync(taxPath, 'utf-8'));
  const homecareKeywords = tax.taxonomy?.homecare || [];
  if (JSON.stringify(homecareKeywords.sort()) !== JSON.stringify([...EXPECTED_HOMECARE_KEYWORDS].sort())) {
    errors.push(`homecare keywords 不一致: actual=${JSON.stringify(homecareKeywords)} expected=${JSON.stringify(EXPECTED_HOMECARE_KEYWORDS)}`);
    console.log(`  ${RED}✗${RESET} keywords 不一致`);
  } else {
    console.log(`  ${GREEN}✓${RESET} 6 keywords 一致 (${homecareKeywords.join(' / ')})`);
  }

  // ── 2. 47県の集中度計算 ──
  console.log(`\n${BOLD}── 2. 47県の 1施設あたり患者数 (集中度) ──${RESET}`);
  const actualPath = path.join(ROOT, 'data', 'static', 'homecare_actual_by_pref.json');
  const actual = JSON.parse(fs.readFileSync(actualPath, 'utf-8'));
  const shardDir = path.join(ROOT, 'data', 'static', 'kijun_shards');

  const concentrations = [];
  for (const pref of PREFECTURES_47) {
    const shardPath = path.join(shardDir, `${pref}.json`);
    if (!fs.existsSync(shardPath)) continue;
    const shard = JSON.parse(fs.readFileSync(shardPath, 'utf-8'));
    const hcFacilities = shard.filter(f => (f?.cap?.homecare || 0) > 0).length;
    const patients = actual.by_prefecture?.[pref]?.actual_total?.homecare_patients || 0;
    if (hcFacilities > 0) {
      concentrations.push({ pref, ratio: patients / hcFacilities, n_facilities: hcFacilities, patients });
    }
  }
  concentrations.sort((a, b) => b.ratio - a.ratio);
  const concRank = {};
  concentrations.forEach((c, i) => { concRank[c.pref] = i + 1; });

  console.log(`  ${GREEN}✓${RESET} 47県集中度 ranking 計算完了`);

  // ── 3. 重点5県の集中度 assertion ──
  console.log(`\n${BOLD}── 3. 重点5県の集中度 assertion ──${RESET}`);
  for (const [pref, exp] of Object.entries(EXPECTED_CONCENTRATION)) {
    const c = concentrations.find(x => x.pref === pref);
    if (!c) {
      errors.push(`${pref}: 集中度データなし`);
      continue;
    }
    const r = concRank[pref];
    const inRange = c.ratio >= exp.range[0] && c.ratio <= exp.range[1];
    const inRank = r >= exp.rank_within[0] && r <= exp.rank_within[1];
    const status = (inRange && inRank) ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`  ${status} ${pref}: ratio=${c.ratio.toFixed(1)} rank=${r}/47 (期待 ratio∈[${exp.range[0]},${exp.range[1]}], rank∈[${exp.rank_within[0]},${exp.rank_within[1]}])`);
    if (!inRange) errors.push(`${pref}: 集中度 ${c.ratio.toFixed(1)} は期待範囲 [${exp.range.join('-')}] 外`);
    if (!inRank) errors.push(`${pref}: 集中度 rank ${r} は期待範囲 [${exp.rank_within.join('-')}] 外`);
  }

  // ── 4. 集中度 TOP/BOTTOM informational ──
  console.log(`\n${BOLD}── 4. 集中度 TOP 5 (集中型) ──${RESET}`);
  for (const c of concentrations.slice(0, 5)) {
    console.log(`  ${concRank[c.pref]}. ${c.pref}: ${c.ratio.toFixed(1)} patients/facility (${c.n_facilities}施設, ${c.patients}人)`);
  }
  console.log(`\n${BOLD}── 5. 集中度 BOTTOM 5 (分散型) ──${RESET}`);
  for (const c of concentrations.slice(-5)) {
    console.log(`  ${concRank[c.pref]}. ${c.pref}: ${c.ratio.toFixed(1)} patients/facility (${c.n_facilities}施設, ${c.patients}人)`);
  }

  // ── snapshot 出力 ──
  const snapshotDir = path.join(__dirname, 'snapshots');
  if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
  const snapshotFile = path.join(snapshotDir, 'capability_mapping_audit.json');
  const snapshotPayload = {
    _generated: new Date().toISOString(),
    _phase: 'Phase 4-3e',
    _description: 'capability mapping audit: 集中度 (1施設あたり患者数) と 47県 ranking',
    _conclusion: 'capability proxy (施設数ベース) は規模・集中度を吸収できない。caveat 強化で運用、proxy 修正は行わない。',
    homecare_keywords: EXPECTED_HOMECARE_KEYWORDS,
    concentration_47pref: concentrations.map((c, i) => ({ rank: i + 1, ...c, ratio: +c.ratio.toFixed(2) })),
    focus_5: Object.fromEntries(Object.keys(EXPECTED_CONCENTRATION).map(p => {
      const c = concentrations.find(x => x.pref === p);
      return [p, c ? { rank: concRank[p], ratio: +c.ratio.toFixed(2), n_facilities: c.n_facilities, patients: c.patients } : null];
    })),
  };
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshotPayload, null, 2), 'utf-8');
  console.log(`\n${BLUE}snapshot 保存: ${path.relative(ROOT, snapshotFile)}${RESET}`);

  // ── 結果 ──
  if (errors.length > 0) {
    console.log(`\n${RED}${BOLD}❌ FAIL: ${errors.length} assertion(s) failed${RESET}`);
    for (const e of errors) console.log(`${RED}  - ${e}${RESET}`);
    process.exit(1);
  }

  console.log(`\n${GREEN}${BOLD}✅ PASS: Capability mapping audit 全 assertion 成功${RESET}`);
  console.log(`${GREEN}  - homecare keywords 6件が facility_taxonomy.json と一致${RESET}`);
  console.log(`${GREEN}  - 重点5県の集中度・rank すべて期待範囲内${RESET}`);
  console.log(`${GREEN}  - 重要発見: 宮崎(rank1, 119/施設) vs 広島(rank47, 18/施設) 構造的差異${RESET}`);
  process.exit(0);
}

main();
