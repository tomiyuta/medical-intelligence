// lib/sourceRegistry.js
// ════════════════════════════════════════════════════════════════════════════
// SOURCE_REGISTRY — 医療・疾病セクション データ源メタの単一ソース
// ════════════════════════════════════════════════════════════════════════════
//
// 目的:
//   全新規部品(PrefStrip47 / ドメインレンズ / マップエコー 等)が受け取る
//   `yearBadge` prop の唯一の出所。年度・出典・バッジ色を一箇所で定義し、
//   複数ビューにまたがる「点推定の脇に年度を必ず添える」文法を統一する。
//
// 年度の裏取り(2026-07-09 実データ確認済):
//   各エントリの year / fullYear は data/static/*.json の _source / source /
//   survey_year / year フィールドを直接 grep して確定。推測ハードコードでない。
//     - ndbQ/ndbHc/checkupRisk : ndb_questionnaire.json source="NDB第10回…令和4年度"
//     - ndbDiag/ndbRx          : NdbView L532/L575/L955「令和5年度レセプト」
//     - patientSurvey          : patient_survey_r5.json survey_year=2023
//     - vitalStats             : vital_stats_pref.json year=2024
//     - mortalityAdj           : age_adjusted_mortality_2020.json year=2020(2015(平成27年)モデル — データnotes「基準人口: 平成27年(2015年)モデル人口」)
//     - cancerSites            : cancer_sites_mortality_2024.json _year=2024
//     - agePyramid             : age_pyramid.json source="住民基本台帳 2025年1月1日"
//     - futureDemo             : future_demographics.json source="IPSS 2023" years=2020..2050
//     - bedFunc/medicalAreas   : bed_function_by_pref.json source="令和6年度病床機能報告"
//
// スキーマ (キー → メタ):
//   label     和名短縮 (バッジ本文・行ラベル用)
//   year      調査年の短縮表記   例 "R4" / "2024" / "2023" / "R6" / "2020–2050"
//   fullYear  正式年度・補足     例 "令和4年度" / "令和2年(2015年(平成27年)モデル人口)"
//   source    出典機関・調査名
//   url       公式URL (分かる範囲。データ内 source_url を優先採用)
//   color     バッジ基調色 hex (#RRGGBB)
//
// ════════════════════════════════════════════════════════════════════════════

export const SOURCE_REGISTRY = {
  // ── NDB 特定健診 (令和4年度 = R4) ──────────────────────────────────────────
  ndbQ: {
    label: '特定健診質問票',
    year: 'R4',
    fullYear: '令和4年度',
    source: 'NDB第10回オープンデータ 特定健診 質問票 (40-74歳)',
    url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177182.html',
    color: '#0891b2',
  },
  ndbHc: {
    label: '特定健診検査値',
    year: 'R4',
    fullYear: '令和4年度',
    source: 'NDB第10回オープンデータ 特定健診 検査値 (40-74歳)',
    url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177182.html',
    color: '#0e7490',
  },
  checkupRisk: {
    label: '健診リスク該当率',
    year: 'R4',
    fullYear: '令和4年度',
    source: 'NDB第10回オープンデータ 特定健診 リスク該当者率 (派生)',
    url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177182.html',
    color: '#ea580c',
  },

  // ── NDB レセプト (令和5年度 = R5) ──────────────────────────────────────────
  ndbDiag: {
    label: '診療行為(NDB)',
    year: 'R5',
    fullYear: '令和5年度',
    source: 'NDB第10回オープンデータ 医科診療行為 算定回数',
    url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177182.html',
    color: '#2563EB',
  },
  ndbRx: {
    label: '処方(NDB)',
    year: 'R5',
    fullYear: '令和5年度',
    source: 'NDB第10回オープンデータ 処方 数量',
    url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177182.html',
    color: '#1d4ed8',
  },

  // ── 患者調査 (令和5年 = 2023) ──────────────────────────────────────────────
  patientSurvey: {
    label: '患者調査',
    year: '2023',
    fullYear: '令和5年 (標本推計)',
    source: '厚生労働省 令和5年患者調査 都道府県編',
    url: 'https://www.mhlw.go.jp/toukei/list/10-20.html',
    color: '#9f1239',
  },

  // ── 人口動態統計 (2024 確定数) ─────────────────────────────────────────────
  vitalStats: {
    label: '人口動態統計',
    year: '2024',
    fullYear: '2024年確定数',
    source: '厚生労働省 人口動態統計 2024年確定数',
    url: 'https://www.mhlw.go.jp/toukei/list/81-1a.html',
    color: '#dc2626',
  },

  // ── 年齢調整死亡率 (令和2年 = 2020 / 2015年(平成27年)モデル人口) ────────────
  // ※旧表記「1985年モデル人口」は誤り。mortality_outcome_2020.json notes
  //   「基準人口: 平成27年(2015年)モデル人口」が正（2026-07-09 手順0(c)修正）。
  mortalityAdj: {
    label: '年齢調整死亡率',
    year: '2020',
    fullYear: '令和2年 (2015年(平成27年)モデル人口)',
    source: '令和5年度人口動態統計特殊報告 令和2年都道府県別年齢調整死亡率',
    url: 'https://www.mhlw.go.jp/toukei/saikin/hw/jinkou/other/20sibou/index.html',
    color: '#991b1b',
  },

  // ── がん 75歳未満年齢調整死亡率 (2024) ─────────────────────────────────────
  cancerSites: {
    label: 'がん死亡(75歳未満ASR)',
    year: '2024',
    fullYear: '2024年 (75歳未満・1985年モデル人口)',
    source: '国立がん研究センター がん情報サービス',
    url: 'https://ganjoho.jp/reg_stat/statistics/data/dl/index.html',
    color: '#be123c',
  },

  // ── 人口 (住民基本台帳 2025年1月1日) ───────────────────────────────────────
  agePyramid: {
    label: '住民基本台帳',
    year: '2025',
    fullYear: '2025年1月1日 (実測)',
    source: '総務省 住民基本台帳 年齢階級別人口',
    url: 'https://www.soumu.go.jp/main_sosiki/jichi_gyosei/daityo/jinkou_jinkoudoutai-setaisuu.html',
    color: '#6366f1',
  },

  // ── 将来人口推計 (社人研 2023 / 2020→2050) ────────────────────────────────
  futureDemo: {
    label: '将来人口推計(社人研)',
    year: '2020–2050',
    fullYear: '社人研2023推計 (基準年2020)',
    source: '国立社会保障・人口問題研究所 (IPSS) 地域別将来推計人口',
    url: 'https://www.ipss.go.jp/pp-fuken/j/fuken2023/t-page.asp',
    color: '#7c3aed',
  },

  // ── 病床機能報告 (令和6年度 = R6 / 2024年7月1日時点) ──────────────────────
  bedFunc: {
    label: '病床機能報告',
    year: 'R6',
    fullYear: '令和6年度 (2024年7月1日時点)',
    source: '厚生労働省 令和6年度病床機能報告',
    url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000055891.html',
    color: '#166534',
  },
  medicalAreas: {
    label: '病床機能報告(医療圏)',
    year: 'R6',
    fullYear: '令和6年度 (2024年7月1日時点)',
    source: '厚生労働省 令和6年度病床機能報告 二次医療圏別',
    url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000055891.html',
    color: '#15803d',
  },
};

// 既知キー一覧 (バリデーション・イテレーション用)
export const SOURCE_KEYS = Object.keys(SOURCE_REGISTRY);

// 未知キー時のフォールバック (バッジは灰色 + "?" 年度)
const UNKNOWN_SOURCE = {
  label: '出典不明',
  year: '—',
  fullYear: '',
  source: '',
  url: '',
  color: '#94a3b8',
};

/**
 * キーからデータ源メタを引く。
 * @param {string} key - SOURCE_REGISTRY のキー (例 'ndbQ')
 * @returns {{label:string,year:string,fullYear:string,source:string,url:string,color:string}}
 *          未知キーは UNKNOWN_SOURCE を返す (throw しない = 描画を止めない)。
 */
export function getSource(key) {
  const entry = SOURCE_REGISTRY[key];
  if (!entry) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`[sourceRegistry] unknown source key: ${JSON.stringify(key)}`);
    }
    return { ...UNKNOWN_SOURCE };
  }
  return entry;
}

// 16進 #RRGGBB に 2桁アルファを付す (#RRGGBBAA)。CSS で軽い塗り/枠に使う。
function withAlpha(hex, alphaHex) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  return hex + alphaHex;
}

/**
 * SourceBadge 部品向けの派生メタ。
 * getSource の生メタに、淡色背景 (bg)・枠色 (border)・ツールチップ文言 (title) を付す。
 * バッジ実装は次フェーズだが、色計算をここに集約して各所での再発明を防ぐ。
 * @param {string} key
 * @returns {{key:string,label:string,year:string,fullYear:string,source:string,url:string,
 *            color:string,bg:string,border:string,title:string}}
 */
export function getSourceBadge(key) {
  const s = getSource(key);
  const title = [s.source, s.fullYear].filter(Boolean).join(' / ') || s.label;
  return {
    key,
    label: s.label,
    year: s.year,
    fullYear: s.fullYear,
    source: s.source,
    url: s.url,
    color: s.color,
    bg: withAlpha(s.color, '14'),      // ~8% 濃度の下地
    border: withAlpha(s.color, '33'),  // ~20% 濃度の枠
    title,                             // hover ツールチップ用 (出典 / 年度)
  };
}

export default SOURCE_REGISTRY;
