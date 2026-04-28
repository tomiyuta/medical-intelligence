// Disease supply-demand domain mapping v0
// Scope: 循環器 / 糖尿病・代謝 / がん の3領域のみ
// 制約: スコア化なし、データ意味ラベル付き、自然言語比較
//
// "罹患率" "供給不足" は使用禁止。proxy未整備な領域は正直に表示する。

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
