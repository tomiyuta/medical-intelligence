/**
 * lib/dispersionMetrics.js
 *
 * Phase 4-3 R1: 47 県 dispersion KPI 計算ユーティリティ
 *
 * 目的: ユーザー観察「ガンだけ県差大、他は小さい」が data 上 完全に逆 (ガンが県差最小)
 *      である事実を UI で正しく伝えるため、CV / max-min 比 / IQR を計算。
 *
 * 用途:
 *   - NdbView Layer 5 死因構造の各 bar に dispersion KPI 併記
 *   - DomainSupplyDemandBridge の outcome 表示
 *   - 将来: 二次医療圏 menu (Phase 4-3c MENU_DESIGN.md)
 *
 * 関連 docs:
 *   - docs/ANALYSIS_MORTALITY_DISPERSION.md (体感と data の乖離)
 *   - docs/PHASE4_3_CANCER_SITES_ANALYSIS.md (5 大がん部位別)
 */

/**
 * 47 県 (or n 件) の値分布から dispersion KPI を計算
 * @param {Array<{pref?: string, value: number}|number>} data - 値の配列
 * @returns {{
 *   n: number,
 *   mean: number,
 *   sd: number,
 *   cv_pct: number,
 *   min: number,
 *   max: number,
 *   max_min_ratio: number,
 *   q1: number,
 *   median: number,
 *   q3: number,
 *   iqr: number,
 *   pref_max?: string,
 *   pref_min?: string,
 * } | null}
 */
export function computeDispersion(data) {
  if (!Array.isArray(data) || data.length < 2) return null;

  // 正規化: 数値配列 or オブジェクト配列を扱う
  const items = data.map(d => {
    if (typeof d === 'number') return { value: d };
    if (d && typeof d.value === 'number') return d;
    return null;
  }).filter(Boolean);

  if (items.length < 2) return null;

  const values = items.map(x => x.value);
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const cv_pct = mean !== 0 ? (sd / Math.abs(mean)) * 100 : 0;

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  const max_min_ratio = min > 0 ? max / min : null;

  // quartiles (linear interpolation, R-7 method)
  const quantile = (p) => {
    const h = (n - 1) * p;
    const i = Math.floor(h);
    return sorted[i] + (h - i) * (sorted[Math.min(i + 1, n - 1)] - sorted[i]);
  };
  const q1 = quantile(0.25);
  const median = quantile(0.5);
  const q3 = quantile(0.75);
  const iqr = q3 - q1;

  // pref_max/pref_min if items have pref labels
  const labeled = items.find(x => x.pref);
  let pref_max, pref_min;
  if (labeled) {
    pref_max = items.find(x => x.value === max)?.pref;
    pref_min = items.find(x => x.value === min)?.pref;
  }

  return {
    n,
    mean: round(mean, 2),
    sd: round(sd, 2),
    cv_pct: round(cv_pct, 2),
    min,
    max,
    max_min_ratio: max_min_ratio != null ? round(max_min_ratio, 3) : null,
    q1: round(q1, 2),
    median: round(median, 2),
    q3: round(q3, 2),
    iqr: round(iqr, 2),
    pref_max,
    pref_min,
  };
}

/**
 * vital_stats_pref の causes 配列から、特定の死因について 47 県 dispersion を計算
 * @param {Array<{pref:string, causes:Array<{cause:string, rate:number}>}>} prefectures
 * @param {string} causeNameLike - 死因名の部分一致 (例: 'がん' で 'がん(悪性新生物)' にマッチ)
 * @returns {dispersion | null}
 */
export function dispersionForCause(prefectures, causeNameLike) {
  if (!Array.isArray(prefectures)) return null;
  const data = [];
  for (const p of prefectures) {
    const c = p.causes?.find(x => x.cause.includes(causeNameLike));
    if (c?.rate != null) data.push({ pref: p.pref, value: c.rate });
  }
  return computeDispersion(data);
}

/**
 * dispersion を一目で読める短いラベル化
 * @returns {{ label_short: string, label_full: string, level: 'low'|'medium'|'high' }}
 */
export function classifyDispersion(disp) {
  if (!disp) return null;
  const cv = disp.cv_pct;
  let level;
  if (cv < 10) level = 'low';
  else if (cv < 20) level = 'medium';
  else level = 'high';

  const label_short = `CV ${cv.toFixed(1)}% / 比 ${disp.max_min_ratio?.toFixed(2) || '-'}`;
  const label_full = `47県分布: 平均 ${disp.mean}, SD ${disp.sd}, CV ${cv.toFixed(2)}%, max ${disp.max}(${disp.pref_max||''}) / min ${disp.min}(${disp.pref_min||''}), max-min 比 ${disp.max_min_ratio?.toFixed(2) || '-'}`;

  return { label_short, label_full, level };
}

function round(v, digits) {
  if (v == null || !isFinite(v)) return v;
  const m = Math.pow(10, digits);
  return Math.round(v * m) / m;
}
