/**
 * Regional Mismatch Detection Logic (Phase 4-1 P1-4 + P2-1)
 *
 * RegionalMismatchExplorer.jsx と snapshot QA test の両方から使う
 * 判定ロジックを切り出した共通モジュール。
 *
 * Phase 4-1 P2-1 で導入: rule-based MVP の判定を 47都道府県全件で
 * 検証可能にするため、UI から判定ロジックを分離。
 *
 * 判定対象 archetype (MVP 4種):
 *   Mismatch Signal: Pattern 1 (Risk-Care Gap)
 *                    Pattern 3 (Supply-Outcome Mismatch)
 *                    Pattern 5 (Aging-Outcome Burden)
 *   Context:         Pattern 6 (Urban Low-risk / High-capability)
 *
 * 入力 ctx (オブジェクト):
 *   - pref: 都道府県名 (例: '沖縄県')
 *   - ndbCheckupRiskRates: 健診リスク率 JSON
 *   - patientSurvey: 患者調査 JSON
 *   - mortalityOutcome2020: 年齢調整死亡率 JSON
 *   - homecareCapability: 在宅医療 capability JSON
 *   - agePyramid: 年齢ピラミッド JSON
 *
 * 出力: archetypes 配列 ({ id, layer, title, description, evidence })
 */

// ── 47県平均計算ヘルパー ──
export function avg47(byPref) {
  if (!byPref) return null;
  const vals = Object.entries(byPref)
    .filter(([k]) => k !== '全国')
    .map(([, v]) => (typeof v === 'object' ? v.rate : v))
    .filter(v => typeof v === 'number');
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

export const pctDiff = (val, ref) =>
  (val == null || ref == null || ref === 0) ? null : ((val / ref - 1) * 100);

// ── 47県分布における位置統計 (Phase 4-1 P2-3) ──
// 入力 byPref: { '北海道': {rate, ...} or 数値, '青森県': ..., ..., '全国': ... }
// 入力 val: 自県の値
// 出力: { mean, std, percentile (0-100), zscore, rank (1=highest), n }
//   percentile は「自県値以下の県の割合 ×100」
//   higherIsBetter=true (rate が低いほど望ましい指標、例: HbA1c) の場合は 100-percentile
//   ただし P2-3 段階では中立的な「分布上の位置」として percentile を返す。
//   Mismatch シグナルの方向は、UI 側の文言と evidence の符号で表現する。
export function computeDistributionStats(byPref, val, options = {}) {
  const { excludeKeys = ['全国'] } = options;
  if (val == null || !byPref) return null;
  const vals = Object.entries(byPref)
    .filter(([k]) => !excludeKeys.includes(k))
    .map(([, v]) => (typeof v === 'object' ? v.rate : v))
    .filter(v => typeof v === 'number');
  if (vals.length === 0) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  const std = Math.sqrt(variance);
  // percentile: 自県値以下 (val を含む) の県数 / 全体
  const belowOrEqual = sorted.filter(v => v <= val).length;
  const percentile = (belowOrEqual / vals.length) * 100;
  // zscore
  const zscore = std === 0 ? 0 : (val - mean) / std;
  // rank: 1 = 最高値 (descending order)
  const sortedDesc = [...vals].sort((a, b) => b - a);
  const rank = sortedDesc.findIndex(v => v === val) + 1;
  return {
    mean: parseFloat(mean.toFixed(2)),
    std: parseFloat(std.toFixed(2)),
    percentile: parseFloat(percentile.toFixed(1)),
    zscore: parseFloat(zscore.toFixed(2)),
    rank,
    n: vals.length,
  };
}

// 数値マップ ({pref: number}) を byPref 互換形式に変換
function toRateMap(numMap) {
  const out = {};
  for (const [k, v] of Object.entries(numMap || {})) {
    if (typeof v === 'number') out[k] = { rate: v };
  }
  return out;
}

// ── 75歳以上人口割合 (agePyramid から) ──
export function compute75Plus(ap) {
  if (!ap?.male || !ap?.female) return null;
  const total = [...ap.male, ...ap.female].reduce((s, v) => s + (v || 0), 0);
  const p75 = ap.male.slice(15).reduce((s, v) => s + (v || 0), 0)
    + ap.female.slice(15).reduce((s, v) => s + (v || 0), 0);
  return total > 0 ? (p75 / total) * 100 : null;
}

// ── デフォルト閾値 (Phase 4-1 P1-4 の MVP 値) ──
// Phase 4-1 P2-2: threshold sensitivity 分析のため、閾値をパラメータ化。
// UI と snapshot QA は BASELINE_THRESHOLDS を使い、後方互換性を保つ。
export const BASELINE_THRESHOLDS = {
  P1: {
    bmi_excess: 10,         // BMI≥25 が47県平均比 +N% 以上
    endo_deficit: -20,      // 内分泌外来受療率が全国比 -N% 以下
  },
  P3: {
    hc_excess: 50,          // cap.homecare が47県平均比 +N% 以上
    outcome_excess: 15,     // 肺炎/心疾患/腎不全 年齢調整 +N% 以上
  },
  P5: {
    p75_excess_pt: 1.0,     // 75+ 割合が全国 +N pt 以上
    hc_deficit: -15,        // hc が47県平均比 -N% 以下
    rh_deficit: -15,        // rh が47県平均比 -N% 以下
    cerebro_excess: 15,     // 脳血管 年齢調整 +N% 以上
  },
  P6: {
    p75_deficit_pt: -1.0,   // 75+ 割合が全国 -N pt 以下
    hba1c_deficit: -5,      // HbA1c≥6.5 が47県平均比 -N% 以下
  },
};

// ── Phase 4-1 P2-4: confidence grade A/B/C 計算ロジック ──
//
// 観察ラベルごとに、ユーザーが「この signal をどれくらい信用してよいか」を
// 誤読しないようにするための補助バッジ。
//
// 重要 (reviewer 採択):
//   confidence は「真実性」「政策判断の正しさ」「医療の質」を示すものではない。
//   利用可能な proxy 群から見た「観察信号の強さ」の総合評価である。
//
// 評価軸:
//   1. evidence completeness (根拠 metric 数)
//   2. distribution extremity (rank/zscore の極端度)
//   3. threshold stability (relaxed/baseline/strict 全シナリオで残るか) - optional
//   4. proxy caveat (P3/P6 など弱い proxy を含む archetype は減点)
//
// Grade 定義:
//   A (高 confidence)    - 複数根拠が揃い分布上も極端、scenario 間で安定
//   B (中 confidence)    - 根拠あり、ただし境界条件 or proxy caveat
//   C (参考 confidence)  - 閾値・proxy・時点差に注意
//
// 入力:
//   match: detectArchetypes が返す archetype オブジェクト
//   options.stability: boolean | null (relaxed/baseline/strict 全てで該当か)
//   options.proxyCaveatIds: 弱い proxy を含む archetype の id 配列
export function computeConfidence(match, options = {}) {
  const { stability = null, proxyCaveatIds = ['P3', 'P6'] } = options;
  const evidence = match?.evidence || [];
  const stats = evidence.map(e => e.stats).filter(Boolean);

  // 強い signal をもつ metric の数 (|z|>=1.5 or rank<=5 or rank>=43 of 47)
  const strongStats = stats.filter(s =>
    Math.abs(s.zscore) >= 1.5 || s.rank <= 5 || (s.n - s.rank) <= 4
  ).length;
  // 非常に強い signal の数 (|z|>=2.0 or rank<=3 or rank>=45)
  const veryStrongStats = stats.filter(s =>
    Math.abs(s.zscore) >= 2.0 || s.rank <= 3 || (s.n - s.rank) <= 2
  ).length;
  const evidenceCount = evidence.length;

  // proxy caveat: P3 (供給 proxy が caveat)、P6 (構造プロファイル) を弱い proxy 扱い
  const hasProxyCaveat = proxyCaveatIds.includes(match?.id);

  // ── Phase 4-3f: support evidence による補助加点 ──
  // reviewer 採択 (案 B-lite): UI 主 evidence は増やさず、support evidence は
  // confidence score の補助加点としてのみ使用。境界県の過剰 A 化を避けるため、
  // stability=true の場合のみ加算 (max +1)。
  const supportEvidence = match?.supportEvidence || [];
  const supportStats = supportEvidence.map(e => e.stats).filter(Boolean);
  const strongSupport = supportStats.filter(s =>
    Math.abs(s.zscore) >= 1.5 || s.rank <= 5 || (s.n - s.rank) <= 4
  ).length;
  // support_bonus: stability=true かつ strongSupport >= 2 の場合のみ +1
  // 境界県 (stability=false) は加算されないため、過剰 A 化を防ぐ
  const supportBonus = (stability === true && strongSupport >= 2) ? 1 : 0;

  // ── score 計算 ──
  let score = 0;
  if (evidenceCount >= 3) score += 1;       // 根拠が多角的
  if (strongStats >= 2) score += 1;          // 複数 metric が分布端
  if (veryStrongStats >= 2) score += 1;      // 複数 metric が極端
  if (stability === true) score += 1;        // 全シナリオで安定
  if (stability === false) score -= 1;       // 境界例
  if (hasProxyCaveat) score -= 1;            // proxy caveat 減点
  score += supportBonus;                     // support evidence 補助加点 (max +1)

  // ── grade 判定 ──
  let grade;
  if (score >= 3) grade = 'A';
  else if (score >= 1) grade = 'B';
  else grade = 'C';

  return {
    grade,
    score,
    factors: {
      evidence_count: evidenceCount,
      strong_stats: strongStats,
      very_strong_stats: veryStrongStats,
      stability,
      has_proxy_caveat: hasProxyCaveat,
      support_evidence_count: supportEvidence.length,
      strong_support: strongSupport,
      support_bonus: supportBonus,
    },
    label: grade === 'A' ? '高 confidence' : grade === 'B' ? '中 confidence' : '参考 confidence',
    caveat: 'confidence は観察信号の強さを示す補助指標であり、医療の質・政策効果・地域の優劣を示すものではありません。',
  };
}

// ── 4 archetype 判定ロジック ──
// 出力: matches 配列 (該当 archetype を 0〜3 個含む、各 match に confidence 付与)
// thresholds: 閾値 override (省略時は BASELINE_THRESHOLDS を使用)
// options.stabilityMap: { [archetypeId: string]: boolean } 各 archetype の3シナリオ安定性
export function detectArchetypes(ctx, thresholds = BASELINE_THRESHOLDS, options = {}) {
  const TH = thresholds;
  const { stabilityMap = null } = options;
  const { pref, ndbCheckupRiskRates, patientSurvey, mortalityOutcome2020, homecareCapability, agePyramid } = ctx;
  const matches = [];

  // ── 共通: 自県値 と 47県平均 / 全国 ──
  const bmi = ndbCheckupRiskRates?.risk_rates?.bmi_ge_25?.by_pref?.[pref]?.rate;
  const bmiAvg = avg47(ndbCheckupRiskRates?.risk_rates?.bmi_ge_25?.by_pref);
  const hba1c = ndbCheckupRiskRates?.risk_rates?.hba1c_ge_6_5?.by_pref?.[pref]?.rate;
  const hba1cAvg = avg47(ndbCheckupRiskRates?.risk_rates?.hba1c_ge_6_5?.by_pref);

  // 内分泌・代謝外来受療率
  const endoKey = 'Ⅳ_内分泌，栄養及び代謝疾患';
  const endo = patientSurvey?.prefectures?.[pref]?.categories?.[endoKey]?.outpatient;
  const endoNat = patientSurvey?.prefectures?.['全国']?.categories?.[endoKey]?.outpatient;

  // homecare capability
  const hc = homecareCapability?.by_prefecture?.[pref]?.homecare_per75;
  const hcAvg = avg47(Object.fromEntries(
    Object.entries(homecareCapability?.by_prefecture || {})
      .map(([k, v]) => [k, v?.homecare_per75])
  ));
  const rh = homecareCapability?.by_prefecture?.[pref]?.rehab_per75;
  const rhAvg = avg47(Object.fromEntries(
    Object.entries(homecareCapability?.by_prefecture || {})
      .map(([k, v]) => [k, v?.rehab_per75])
  ));

  // 75+ 割合
  const p75 = compute75Plus(agePyramid?.prefectures?.[pref]);
  const p75NatList = Object.values(agePyramid?.prefectures || {})
    .map(compute75Plus)
    .filter(v => v != null);
  const p75Avg = p75NatList.length
    ? p75NatList.reduce((s, v) => s + v, 0) / p75NatList.length
    : null;

  // mortality 年齢調整 (男女平均)
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
  const cerebro = mAA('脳血管疾患');
  const cerebroNat = mAANat('脳血管疾患');
  const pneumonia = mAA('肺炎');
  const pneumoniaNat = mAANat('肺炎');
  const heart = mAA('心疾患');
  const heartNat = mAANat('心疾患');
  const renal = mAA('腎不全');
  const renalNat = mAANat('腎不全');
  const dm = mAA('糖尿病');
  const dmNat = mAANat('糖尿病');

  // ── Phase 4-1 P2-3: 各 metric の分布統計を事前計算 ──
  // by-pref オブジェクト構築
  const hcByPref = toRateMap(Object.fromEntries(Object.entries(homecareCapability?.by_prefecture || {}).map(([k, v]) => [k, v?.homecare_per75])));
  const rhByPref = toRateMap(Object.fromEntries(Object.entries(homecareCapability?.by_prefecture || {}).map(([k, v]) => [k, v?.rehab_per75])));
  const p75ByPref = toRateMap(Object.fromEntries(Object.entries(agePyramid?.prefectures || {}).map(([k, ap]) => [k, compute75Plus(ap)])));
  const aamByPref = (cause) => toRateMap(Object.fromEntries(Object.entries(mortalityOutcome2020?.prefectures || {}).map(([k, p]) => {
    const d = p?.[cause]?.age_adjusted;
    return [k, (d?.male && d?.female) ? (d.male.rate + d.female.rate) / 2 : null];
  })));
  const endoByPref = toRateMap(Object.fromEntries(Object.entries(patientSurvey?.prefectures || {}).filter(([k]) => k !== '全国').map(([k, v]) => [k, v?.categories?.['Ⅳ_内分泌，栄養及び代謝疾患']?.outpatient])));

  // 主要 evidence metric の分布統計 (P2-3 reviewer 採択スコープ)
  const stats = {
    bmi: computeDistributionStats(ndbCheckupRiskRates?.risk_rates?.bmi_ge_25?.by_pref, bmi),
    hba1c: computeDistributionStats(ndbCheckupRiskRates?.risk_rates?.hba1c_ge_6_5?.by_pref, hba1c),
    endo: computeDistributionStats(endoByPref, endo),
    hc: computeDistributionStats(hcByPref, hc),
    rh: computeDistributionStats(rhByPref, rh),
    p75: computeDistributionStats(p75ByPref, p75),
    pneumonia: computeDistributionStats(aamByPref('肺炎'), pneumonia),
    heart: computeDistributionStats(aamByPref('心疾患'), heart),
    renal: computeDistributionStats(aamByPref('腎不全'), renal),
    cerebro: computeDistributionStats(aamByPref('脳血管疾患'), cerebro),
    dm: computeDistributionStats(aamByPref('糖尿病'), dm),
  };
  // statsRef ヘルパー: stats から { percentile, zscore, n } を text で出す
  const statsRef = (s) => s ? `pct ${s.percentile.toFixed(0)} / z=${s.zscore > 0 ? '+' : ''}${s.zscore.toFixed(2)}` : '';

  // ── Pattern 1: Risk-Care Gap (糖代謝) ──
  // 条件: BMI≥25 が47県平均比+10%以上、かつ 内分泌外来受療率が-20%以下
  if (bmi != null && bmiAvg != null && endo != null && endoNat != null) {
    const bmiD = pctDiff(bmi, bmiAvg);
    const hba1cD = pctDiff(hba1c, hba1cAvg);
    const endoD = pctDiff(endo, endoNat);
    if (bmiD > TH.P1.bmi_excess && endoD < TH.P1.endo_deficit) {
      matches.push({
        id: 'P1',
        layer: 'mismatch',
        title: 'リスクと医療接触の乖離（Risk-Care Gap）',
        description: '糖代謝リスク proxy は高い一方、内分泌・代謝系外来受療率 proxy は低く、両者に乖離が見られます。',
        evidence: [
          { label: 'BMI≥25 (健診)', value: `${bmi.toFixed(1)}%`, ref: `47県平均比 ${bmiD > 0 ? '+' : ''}${bmiD.toFixed(1)}%`, stats: stats.bmi },
          ...(hba1cD != null ? [{ label: 'HbA1c≥6.5 (健診)', value: `${hba1c.toFixed(1)}%`, ref: `47県平均比 ${hba1cD > 0 ? '+' : ''}${hba1cD.toFixed(1)}%`, stats: stats.hba1c }] : []),
          { label: '内分泌・代謝外来受療率', value: `${endo}/10万`, ref: `全国比 ${endoD > 0 ? '+' : ''}${endoD.toFixed(1)}%`, stats: stats.endo },
          ...(dm != null && dmNat != null ? [{ label: '糖尿病 年齢調整死亡率 (2020)', value: `${dm.toFixed(1)}/10万`, ref: `全国比 ${pctDiff(dm, dmNat) > 0 ? '+' : ''}${pctDiff(dm, dmNat).toFixed(1)}%`, stats: stats.dm }] : []),
        ],
      });
    }
  }

  // ── Pattern 3: Supply-Outcome Mismatch ──
  // 条件: cap.homecare が47県平均比+50%以上、かつ 肺炎/心疾患/腎不全 年齢調整のいずれかが+15%以上
  if (hc != null && hcAvg != null) {
    const hcD = pctDiff(hc, hcAvg);
    if (hcD > TH.P3.hc_excess) {
      const outcomeIssues = [];
      if (pneumonia != null && pneumoniaNat != null && pctDiff(pneumonia, pneumoniaNat) > TH.P3.outcome_excess) {
        outcomeIssues.push({ label: '肺炎 年齢調整死亡率 (2020)', value: `${pneumonia.toFixed(1)}/10万`, ref: `全国比 +${pctDiff(pneumonia, pneumoniaNat).toFixed(1)}%`, stats: stats.pneumonia });
      }
      if (heart != null && heartNat != null && pctDiff(heart, heartNat) > TH.P3.outcome_excess) {
        outcomeIssues.push({ label: '心疾患 年齢調整死亡率 (2020)', value: `${heart.toFixed(1)}/10万`, ref: `全国比 +${pctDiff(heart, heartNat).toFixed(1)}%`, stats: stats.heart });
      }
      if (renal != null && renalNat != null && pctDiff(renal, renalNat) > TH.P3.outcome_excess) {
        outcomeIssues.push({ label: '腎不全 年齢調整死亡率 (2020)', value: `${renal.toFixed(1)}/10万`, ref: `全国比 +${pctDiff(renal, renalNat).toFixed(1)}%`, stats: stats.renal });
      }
      if (outcomeIssues.length > 0) {
        matches.push({
          id: 'P3',
          layer: 'mismatch',
          title: '供給 proxy と Outcome の不一致（Supply-Outcome Mismatch）',
          description: '在宅医療 capability proxy は厚い一方、年齢調整後の Outcome に高値が観察されます。「供給を増やせば結果が改善する」という政策効果の主張ではありません。',
          evidence: [
            { label: '在宅医療 capability (75+10万対)', value: hc.toFixed(0), ref: `47県平均比 +${hcD.toFixed(1)}%`, stats: stats.hc },
            ...outcomeIssues,
          ],
        });
      }
    }
  }

  // ── Pattern 5: Aging-Outcome Burden ──
  // 条件: 75+ 割合が全国+1pt以上、かつ cap.homecare/rehab が-15%以下、かつ 脳血管 年齢調整 が+15%以上
  if (p75 != null && p75Avg != null && (p75 - p75Avg) > TH.P5.p75_excess_pt) {
    const hcD = pctDiff(hc, hcAvg);
    const rhD = pctDiff(rh, rhAvg);
    const cerebroD = pctDiff(cerebro, cerebroNat);
    if ((hcD != null && hcD < TH.P5.hc_deficit) && (rhD != null && rhD < TH.P5.rh_deficit) && (cerebroD != null && cerebroD > TH.P5.cerebro_excess)) {
      matches.push({
        id: 'P5',
        layer: 'mismatch',
        title: '高齢化に対する在宅移行の遅れと Outcome の連動（Aging-Outcome Burden）',
        description: '高齢化が進んでいるのに在宅・リハ capability proxy が薄く、脳血管 年齢調整死亡率にも高値が観察されます。「医療体制が悪い」という評価ではありません。',
        evidence: [
          { label: '75歳以上割合 (住基2025)', value: `${p75.toFixed(1)}%`, ref: `全国 ${p75Avg.toFixed(1)}% より +${(p75 - p75Avg).toFixed(1)}pt`, stats: stats.p75 },
          { label: '在宅医療 capability (75+10万対)', value: hc.toFixed(0), ref: `47県平均比 ${hcD.toFixed(1)}%`, stats: stats.hc },
          { label: 'リハビリ capability (75+10万対)', value: rh.toFixed(0), ref: `47県平均比 ${rhD.toFixed(1)}%`, stats: stats.rh },
          { label: '脳血管 年齢調整死亡率 (2020)', value: `${cerebro.toFixed(1)}/10万`, ref: `全国比 +${cerebroD.toFixed(1)}%`, stats: stats.cerebro },
        ],
      });
    }
  }

  // ── Pattern 6: Urban Low-risk / High-capability Context (構造プロファイル) ──
  // 条件: 75+ 割合が全国-1pt以下、かつ HbA1c≥6.5 が47県平均比-5%以下
  if (p75 != null && p75Avg != null && (p75 - p75Avg) < TH.P6.p75_deficit_pt) {
    const hba1cD = pctDiff(hba1c, hba1cAvg);
    if (hba1cD != null && hba1cD < TH.P6.hba1c_deficit) {
      matches.push({
        id: 'P6',
        layer: 'context',
        title: '都市低リスク・高機能集積の構造（Urban Context）',
        description: '若年人口比率が高く、健診リスク proxy が低位で観察されます。これは構造プロファイルであり、「医療が優れている」という意味ではありません。低リスクは若年構造のみで説明できるとは限らず、健診受診者選択バイアス、生活習慣、社会経済要因が複合している可能性があります。',
        evidence: [
          { label: '75歳以上割合 (住基2025)', value: `${p75.toFixed(1)}%`, ref: `全国 ${p75Avg.toFixed(1)}% より ${(p75 - p75Avg).toFixed(1)}pt`, stats: stats.p75 },
          { label: 'HbA1c≥6.5 (健診)', value: `${hba1c.toFixed(1)}%`, ref: `47県平均比 ${hba1cD.toFixed(1)}%`, stats: stats.hba1c },
          ...(bmi != null && bmiAvg != null ? [{ label: 'BMI≥25 (健診)', value: `${bmi.toFixed(1)}%`, ref: `47県平均比 ${pctDiff(bmi, bmiAvg) > 0 ? '+' : ''}${pctDiff(bmi, bmiAvg).toFixed(1)}%`, stats: stats.bmi }] : []),
        ],
      });
    }
  }

  // ── Phase 4-3f: 各 match に supportEvidence を付与 (UI 主 evidence は増やさず、
  // confidence score の補助加点として使用) ──
  // reviewer 採択 (案 B-lite): 既存 NDB 19 項目から Pattern 1/6 の補助 evidence 候補を
  // 内部的に保持。UI には summary 1 行のみ表示、詳細は折りたたみ。
  const SUPPORT_EVIDENCE_CONFIG = {
    P1: {
      // 沖縄 P1 を強化する補助 evidence (Phase 4-3a で 47県 rank 確認済)
      // 質問票キー (ndbQuestionnaire.prefectures[pref][key])
      questionnaire: ['weight_gain', 'heart_disease', 'stroke_history', 'heavy_drinker'],
      // 検査値キー (ndbCheckupRiskRates.risk_rates[key].by_pref)
      checkup: [],
      // signal direction: high = 上位リスクが Pattern を支持 (= 沖縄は high が支持)
      direction: 'high',
    },
    P6: {
      // 東京 P6 (Urban Context) を強化する補助 evidence
      questionnaire: ['hypertension_med', 'diabetes_medication', 'lipid_medication'],
      checkup: ['sbp_ge_140'],
      // signal direction: low = 下位 (= 東京は low が支持、低リスク context)
      direction: 'low',
    },
    // P3 / P5 は本フェーズでは scope 外 (reviewer 採択方針)
  };

  // questionnaire data 取得 (ctx に ndbQuestionnaire が渡されていれば使用)
  const questData = ctx.ndbQuestionnaire?.prefectures || {};
  const questPrefs47 = Object.keys(questData).filter(p => p !== '全国');
  // 47県分布から rank/zscore を計算するヘルパー
  function computeQStats(qkey, prefValue) {
    const values = questPrefs47.map(p => questData[p]?.[qkey]).filter(v => typeof v === 'number');
    if (values.length === 0 || prefValue == null) return null;
    const sorted = [...values].sort((a, b) => b - a);  // 降順 (rank 1 = 最大)
    const rank = sorted.indexOf(prefValue) + 1;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);
    const zscore = std > 0 ? (prefValue - mean) / std : 0;
    return { rank, zscore: +zscore.toFixed(2), n: values.length, value: prefValue };
  }
  // 検査値 risk rate stats (既存 ndbCheckupRiskRates を活用)
  function computeCheckupStats(key, prefValue) {
    const byPref = ndbCheckupRiskRates?.risk_rates?.[key]?.by_pref;
    if (!byPref || prefValue == null) return null;
    const values = Object.entries(byPref)
      .filter(([p]) => p !== '全国')
      .map(([, v]) => v?.rate)
      .filter(v => typeof v === 'number');
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => b - a);
    const rank = sorted.indexOf(prefValue) + 1;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);
    const zscore = std > 0 ? (prefValue - mean) / std : 0;
    return { rank, zscore: +zscore.toFixed(2), n: values.length, value: prefValue };
  }

  for (const m of matches) {
    const cfg = SUPPORT_EVIDENCE_CONFIG[m.id];
    const supportEvidence = [];
    if (cfg) {
      // 質問票項目
      for (const qkey of cfg.questionnaire) {
        const v = questData[pref]?.[qkey];
        if (v != null) {
          const stats = computeQStats(qkey, v);
          if (stats) supportEvidence.push({
            key: qkey,
            source: 'questionnaire',
            label: qkey,
            value: v,
            stats,
            // direction が 'high' の場合、rank<=5 で signal 支持 / 'low' なら rank>=43 で支持
            supports_pattern: cfg.direction === 'high' ? stats.rank <= 5 : stats.rank >= 43,
          });
        }
      }
      // 検査値項目
      for (const ckey of cfg.checkup) {
        const v = ndbCheckupRiskRates?.risk_rates?.[ckey]?.by_pref?.[pref]?.rate;
        if (v != null) {
          const stats = computeCheckupStats(ckey, v);
          if (stats) supportEvidence.push({
            key: ckey,
            source: 'checkup',
            label: ckey,
            value: v,
            stats,
            supports_pattern: cfg.direction === 'high' ? stats.rank <= 5 : stats.rank >= 43,
          });
        }
      }
    }
    m.supportEvidence = supportEvidence;
  }

  // ── Phase 4-1 P2-4: 各 match に confidence を付与 (Phase 4-3f で supportEvidence も加味) ──
  for (const m of matches) {
    const stab = stabilityMap ? (stabilityMap[m.id] ?? null) : null;
    m.confidence = computeConfidence(m, { stability: stab });
  }

  return matches;
}
