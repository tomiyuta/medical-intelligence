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

const BUILDERS = { overview, population, demand, care, homecare, physician, specialty, bed, inpatient, hospTrend, designation, emergency, dpc, dpcLosTrend, surgery };

export function getAreaBundle(code) {
  const out = {};
  for (const [k, fn] of Object.entries(BUILDERS)) {
    try { out[k] = fn(code); } catch { out[k] = null; }
  }
  return out;
}

export const PANEL_KEYS = Object.keys(BUILDERS);
