// 医療圏カルテ 統合データ層。各静的JSONを一度だけ読み、二次医療圏コード単位で
// 全パネル分のデータを1バンドルにまとめる。API/シャード生成の単一ソース。
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const DIR = join(process.cwd(), 'data', 'static');
const _cache = {};
function load(file) {
  if (file in _cache) return _cache[file];
  const p = join(DIR, file);
  _cache[file] = existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null;
  return _cache[file];
}

// ── パネル別ビルダー（各APIの?code=... と同一の戻り値） ──

function overview(code) {
  const d = load('area_overview.json');
  if (!d) return null;
  const self = d.areas[code];
  if (!self) return { ready: true };
  const pref = d.prefs[self.pref] || null;
  return {
    ready: true, source: d.source, note: d.note, facSource: d.facSource, staffSource: d.staffSource,
    code, pref: self.pref, self,
    prefAreas: pref?.areas || [], prefTotal: pref?.total || null, national: d.national,
  };
}

function population(code) {
  const d = load('population_r5.json');
  if (!d) return { ready: false, area: null };
  return { ready: true, source: d.source, note: d.note, years: d.years, code, area: d.areas[code] || null };
}

function demand(code) {
  const d = load('demand_projection_r5.json');
  if (!d) return { ready: false, area: null };
  return { ready: true, source: d.source, note: d.note, years: d.years, code, area: d.areas[code] || null };
}

function care(code) {
  const d = load('care_projection_r5.json');
  if (!d) return { ready: false, area: null };
  return { ready: true, source: d.source, note: d.note, levels: d.levels, years: d.years, code, area: d.areas[code] || null };
}

function homecare(code) {
  const d = load('homecare_projection_r5.json');
  if (!d) return { ready: false };
  const self = d.areas[code];
  if (!self) return { ready: true, source: d.source };
  return { ready: true, source: d.source, note: d.note, code, ...self };
}

function physician(code) {
  const d = load('physician_distribution.json');
  if (!d) return { ready: false };
  const base = {
    ready: true, source: d.source, sourceUrl: d.sourceUrl, note: d.note,
    national: d.nationalIndex, thresholds: { majority: d.majorityThreshold, minority: d.minorityThreshold },
    areaCount: d.areaCount,
  };
  const area = d.areas[code];
  if (!area) return { ...base, code, area: null };
  const prefCode = code.slice(0, 2);
  const siblings = Object.entries(d.areas)
    .filter(([c]) => c.slice(0, 2) === prefCode)
    .map(([c, a]) => ({ code: c, area: a.area, index: a.index, classification: a.classification, rank: a.rank }))
    .sort((x, y) => x.code.localeCompare(y.code));
  return { ...base, code, area: { ...area, code }, pref: area.pref, prefIndex: area.prefIndex, siblings };
}

function specialty(code) {
  const d = load('physician_specialty_r6.json');
  if (!d) return { ready: false };
  const self = d.areas[code];
  if (!self) return { ready: true, source: d.source };
  return { ready: true, source: d.source, note: d.note, code, self, national: d.national };
}

function bed(code) {
  const data = load('bed_detail_r6.json');
  if (!data) return { ready: false, area: null };
  const area = data.areas[code] || null;
  let admFees = null;
  if (area) {
    const agg = {};
    for (const f of area.facilities)
      for (const [fee, beds] of Object.entries(f.admFees || {})) agg[fee] = (agg[fee] || 0) + beds;
    admFees = Object.entries(agg).map(([fee, beds]) => ({ fee, beds })).sort((a, b) => b.beds - a.beds);
  }
  const nec = load('bed_necessity_r6.json') || {};
  const necessity = (nec.areas && nec.areas[code]) || null;
  return { ready: true, source: data.source, published: data.published, note: data.note, code, area, admFees, necessity, necessitySource: nec.source };
}

function inpatient(code) {
  const d = load('hospital_report_r5.json');
  if (!d) return { ready: false };
  const self = d.areas[code];
  if (!self) return { ready: true, source: d.source };
  const prefCode = code.slice(0, 2);
  const siblings = Object.entries(d.areas).filter(([c]) => c.slice(0, 2) === prefCode)
    .sort((a, b) => a[0].localeCompare(b[0])).map(([c, a]) => ({ code: c, ...a }));
  return { ready: true, source: d.source, note: d.note, years: d.years, code, pref: self.pref, self, siblings, prefRow: d.prefs[prefCode] || null, national: d.national };
}

function designation(code) {
  const d = load('designation_r7.json');
  if (!d) return { ready: false };
  const self = d.areas[code];
  if (!self) return { ready: true, source: d.source };
  return { ready: true, source: d.source, note: d.note, labels: d.labels, order: d.order, code, ...self };
}

function emergency(code) {
  const d = load('emergency_r6.json');
  if (!d) return { ready: false, area: null };
  return { ready: true, source: d.source, published: d.published, note: d.note, code, area: d.areas[code] || null };
}

function dpc(code) {
  const d = load('dpc_mdc_r5.json');
  if (!d) return { ready: false, area: null };
  return { ready: true, source: d.source, note: d.note, mdcLabels: d.mdcLabels, code, area: d.areas[code] || null };
}

function surgery(code) {
  const d = load('surgery_projection_r5.json');
  if (!d) return { ready: false };
  const self = d.areas[code];
  if (!self) return { ready: true, source: d.source };
  return { ready: true, source: d.source, note: d.note, code, ...self };
}

function hospTrend(code) {
  const d = load('hospital_trend_r5.json');
  if (!d) return { ready: false };
  const self = d.areas[code];
  if (!self) return { ready: true, source: d.source };
  return { ready: true, source: d.source, note: d.note, years: d.years, code, ...self };
}

function dpcLosTrend(code) {
  const d = load('dpc_los_trend.json');
  if (!d) return { ready: false };
  const self = d.areas[code] || null;
  return { ready: true, source: d.source, note: d.note, years: d.years, code, self, prefs: d.prefs, national: d.national };
}

// ── 330圏 分布ノルム（サマリーカードの AreaStrip330 用）──
// 全指標×全圏の値を一度だけ構築し（モジュールキャッシュ）、どの圏の
// バンドルにも同一オブジェクトを同梱する。自圏はコード一致で client 側が定位。
let _norms = undefined;
function shortPref(p) {
  return p && (p.endsWith('都') || p.endsWith('府') || p.endsWith('県')) ? p.slice(0, -1) : p;
}
function buildNorms() {
  if (_norms !== undefined) return _norms;
  const pop = load('population_r5.json');
  const phy = load('physician_distribution.json');
  const nec = load('bed_necessity_r6.json');
  if (!pop) return (_norms = { ready: false });

  // ラベル辞書（「圏名·県」で全国一意・population を正典に）
  const labelByCode = {};
  for (const [c, a] of Object.entries(pop.areas)) labelByCode[c] = `${a.area}·${shortPref(a.pref)}`;
  const lab = (c, a) => labelByCode[c] || `${a.area}·${shortPref(a.pref)}`;

  // 1) 2050人口増減率  2) 2050高齢化率（全国tickは330圏の実合計から算出）
  const chgItems = [], ageItems = [];
  let sT2020 = 0, sT2050 = 0, sA65 = 0;
  for (const [c, a] of Object.entries(pop.areas)) {
    const y0 = a.years['2020'], y1 = a.years['2050'], label = labelByCode[c];
    if (y0 && y1 && y0.total) {
      chgItems.push({ code: c, label, value: Math.round((y1.total / y0.total - 1) * 1000) / 10 });
      sT2020 += y0.total; sT2050 += y1.total;
    }
    if (y1 && y1.total) {
      ageItems.push({ code: c, label, value: Math.round((y1.a65 || 0) / y1.total * 1000) / 10 });
      sA65 += (y1.a65 || 0);
    }
  }
  const natChg = sT2020 ? Math.round((sT2050 / sT2020 - 1) * 1000) / 10 : null;
  const natAge = sT2050 ? Math.round(sA65 / sT2050 * 1000) / 10 : null;

  // 3) 医師偏在指標（全国tick=公表全国値）
  const idxItems = [];
  if (phy) for (const [c, a] of Object.entries(phy.areas)) idxItems.push({ code: c, label: lab(c, a), value: a.index });
  const natIdx = phy?.nationalIndex ?? null;

  // 4) 病床過不足率 (2024実績−必要)/必要 ×100（326圏・全国tickは実合計）
  const balItems = [];
  let sCur = 0, sNeed = 0;
  if (nec) for (const [c, a] of Object.entries(nec.areas)) {
    const s = a.series?.['合計'];
    if (s && s['2024'] != null && s['必要']) {
      balItems.push({ code: c, label: lab(c, a), value: Math.round((s['2024'] - s['必要']) / s['必要'] * 1000) / 10 });
      sCur += s['2024']; sNeed += s['必要'];
    }
  }
  const natBal = sNeed ? Math.round((sCur - sNeed) / sNeed * 1000) / 10 : null;

  return (_norms = {
    ready: true, labelByCode,
    metrics: {
      pop2050chg:   { label: '2050人口増減率', unit: '%', badge: { label: '社人研R5', color: '#7c3aed' }, natAvg: natChg, items: chgItems },
      aging2050:    { label: '2050高齢化率',   unit: '%', badge: { label: '社人研R5', color: '#b45309' }, natAvg: natAge, items: ageItems },
      physicianIdx: { label: '医師偏在指標',   unit: '',  badge: { label: '医師偏在R6', color: '#2563EB' }, natAvg: natIdx, inverse: true, items: idxItems },
      bedBalance:   { label: '病床過不足率',   unit: '%', badge: { label: '地域医療構想', color: '#0891b2' }, natAvg: natBal, items: balItems },
    },
  });
}
function norms() { return buildNorms(); }

const BUILDERS = { overview, population, demand, care, homecare, physician, specialty, bed, inpatient, hospTrend, designation, emergency, dpc, dpcLosTrend, surgery, norms };

export function getAreaBundle(code) {
  const out = {};
  for (const [k, fn] of Object.entries(BUILDERS)) {
    try { out[k] = fn(code); } catch { out[k] = null; }
  }
  return out;
}

export const PANEL_KEYS = Object.keys(BUILDERS);
