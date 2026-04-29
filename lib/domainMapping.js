// Disease Supply-Demand Bridge domain mapping
//
// ════════════════════════════════════════════════════════════════════════════
// 🆙 Bridge Risk Model v1 — 2026-04-28 採択 (FROZEN v0 解除)
// ════════════════════════════════════════════════════════════════════════════
// 変更内容:
//   - `risk` (単一proxy) → `risks[]` (複数proxy配列) への移行
//   - 既存riskは `legacy: true` として保持
//   - 新規riskは NDB特定健診リスク率 / NDB質問票 から追加
//
// 解除理由:
//   今回の変更は表示項目の追加ではなく、Bridge core risk定義の構造変更である。
//   FROZEN v0 を維持したまま後方互換拡張として扱うのは不適切。
//   Bridge Risk Model v1 として記録する。
//
// 継承する v0 原則 (docs/BRIDGE_V1_INTERPRETATION.md 参照):
//   - 受療率 ≠ 罹患率
//   - 処方薬proxy ≠ 患者数
//   - 供給proxy ≠ 疾患専用供給
//   - 死亡率は粗死亡率 ≠ 医療の優劣
//   - Bridgeは異常検出ではなく仮説生成装置
//
// risks[] スキーマ:
//   {
//     source: 'ndbQ' | 'ndbHc' | 'ndbCheckupRiskRate',
//     ndbQKey?: string,       // 質問票キー
//     ndbHcMetric?: string,   // 健診平均値メトリック
//     riskKey?: string,       // checkup_risk_rates キー
//     label: string,
//     unit: string,
//     direction: 'higher_worse' | 'higher_better' | 'higher_more',
//     note: string,
//     legacy?: true,          // v0からの継承
//   }
// ════════════════════════════════════════════════════════════════════════════

export const DOMAIN_MAPPING = {
  cardiovascular: {
    id: 'cardiovascular',
    label: '循環器',
    icon: '❤️',
    color: '#dc2626',
    bg: '#fef2f2',
    risks: [
      {
        source: 'ndbCheckupRiskRate',
        riskKey: 'sbp_ge_140',
        label: '収縮期血圧 ≥140 mmHg',
        unit: '%',
        direction: 'higher_worse',
        note: 'NDB特定健診(40-74歳)受診者中、収縮期血圧140mmHg以上の比率(高血圧)',
      },
      {
        source: 'ndbCheckupRiskRate',
        riskKey: 'ldl_ge_140',
        label: 'LDLコレステロール ≥140 mg/dL',
        unit: '%',
        direction: 'higher_worse',
        note: 'NDB特定健診(40-74歳)受診者中、LDL140mg/dL以上の比率(脂質異常症)',
      },
      {
        source: 'ndbQ',
        ndbQKey: 'hypertension_med',
        label: '高血圧薬服用率',
        unit: '%',
        direction: 'higher_more',
        note: 'NDB質問票Q1。治療中の高血圧症患者比率。リスクではなく治療負荷proxy',
      },
      {
        source: 'ndbQ',
        ndbQKey: 'lipid_medication',
        label: '脂質異常症薬服用率',
        unit: '%',
        direction: 'higher_more',
        note: 'NDB質問票Q3。治療中の脂質異常症患者比率',
      },
      {
        source: 'ndbQ',
        ndbQKey: 'smoking',
        label: '喫煙率',
        unit: '%',
        direction: 'higher_worse',
        note: 'NDB特定健診質問票(40-74歳)',
        legacy: true,
      },
    ],
    demand: {
      patientSurveyKey: 'Ⅸ_循環器系の疾患',
      label: '循環器系 受療率(外来)',
      unit: '/10万対',
      note: '令和5年患者調査・人口10万対',
    },
    utilization: {
      label: '循環器関連薬 処方proxy',
      basis: '薬効分類ベース',
      codes: ['214', '218', '333'],
      codeLabels: { '214': '血圧降下剤', '218': '高脂血症用剤', '333': '血液凝固阻止剤' },
      unit: '/人口10万対',
      note: '降圧薬・脂質異常症薬・抗血栓薬の処方量proxy。循環器疾患患者数そのものではありません。',
      direction: 'higher_more',
    },
    supply: {
      bedFuncKeys: ['高度急性期', '急性期'],
      label: '高度急性期+急性期 床シェア',
      proxyLabel: '急性期・手術系供給proxy',
      unit: '%',
      note: '※循環器専用ではない。整形外科・外科・小児等を含む急性期全体の供給proxy',
    },
    outcome: {
      vitalCause: '心疾患',
      aamCause: '心疾患',
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
    risks: [
      {
        source: 'ndbCheckupRiskRate',
        riskKey: 'hba1c_ge_6_5',
        label: 'HbA1c ≥6.5%',
        unit: '%',
        direction: 'higher_worse',
        note: 'NDB特定健診(40-74歳)受診者中、HbA1c 6.5%以上の比率(糖尿病型)',
      },
      {
        source: 'ndbCheckupRiskRate',
        riskKey: 'bmi_ge_25',
        label: 'BMI ≥25 (肥満)',
        unit: '%',
        direction: 'higher_worse',
        note: 'NDB特定健診(40-74歳)受診者中、BMI 25以上の比率(肥満)',
      },
      {
        source: 'ndbQ',
        ndbQKey: 'diabetes_medication',
        label: '糖尿病薬・インスリン服用率',
        unit: '%',
        direction: 'higher_more',
        note: 'NDB質問票Q2。治療中の糖尿病患者比率',
      },
      {
        source: 'ndbQ',
        ndbQKey: 'weight_gain',
        label: '体重増加(過去3年5kg以上)',
        unit: '%',
        direction: 'higher_worse',
        note: 'NDB特定健診質問票・代謝リスクの代理proxy',
        legacy: true,
      },
    ],
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
    supply: null,
    supplyNote: '糖尿病・代謝の施設供給proxyは未整備（生活習慣病管理料等の届出細分類は v2 以降で検討）',
    outcome: {
      vitalCause: '糖尿病',
      aamCause: '糖尿病',
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
    risks: [
      {
        source: 'ndbQ',
        ndbQKey: 'smoking',
        label: '喫煙率',
        unit: '%',
        direction: 'higher_worse',
        note: 'NDB特定健診質問票・喫煙が主要risk factor',
        legacy: true,
      },
      {
        source: 'ndbQ',
        ndbQKey: 'heavy_drinker',
        label: '多量飲酒率',
        unit: '%',
        direction: 'higher_worse',
        note: 'NDB質問票・飲酒関連がん(食道・肝・大腸等)のrisk factor',
      },
    ],
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
      aamCause: '悪性新生物',
      label: '悪性新生物 死亡率',
      unit: '/10万対',
      note: '粗死亡率・年齢調整前',
    },
  },
  cerebrovascular: {
    id: 'cerebrovascular',
    label: '脳血管',
    icon: '🧠',
    color: '#0891b2',
    bg: '#ecfeff',
    isExperimental: true,
    experimentalNote: '脳血管領域はv1 experimental。受療率・薬剤proxyが未整備。リスクは血圧・脳卒中既往・喫煙の3点',
    risks: [
      {
        source: 'ndbCheckupRiskRate',
        riskKey: 'sbp_ge_140',
        label: '収縮期血圧 ≥140 mmHg',
        unit: '%',
        direction: 'higher_worse',
        note: 'NDB特定健診(40-74歳)受診者中、収縮期血圧140mmHg以上の比率。脳卒中の最大risk factor',
      },
      {
        source: 'ndbQ',
        ndbQKey: 'stroke_history',
        label: '脳卒中既往率',
        unit: '%',
        direction: 'higher_more',
        note: 'NDB質問票Q4。既往者比率(将来再発リスクproxy)',
      },
      {
        source: 'ndbQ',
        ndbQKey: 'smoking',
        label: '喫煙率',
        unit: '%',
        direction: 'higher_worse',
        note: '脳血管疾患の主要risk factor',
        legacy: true,
      },
    ],
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
      aamCause: '脳血管疾患',
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
    risks: [
      {
        source: 'ndbQ',
        ndbQKey: 'smoking',
        label: '喫煙率',
        unit: '%',
        direction: 'higher_worse',
        note: 'COPD・肺がん・呼吸器疾患の主要risk factor。喫煙率高=COPD多いと断定はしない',
        legacy: true,
      },
    ],
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
      aamCause: '肺炎',
      label: '肺炎 死亡率',
      unit: '/10万対',
      note: '粗死亡率・年齢調整前。呼吸器医療の質と直接結びつけない',
      additionalCauses: [
        { vitalCause: '誤嚥性肺炎', label: '誤嚥性肺炎 死亡率', unit: '/10万対' },
      ],
    },
  },
  renal: {
    id: 'renal',
    label: '腎疾患',
    icon: '🫘',
    color: '#8b5cf6',
    bg: '#f5f3ff',
    isExperimental: true,
    experimentalNote: '腎疾患領域はv1 experimental。透析・人工腎臓 (J038/J039) と供給capabilityが未整備',
    risks: [
      {
        source: 'ndbCheckupRiskRate',
        riskKey: 'urine_protein_ge_1plus',
        label: '尿蛋白 1+以上',
        unit: '%',
        direction: 'higher_worse',
        note: 'NDB特定健診(40-74歳)受診者中、尿蛋白定性1+以上の比率。CKDリスク補助',
      },
      {
        source: 'ndbHc',
        ndbHcMetric: 'eGFR',
        label: 'eGFR (推算糸球体濾過量)',
        unit: 'mL/min/1.73m²',
        direction: 'higher_better',
        note: 'NDB特定健診受診者の集団平均値。eGFR低下=腎機能リスクの代理。CKD診断率ではない',
        legacy: true,
      },
      {
        source: 'ndbQ',
        ndbQKey: 'ckd_history',
        label: 'CKD・腎不全既往率',
        unit: '%',
        direction: 'higher_more',
        note: 'NDB質問票Q6。既往者比率。未診断者を含まない',
      },
    ],
    demand: {
      patientSurveyKey: 'ⅩⅣ_腎尿路生殖器系の疾患',
      label: '腎尿路生殖器系 受療率(外来)',
      unit: '/10万対',
      note: '令和5年患者調査・人口10万対。CKD専用ではなく、結石・前立腺肥大・腎盂腎炎等を含む',
    },
    utilization: null,
    utilizationNote: '腎疾患の医療利用proxyは v1 未整備。透析・人工腎臓 (J038/J039) が ndb_diagnostics に未収載のため。利尿剤・RAS阻害薬は循環器と重複するため不採用 (peer review遵守)',
    supply: null,
    supplyNote: '腎疾患の供給proxyは v1 未整備。透析・腎特化capabilityが施設基準に未抽出のため',
    outcome: {
      vitalCause: '腎不全',
      aamCause: '腎不全',
      label: '腎不全 死亡率',
      unit: '/10万対',
      note: '粗死亡率・年齢調整前。年齢構成の影響を強く受ける。腎臓医療の質と直接結びつけない',
    },
  },
};

// 比較ラベルの自然言語化
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
    } else if (direction === 'higher_better') {
      label = abs >= threshold_high ? `${referenceLabel}より顕著に高い (良好)` : `${referenceLabel}より高い (良好)`;
      color = '#059669';
    } else {
      label = abs >= threshold_high ? `${referenceLabel}より顕著に高い` : `${referenceLabel}より高い`;
      color = '#059669';
    }
  } else {
    if (direction === 'higher_worse') {
      label = abs >= threshold_high ? `${referenceLabel}より顕著に低い` : `${referenceLabel}より低い`;
      color = '#059669';
    } else if (direction === 'higher_better') {
      label = abs >= threshold_high ? `${referenceLabel}より顕著に低い (注意)` : `${referenceLabel}より低い`;
      color = abs >= threshold_high ? '#dc2626' : '#f59e0b';
    } else {
      label = abs >= threshold_high ? `${referenceLabel}より顕著に低い` : `${referenceLabel}より低い`;
      color = '#dc2626';
    }
  }
  return { label, color, deltaPct };
}

export const DATA_BADGE = {
  risk: { label: 'リスク', bg: '#fef3c7', fg: '#92400e' },
  demand: { label: '疾病負荷', bg: '#fce7f3', fg: '#9f1239' },
  utilization: { label: '医療利用', bg: '#dbeafe', fg: '#1e3a8a' },
  supply: { label: '供給proxy', bg: '#dcfce7', fg: '#166534' },
  outcome: { label: '結果', bg: '#fee2e2', fg: '#991b1b' },
};
