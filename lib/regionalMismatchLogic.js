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

// ── 75歳以上人口割合 (agePyramid から) ──
export function compute75Plus(ap) {
  if (!ap?.male || !ap?.female) return null;
  const total = [...ap.male, ...ap.female].reduce((s, v) => s + (v || 0), 0);
  const p75 = ap.male.slice(15).reduce((s, v) => s + (v || 0), 0)
    + ap.female.slice(15).reduce((s, v) => s + (v || 0), 0);
  return total > 0 ? (p75 / total) * 100 : null;
}

// ── 4 archetype 判定ロジック ──
// 出力: matches 配列 (該当 archetype を 0〜3 個含む)
export function detectArchetypes(ctx) {
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

  // ── Pattern 1: Risk-Care Gap (糖代謝) ──
  // 条件: BMI≥25 が47県平均比+10%以上、かつ 内分泌外来受療率が-20%以下
  if (bmi != null && bmiAvg != null && endo != null && endoNat != null) {
    const bmiD = pctDiff(bmi, bmiAvg);
    const hba1cD = pctDiff(hba1c, hba1cAvg);
    const endoD = pctDiff(endo, endoNat);
    if (bmiD > 10 && endoD < -20) {
      matches.push({
        id: 'P1',
        layer: 'mismatch',
        title: 'リスクと医療接触の乖離（Risk-Care Gap）',
        description: '糖代謝リスク proxy は高い一方、内分泌・代謝系外来受療率 proxy は低く、両者に乖離が見られます。',
        evidence: [
          { label: 'BMI≥25 (健診)', value: `${bmi.toFixed(1)}%`, ref: `47県平均比 ${bmiD > 0 ? '+' : ''}${bmiD.toFixed(1)}%` },
          ...(hba1cD != null ? [{ label: 'HbA1c≥6.5 (健診)', value: `${hba1c.toFixed(1)}%`, ref: `47県平均比 ${hba1cD > 0 ? '+' : ''}${hba1cD.toFixed(1)}%` }] : []),
          { label: '内分泌・代謝外来受療率', value: `${endo}/10万`, ref: `全国比 ${endoD > 0 ? '+' : ''}${endoD.toFixed(1)}%` },
          ...(dm != null && dmNat != null ? [{ label: '糖尿病 年齢調整死亡率 (2020)', value: `${dm.toFixed(1)}/10万`, ref: `全国比 ${pctDiff(dm, dmNat) > 0 ? '+' : ''}${pctDiff(dm, dmNat).toFixed(1)}%` }] : []),
        ],
      });
    }
  }

  // ── Pattern 3: Supply-Outcome Mismatch ──
  // 条件: cap.homecare が47県平均比+50%以上、かつ 肺炎/心疾患/腎不全 年齢調整のいずれかが+15%以上
  if (hc != null && hcAvg != null) {
    const hcD = pctDiff(hc, hcAvg);
    if (hcD > 50) {
      const outcomeIssues = [];
      if (pneumonia != null && pneumoniaNat != null && pctDiff(pneumonia, pneumoniaNat) > 15) {
        outcomeIssues.push({ label: '肺炎 年齢調整死亡率 (2020)', value: `${pneumonia.toFixed(1)}/10万`, ref: `全国比 +${pctDiff(pneumonia, pneumoniaNat).toFixed(1)}%` });
      }
      if (heart != null && heartNat != null && pctDiff(heart, heartNat) > 15) {
        outcomeIssues.push({ label: '心疾患 年齢調整死亡率 (2020)', value: `${heart.toFixed(1)}/10万`, ref: `全国比 +${pctDiff(heart, heartNat).toFixed(1)}%` });
      }
      if (renal != null && renalNat != null && pctDiff(renal, renalNat) > 15) {
        outcomeIssues.push({ label: '腎不全 年齢調整死亡率 (2020)', value: `${renal.toFixed(1)}/10万`, ref: `全国比 +${pctDiff(renal, renalNat).toFixed(1)}%` });
      }
      if (outcomeIssues.length > 0) {
        matches.push({
          id: 'P3',
          layer: 'mismatch',
          title: '供給 proxy と Outcome の不一致（Supply-Outcome Mismatch）',
          description: '在宅医療 capability proxy は厚い一方、年齢調整後の Outcome に高値が観察されます。「供給を増やせば結果が改善する」という政策効果の主張ではありません。',
          evidence: [
            { label: '在宅医療 capability (75+10万対)', value: hc.toFixed(0), ref: `47県平均比 +${hcD.toFixed(1)}%` },
            ...outcomeIssues,
          ],
        });
      }
    }
  }

  // ── Pattern 5: Aging-Outcome Burden ──
  // 条件: 75+ 割合が全国+1pt以上、かつ cap.homecare/rehab が-15%以下、かつ 脳血管 年齢調整 が+15%以上
  if (p75 != null && p75Avg != null && (p75 - p75Avg) > 1.0) {
    const hcD = pctDiff(hc, hcAvg);
    const rhD = pctDiff(rh, rhAvg);
    const cerebroD = pctDiff(cerebro, cerebroNat);
    if ((hcD != null && hcD < -15) && (rhD != null && rhD < -15) && (cerebroD != null && cerebroD > 15)) {
      matches.push({
        id: 'P5',
        layer: 'mismatch',
        title: '高齢化に対する在宅移行の遅れと Outcome の連動（Aging-Outcome Burden）',
        description: '高齢化が進んでいるのに在宅・リハ capability proxy が薄く、脳血管 年齢調整死亡率にも高値が観察されます。「医療体制が悪い」という評価ではありません。',
        evidence: [
          { label: '75歳以上割合 (住基2025)', value: `${p75.toFixed(1)}%`, ref: `全国 ${p75Avg.toFixed(1)}% より +${(p75 - p75Avg).toFixed(1)}pt` },
          { label: '在宅医療 capability (75+10万対)', value: hc.toFixed(0), ref: `47県平均比 ${hcD.toFixed(1)}%` },
          { label: 'リハビリ capability (75+10万対)', value: rh.toFixed(0), ref: `47県平均比 ${rhD.toFixed(1)}%` },
          { label: '脳血管 年齢調整死亡率 (2020)', value: `${cerebro.toFixed(1)}/10万`, ref: `全国比 +${cerebroD.toFixed(1)}%` },
        ],
      });
    }
  }

  // ── Pattern 6: Urban Low-risk / High-capability Context (構造プロファイル) ──
  // 条件: 75+ 割合が全国-1pt以下、かつ HbA1c≥6.5 が47県平均比-5%以下
  if (p75 != null && p75Avg != null && (p75 - p75Avg) < -1.0) {
    const hba1cD = pctDiff(hba1c, hba1cAvg);
    if (hba1cD != null && hba1cD < -5) {
      matches.push({
        id: 'P6',
        layer: 'context',
        title: '都市低リスク・高機能集積の構造（Urban Context）',
        description: '若年人口比率が高く、健診リスク proxy が低位で観察されます。これは構造プロファイルであり、「医療が優れている」という意味ではありません。低リスクは若年構造のみで説明できるとは限らず、健診受診者選択バイアス、生活習慣、社会経済要因が複合している可能性があります。',
        evidence: [
          { label: '75歳以上割合 (住基2025)', value: `${p75.toFixed(1)}%`, ref: `全国 ${p75Avg.toFixed(1)}% より ${(p75 - p75Avg).toFixed(1)}pt` },
          { label: 'HbA1c≥6.5 (健診)', value: `${hba1c.toFixed(1)}%`, ref: `47県平均比 ${hba1cD.toFixed(1)}%` },
          ...(bmi != null && bmiAvg != null ? [{ label: 'BMI≥25 (健診)', value: `${bmi.toFixed(1)}%`, ref: `47県平均比 ${pctDiff(bmi, bmiAvg) > 0 ? '+' : ''}${pctDiff(bmi, bmiAvg).toFixed(1)}%` }] : []),
        ],
      });
    }
  }

  return matches;
}
