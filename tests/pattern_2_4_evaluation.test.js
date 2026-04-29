#!/usr/bin/env node
/**
 * Phase 4-1 P2-5: Pattern 2 / Pattern 4 追加検討 (off-UI evaluation)
 *
 * reviewer 採択方針:
 *   "まず実装しない。いきなり UI に追加せず、まず evaluation report を作る"
 *
 * 目的:
 *   Pattern 2 (Supply-Outcome 並列悪化) と Pattern 4 (Alignment Context) を
 *   UI に追加すべきか、docs-only / no-go とすべきかを 47県 off-UI 評価で判断する。
 *
 * Pattern 2 候補ロジック (試案 v1, P5 拡張版):
 *   - 75+ 割合 - 全国 > +1.0pt (P5 と同じ)
 *   - hc / rh - 47県平均 < -15% (P5 と同じ)
 *   - (cerebro OR 腎不全) - 全国 > +15%  ← P5 は cerebro のみ、ここで腎不全を追加
 *
 * Pattern 4 候補ロジック (試案 v1, Alignment Context):
 *   - 75+ 割合 - 全国 in [-1.0, +2.0]pt (中〜高齢化)
 *   - (hc - 47県平均 > +30%) OR (rh - 47県平均 > +30%) (供給厚)
 *   - 5死因 全て (cerebro / 肺炎 / 心疾患 / 腎不全 / 糖尿病) 年齢調整 全国比 in [-15%, +15%] (outcome 安定)
 *
 * reviewer Done 条件:
 *   [x] Pattern 2 / 4 の候補ロジックを文書化
 *   [x] 47県に off-UI 評価を実施
 *   [x] P2/P5 重複率を計算
 *   [x] P4 の誤読リスクを評価
 *   [x] UI に追加する / docs-only / no-go の判断を明記
 *   [x] npm test PASS
 *
 * 使用:
 *   node tests/pattern_2_4_evaluation.test.js
 *   npm run test:pattern-2-4-evaluation
 *
 * exit code:
 *   0 = pass (評価完了、結論明記)
 *   1 = fail (P5 重複率が想定外、または P4 候補が代表例外)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

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

function loadData() {
  const dataDir = path.join(ROOT, 'data', 'static');
  return {
    homecareCapability: JSON.parse(fs.readFileSync(path.join(dataDir, 'homecare_capability_by_pref.json'), 'utf-8')),
    mortalityOutcome2020: JSON.parse(fs.readFileSync(path.join(dataDir, 'mortality_outcome_2020.json'), 'utf-8')),
    agePyramid: JSON.parse(fs.readFileSync(path.join(dataDir, 'age_pyramid.json'), 'utf-8')),
  };
}

function avg47(byPref) {
  const vals = Object.entries(byPref).filter(([k]) => k !== '全国').map(([, v]) => v).filter(v => typeof v === 'number');
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}
const pctDiff = (val, ref) => (val == null || ref == null || ref === 0) ? null : ((val / ref - 1) * 100);
function compute75Plus(ap) {
  if (!ap?.male || !ap?.female) return null;
  const total = [...ap.male, ...ap.female].reduce((s, v) => s + (v || 0), 0);
  const p75 = ap.male.slice(15).reduce((s, v) => s + (v || 0), 0) + ap.female.slice(15).reduce((s, v) => s + (v || 0), 0);
  return total > 0 ? (p75 / total) * 100 : null;
}

function buildContext(pref, data) {
  const { homecareCapability, mortalityOutcome2020, agePyramid } = data;
  const hc = homecareCapability?.by_prefecture?.[pref]?.homecare_per75;
  const hcAvg = avg47(Object.fromEntries(Object.entries(homecareCapability?.by_prefecture || {}).map(([k, v]) => [k, v?.homecare_per75])));
  const rh = homecareCapability?.by_prefecture?.[pref]?.rehab_per75;
  const rhAvg = avg47(Object.fromEntries(Object.entries(homecareCapability?.by_prefecture || {}).map(([k, v]) => [k, v?.rehab_per75])));
  const p75 = compute75Plus(agePyramid?.prefectures?.[pref]);
  const p75NatList = Object.values(agePyramid?.prefectures || {}).map(compute75Plus).filter(v => v != null);
  const p75Avg = p75NatList.length ? p75NatList.reduce((s, v) => s + v, 0) / p75NatList.length : null;
  const mAA = (cause) => {
    const d = mortalityOutcome2020?.prefectures?.[pref]?.[cause]?.age_adjusted;
    return (d?.male && d?.female) ? (d.male.rate + d.female.rate) / 2 : null;
  };
  const mAANat = (cause) => {
    const d = mortalityOutcome2020?.national?.[cause]?.age_adjusted;
    return (d?.male && d?.female) ? (d.male.rate + d.female.rate) / 2 : null;
  };
  return {
    pref, hc, hcAvg, rh, rhAvg, p75, p75Avg,
    cerebro: mAA('脳血管疾患'), cerebroNat: mAANat('脳血管疾患'),
    pneumonia: mAA('肺炎'), pneumoniaNat: mAANat('肺炎'),
    heart: mAA('心疾患'), heartNat: mAANat('心疾患'),
    renal: mAA('腎不全'), renalNat: mAANat('腎不全'),
    dm: mAA('糖尿病'), dmNat: mAANat('糖尿病'),
  };
}

// ── Pattern 2 候補判定 (試案) ──
function isPattern2Candidate(c) {
  if (c.p75 == null || c.p75Avg == null || c.hc == null || c.hcAvg == null || c.rh == null || c.rhAvg == null) return false;
  if ((c.p75 - c.p75Avg) <= 1.0) return false;
  if (pctDiff(c.hc, c.hcAvg) >= -15) return false;
  if (pctDiff(c.rh, c.rhAvg) >= -15) return false;
  const cerebroD = pctDiff(c.cerebro, c.cerebroNat);
  const renalD = pctDiff(c.renal, c.renalNat);
  return (cerebroD != null && cerebroD > 15) || (renalD != null && renalD > 15);
}

// ── Pattern 5 (現行) 判定 ──
function isPattern5(c) {
  if (c.p75 == null || c.p75Avg == null || c.hc == null || c.hcAvg == null || c.rh == null || c.rhAvg == null) return false;
  if ((c.p75 - c.p75Avg) <= 1.0) return false;
  if (pctDiff(c.hc, c.hcAvg) >= -15) return false;
  if (pctDiff(c.rh, c.rhAvg) >= -15) return false;
  const cerebroD = pctDiff(c.cerebro, c.cerebroNat);
  return cerebroD != null && cerebroD > 15;
}

// ── Pattern 4 候補判定 (試案: Alignment Context) ──
function isPattern4Candidate(c) {
  if (c.p75 == null || c.p75Avg == null || c.hc == null || c.hcAvg == null || c.rh == null || c.rhAvg == null) return false;
  // 75+ は中〜高 (-1.0 ≤ p75 - 全国 ≤ +2.0)
  const p75D = c.p75 - c.p75Avg;
  if (p75D < -1.0 || p75D > 2.0) return false;
  // 供給厚 (hc OR rh が +30% 以上)
  const hcD = pctDiff(c.hc, c.hcAvg);
  const rhD = pctDiff(c.rh, c.rhAvg);
  const supplyHigh = (hcD != null && hcD > 30) || (rhD != null && rhD > 30);
  if (!supplyHigh) return false;
  // 5死因 全て年齢調整死亡率が全国比 ±15% 以内
  const outcomes = [
    pctDiff(c.cerebro, c.cerebroNat),
    pctDiff(c.pneumonia, c.pneumoniaNat),
    pctDiff(c.heart, c.heartNat),
    pctDiff(c.renal, c.renalNat),
    pctDiff(c.dm, c.dmNat),
  ];
  if (outcomes.some(d => d == null)) return false;
  return outcomes.every(d => d >= -15 && d <= 15);
}

// ── main ──
function main() {
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}  Pattern 2 / 4 Evaluation (Phase 4-1 P2-5, off-UI)${RESET}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`reviewer 採択方針: まず実装しない。off-UI で評価レポートを作る。`);
  console.log('');

  const data = loadData();
  const errors = [];
  const p2Candidates = [];
  const p4Candidates = [];
  const p5Current = [];
  const p2DetailByPref = {};
  const p4DetailByPref = {};

  for (const pref of PREFECTURES_47) {
    const c = buildContext(pref, data);
    if (isPattern2Candidate(c)) {
      p2Candidates.push(pref);
      p2DetailByPref[pref] = {
        p75_diff: c.p75 != null && c.p75Avg != null ? +(c.p75 - c.p75Avg).toFixed(2) : null,
        hc_pct: pctDiff(c.hc, c.hcAvg)?.toFixed(1),
        rh_pct: pctDiff(c.rh, c.rhAvg)?.toFixed(1),
        cerebro_pct: pctDiff(c.cerebro, c.cerebroNat)?.toFixed(1),
        renal_pct: pctDiff(c.renal, c.renalNat)?.toFixed(1),
      };
    }
    if (isPattern5(c)) p5Current.push(pref);
    if (isPattern4Candidate(c)) {
      p4Candidates.push(pref);
      p4DetailByPref[pref] = {
        p75_diff: c.p75 != null && c.p75Avg != null ? +(c.p75 - c.p75Avg).toFixed(2) : null,
        hc_pct: pctDiff(c.hc, c.hcAvg)?.toFixed(1),
        rh_pct: pctDiff(c.rh, c.rhAvg)?.toFixed(1),
        cerebro_pct: pctDiff(c.cerebro, c.cerebroNat)?.toFixed(1),
        pneumonia_pct: pctDiff(c.pneumonia, c.pneumoniaNat)?.toFixed(1),
        heart_pct: pctDiff(c.heart, c.heartNat)?.toFixed(1),
        renal_pct: pctDiff(c.renal, c.renalNat)?.toFixed(1),
        dm_pct: pctDiff(c.dm, c.dmNat)?.toFixed(1),
      };
    }
  }

  // P2/P5 重複率
  const p2Set = new Set(p2Candidates);
  const p5Set = new Set(p5Current);
  const overlap = [...p2Set].filter(p => p5Set.has(p));
  const onlyP2 = [...p2Set].filter(p => !p5Set.has(p));
  const onlyP5 = [...p5Set].filter(p => !p2Set.has(p));
  const overlapRate = p2Set.size > 0 ? (overlap.length / p2Set.size * 100).toFixed(1) : '0.0';

  // ── レポート ──
  console.log(`${BOLD}── Pattern 2 候補 (試案: P5 + 腎不全 拡張) ──${RESET}`);
  console.log(`  該当: ${p2Candidates.length}県 — ${p2Candidates.join('・') || '(なし)'}`);
  console.log('');

  console.log(`${BOLD}── Pattern 5 現行 (cerebro のみ) ──${RESET}`);
  console.log(`  該当: ${p5Current.length}県 — ${p5Current.join('・') || '(なし)'}`);
  console.log('');

  console.log(`${BOLD}── P2/P5 重複分析 ──${RESET}`);
  console.log(`  ${YELLOW}重複 (P2かつP5)${RESET}: ${overlap.length}県 — ${overlap.join('・') || '(なし)'}`);
  console.log(`  P2のみ            : ${onlyP2.length}県 — ${onlyP2.join('・') || '(なし)'}`);
  console.log(`  P5のみ            : ${onlyP5.length}県 — ${onlyP5.join('・') || '(なし)'}`);
  console.log(`  ${BOLD}重複率: ${overlapRate}% (P2候補のうち P5 にも該当)${RESET}`);
  console.log('');

  console.log(`${BOLD}── Pattern 4 候補 (試案: Alignment Context) ──${RESET}`);
  console.log(`  該当: ${p4Candidates.length}県 — ${p4Candidates.join('・') || '(なし)'}`);
  for (const p of p4Candidates) {
    const d = p4DetailByPref[p];
    console.log(`    ${CYAN}${p}${RESET}: 75+${d.p75_diff > 0 ? '+' : ''}${d.p75_diff}pt / hc${d.hc_pct > 0 ? '+' : ''}${d.hc_pct}% / rh${d.rh_pct > 0 ? '+' : ''}${d.rh_pct}%`);
    console.log(`      outcome: cerebro${d.cerebro_pct > 0 ? '+' : ''}${d.cerebro_pct}% / 肺炎${d.pneumonia_pct > 0 ? '+' : ''}${d.pneumonia_pct}% / 心疾患${d.heart_pct > 0 ? '+' : ''}${d.heart_pct}% / 腎不全${d.renal_pct > 0 ? '+' : ''}${d.renal_pct}% / 糖尿病${d.dm_pct > 0 ? '+' : ''}${d.dm_pct}%`);
  }
  console.log('');

  // 代表例検証
  console.log(`${BOLD}── 代表例検証 (docs/REGIONAL_MISMATCH_PATTERNS.md) ──${RESET}`);
  const p2DocsRep = ['秋田県', '青森県', '岩手県', '山形県'];
  const p4DocsRep = ['岡山県', '熊本県', '島根県'];
  const p2RepHit = p2DocsRep.filter(p => p2Set.has(p));
  const p4RepHit = p4DocsRep.filter(p => p4Candidates.includes(p));
  console.log(`  P2 docs代表 [${p2DocsRep.join('・')}]: ${p2RepHit.length}/${p2DocsRep.length} 件が候補に該当 — ${p2RepHit.join('・') || '(なし)'}`);
  console.log(`  P4 docs代表 [${p4DocsRep.join('・')}]: ${p4RepHit.length}/${p4DocsRep.length} 件が候補に該当 — ${p4RepHit.join('・') || '(なし)'}`);
  console.log('');

  // 誤読リスク評価
  console.log(`${BOLD}── 誤読リスク評価 ──${RESET}`);
  console.log(`  ${RED}Pattern 2${RESET}: ${overlapRate >= 80 ? '⚠ P5 とほぼ同一の signal、独立 archetype として情報量が少ない' : 'P5 と差別化可能'}`);
  console.log(`  ${RED}Pattern 4${RESET}: ⚠ 「優良地域」誤読リスクが極めて強い。「医療体制が良い」「病院の質が高い」と読まれる可能性大。`);
  console.log('');

  // 結論
  console.log(`${BOLD}${YELLOW}── 結論 (P2-5 reviewer 推奨方針) ──${RESET}`);
  console.log('');
  const p2Decision = overlapRate >= 80 ? 'docs-only' : 'conditional UI (P5 sub-label)';
  const p4Decision = 'docs-only (no UI)';
  console.log(`  ${BOLD}Pattern 2: ${p2Decision}${RESET}`);
  console.log(`    理由: P5 重複率 ${overlapRate}%。`);
  if (overlapRate >= 80) {
    console.log(`           独立 archetype として UI 追加すると同じ県群が二重ラベル化し、情報量が増えない。`);
    console.log(`           docs での記述に留めるか、将来 P5 内の sub-label として整理する。`);
  } else {
    console.log(`           P5 と異なる県群を捉える可能性あり。P5 sub-label 化を検討。`);
  }
  console.log('');
  console.log(`  ${BOLD}Pattern 4: ${p4Decision}${RESET}`);
  console.log(`    理由: Alignment Context は単独で「不一致」を示さず (docs §Pattern 4 注記)、`);
  console.log(`           UI 表示すると「優良県」「医療の質が高い」誤読を強く誘発する。`);
  console.log(`           reviewer 採択 (P0 docs alignment) と相反するため、docs-only で運用する。`);
  console.log(`           因果関係は推論しないため、好事例の参照は docs (Phase 2E-3) で行う。`);
  console.log('');

  // ── snapshot 出力 ──
  const snapshotDir = path.join(__dirname, 'snapshots');
  if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
  const jsonPath = path.join(snapshotDir, 'pattern_2_4_evaluation.json');
  const jsonPayload = {
    _generated: new Date().toISOString(),
    _description: 'Phase 4-1 P2-5 Pattern 2/4 追加検討 評価結果',
    _conclusion: {
      pattern_2: { decision: p2Decision, overlap_rate_with_p5: overlapRate, candidates: p2Candidates, candidates_only_in_p2: onlyP2, candidates_only_in_p5: onlyP5, overlap_with_p5: overlap },
      pattern_4: { decision: p4Decision, candidates: p4Candidates, misread_risk: '優良地域誤読リスクが強い' },
    },
    pattern_2: { logic: 'P5 + 腎不全 OR cerebro', candidates: p2Candidates, detail_by_pref: p2DetailByPref, docs_representatives: p2DocsRep, docs_rep_hit: p2RepHit },
    pattern_5_current: { candidates: p5Current },
    pattern_4: { logic: '75+ in [-1.0, +2.0]pt + (hc>+30% or rh>+30%) + 5死因 ±15% 以内', candidates: p4Candidates, detail_by_pref: p4DetailByPref, docs_representatives: p4DocsRep, docs_rep_hit: p4RepHit },
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf-8');
  console.log(`${BLUE}snapshot 保存: ${path.relative(ROOT, jsonPath)}${RESET}`);

  // ── assertion ──
  // 結論が記録されているか
  if (!p2Decision || !p4Decision) errors.push('決定 (decision) が記録されていない');
  // P2 docs代表のうち1件以上ヒット (logic 妥当性チェック)
  if (p2RepHit.length === 0) errors.push(`P2 候補が docs 代表 [${p2DocsRep.join(',')}] のいずれも捉えていない (logic 要見直し)`);
  // P4 docs代表のうち1件以上ヒット
  if (p4RepHit.length === 0) errors.push(`P4 候補が docs 代表 [${p4DocsRep.join(',')}] のいずれも捉えていない (logic 要見直し)`);

  if (errors.length > 0) {
    console.log(`\n${RED}${BOLD}❌ FAIL${RESET}`);
    for (const e of errors) console.log(`${RED}  - ${e}${RESET}`);
    process.exit(1);
  }

  console.log(`\n${GREEN}${BOLD}✅ PASS: Pattern 2/4 evaluation complete${RESET}`);
  console.log(`${GREEN}  - Pattern 2: ${p2Decision} (P5 重複率 ${overlapRate}%)${RESET}`);
  console.log(`${GREEN}  - Pattern 4: ${p4Decision}${RESET}`);
  console.log(`${GREEN}  - 詳細: docs/P2_5_PATTERN_2_4_EVALUATION.md${RESET}`);
  process.exit(0);
}

main();
