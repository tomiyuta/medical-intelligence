'use client';
import { useMemo, useState, useEffect, useRef } from 'react';
import { fmt, METRICS, mKey } from '../shared';
import { getSourceBadge } from '../../../lib/sourceRegistry';
import { useCountUp, useFlipRows, prefersReducedMotion, useYearSweep } from '../ui/vizHooks';
import { useSelection } from '../SelectionContext';

const VITAL_MAP = { cancer: 'がん(悪性新生物)', heart: '心疾患', stroke: '脳血管疾患' };
const isVital = m => m in VITAL_MAP;
const isSupply = m => !isVital(m); // 施設/病院/DPC/病床
const NO_DATA_COLOR = '#eef1f5'; // 「データなし」中立色(欠測=分位色/ランキングから除外)

// 系統別 5 分位パレット(低→高)。家文法: 供給=中立(indigo)/死亡=リスク(琥珀→赤)/逼迫=リスク(赤→緑)。
const PAL_SUPPLY = ['#eef2ff', '#c7d2fe', '#a5b4fc', '#6366f1', '#4338ca']; // 中立 indigo
const PAL_DEATH  = ['#fef3c7', '#fbbf24', '#f59e0b', '#ea580c', '#b91c1c']; // リスク 琥珀→赤
const PAL_STRAIN = ['#b91c1c', '#ea580c', '#f59e0b', '#84cc16', '#16a34a']; // 逼迫: 低=赤 / 潤沢=緑

// 実測値配列 → 5 分位しきい値 [t20,t40,t60,t80]
function quintThresholds(vals) {
  const s = vals.filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
  if (s.length < 2) return null;
  const q = p => { const idx = (s.length - 1) * p; const lo = Math.floor(idx), hi = Math.ceil(idx); return s[lo] + (s[hi] - s[lo]) * (idx - lo); };
  return [q(0.2), q(0.4), q(0.6), q(0.8)];
}
const binOf = (v, th) => { if (th == null) return 2; return v <= th[0] ? 0 : v <= th[1] ? 1 : v <= th[2] ? 2 : v <= th[3] ? 3 : 4; };

// 供給4指標の年度バッジ(届出受理医療機関名簿。FacilityExplorerView と同一出典)
const SUPPLY_BADGE = { label: '医療機関届出', year: 'R8', color: '#4338ca' };

export default function MapView({ mob, navTitle, prefs, metric, setMetric, japanMap, hovPref, setHovPref, tooltipPos, setTooltipPos, setGlobalPref, setView, vitalStats, globalPref, futureDemo }) {
  // 年軸は共有（SelectionContext）: NdbView タイムレンズと同一ソース
  const { futureYear, setFutureYear } = useSelection();
  // ── ローカル状態 ────────────────────────────────────────────────
  const [unitMode, setUnitMode] = useState('raw');   // 供給指標: 'raw' | 'per100k'
  const [mode, setMode] = useState('map');            // 'map'(分布) | 'strain'(病床逼迫度スイープ)
  const [hovSrc, setHovSrc] = useState(null);         // 'map' | 'list' — hover 発生源(地図tooltipは'map'のみ)
  const reduced = prefersReducedMotion();

  // ── 将来人口ルックアップ(社人研) ──────────────────────────────
  const demoYears = useMemo(() => (futureDemo?.years?.length ? futureDemo.years : [2020, 2025, 2030, 2035, 2040, 2045, 2050]), [futureDemo]);
  const demoByPref = useMemo(() => {
    const m = {};
    (futureDemo?.prefectures || []).forEach(p => { m[p.pref] = p; });
    return m;
  }, [futureDemo]);
  const pop2025 = pref => { const y = demoByPref[pref]?.total_pop; return y ? y['2025'] : null; };
  const pop75 = (pref, year) => {
    const d = demoByPref[pref]; if (!d) return null;
    const tp = d.total_pop?.[year], ar = d.aging_rate_75?.[year];
    return (tp == null || ar == null) ? null : tp * ar / 100;
  };

  // ── 病床逼迫度スイープ状態（年軸は SelectionContext.futureYear を単一ソース参照） ──
  // demoYears は数値配列。既存の厳密比較(sweepYear===y)を保つため sweepYear は数値のまま、
  // 共有 futureYear(文字列 '2025' 等)を文字列配列 yearsStr 経由で正規化して対応付ける。
  const yearsStr = useMemo(() => demoYears.map(String), [demoYears]);
  const curStr = yearsStr.includes(String(futureYear)) ? String(futureYear) : yearsStr[0];
  const sweepIdx = Math.max(0, yearsStr.indexOf(curStr));
  const sweepYear = demoYears[sweepIdx];              // 数値（表示/比較用）
  const { playing, setPlaying, toggle: toggleSweep } =
    useYearSweep({ years: yearsStr, current: curStr, setYear: setFutureYear, interval: 1300, respectReduced: true });
  useEffect(() => { if (mode !== 'strain') setPlaying(false); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 表示データ(name→val)。val=null は欠測(データなし)を表す。 ─────
  const supplyKey = metric; // facilities/hospitals/dpc/beds
  const rows = useMemo(() => {
    // 病床逼迫度モード: 病床数 ÷ 75歳以上人口 ×100(=75歳以上100人あたり病床数)
    if (mode === 'strain') {
      return (prefs || []).map(p => {
        const beds = p.beds, p75 = pop75(p.name, sweepYear);
        const val = (beds == null || p75 == null || p75 === 0) ? null : beds / p75 * 100;
        return { name: p.name, val, beds, p75 };
      });
    }
    // 死亡3指標: vitalStats から rate(/10万)
    if (isVital(metric) && vitalStats?.prefectures) {
      const causeName = VITAL_MAP[metric];
      return vitalStats.prefectures.map(vp => {
        const c = vp.causes?.find(x => x.cause === causeName);
        return { name: vp.pref, val: (c?.rate == null ? null : c.rate) };
      });
    }
    // 供給4指標: 実数 or 人口10万対
    return (prefs || []).map(p => {
      const raw = p[supplyKey];
      if (raw == null) return { name: p.name, val: null, raw: null };
      if (unitMode === 'per100k') {
        const pop = pop2025(p.name);
        return { name: p.name, val: (pop ? raw / pop * 100000 : null), raw };
      }
      return { name: p.name, val: raw, raw };
    });
  }, [mode, sweepYear, metric, unitMode, prefs, vitalStats, demoByPref]);

  const dataByName = useMemo(() => { const m = {}; rows.forEach(d => m[d.name] = d); return m; }, [rows]);

  // ── 色スケール(系統別・5分位) ─────────────────────────────────
  const palette = mode === 'strain' ? PAL_STRAIN : isVital(metric) ? PAL_DEATH : PAL_SUPPLY;
  const accent = mode === 'strain' ? '#b91c1c' : isVital(metric) ? '#b91c1c' : '#4338ca';
  const thresholds = useMemo(() => quintThresholds(rows.map(r => r.val)), [rows]);
  const colorOf = v => (v == null || !isFinite(v)) ? NO_DATA_COLOR : palette[binOf(v, thresholds)];

  // ── 降順ランク(1=最大値)。逼迫モードは「逼迫が強い=値が小さい」ので昇順が1位。 ──
  const strainWorst = mode === 'strain'; // 値が小さいほど上位(逼迫)
  const ranked = useMemo(() => {
    const withVal = rows.filter(r => r.val != null);
    const noVal = rows.filter(r => r.val == null);
    withVal.sort((a, b) => strainWorst ? a.val - b.val : b.val - a.val);
    return [...withVal, ...noVal];
  }, [rows, strainWorst]);
  const rankMap = useMemo(() => { const m = {}; ranked.forEach((r, i) => { if (r.val != null) m[r.name] = i + 1; }); return m; }, [ranked]);
  const maxAbs = useMemo(() => Math.max(...rows.map(r => (r.val == null ? 0 : Math.abs(r.val))), 1e-9), [rows]);

  // ── 前指標比ランク差(map モードのみ・指標/単位切替時に算出) ──────
  const prevRankRef = useRef(null);
  const rankKeyRef = useRef(null);
  const [rankDelta, setRankDelta] = useState({});
  useEffect(() => {
    const key = mode + '|' + metric + '|' + unitMode + '|' + sweepYear;
    if (mode !== 'map') { prevRankRef.current = null; rankKeyRef.current = key; setRankDelta({}); return; }
    if (prevRankRef.current && rankKeyRef.current !== key) {
      const d = {}; Object.keys(rankMap).forEach(n => { const pv = prevRankRef.current[n]; if (pv != null) d[n] = pv - rankMap[n]; });
      setRankDelta(d);
    }
    prevRankRef.current = rankMap; rankKeyRef.current = key;
  }, [rankMap, mode, metric, unitMode, sweepYear]);

  // ── 総数(countup) ────────────────────────────────────────────
  const headline = useMemo(() => {
    if (mode === 'strain') {
      let b = 0, p = 0; rows.forEach(r => { if (r.beds != null && r.p75 != null) { b += r.beds; p += r.p75; } });
      return p > 0 ? b / p * 100 : null;
    }
    if (isVital(metric)) { const v = rows.filter(r => r.val != null); return v.length ? v.reduce((s, r) => s + r.val, 0) / v.length : null; }
    if (unitMode === 'per100k') { let raw = 0, pop = 0; rows.forEach(r => { const pp = pop2025(r.name); if (r.raw != null && pp) { raw += r.raw; pop += pp; } }); return pop > 0 ? raw / pop * 100000 : null; }
    return rows.reduce((s, r) => s + (r.val || 0), 0);
  }, [rows, mode, metric, unitMode, demoByPref]);
  const animHead = useCountUp(headline == null ? 0 : headline);

  // ── ラベル・単位 ─────────────────────────────────────────────
  const metricLabel = Object.values(METRICS)[Object.values(mKey).indexOf(metric)] || metric;
  const unit = mode === 'strain' ? '床/100人' : isVital(metric) ? '/10万' : unitMode === 'per100k' ? '/10万人' : '';
  const dec = (mode === 'strain' || isVital(metric) || unitMode === 'per100k') ? 1 : 0;
  const fmtVal = v => v == null || !isFinite(v) ? '—' : dec ? v.toFixed(dec) : fmt(Math.round(v));
  const displayLabel = mode === 'strain' ? '75歳以上100人あたり病床数' : metricLabel + (isVital(metric) ? '' : unitMode === 'per100k' ? ' (人口10万対)' : '');

  // ── 年度バッジ ───────────────────────────────────────────────
  const badge = mode === 'strain' ? { ...getSourceBadge('futureDemo'), year: sweepYear + '年推計' } : isVital(metric) ? getSourceBadge('vitalStats') : SUPPLY_BADGE;

  // ── hover 横断同期 + 猶予付き解除(tooltip ボタンをクリック可能に) ──
  const hideTimer = useRef(null);
  const cancelHide = () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } };
  const armHide = () => { cancelHide(); hideTimer.current = setTimeout(() => { setHovPref(null); setHovSrc(null); }, 140); };
  useEffect(() => () => cancelHide(), []);

  // ── hovPref(地図側)変化でランキング行へスクロール同期 ────────────
  const rowRefs = useRef({});
  const scrollRoot = useRef(null);
  useEffect(() => {
    if (!hovPref || hovSrc !== 'map') return;
    const el = rowRefs.current[hovPref];
    if (el?.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [hovPref, hovSrc, reduced]);

  // ── FLIP(指標/単位/年切替で行が滑走) ───────────────────────────
  useFlipRows(rowRefs, [metric, unitMode, mode, sweepYear], mob);

  const goProfile = pref => { cancelHide(); setGlobalPref(pref); setView('area'); };

  const pill = (active, activeBg, activeFg, activeBorder) => ({
    padding: mob ? '4px 8px' : '5px 12px', borderRadius: 18,
    border: active ? '2px solid ' + activeBorder : '1px solid #e2e8f0',
    background: active ? activeBg : '#fff', color: active ? activeFg : '#64748b',
    fontSize: 11, fontWeight: active ? 600 : 400, cursor: 'pointer',
  });

  return <>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:mob?8:12,flexWrap:'wrap',gap:8}}>
    <div>
      <h1 style={{fontSize:mob?18:20,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>
        {navTitle ? navTitle + '｜' : ''}{mode==='strain'?'都道府県別 病床逼迫度シミュレーション':`都道府県別 ${isVital(metric)?'疾病構造':'医療機関分布'}`}
      </h1>
      <p style={{fontSize:11,color:'#94a3b8',margin:'4px 0 0'}}>
        {mode==='strain'
          ? '現病床数(R8時点で一定と仮定)を将来75歳以上人口で除算。少ないほど病床が逼迫(赤)。'
          : isVital(metric) ? '※厚労省人口動態統計 2024年確定数(/10万・粗率)'
          : unitMode==='per100k' ? '人口10万人あたりの供給密度(2025年推計人口で除算)。「人口の影」を除いた地図。'
          : '実数。人口の多い都府県が濃くなる(=人口地図)。10万対に切替で供給密度が見える。'}
      </p>
    </div>
    <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
      {Object.entries(mKey).map(([k,v])=>(
        <button key={k} onClick={()=>{setMetric(v);setMode('map');}}
          style={pill(mode==='map'&&metric===v, isVital(v)?'#fef2f2':'#eef2ff', isVital(v)?'#b91c1c':'#4338ca', isVital(v)?'#b91c1c':'#4338ca')}>
          {METRICS[k]}
        </button>
      ))}
    </div>
  </div>

  {/* 第2コントロールバー: 単位トグル(供給時) + 病床逼迫度モード切替 */}
  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:mob?8:12,flexWrap:'wrap'}}>
    {mode==='map' && isSupply(metric) && (
      <div style={{display:'inline-flex',gap:3,background:'#f1f5f9',borderRadius:20,padding:3}}>
        {[['raw','実数'],['per100k','人口10万対']].map(([u,lab])=>(
          <button key={u} onClick={()=>setUnitMode(u)} disabled={u==='per100k'&&!futureDemo}
            style={{padding:mob?'4px 10px':'5px 14px',borderRadius:16,border:'none',cursor:(u==='per100k'&&!futureDemo)?'not-allowed':'pointer',
              background:unitMode===u?'#fff':'transparent',color:unitMode===u?'#4338ca':'#64748b',fontSize:11,fontWeight:unitMode===u?600:400,
              boxShadow:unitMode===u?'0 1px 2px rgba(0,0,0,0.08)':'none',opacity:(u==='per100k'&&!futureDemo)?0.5:1}}>{lab}</button>
        ))}
      </div>
    )}
    <button onClick={()=>{ setMode(m=>m==='strain'?'map':'strain'); }}
      disabled={!futureDemo}
      style={{padding:mob?'5px 12px':'6px 16px',borderRadius:20,border:mode==='strain'?'2px solid #b91c1c':'1px solid #fecaca',
        background:mode==='strain'?'#b91c1c':'#fff',color:mode==='strain'?'#fff':'#b91c1c',fontSize:12,fontWeight:600,
        cursor:futureDemo?'pointer':'not-allowed',opacity:futureDemo?1:0.5,display:'inline-flex',alignItems:'center',gap:6}}>
      <span style={{fontSize:13}}>⏱</span>{mode==='strain'?'分布地図に戻る':'病床逼迫度 2020→2050'}
    </button>
  </div>

  {/* 年レール(逼迫モード) */}
  {mode==='strain' && (
    <div style={{display:'flex',alignItems:'center',gap:mob?4:8,marginBottom:mob?8:12,flexWrap:'wrap',background:'#fff',border:'1px solid #f0f0f0',borderRadius:12,padding:mob?'8px 10px':'10px 14px'}}>
      {reduced
        ? <span style={{fontSize:10,color:'#94a3b8'}}>▶自動再生は軽減設定で無効(年を選択)</span>
        : <button onClick={toggleSweep}
            style={{width:34,height:34,borderRadius:'50%',border:'none',background:playing?'#b91c1c':'#1e293b',color:'#fff',fontSize:14,cursor:'pointer',flexShrink:0}}>
            {playing?'❚❚':'▶'}
          </button>}
      <div style={{display:'flex',gap:mob?3:6,flexWrap:'wrap',flex:1}}>
        {demoYears.map((y,i)=>(
          <button key={y} onClick={()=>{setPlaying(false);setFutureYear(String(y));}}
            style={{padding:mob?'3px 7px':'4px 11px',borderRadius:14,border:'none',cursor:'pointer',fontVariantNumeric:'tabular-nums',
              background:sweepYear===y?'#b91c1c':'#f1f5f9',color:sweepYear===y?'#fff':'#64748b',fontSize:11,fontWeight:sweepYear===y?700:400}}>{y}</button>
        ))}
      </div>
    </div>
  )}

  <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'1fr 248px',gap:12}}>
    <div style={{background:'#fff',borderRadius:14,padding:mob?'8px':'12px 16px',border:'1px solid #f0f0f0',position:'relative',minHeight:mob?'calc(100vh - 240px)':'calc(100vh - 220px)'}}>
      {/* 総数 + 年度バッジ */}
      <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:6,flexWrap:'wrap'}}>
        <span style={{fontSize:26,fontWeight:700,color:accent,fontVariantNumeric:'tabular-nums'}}>
          {headline==null?'—':dec?animHead.toFixed(dec):fmt(Math.round(animHead))}
        </span>
        <span style={{fontSize:11,color:'#94a3b8'}}>
          {mode==='strain'?`全国 ${displayLabel} (${sweepYear}年)`:`${displayLabel}${isVital(metric)?' 全国平均':' 合計'}`}
          {unit&&mode!=='strain'?` (${unit})`:''} ｜ hover/タップで詳細
        </span>
        {badge?.year && <span style={{fontSize:10,fontWeight:600,color:badge.color,background:(badge.color||'#64748b')+'14',border:'1px solid '+((badge.color||'#64748b')+'33'),padding:'2px 8px',borderRadius:10,whiteSpace:'nowrap'}}>{badge.label} {badge.year}</span>}
      </div>

      {japanMap && (
        <svg viewBox={japanMap.viewBox} style={{width:'100%',height:mob?'calc(100vh - 300px)':'calc(100vh - 280px)'}} preserveAspectRatio="xMidYMid meet">
          {japanMap.prefs.map(pf => {
            const d = dataByName[pf.ja];
            const val = (d && d.val != null) ? d.val : null;
            const isHov = hovPref===pf.ja;
            return <path key={pf.id} d={pf.d}
              fill={isHov?'#0f172a':colorOf(val)}
              stroke={isHov?'#0f172a':globalPref===pf.ja?'#111827':'#fff'} strokeWidth={globalPref===pf.ja?1.4:0.5}
              style={{cursor:'pointer',transition:'fill 0.15s, stroke 0.12s'}}
              onMouseEnter={e=>{cancelHide();setHovPref(pf.ja);setHovSrc('map');const r=e.currentTarget.getBoundingClientRect();const svgR=e.currentTarget.closest('svg').getBoundingClientRect();setTooltipPos({x:r.x-svgR.x+r.width/2,y:r.y-svgR.y});}}
              onMouseLeave={armHide}
              onClick={()=>{setGlobalPref(pf.ja);}}
            />;
          })}
        </svg>
      )}

      {/* 分位凡例 */}
      {thresholds && (
        <div style={{display:'flex',gap:2,alignItems:'center',marginTop:6}}>
          <span style={{fontSize:10,color:'#94a3b8',marginRight:2}}>{mode==='strain'?'逼迫':'低'}</span>
          {palette.map((c,i)=><div key={i} style={{width:mob?18:26,height:9,background:c,borderRadius:i===0?'3px 0 0 3px':i===palette.length-1?'0 3px 3px 0':0}}/>) }
          <span style={{fontSize:10,color:'#94a3b8',marginLeft:2}}>{mode==='strain'?'潤沢':'高'}</span>
          <span style={{fontSize:10,color:'#cbd5e1',marginLeft:8}}>5分位 ｜ ▨ データなし</span>
          <div style={{width:12,height:9,background:NO_DATA_COLOR,border:'1px solid #e2e8f0',borderRadius:2,marginLeft:2}}/>
        </div>
      )}

      {/* hover ツールチップ(地図発生源のみ)+ プロファイルへ→ */}
      {hovPref && hovSrc==='map' && (()=>{const d=dataByName[hovPref];const noData=!d||d.val==null;const rk=rankMap[hovPref];return (
        <div onMouseEnter={cancelHide} onMouseLeave={armHide}
          style={{position:'absolute',left:`clamp(60px, ${tooltipPos.x}px, calc(100% - 90px))`,top:tooltipPos.y+58,transform:'translateX(-50%)',background:'#1e293b',color:'#fff',padding:'8px 12px',borderRadius:8,fontSize:12,zIndex:10,boxShadow:'0 4px 12px rgba(0,0,0,0.2)',whiteSpace:'nowrap'}}>
          <div style={{fontWeight:700,marginBottom:2}}>{hovPref}</div>
          {noData
            ? <div style={{color:'#cbd5e1'}}>{displayLabel}: <span style={{fontWeight:600}}>データなし</span></div>
            : <div>{displayLabel}: <span style={{color:'#93c5fd',fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{fmtVal(d.val)}{unit}</span></div>}
          {!noData && rk!=null && <div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>47県中 <span style={{color:'#e2e8f0',fontWeight:600}}>{rk}</span> 位{strainWorst?'(逼迫が強い順)':'(高い順)'}</div>}
          <button onClick={()=>goProfile(hovPref)}
            style={{marginTop:6,width:'100%',padding:'4px 8px',borderRadius:6,border:'none',background:'#334155',color:'#e2e8f0',fontSize:11,fontWeight:600,cursor:'pointer'}}>
            この県のプロファイルへ →
          </button>
        </div>
      );})()}
    </div>

    {/* ランキング(FLIP + hover同期 + ランク差) */}
    <div ref={scrollRoot} style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',overflow:'hidden',maxHeight:mob?320:'calc(100vh - 220px)',overflowY:'auto',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
      <div style={{padding:'10px 12px',borderBottom:'1px solid #f0f0f0',fontSize:12,fontWeight:600,position:'sticky',top:0,background:'#fff',zIndex:1}}>
        全47都道府県{mode==='strain'?` ｜ ${sweepYear}年`:''}
      </div>
      {ranked.map((p,i)=>{
        const noData=p.val==null;
        const hov=hovPref===p.name;
        const delta=mode==='map'?rankDelta[p.name]:undefined;
        return (
        <div key={p.name} ref={el=>{ if(el) rowRefs.current[p.name]=el; }}
          onClick={()=>{setGlobalPref(p.name);}}
          onMouseEnter={()=>{cancelHide();setHovPref(p.name);setHovSrc('list');}}
          onMouseLeave={armHide}
          style={{display:'flex',alignItems:'center',padding:'6px 12px',borderBottom:'1px solid #f8f9fa',cursor:'pointer',fontSize:12,
            background:hov?'#eef2ff':p.name===globalPref?'#fef3c7':'transparent',opacity:noData?0.55:1,
            boxShadow:hov?'inset 3px 0 0 '+accent:'none'}}>
          <span style={{width:20,fontWeight:600,color:'#94a3b8',fontSize:10,fontVariantNumeric:'tabular-nums'}}>{noData?'–':i+1}</span>
          <span style={{flex:1,fontWeight:500}}>{p.name}</span>
          {delta!=null && delta!==0 && (
            <span style={{fontSize:9,fontWeight:700,marginRight:6,color:delta>0?'#4338ca':'#9f1239'}}>{delta>0?'▲':'▼'}{Math.abs(delta)}</span>
          )}
          {noData
            ? <span style={{fontWeight:500,color:'#94a3b8',fontSize:11}}>データなし</span>
            : <span style={{fontWeight:600,color:accent,fontVariantNumeric:'tabular-nums',fontSize:12}}>{fmtVal(p.val)}</span>}
          <div style={{width:52,height:6,borderRadius:3,background:'#f1f5f9',marginLeft:8,overflow:'hidden',flexShrink:0}}>
            <div style={{height:'100%',borderRadius:3,background:colorOf(p.val),width:noData?'0%':`${Math.abs(p.val)/maxAbs*100}%`}}/>
          </div>
        </div>
      );})}
    </div>
  </div>
  </>;
}
