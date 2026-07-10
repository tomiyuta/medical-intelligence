export const revalidate = 86400;
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' };

// demand_projection_r5.json(330二次医療圏 × 22 ICD章 × 入院/外来 × 2020-2050 の
// 受療率法による将来患者数推計)を都道府県(pref)単位に集約して返す。
// 1日平均患者数は圏合算が数学的に正当(医療需給総覧#30準拠)。
// lib/hsaData.js の demand(code) ビルダーが返す area 構造(inpatient/outpatient/
// diseases/national、各 {章名:{年:値}})を、areas[code].pref キーで束ねて足し合わせる。

let _cache = null;
function load() {
  if (!_cache) {
    _cache = JSON.parse(readFileSync(join(process.cwd(), 'data', 'static', 'demand_projection_r5.json'), 'utf-8'));
  }
  return _cache;
}

// series: { 年: 値 } を dest に加算
function addSeries(dest, series) {
  for (const y of Object.keys(series)) {
    const v = series[y];
    dest[y] = (dest[y] || 0) + (typeof v === 'number' ? v : 0);
  }
}

// src: { 章名: {年:値} } を dest に章単位で加算
function accCategoryMap(dest, src) {
  for (const cat of Object.keys(src)) {
    if (!dest[cat]) dest[cat] = {};
    addSeries(dest[cat], src[cat]);
  }
}

// 浮動小数の合算ノイズを丸める(元値は小数第1位)
function round1(obj) {
  for (const k of Object.keys(obj)) obj[k] = Math.round(obj[k] * 10) / 10;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pref = searchParams.get('pref');
  const d = load();
  const years = d.years;

  const matched = Object.entries(d.areas)
    .filter(([, a]) => !pref || a.pref === pref)
    .map(([code, a]) => ({ code, ...a }));

  const inpatient = {};
  const outpatient = {};
  const diseases = {};
  const national = { inpatient: {}, outpatient: {} };

  for (const a of matched) {
    accCategoryMap(inpatient, a.inpatient || {});
    accCategoryMap(outpatient, a.outpatient || {});
    for (const name of Object.keys(a.diseases || {})) {
      const io = a.diseases[name];
      if (!diseases[name]) diseases[name] = { inpatient: {}, outpatient: {} };
      if (io.inpatient) addSeries(diseases[name].inpatient, io.inpatient);
      if (io.outpatient) addSeries(diseases[name].outpatient, io.outpatient);
    }
    // national = 全国受療率を各圏の将来人口に適用した参考ベンチマーク(圏合算で県相当)
    if (a.national) {
      if (a.national.inpatient) addSeries(national.inpatient, a.national.inpatient);
      if (a.national.outpatient) addSeries(national.outpatient, a.national.outpatient);
    }
  }

  for (const cat of Object.keys(inpatient)) round1(inpatient[cat]);
  for (const cat of Object.keys(outpatient)) round1(outpatient[cat]);
  for (const name of Object.keys(diseases)) {
    round1(diseases[name].inpatient);
    round1(diseases[name].outpatient);
  }
  round1(national.inpatient);
  round1(national.outpatient);

  return NextResponse.json({
    ready: true,
    source: d.source,
    note: d.note,
    method: '受療率法(受療率固定・人口変動のみ反映)。1日平均患者数。患者住所地ベース。参考推計。',
    years,
    pref: pref || null,
    scope: pref ? 'prefecture' : 'all-areas',
    resolved: pref ? matched.length > 0 : null,
    areaCount: matched.length,
    inpatient,
    outpatient,
    diseases,
    national,
    nationalNote: 'national は全国受療率を各圏人口に適用した参考ベンチマークの圏合算(県actualとの対比用)。',
    areas: matched.map((a) => ({ code: a.code, area: a.area })),
  }, { headers: CACHE_HEADERS });
}
