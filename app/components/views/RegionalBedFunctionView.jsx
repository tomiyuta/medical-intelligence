'use client';
import { useState, useEffect, useMemo } from 'react';
import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceArea, ReferenceLine, ReferenceDot } from 'recharts';
import { fmt, sortPrefs } from '../shared';
import InterpretationGuard from '../ui/InterpretationGuard';
import PrefStrip47 from '../ui/PrefStrip47';
import PrefChoropleth from '../ui/PrefChoropleth';
import { getSourceBadge } from '../../../lib/sourceRegistry';

const FUNC_COLORS = {
  '高度急性期': '#dc2626',
  '急性期': '#f59e0b',
  '回復期': '#059669',
  '慢性期': '#2563eb',
};
const ACTIVE_FUNCS = ['高度急性期', '急性期', '回復期', '慢性期'];

// ════════════════════════════════════════════════════════════════════════════
// 在宅移行 補助分類 (v1, peer review 2026-04-28 採択)
// ════════════════════════════════════════════════════════════════════════════
// v1 改善 (vs v0):
// - 3指標 → 5指標化 (cap.homecare/cap.rehab/75+ を追加)
// - 二値high/low → 三値 high/neutral/low (±5% neutral zone)
// - 病床シェア → 75歳以上人口あたり病床数 (絶対供給量) へ変更
// - mixed/中間型 が自然に発生 (peer review #2 補正反映)
//
// Gate: 75歳以上割合 ≥ 47県平均 → 高齢化県のみ判定対象
// 5指標を high/neutral/low に三値化 (47県平均比 ±5%)
// high≥3 → 在宅移行支援型の可能性
// low≥3  → 在宅移行ギャップ型の可能性
// それ以外 → 中間型/判定保留
// 表現は必ず「可能性」とし、断定しない
const NEUTRAL_PCT = 5;
function classifyHomecareType(stats) {
  if (!stats) return null;
  const { share75plus, share75plus_natAvg } = stats;
  if (share75plus == null || share75plus_natAvg == null) return null;

  const isAging = share75plus >= share75plus_natAvg;
  if (!isAging) return { type:'該当なし', subType:'gate_not_aging', icon:'➖', color:'#94a3b8', desc:'75歳以上割合が全国平均未満のため、本分類は判定対象外', signals:[] };

  const indicators = [
    { key:'ndb', label:'NDB在宅医療(75+10万対)', value:stats.m1_ndb, ref:stats.m1_ndb_avg },
    { key:'rec', label:'回復期病床/75+10万対', value:stats.m2_recovery_beds, ref:stats.m2_recovery_beds_avg },
    { key:'chr', label:'慢性期病床/75+10万対', value:stats.m3_chronic_beds, ref:stats.m3_chronic_beds_avg },
    { key:'hcc', label:'cap.homecare/75+10万対', value:stats.m4_homecare_cap, ref:stats.m4_homecare_cap_avg },
    { key:'rhc', label:'cap.rehab/75+10万対', value:stats.m5_rehab_cap, ref:stats.m5_rehab_cap_avg },
  ];

  const signals = [];
  let high = 0, neutral = 0, low = 0;
  for (const ind of indicators) {
    if (ind.value == null || ind.ref == null || ind.ref === 0) continue;
    const deltaPct = (ind.value/ind.ref - 1) * 100;
    let level;
    if (deltaPct > NEUTRAL_PCT) { level = 'high'; high++; }
    else if (deltaPct < -NEUTRAL_PCT) { level = 'low'; low++; }
    else { level = 'neutral'; neutral++; }
    signals.push({ name:ind.label, value:ind.value, ref:ind.ref, level, delta:deltaPct.toFixed(1) });
  }
  if (signals.length === 0) return null;

  if (high >= 3) {
    return { type:'在宅移行支援型の可能性', subType:'support', color:'#059669', icon:'🏠', desc:`75歳以上割合が全国平均以上(${share75plus.toFixed(1)}%) かつ 5指標中 ${high}/${signals.length} が47県平均より明確に高い (>+${NEUTRAL_PCT}%)。在宅・退院後受け皿が比較的厚い構造の可能性。`, signals, counts:{high, neutral, low} };
  }
  if (low >= 3) {
    return { type:'在宅移行ギャップ型の可能性', subType:'gap', color:'#dc2626', icon:'⚠️', desc:`75歳以上割合が全国平均以上(${share75plus.toFixed(1)}%) かつ 5指標中 ${low}/${signals.length} が47県平均より明確に低い (<-${NEUTRAL_PCT}%)。高齢化に対し在宅・退院後受け皿が薄い可能性 — 追加検証要。`, signals, counts:{high, neutral, low} };
  }
  return { type:'中間型/判定保留', subType:'mixed', color:'#64748b', icon:'➖', desc:`75歳以上割合は全国平均以上だが、5指標が high=${high}/neutral=${neutral}/low=${low} で拮抗 (どちらも3未満)。明確な支援型・ギャップ型判定は保留。`, signals, counts:{high, neutral, low} };
}

// 地域類型 (5-pattern, 優先順位順に評価)
function classifyRegion(prefShares, natShares, beds_per_75plus, nat_beds_per_75plus) {
  if (!prefShares) return null;
  const dHi = prefShares['高度急性期'] - natShares['高度急性期'];
  const dCh = prefShares['慢性期'] - natShares['慢性期'];
  const dRe = prefShares['回復期'] - natShares['回復期'];
  const acuteShare = prefShares['急性期'];
  const supplyRatio = (beds_per_75plus && nat_beds_per_75plus)
    ? beds_per_75plus / nat_beds_per_75plus
    : null;

  // 優先順位:供給薄型 > 大都市・高機能集中型 > 急性期偏重型 > 高齢化・慢性期型 > 回復期補完型 > 標準型
  if (supplyRatio != null && supplyRatio < 0.85) {
    return { type:'供給薄型の可能性', color:'#dc2626', desc:'75歳以上人口に対する病床数が全国平均の0.85倍未満。アクセス・在宅代替の確認が示唆される。', icon:'⚠️' };
  }
  if (dHi > 2) {
    return { type:'大都市・高機能集中型', color:'#7c3aed', desc:`高度急性期シェアが全国比 +${dHi.toFixed(1)}pt。大学病院・専門病院の集積する大都市型の傾向。`, icon:'🏙️' };
  }
  if (acuteShare > 50) {
    return { type:'急性期偏重型の傾向', color:'#f59e0b', desc:`急性期シェアが${acuteShare.toFixed(1)}%と過半。回復期・慢性期とのバランスは要確認。`, icon:'⚖️' };
  }
  if (dCh > 5) {
    return { type:'高齢化・慢性期型の傾向', color:'#2563eb', desc:`慢性期シェアが全国比 +${dCh.toFixed(1)}pt。長期療養・慢性疾患需要が相対的に大きい構造。`, icon:'🌿' };
  }
  if (dRe > 3) {
    return { type:'回復期補完型の傾向', color:'#059669', desc:`回復期シェアが全国比 +${dRe.toFixed(1)}pt。脳卒中・整形後の受け皿が厚めの構造。`, icon:'🔄' };
  }
  return { type:'標準型', color:'#64748b', desc:'機能配分は全国平均に近い。', icon:'➖' };
}

export default function RegionalBedFunctionView({ mob, bedFunc, regPref, setRegPref, agePyramid, ndbDiag, homecareCapability, japanMap }) {
  const isNational = !regPref || regPref === '全国';
  const bf = bedFunc?.prefectures?.[regPref];
  const bfNat = bedFunc?.national;

  // 47県ストリップ／地図 の hover同期・◆ピン state（確立済 PrefStrip47 文法）
  const [hoverPref, setHoverPref] = useState(null);
  const [pinnedPref, setPinnedPref] = useState(null);

  const computeShares = (d) => {
    if (!d) return null;
    const total = d['総床数'] || 0;
    if (total === 0) return null;
    return ACTIVE_FUNCS.reduce((acc, f) => { acc[f] = (d[f]?.beds || 0) / total * 100; return acc; }, {});
  };
  const prefShares = isNational ? null : computeShares(bf);
  const natShares = computeShares(bfNat);

  const allPrefs = bedFunc?.prefectures ? sortPrefs(Object.keys(bedFunc.prefectures)) : [];

  // 75歳以上人口の集計 (agePyramid: 21年齢帯, idx 15-=75-79, 17=85-89...)
  const compute75plus = (prefName) => {
    if (!agePyramid) return null;
    const ap = prefName === '全国' ? agePyramid.national : agePyramid.prefectures?.[prefName];
    if (!ap?.male || !ap?.female) return null;
    let sum = 0;
    for (let i = 15; i < ap.male.length; i++) sum += (ap.male[i] || 0) + (ap.female[i] || 0);
    return sum;
  };
  const pop75 = isNational ? compute75plus('全国') : compute75plus(regPref);
  const totalBeds = bf?.['総床数'] || (isNational ? bfNat?.['総床数'] : null);
  const beds_per_75plus = (totalBeds && pop75) ? (totalBeds / pop75 * 100000) : null;

  // 全国基準
  const nat_pop75 = compute75plus('全国');
  const nat_total = bfNat?.['総床数'];
  const nat_beds_per_75plus = (nat_total && nat_pop75) ? (nat_total / nat_pop75 * 100000) : null;

  // ── 47県 機能別シェア分布（#3 PrefStrip47 4行帯 用） ──
  // bedFunc.prefectures 全47県から各機能の床数シェア(%)を算出。追加取得ゼロ。
  const funcStrips = useMemo(() => {
    const prefs = bedFunc?.prefectures || {};
    const out = { '高度急性期': [], '急性期': [], '回復期': [], '慢性期': [] };
    Object.keys(prefs).forEach(pp => {
      const d = prefs[pp];
      const total = d?.['総床数'] || 0;
      if (!total) return;
      ACTIVE_FUNCS.forEach(f => {
        out[f].push({ pref: pp, value: (d[f]?.beds || 0) / total * 100 });
      });
    });
    return out;
  }, [bedFunc]);

  // ── 75+あたり病床数 の47県 valueByPref（#6 PrefChoropleth 用） ──
  // 分子=総床数(bedFunc)／分母=75歳以上人口(agePyramid idx15-)。両者とも実在確認済。
  const bedsPer75ByPref = useMemo(() => {
    const prefs = bedFunc?.prefectures || {};
    const aps = agePyramid?.prefectures || {};
    const out = {};
    Object.keys(prefs).forEach(pp => {
      const total = prefs[pp]?.['総床数'] || 0;
      const ap = aps[pp];
      if (!total || !ap?.male || !ap?.female) return;
      let p75 = 0;
      for (let i = 15; i < ap.male.length; i++) p75 += (ap.male[i] || 0) + (ap.female[i] || 0);
      if (p75 > 0) out[pp] = total / p75 * 100000;
    });
    return out;
  }, [bedFunc, agePyramid]);

  // 全ストリップ／地図 共通props（onJump/onSelect=setRegPref=globalPref直結）
  const stripCommon = {
    selected: isNational ? null : regPref,
    pinned: pinnedPref,
    hoverPref,
    onHover: setHoverPref,
    onPin: (p) => setPinnedPref(prev => prev === p ? null : p),
    onJump: (p) => setRegPref && setRegPref(p),
  };

  // 病棟数集計
  const totalWards = bf
    ? ACTIVE_FUNCS.reduce((s, f) => s + (bf[f]?.wards || 0), 0)
    : (bfNat ? ACTIVE_FUNCS.reduce((s, f) => s + (bfNat[f]?.wards || 0), 0) : null);

  const region = !isNational ? classifyRegion(prefShares, natShares, beds_per_75plus, nat_beds_per_75plus) : null;

  // 47県平均 (v1 在宅文脈型判定の reference, 5指標)
  const compute47Avg = () => {
    try {
      if (!agePyramid?.prefectures || !bedFunc?.prefectures || !Array.isArray(ndbDiag)) return null;
      const prefs = Object.keys(agePyramid.prefectures);
      let s75Sum = 0, s75N = 0;
      let m1Sum = 0, m1N = 0, m2Sum = 0, m2N = 0, m3Sum = 0, m3N = 0, m4Sum = 0, m4N = 0, m5Sum = 0, m5N = 0;
      prefs.forEach(pp => {
        const ap = agePyramid.prefectures[pp];
        if (!ap || !Array.isArray(ap.male) || !Array.isArray(ap.female)) return;
        const tot = ap.male.reduce((a,b)=>a+(b||0),0) + ap.female.reduce((a,b)=>a+(b||0),0);
        const p75 = ap.male.slice(15).reduce((a,b)=>a+(b||0),0) + ap.female.slice(15).reduce((a,b)=>a+(b||0),0);
        if (tot > 0) { s75Sum += p75/tot*100; s75N++; }
        if (p75 > 0) {
          const ndbRec = ndbDiag.find(d => d && d.category === 'C_在宅医療' && d.prefecture === pp);
          if (ndbRec) { m1Sum += (ndbRec.total_claims||0)/p75*100000; m1N++; }
          const bd = bedFunc.prefectures[pp];
          if (bd && bd['回復期'] && bd['慢性期']) {
            m2Sum += (bd['回復期'].beds||0)/p75*100000; m2N++;
            m3Sum += (bd['慢性期'].beds||0)/p75*100000; m3N++;
          }
          const hc = homecareCapability?.by_prefecture?.[pp];
          if (hc) {
            if (hc.homecare_per75 != null) { m4Sum += hc.homecare_per75; m4N++; }
            if (hc.rehab_per75 != null) { m5Sum += hc.rehab_per75; m5N++; }
          }
        }
      });
      return {
        share75plus_natAvg: s75N ? s75Sum/s75N : null,
        m1_ndb_avg: m1N ? m1Sum/m1N : null,
        m2_recovery_beds_avg: m2N ? m2Sum/m2N : null,
        m3_chronic_beds_avg: m3N ? m3Sum/m3N : null,
        m4_homecare_cap_avg: m4N ? m4Sum/m4N : null,
        m5_rehab_cap_avg: m5N ? m5Sum/m5N : null,
      };
    } catch (e) {
      console.error('compute47Avg v1 failed:', e);
      return null;
    }
  };

  let homecareType = null;
  try {
    if (!isNational && agePyramid?.prefectures?.[regPref] && Array.isArray(ndbDiag) && ndbDiag.length > 0) {
      const ap = agePyramid.prefectures[regPref];
      const bd = bedFunc?.prefectures?.[regPref];
      const hc = homecareCapability?.by_prefecture?.[regPref];
      if (ap && Array.isArray(ap.male) && Array.isArray(ap.female) && bd) {
        const tot = ap.male.reduce((a,b)=>a+(b||0),0) + ap.female.reduce((a,b)=>a+(b||0),0);
        const p75 = ap.male.slice(15).reduce((a,b)=>a+(b||0),0) + ap.female.slice(15).reduce((a,b)=>a+(b||0),0);
        const share75 = tot > 0 ? p75/tot*100 : null;
        const ndbRec = ndbDiag.find(d => d && d.category === 'C_在宅医療' && d.prefecture === regPref);
        const m1_ndb = (ndbRec && p75 > 0) ? ndbRec.total_claims/p75*100000 : null;
        const m2_recovery_beds = (bd['回復期'] && p75 > 0) ? bd['回復期'].beds/p75*100000 : null;
        const m3_chronic_beds = (bd['慢性期'] && p75 > 0) ? bd['慢性期'].beds/p75*100000 : null;
        const m4_homecare_cap = hc?.homecare_per75 ?? null;
        const m5_rehab_cap = hc?.rehab_per75 ?? null;
        const ref = compute47Avg();
        if (ref) {
          homecareType = classifyHomecareType({
            share75plus: share75,
            share75plus_natAvg: ref.share75plus_natAvg,
            m1_ndb, m1_ndb_avg: ref.m1_ndb_avg,
            m2_recovery_beds, m2_recovery_beds_avg: ref.m2_recovery_beds_avg,
            m3_chronic_beds, m3_chronic_beds_avg: ref.m3_chronic_beds_avg,
            m4_homecare_cap, m4_homecare_cap_avg: ref.m4_homecare_cap_avg,
            m5_rehab_cap, m5_rehab_cap_avg: ref.m5_rehab_cap_avg,
          });
        }
      }
    }
  } catch (e) {
    console.error('homecareType v1 calc failed:', e);
    homecareType = null;
  }

  // ════════════════════════════════════════════════════════════════════════
  // rank7: 病床供給 × 将来入院需要クロスオーバー
  // ════════════════════════════════════════════════════════════════════════
  // 供給帯 = 4機能(高度急性期/急性期/回復期/慢性期)の病床数のみ。休棟2種は除外。
  const supplyBeds = useMemo(() => {
    const src = bf || (isNational ? bfNat : null);
    if (!src) return null;
    let s = 0, any = false;
    for (const f of ACTIVE_FUNCS) {
      const b = src[f]?.beds;
      if (typeof b === 'number') { s += b; any = true; }
    }
    return any ? s : null;
  }, [bf, bfNat, isNational]);

  // 将来入院需要(1日平均在院患者数, 2020-2050)を県集約 API から取得
  const [demandProj, setDemandProj] = useState(null);
  const [demandLoading, setDemandLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setDemandProj(null);
    setDemandLoading(true);
    // 全国(regPref=null)は pref 無指定=全圏合算 で全国相当の需要を取得
    const q = isNational ? '' : encodeURIComponent(regPref);
    fetch(`/api/demand-projection/pref?pref=${q}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive) { setDemandProj(j); setDemandLoading(false); } })
      .catch(() => { if (alive) { setDemandProj(null); setDemandLoading(false); } });
    return () => { alive = false; };
  }, [regPref, isNational]);

  const demandModel = useMemo(() => {
    if (!demandProj || !Array.isArray(demandProj.years)) return null;
    const series = demandProj.inpatient?.['総数'];
    if (!series) return null;
    const rows = demandProj.years.map(y => {
      const ys = String(y);
      const demand = typeof series[ys] === 'number' ? series[ys] : null;
      const ratio = (demand != null && supplyBeds) ? (demand / supplyBeds * 100) : null;
      return { year: ys, yearNum: y, demand, ratio, projected: y >= 2025 };
    });
    const valid = rows.filter(r => r.demand != null);
    if (valid.length === 0) return null;
    // 需要ピーク年(reduce)
    const peak = valid.reduce((a, b) => (b.demand > a.demand ? b : a), valid[0]);
    // 供給とのクロスオーバー(需要が現在病床を最初に上回る年)
    const cross = (supplyBeds != null) ? (valid.find(r => r.demand > supplyBeds) || null) : null;
    const lastProjYear = rows[rows.length - 1]?.year;
    return { rows, peak, cross, lastProjYear, source: demandProj.source, note: demandProj.note, method: demandProj.method };
  }, [demandProj, supplyBeds]);

  const bedBadge = getSourceBadge('bedFunc');
  const stripYb = { label: bedBadge.year, color: bedBadge.color }; // PrefStrip47/PrefChoropleth 必須 yearBadge

  // 需要/病床比 の Y ドメイン上限(供給ラインが必ず入るよう余白確保)
  const demandYMax = useMemo(() => {
    if (!demandModel) return null;
    const dmax = Math.max(...demandModel.rows.map(r => r.demand || 0));
    const top = Math.max(dmax, supplyBeds || 0);
    return Math.ceil(top * 1.12 / 1000) * 1000;
  }, [demandModel, supplyBeds]);

  const DemandTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0]?.payload;
    if (!p || p.demand == null) return null;
    return (
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 11px', fontSize:11.5, boxShadow:'0 2px 8px rgba(0,0,0,0.08)' }}>
        <div style={{ fontWeight:700, color:'#1e293b', marginBottom:3 }}>{label}年{p.projected && <span style={{ marginLeft:5, fontSize:9, color:'#b45309', fontWeight:600 }}>参考推計</span>}</div>
        <div style={{ color:'#2563eb', fontWeight:600 }}>入院需要 {fmt(Math.round(p.demand))} <span style={{ color:'#94a3b8', fontWeight:500 }}>人/日</span></div>
        {supplyBeds != null && <div style={{ color:'#166534', fontWeight:600 }}>現在病床(4機能) {fmt(supplyBeds)} <span style={{ color:'#94a3b8', fontWeight:500 }}>床</span></div>}
        {p.ratio != null && <div style={{ marginTop:2, color:'#64748b' }}>需要/病床比 <b>{p.ratio.toFixed(0)}%</b> <span style={{ fontSize:9, color:'#94a3b8' }}>(参考値)</span></div>}
      </div>
    );
  };

  return <>
  {/* Header */}
  <div style={{marginBottom:20}}>
    <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Regional Bed Function</div>
    <h1 style={{fontSize:mob?20:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>地域医療構想・病床機能</h1>
    <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>R6病床機能報告に基づく、地域の医療提供体制(機能配分・規模・75歳以上人口あたり供給)の俯瞰</p>
  </div>

  {/* Pref selector */}
  <div style={{display:'flex',gap:8,marginBottom:20,alignItems:'center',flexWrap:'wrap'}}>
    <select value={regPref || '全国'} onChange={e => setRegPref && setRegPref(e.target.value === '全国' ? null : e.target.value)} style={{padding:'10px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:14,background:'#fff',fontWeight:600}}>
      <option value="全国">全国</option>
      {allPrefs.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  </div>

  {/* KPI Grid (5指標) */}
  {(bf || bfNat) && (
    <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(5,1fr)',gap:10,marginBottom:16}}>
      {[
        {l:'総床数', v: totalBeds ? fmt(totalBeds) : '—', sub:'許可病床(一般+療養)', c:'#2563eb'},
        {l:'病棟数', v: totalWards ? fmt(totalWards) : '—', sub:'4機能合計', c:'#059669'},
        {l:'75歳以上人口', v: pop75 ? fmt(pop75) : '—', sub:'住基2025', c:'#9f1239'},
        {l:'75+あたり病床数', v: beds_per_75plus ? beds_per_75plus.toFixed(0) : '—', sub:'人口10万対 ※年次差あり',
         c:'#f59e0b',
         delta: (beds_per_75plus && nat_beds_per_75plus && !isNational) ? ((beds_per_75plus/nat_beds_per_75plus-1)*100) : null},
        {l: isNational ? '基準' : '全国比', v: isNational ? '—' : (nat_total ? `${(totalBeds/nat_total*100).toFixed(2)}%` : '—'), sub:'総床数の全国シェア', c:'#64748b'},
      ].map((k,i) => (
        <div key={i} style={{background:'#fff',borderRadius:10,padding:'12px 14px',border:'1px solid #f0f0f0'}}>
          <div style={{fontSize:11,color:'#94a3b8'}}>{k.l}</div>
          <div style={{fontSize:mob?16:20,fontWeight:700,color:k.c}}>{k.v}</div>
          {k.delta != null && <div style={{fontSize:10,fontWeight:600,color:k.delta>0?'#dc2626':'#059669'}}>{k.delta>0?'+':''}{k.delta.toFixed(1)}% vs全国</div>}
          {k.sub && <div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>{k.sub}</div>}
        </div>
      ))}
    </div>
  )}

  {/* Layer A: 機能区分構成 */}
  {(prefShares || (isNational && natShares)) && (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <span style={{fontSize:18}}>🏥</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>
            機能区分構成 — {isNational ? '全国' : regPref}
            <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fef3c7',color:'#92400e',fontWeight:500}}>機能配分・現況</span>
          </div>
          <div style={{fontSize:11,color:'#94a3b8'}}>令和6年度病床機能報告(2024/7/1時点) — 各機能の床数シェア・全国基準との偏差</div>
        </div>
      </div>
      {(() => {
        const target = prefShares || natShares;
        const showDelta = !isNational && natShares;
        return (
          <div>
            <div style={{display:'flex',height:32,borderRadius:6,overflow:'hidden',marginBottom:10}}>
              {ACTIVE_FUNCS.map(f => (
                <div key={f} title={`${f} ${target[f].toFixed(1)}%`} style={{width:`${target[f]}%`,background:FUNC_COLORS[f],display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:700,minWidth:0,overflow:'hidden',whiteSpace:'nowrap'}}>
                  {target[f] >= 6 ? `${target[f].toFixed(1)}%` : ''}
                </div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(4,1fr)',gap:10}}>
              {ACTIVE_FUNCS.map(f => {
                const v = target[f];
                const delta = showDelta ? v - natShares[f] : null;
                const beds = (prefShares ? bf[f]?.beds : bfNat[f]?.beds) || 0;
                return (
                  <div key={f} style={{borderLeft:`4px solid ${FUNC_COLORS[f]}`,padding:'8px 10px',background:'#f8fafc',borderRadius:6}}>
                    <div style={{fontSize:10,color:'#64748b'}}>{f}</div>
                    <div style={{fontSize:mob?14:16,fontWeight:700,color:FUNC_COLORS[f]}}>{v.toFixed(1)}%</div>
                    <div style={{fontSize:10,color:'#94a3b8'}}>
                      {fmt(beds)} 床
                      {delta != null && <span style={{marginLeft:6,fontWeight:600,color:Math.abs(delta) > 1.5 ? (delta > 0 ? '#dc2626' : '#059669') : '#94a3b8'}}>
                        ({delta > 0 ? '+' : ''}{delta.toFixed(1)}pt)
                      </span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* #3: 機能別シェアの47県分布（PrefStrip47 4行帯・hoverPref横断同期） */}
            {ACTIVE_FUNCS.every(f => funcStrips[f].length >= 40) && (
              <div style={{marginTop:16,paddingTop:14,borderTop:'1px solid #f1f5f9'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:'#1e293b'}}>機能別シェアの47県分布</span>
                  <span style={{fontSize:10,color:'#94a3b8'}}>
                    青リング={isNational?'—':regPref}・青破線▽=全国平均・◆=比較ピン。ドットをなぞると4行が同期点灯、クリックで県移動。
                  </span>
                </div>
                {ACTIVE_FUNCS.map(f => (
                  <div key={f} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <div style={{width:mob?58:72,flexShrink:0,display:'flex',alignItems:'center',gap:5}}>
                      <span style={{width:8,height:8,borderRadius:2,background:FUNC_COLORS[f],flexShrink:0}} />
                      <span style={{fontSize:10.5,color:'#475569',fontWeight:600,whiteSpace:'nowrap'}}>{f}</span>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <PrefStrip47 {...stripCommon} values={funcStrips[f]} natAvg={natShares?.[f]} yearBadge={stripYb} mode="inline" />
                    </div>
                  </div>
                ))}
                <div style={{fontSize:9.5,color:'#94a3b8',marginTop:3,lineHeight:1.5}}>
                  各行は「その機能が県内総床数に占める割合(%)」の47県分布。行ごとに独立スケール — 行どうしのドット位置は直接比較できません。高低は良し悪しではありません。
                </div>
              </div>
            )}
          </div>
        );
      })()}
      <div style={{fontSize:10,color:'#94a3b8',marginTop:10,lineHeight:1.5}}>
        ※機能区分は施設の自己申告(2024/7/1時点)。地域医療構想の評価指標として使用。
      </div>
    </div>
  )}

  {/* #6: 75歳以上人口あたり病床数 の47県クロロプレス地図 */}
  {japanMap?.prefs && Object.keys(bedsPer75ByPref).length >= 40 && (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:12,flexWrap:'wrap'}}>
        <span style={{fontSize:18}}>🗺️</span>
        <div style={{flex:'1 1 240px'}}>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
            75歳以上人口あたり病床数 — 47県供給地図
            <span title={bedBadge.title} style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:4,background:bedBadge.bg,color:bedBadge.color,border:`1px solid ${bedBadge.border}`}}>床数 {bedBadge.year}</span>
          </div>
          <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>総床数(R6) ÷ 75歳以上人口(住基2025) ×10万。西高東低の慢性期偏在・供給薄県が地理として一目に。県クリックで移動。</div>
        </div>
      </div>
      <PrefChoropleth
        japanMap={japanMap}
        valueByPref={bedsPer75ByPref}
        selected={isNational ? null : regPref}
        onSelect={(p) => setRegPref && setRegPref(p)}
        title="75+あたり病床数（人口10万対）"
        unit="床"
        yearBadge={stripYb}
        mob={mob}
        height={mob?170:210}
      />
      <div style={{fontSize:9.5,color:'#94a3b8',marginTop:6,lineHeight:1.5}}>
        色階級はこの指標だけの5分位です。<b>床数=2024/7/1・人口=2025/1で年次差があり</b>、厳密な同年比ではなく現況の地域差の観察です。高低は良し悪しではありません(在宅・介護など病床外の受け皿は含みません)。
      </div>
    </div>
  )}

  {/* Layer B: 病床供給 × 将来入院需要クロスオーバー (rank7) */}
  {/* hatch pattern def (SVG global, ReferenceArea fill=url(#rbfHatch) から参照) */}
  <svg width="0" height="0" style={{position:'absolute'}} aria-hidden="true">
    <defs>
      <pattern id="rbfHatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
        <rect width="7" height="7" fill="#eff6ff" fillOpacity="0.5" />
        <line x1="0" y1="0" x2="0" y2="7" stroke="#93c5fd" strokeWidth="1.4" strokeOpacity="0.6" />
      </pattern>
    </defs>
  </svg>
  <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:6,flexWrap:'wrap'}}>
      <span style={{fontSize:18}}>📈</span>
      <div style={{flex:'1 1 240px'}}>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          病床供給 × 将来入院需要クロスオーバー — {isNational ? '全国' : regPref}
          <span title={bedBadge.title} style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:4,background:bedBadge.bg,color:bedBadge.color,border:`1px solid ${bedBadge.border}`}}>供給 {bedBadge.year}</span>
          <span title="受療率法(受療率固定・人口変動のみ反映)による将来推計" style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:4,background:'#fff7ed',color:'#b45309',border:'1px solid #fed7aa'}}>需要 参考推計</span>
        </div>
        <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>現在の病床供給(R6・静的水準)の上に、受療率法による2020–2050の入院需要(1日平均在院患者数)を重ねる</div>
      </div>
    </div>

    {demandLoading && <div style={{padding:'28px 0',textAlign:'center',fontSize:12,color:'#94a3b8'}}>需要推計を読み込み中…</div>}
    {!demandLoading && !demandModel && (
      <div style={{padding:'20px 0',fontSize:12,color:'#94a3b8'}}>この{isNational?'':'県の'}将来入院需要の推計データは見つかりませんでした。</div>
    )}

    {!demandLoading && demandModel && (
      <>
        {/* 需要ピーク年・クロスオーバー チップ */}
        <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'6px 0 12px'}}>
          <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'6px 12px',fontSize:11.5}}>
            <span style={{color:'#94a3b8'}}>需要ピーク年</span>{' '}
            <b style={{color:'#2563eb'}}>{demandModel.peak.year}年</b>{' '}
            <span style={{color:'#64748b'}}>{fmt(Math.round(demandModel.peak.demand))} 人/日</span>
          </div>
          {supplyBeds != null && (
            <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'6px 12px',fontSize:11.5}}>
              <span style={{color:'#94a3b8'}}>現在病床(4機能)</span>{' '}
              <b style={{color:'#166534'}}>{fmt(supplyBeds)} 床</b>{' '}
              <span style={{fontSize:9,color:'#94a3b8'}}>2024静的</span>
            </div>
          )}
          {supplyBeds != null && demandModel.cross && (
            <div style={{background:'#fefce8',border:'1px solid #fde68a',borderRadius:8,padding:'6px 12px',fontSize:11.5}}>
              <span style={{color:'#94a3b8'}}>需要が現在病床水準を上回る年</span>{' '}
              <b style={{color:'#b45309'}}>{demandModel.cross.year}年</b>{' '}
              <span style={{fontSize:9,color:'#94a3b8'}}>(参考値・断定ではありません)</span>
            </div>
          )}
        </div>

        <ResponsiveContainer width="100%" height={mob?240:300}>
          <ComposedChart data={demandModel.rows} margin={{left:8,right:12,top:12,bottom:4}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            {/* 供給帯: 現在病床でカバー可能な需要水準ゾーン(y=0..供給) — 静的 */}
            {supplyBeds != null && (
              <ReferenceArea y1={0} y2={supplyBeds} fill="#059669" fillOpacity={0.06} stroke="none" ifOverflow="extendDomain" />
            )}
            {/* 推計領域(2025以降)を斜線塗り */}
            <ReferenceArea x1="2025" x2={demandModel.lastProjYear} fill="url(#rbfHatch)" fillOpacity={1} stroke="none" ifOverflow="extendDomain" />
            <XAxis dataKey="year" tick={{fontSize:11,fill:'#475569'}} axisLine={false} tickLine={false} />
            <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} domain={[0, demandYMax || 'auto']} width={48} />
            <Tooltip content={<DemandTooltip />} cursor={{stroke:'#94a3b8',strokeWidth:1,strokeDasharray:'4 3'}} />
            {/* 入院需要曲線(面) */}
            <Area type="monotone" dataKey="demand" name="入院需要" stroke="#2563eb" strokeWidth={2.4} fill="#2563eb" fillOpacity={0.12} dot={{r:2.5,fill:'#2563eb'}} activeDot={{r:4}} connectNulls />
            {/* 現在総病床(4機能)の水平参照ライン(帯の上端) */}
            {supplyBeds != null && (
              <ReferenceLine y={supplyBeds} stroke="#059669" strokeWidth={1.8} strokeDasharray="6 4"
                label={{value:`現在総病床(4機能) ${fmt(supplyBeds)}床`, position:'insideTopLeft', fontSize:10, fill:'#166534', fontWeight:600}} />
            )}
            {/* 需要ピーク年ドット */}
            {demandModel.peak && demandModel.peak.demand != null && (
              <ReferenceDot x={demandModel.peak.year} y={demandModel.peak.demand} r={5} fill="#2563eb" stroke="#fff" strokeWidth={1.6}
                label={{value:`ピーク ${demandModel.peak.year}`, position:'top', fontSize:9.5, fill:'#2563eb', fontWeight:700}} />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* 凡例・ガードレール */}
        <div style={{display:'flex',gap:14,flexWrap:'wrap',fontSize:10.5,color:'#64748b',margin:'8px 0 0'}}>
          <span><span style={{display:'inline-block',width:20,height:3,background:'#2563eb',borderRadius:2,verticalAlign:'middle',marginRight:5}} />入院需要(1日平均在院患者数・受療率法)</span>
          <span><span style={{display:'inline-block',width:20,height:0,borderTop:'2px dashed #059669',verticalAlign:'middle',marginRight:5}} />現在総病床(4機能・R6静的水準)</span>
          <span><span style={{display:'inline-block',width:14,height:10,backgroundColor:'#eff6ff',backgroundImage:'repeating-linear-gradient(45deg, #93c5fd 0, #93c5fd 1.4px, transparent 1.4px, transparent 5px)',border:'1px solid #bfdbfe',verticalAlign:'middle',marginRight:5}} />推計領域(2025–)</span>
        </div>

        <div style={{fontSize:10,color:'#94a3b8',marginTop:10,paddingTop:10,borderTop:'1px solid #f1f5f9',lineHeight:1.7}}>
          <b style={{color:'#b45309'}}>⚠️ 参考推計として</b>: 病床数は<b>2024年時点の静的水準</b>で、将来の病床再編・機能転換は反映しません。需要は受療率法(受療率固定・人口変動のみ反映・患者住所地ベース)による参考推計です。<br/>
          <b>需要/病床比</b>は稼働率・平均在院日数の変化・二次医療圏を跨ぐ患者の流出入を考慮しない<b>参考値</b>であり、病床の「不足」「過剰」を断定するものではありません。<br/>
          <b>1日平均在院患者数(人/日)と病床数(床)は同一次元(在院日数ベースの延べ規模)ですが、稼働率・回転を挟むため同一物ではありません。</b><br/>
          ※供給帯・水平ラインの病床数は<b>休棟・休止病床を除く4機能(高度急性期/急性期/回復期/慢性期)のみ</b>を積算しています(休棟2区分は将来稼働が不確実なため除外)。<br/>
          出典: 供給={bedBadge.source} / 需要={demandModel.source||'demand_projection R5(受療率法)'}
        </div>
      </>
    )}
  </div>

  {/* 地域類型 */}
  {region && (
    <div style={{background:'#fff',borderRadius:14,border:`1px solid ${region.color}33`,borderLeft:`6px solid ${region.color}`,padding:'16px 20px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
        <span style={{fontSize:18}}>{region.icon}</span>
        <div style={{fontSize:13,fontWeight:700,color:region.color}}>観察ラベル: {region.type}</div>
      </div>
      <div style={{fontSize:12,color:'#475569',lineHeight:1.6}}>{region.desc}</div>
      {/* P1-2: 解釈注意 (地域類型の観察ラベル化) */}
      <InterpretationGuard variant="mismatch" compact={true} />
    </div>
  )}

  {/* 在宅移行 補助分類 (v0) */}
  {!isNational && homecareType && (
    <div style={{background:'#fff',borderRadius:14,border:`1px solid ${(homecareType.color || '#cbd5e1') + '40'}`,padding:'16px 20px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
        <span style={{fontSize:20}}>{homecareType.icon || '➖'}</span>
        <div style={{fontSize:13,fontWeight:700,color:homecareType.color || '#64748b'}}>在宅移行 補助分類: {homecareType.type}</div>
        <span style={{fontSize:9,padding:'1px 6px',borderRadius:3,background:'#dcfce7',color:'#166534',fontWeight:600}}>v1</span>
        {homecareType.counts && (
          <span style={{fontSize:9,padding:'1px 6px',borderRadius:3,background:'#f1f5f9',color:'#475569',fontWeight:500}}>
            high {homecareType.counts.high} / neutral {homecareType.counts.neutral} / low {homecareType.counts.low}
          </span>
        )}
      </div>
      <div style={{fontSize:12,color:'#475569',lineHeight:1.6,marginBottom:8}}>{homecareType.desc}</div>
      {Array.isArray(homecareType.signals) && homecareType.signals.length > 0 && (
        <div style={{marginTop:8,padding:'8px 12px',background:'#f8fafc',borderRadius:6,fontSize:11}}>
          <div style={{fontWeight:600,color:'#64748b',marginBottom:4}}>判定根拠 (47県平均比、±5%超で high/low、±5%以内で neutral):</div>
          <ul style={{paddingLeft:18,margin:0,lineHeight:1.7,color:'#475569'}}>
            {homecareType.signals.map((sig, i) => {
              const lvl = sig.level || (sig.isHigh ? 'high' : 'low');
              const colorMap = {high:'#059669', low:'#dc2626', neutral:'#94a3b8'};
              const labelMap = {high:'平均より高い', low:'平均より低い', neutral:'平均近傍'};
              return (
                <li key={i}>
                  {sig.name}: <b style={{color:colorMap[lvl]}}>{labelMap[lvl]}</b> ({Number(sig.delta) > 0 ? '+' : ''}{sig.delta}%)
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div style={{fontSize:10,color:'#94a3b8',marginTop:8,padding:'8px 12px',background:'#fff7ed',borderRadius:4,lineHeight:1.6}}>
        <b style={{color:'#92400e'}}>⚠️ v1 スコープと限界 (peer review #3 確定)</b><br/>
        ・本分類は<b>75歳以上割合が47県平均以上の高齢化県を主対象</b>とした補助分類です。若年・大都市圏 (東京/大阪/愛知等) は「該当なし: gate_not_aging」となり、<u>本分類の対象外</u>です (在宅移行が不要という意味ではありません)。<br/>
        ・「<b>支援型の可能性</b>」は、NDB在宅医療 / 病床機能 / cap.homecare / cap.rehab の proxy 上で供給が比較的厚い地域を指すもので、<u>医療の優劣・在宅看取り件数・患者満足度・医療費効率等を示すものではありません</u>。<br/>
        ・cap.homecare / cap.rehab は<b>施設基準届出件数の集計値</b>であり、訪問診療実施件数・在宅酸素実施数・リハ実績そのものではありません。<br/>
        ・cap.homecare と cap.rehab の Pearson r=+0.627 (重複情報の懸念)。v2でスコア化する際は重複処理が必要。<br/>
        ・v1: 5指標化 + ±5% neutral zone + per75+補正。
      </div>
    </div>
  )}

  {/* データの取扱いについて (注記) */}
  <div style={{background:'#fffbeb',borderRadius:14,border:'1px solid #fde68a',padding:'14px 18px',marginBottom:16}}>
    <div style={{fontSize:12,fontWeight:600,color:'#92400e',marginBottom:6}}>📋 データの取扱いについて</div>
    <ul style={{margin:0,paddingLeft:18,fontSize:11,color:'#78350f',lineHeight:1.7}}>
      <li><b>自己申告</b>: 病床機能区分は施設の自己申告(2024/7/1時点)に基づき、実際の患者構成と乖離する可能性。</li>
      <li><b>時点差</b>: 病床機能=2024/7/1時点、人口データ=住基2025年1月。年次差があり厳密な同年比較ではなく現況把握用。</li>
      <li><b>地域類型は暫定ルール</b>: 「供給薄型の可能性」「急性期偏重型の傾向」等は経験則に基づく暫定分類で、z-score化等の統計的根拠は未実装(Phase 2課題)。</li>
    </ul>
  </div>

  {/* 需要との接続 (Phase 2 placeholder) */}
  <div style={{background:'#fafbfc',borderRadius:14,border:'1px dashed #cbd5e1',padding:'16px 20px',marginBottom:16}}>
    <div style={{fontSize:12,fontWeight:600,color:'#64748b',marginBottom:4}}>📊 需要との接続 (Coming next)</div>
    <div style={{fontSize:11,color:'#94a3b8',lineHeight:1.6}}>
      患者調査受療率(P6で実装済) / NDB在宅医療 / NDBリハビリ / NDB入院基本料 と機能配分の対比による supply-demand mapping を Phase 2 で予定。
    </div>
  </div>
  </>;
}
