export const revalidate = 86400;
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' };

// NDB第10回オープンデータ 特定健診 検査値階層別分布 (令和4年度) の v2 スキーマ
// (sex × age_group × bin_label を完全保持、19,973行/3.4MB)を、
// ?pref=&metric=&sex= でサーバ側に絞り込み、
//  ・選択県のビン別count
//  ・全国 = 47都道府県のcountサーバ合算(擬似県「都道府県判別不可」は除外)
// のみを数KBで返す。3.4MBのクライアント配信を回避する。

const PSEUDO_PREF = '都道府県判別不可';
const METRICS = ['BMI', 'HbA1c', '収縮期血圧', 'LDL', '尿蛋白'];
// 尿蛋白は順序尺度(数値パース不能)なので固定ランクで並べる
const URINE_ORDER = { '－': 0, '±': 1, '＋': 2, '＋＋': 3, '＋＋＋': 4 };

let _cache = null;
function load() {
  if (!_cache) {
    _cache = JSON.parse(readFileSync(join(process.cwd(), 'data', 'static', 'ndb_checkup_bins_v2.json'), 'utf-8'));
  }
  return _cache;
}

// ビンの臨床値昇順ソートキー。「X以上」はXを、「X未満」のみの最下位ビンは -Infinity。
function lowerBound(metric, label) {
  if (metric === '尿蛋白') return label in URINE_ORDER ? URINE_ORDER[label] : 999;
  const m = label.match(/([0-9]+(?:\.[0-9]+)?)以上/);
  if (m) return parseFloat(m[1]);
  return -Infinity;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pref = searchParams.get('pref');
  const metricParam = searchParams.get('metric');
  const sexParam = searchParams.get('sex');

  const d = load();
  const rows = d.data || [];

  const metricFilter = METRICS.includes(metricParam) ? metricParam : null;
  const sexFilter = (sexParam === 'male' || sexParam === 'female') ? sexParam : null;

  // metric|sex|age_group|bin_label で集計
  const agg = new Map();
  const keyOf = (m, s, a, b) => m + '|' + s + '|' + a + '|' + b;
  const ageSet = new Set();
  const binByMetric = {};

  for (const r of rows) {
    if (metricFilter && r.metric !== metricFilter) continue;
    if (sexFilter && r.sex !== sexFilter) continue;
    const isPseudo = r.pref === PSEUDO_PREF;
    ageSet.add(r.age_group);
    if (!binByMetric[r.metric]) binByMetric[r.metric] = new Set();
    binByMetric[r.metric].add(r.bin_label);

    const k = keyOf(r.metric, r.sex, r.age_group, r.bin_label);
    let cur = agg.get(k);
    if (!cur) {
      cur = { metric: r.metric, sex: r.sex, age_group: r.age_group, bin_label: r.bin_label, pref_count: 0, national_count: 0 };
      agg.set(k, cur);
    }
    if (!isPseudo) cur.national_count += r.count;              // 全国 = 47県合算(判別不可除外)
    if (pref && r.pref === pref) cur.pref_count += r.count;     // 選択県
  }

  const out = Array.from(agg.values());

  // 含まれる各metricのビン順序(臨床値昇順)
  const binOrder = {};
  for (const m of Object.keys(binByMetric)) {
    binOrder[m] = Array.from(binByMetric[m]).sort((a, b) => lowerBound(m, a) - lowerBound(m, b));
  }
  const ageGroups = Array.from(ageSet).sort();
  const prefResolved = pref ? out.some((r) => r.pref_count > 0) : false;

  return NextResponse.json({
    source: d.source,
    source_url: d.source_url,
    schema_version: d.schema_version,
    yearBadge: 'R4',
    pref: pref || null,
    prefResolved,
    metric: metricFilter,
    sex: sexFilter,
    metricsAvailable: METRICS,
    ageGroups,
    binOrder,
    excludedPseudoPref: PSEUDO_PREF,
    nationalPrefCount: 47,
    nationalNote: '全国は47都道府県のcountをサーバ側で合算(擬似県「都道府県判別不可」を除外)。公式全国集計とは微差の可能性。',
    denominatorNote: '分母=特定健診受診者(40-74歳)。住民全体ではない。比較は同性×同年齢帯同士に限る。',
    rowCount: out.length,
    rows: out,
  }, { headers: CACHE_HEADERS });
}
