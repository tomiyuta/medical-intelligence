// Disease supply-demand domain mapping v0
// Scope: 循環器 / 糖尿病・代謝 / がん の3領域のみ
// 制約: スコア化なし、データ意味ラベル付き、自然言語比較
//
// "罹患率" "供給不足" は使用禁止。proxy未整備な領域は正直に表示する。
//
// ════════════════════════════════════════════════════════════════════════════
// 🔒 v0 FROZEN at commit 475a174 (2026-04-28) — 「現行解釈仕様の固定」
// ════════════════════════════════════════════════════════════════════════════
// FROZEN は「医学的に正しい構成の確定」ではなく「現時点の解釈仕様の固定」を意味する。
// 新データ・年齢調整死亡率・薬剤名ベース補正・NDB追加カテゴリ投入時には、
// FROZEN解除 commit + interpretation notes 更新で再評価する。
//
// 本 DOMAIN_MAPPING の3領域 (cardiovascular/diabetes_metabolic/cancer) の
// risk/demand/utilization/supply/outcome キー構造、codes/keys 値は v0 frozen。
//
// 変更には FROZEN 解除 commit + interpretation notes 更新が必要:
//   docs/BRIDGE_V0_INTERPRETATION.md の "domainMapping v0 FROZEN 宣言" 章を参照
//
// 許可される変更: note/proxyLabel/label の文言修正, describeDelta閾値調整
// 禁止される変更: 3領域の codes/keys 追加・削除・差し替え
//
// 4領域目以降の拡張 (脳血管/呼吸器/腎疾患等) は別キーで追加可能 (3領域は維持される)。
// 例: cerebrovascular (commit ?)
// ════════════════════════════════════════════════════════════════════════════

export const DOMAIN_MAPPING = {
  cardiovascular: {
    id: 'cardiovascular',
    label: '循環器',
    icon: '❤️',
    color: '#dc2626',
    bg: '#fef2f2',
    // リスク: NDB質問票キー (生活習慣)
    risk: {
      ndbQKey: 'smoking',
      label: '喫煙率',
      unit: '%',
      direction: 'higher_worse',
      note: 'NDB特定健診質問票(40-74歳)',
    },
    // 疾病負荷: 患者調査 大分類
    demand: {
      patientSurveyKey: 'Ⅸ_循環器系の疾患',
      label: '循環器系 受療率(外来)',
      unit: '/10万対',
      note: '令和5年患者調査・人口10万対',
    },
    // 医療利用: NDB処方薬 薬効分類ベース proxy (人口10万対)
    utilization: {
      label: '循環器関連薬 処方proxy',
      basis: '薬効分類ベース',
      codes: ['214', '218', '333'],
      codeLabels: { '214': '血圧降下剤', '218': '高脂血症用剤', '333': '血液凝固阻止剤' },
      unit: '/人口10万対',
      note: '降圧薬・脂質異常症薬・抗血栓薬の処方量proxy。循環器疾患患者数そのものではありません。',
      direction: 'higher_more',
    },
    // 供給proxy: bedFunc 機能区分
    supply: {
      bedFuncKeys: ['高度急性期', '急性期'],
      label: '高度急性期+急性期 床シェア',
      proxyLabel: '急性期・手術系供給proxy',
      unit: '%',
      note: '※循環器専用ではない。整形外科・外科・小児等を含む急性期全体の供給proxy',
    },
    // 結果: vitalStats causes
    outcome: {
      vitalCause: '心疾患',
      label: '心疾患 死亡率',
      unit: '/10万対',
      note: '粗死亡率・年齢調整前。年齢構成の影響を強く受ける',
    },
  },
  diabetes_metabolic: {
    id: 'diabetes_metabolic',
    label: '糖尿病・代謝',
    icon: '🍰',
    color: '#f59e0b',
    bg: '#fffbeb',
    risk: {
      ndbQKey: 'weight_gain',
      label: '体重増加(過去3年5kg以上)',
      unit: '%',
      direction: 'higher_worse',
      note: 'NDB特定健診質問票・BMI/HbA1cの代理proxy',
    },
    demand: {
      patientSurveyKey: 'Ⅳ_内分泌，栄養及び代謝疾患',
      label: '内分泌・栄養・代謝 受療率(外来)',
      unit: '/10万対',
      note: '令和5年患者調査・人口10万対',
    },
    utilization: {
      label: '糖尿病薬 処方proxy',
      basis: '薬効分類ベース',
      codes: ['396'],
      codeLabels: { '396': '糖尿病用剤' },
      unit: '/人口10万対',
      note: '糖尿病用剤(396)の処方量proxy。インスリン等が別分類の場合はPhase 2で薬剤名ベース補正検討。',
      direction: 'higher_more',
    },
    // 供給proxy未整備 — 正直に表示
    supply: null,
    supplyNote: '糖尿病・代謝の施設供給proxyは未整備（生活習慣病管理料等の届出細分類は v1 以降で検討）',
    outcome: {
      vitalCause: '糖尿病',
      label: '糖尿病 死亡率',
      unit: '/10万対',
      note: '粗死亡率・年齢調整前',
    },
  },
  cancer: {
    id: 'cancer',
    label: 'がん',
    icon: '🎗️',
    color: '#7c3aed',
    bg: '#faf5ff',
    risk: {
      ndbQKey: 'smoking',
      label: '喫煙率',
      unit: '%',
      direction: 'higher_worse',
      note: 'NDB特定健診質問票・喫煙が主要risk factor',
    },
    demand: {
      patientSurveyKey: 'Ⅱ_新生物＜腫瘍＞',
      label: '新生物 受療率(外来)',
      unit: '/10万対',
      note: '令和5年患者調査・人口10万対',
    },
    utilization: {
      label: '抗悪性腫瘍薬 処方proxy',
      basis: '薬効分類ベース',
      codes: ['421', '422', '423', '424', '429'],
      codeLabels: { '421': 'アルキル化剤', '422': '代謝拮抗剤', '423': '抗腫瘍性抗生物質(データ無)', '424': '抗腫瘍性植物成分製剤', '429': 'その他の腫瘍用薬' },
      unit: '/人口10万対',
      note: '腫瘍用薬の処方量proxy。制吐薬・鎮痛薬・G-CSF等の支持療法は含めない。423はNDB公開データ未収載。',
      direction: 'higher_more',
    },
    supply: {
      bedFuncKeys: ['高度急性期'],
      label: '高度急性期 床シェア',
      proxyLabel: 'がん関連施設基準proxy',
      unit: '%',
      note: '※がん診療連携拠点病院ステータスとは異なる。がん関連capability(oncology届出)とも別',
    },
    outcome: {
      vitalCause: 'がん(悪性新生物)',
      label: '悪性新生物 死亡率',
      unit: '/10万対',
      note: '粗死亡率・年齢調整前',
    },
  },
  // ════════════════════════════════════════════════════════════════════════════
  // v1 拡張領域 (FROZEN 範囲外: 4領域目以降)
  // ════════════════════════════════════════════════════════════════════════════
  cerebrovascular: {
    id: 'cerebrovascular',
    label: '脳血管',
    icon: '🧠',
    color: '#0891b2',
    bg: '#ecfeff',
    isExperimental: true,
    experimentalNote: '脳血管領域はv1 experimental。受療率・薬剤proxyが未整備のため、リスク・供給・粗死亡率の3点確認に限定',
    risk: {
      ndbQKey: 'smoking',
      label: '喫煙率',
      unit: '%',
      direction: 'higher_worse',
      note: '脳血管疾患の主要risk factor。血圧・運動不足等との複合判定はv2で検討',
    },
    demand: null,
    demandNote: '患者調査では Ⅸ_循環器系の疾患 に統合され、脳血管単独の受療率データは公開データに未収載。Phase 2で詳細表データ調査要',
    utilization: null,
    utilizationNote: '脳血管領域の薬剤proxyはv1未整備。抗血栓薬(333)は循環器領域との重複が大きいため未採用。Phase 2で領域専用proxy検討',
    supply: {
      bedFuncKeys: ['高度急性期', '急性期', '回復期'],
      label: '高度急性期+急性期+回復期 床シェア',
      proxyLabel: '急性期・リハ供給proxy',
      unit: '%',
      note: '※脳卒中専用施設数ではなく、急性期・リハ関連供給の代理指標。回復期病床は脳卒中以外も含む',
    },
    outcome: {
      vitalCause: '脳血管疾患',
      label: '脳血管疾患 死亡率',
      unit: '/10万対',
      note: '粗死亡率・年齢調整前。年齢構成の影響を強く受ける',
    },
  },
  respiratory: {
    id: 'respiratory',
    label: '呼吸器',
    icon: '🫁',
    color: '#0e7490',
    bg: '#ecfeff',
    isExperimental: true,
    experimentalNote: '呼吸器領域はv1 experimental。慢性下気道疾患の死亡率データが公開vital_statisticsに未収載のため肺炎+誤嚥性肺炎で代替',
    risk: {
      ndbQKey: 'smoking',
      label: '喫煙率',
      unit: '%',
      direction: 'higher_worse',
      note: 'COPD・肺がん・呼吸器疾患の主要risk factor。喫煙率高=COPD多いと断定はしない',
    },
    demand: {
      patientSurveyKey: 'Ⅹ_呼吸器系の疾患',
      label: '呼吸器系 受療率(外来)',
      unit: '/10万対',
      note: '令和5年患者調査・人口10万対',
    },
    utilization: {
      label: '気管支拡張剤 処方proxy',
      basis: '薬効分類ベース',
      codes: ['225'],
      codeLabels: { '225': '気管支拡張剤' },
      unit: '/人口10万対',
      note: '気管支拡張剤(225)のみ採用。鎮咳剤(222)・去たん剤(223)・鎮咳去たん剤(224)は風邪等軽症処方が支配的のため未採用。「呼吸器疾患患者数」ではなく治療proxy',
      direction: 'higher_more',
    },
    supply: null,
    supplyNote: '呼吸器領域の供給proxyは v1 未整備。在宅医療算定は呼吸器特異性が低く(在宅酸素とは断定しない)、急性期/慢性期病床も呼吸器専用ではないため代理として不採用',
    outcome: {
      vitalCause: '肺炎',
      label: '肺炎 死亡率',
      unit: '/10万対',
      note: '粗死亡率・年齢調整前。呼吸器医療の質と直接結びつけない',
      additionalCauses: [
        { vitalCause: '誤嚥性肺炎', label: '誤嚥性肺炎 死亡率', unit: '/10万対' },
      ],
    },
  },
  // ════════════════════════════════════════════════════════════════════════════
  // 腎疾患 (renal) — v1 experimental, peer review 2026-04-28 採択
  // ════════════════════════════════════════════════════════════════════════════
  // 制約 (peer review 遵守):
  // - リスク: eGFR (健診受診者集団値、CKD診断率ではない注記)
  // - 疾病負荷: 患者調査ⅩⅣ_腎尿路生殖器系 (CKD専用ではない、結石・前立腺肥大含む)
  // - 医療利用: 未整備 (透析・人工腎臓 J038/J039 が ndb_diagnostics に未収載)
  // - 供給: 未整備 (透析・腎特化 capability 未抽出)
  // - 結果: 腎不全死亡率 (粗死亡率、年齢調整前)
  //
  // 禁止事項:
  // - ❌ 利尿剤(213) を腎proxyに使わない (循環器・心不全と重複)
  // - ❌ RAS阻害薬(214) を腎proxyに使わない (循環器・高血圧と重複)
  // - ❌ '罹患率' '供給不足' '腎臓医療の質' 断定
  renal: {
    id: 'renal',
    label: '腎疾患',
    icon: '🫘',
    color: '#8b5cf6',
    bg: '#f5f3ff',
    isExperimental: true,
    experimentalNote: '腎疾患領域はv1 experimental。透析・人工腎臓関連の医療利用proxyと供給capabilityが未整備のため、リスク(eGFR)・疾病負荷(受療率)・結果(腎不全死亡率)の3列のみ。',
    risk: {
      ndbHcMetric: 'eGFR',
      label: 'eGFR (推算糸球体濾過量)',
      unit: 'mL/min/1.73m²',
      direction: 'higher_better',
      note: 'NDB特定健診(40-74歳)受診者の集団平均値。eGFR低下=腎機能リスクの代理。CKD診断率ではない',
    },
    demand: {
      patientSurveyKey: 'ⅩⅣ_腎尿路生殖器系の疾患',
      label: '腎尿路生殖器系 受療率(外来)',
      unit: '/10万対',
      note: '令和5年患者調査・人口10万対。CKD専用ではなく、結石・前立腺肥大・腎盂腎炎等を含む',
    },
    utilization: null,
    utilizationNote: '腎疾患の医療利用proxyは v1 未整備。透析・人工腎臓 (J038/J039) が ndb_diagnostics に未収載のため。利尿剤・RAS阻害薬は循環器と重複するため不採用 (peer review遵守)',
    supply: null,
    supplyNote: '腎疾患の供給proxyは v1 未整備。透析・腎特化capabilityが施設基準に未抽出のため。dx_it (診療情報提供等) は腎特化ではないため誤読リスクが高く不採用',
    outcome: {
      vitalCause: '腎不全',
      label: '腎不全 死亡率',
      unit: '/10万対',
      note: '粗死亡率・年齢調整前。年齢構成の影響を強く受ける。腎臓医療の質と直接結びつけない',
    },
  },


};

// 比較ラベルの自然言語化
// referenceLabel: 比較対象の名称 ('全国平均' or '47都道府県平均' 等)
export function describeDelta(value, refValue, direction = 'higher_worse', threshold_low = 5, threshold_high = 15, referenceLabel = '全国平均') {
  if (value == null || refValue == null || refValue === 0) return null;
  const deltaPct = ((value / refValue - 1) * 100);
  const abs = Math.abs(deltaPct);
  let label, color;
  if (abs < threshold_low) { label = `${referenceLabel}と同程度`; color = '#64748b'; }
  else if (deltaPct > 0) {
    if (direction === 'higher_worse') {
      label = abs >= threshold_high ? `${referenceLabel}より顕著に高い` : `${referenceLabel}より高い`;
      color = abs >= threshold_high ? '#dc2626' : '#f59e0b';
    } else {
      label = abs >= threshold_high ? `${referenceLabel}より顕著に高い` : `${referenceLabel}より高い`;
      color = '#059669';
    }
  } else {
    if (direction === 'higher_worse') {
      label = abs >= threshold_high ? `${referenceLabel}より顕著に低い` : `${referenceLabel}より低い`;
      color = '#059669';
    } else {
      label = abs >= threshold_high ? `${referenceLabel}より顕著に低い` : `${referenceLabel}より低い`;
      color = '#f59e0b';
    }
  }
  return { deltaPct, label, color, referenceLabel };
}

// データ意味バッジ定義
export const DATA_BADGE = {
  risk: { label: '生活習慣リスク', bg: '#dbeafe', fg: '#1e40af' },
  demand: { label: '受療率', bg: '#fce7f3', fg: '#9f1239' },
  utilization: { label: '医療利用量', bg: '#cffafe', fg: '#155e75' },
  supply: { label: '供給proxy', bg: '#fef3c7', fg: '#92400e' },
  outcome: { label: '結果指標', bg: '#fee2e2', fg: '#991b1b' },
};
