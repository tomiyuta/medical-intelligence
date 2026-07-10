'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { fmt, sortPrefs } from '../shared';
import AgePyramidGhost from '../ui/AgePyramidGhost';
import { useCountUp, CountUpNum, useFlipRows } from '../ui/vizHooks';
import { getSourceBadge } from '../../../lib/sourceRegistry';

// yearBadge（PrefStrip47/AgePyramidGhost 必須prop）: SOURCE_REGISTRY から {label:year, color}
const yb = (k) => { const s = getSourceBadge(k); return { label: s.year, color: s.color }; };
const DEMO_YEARS = ['2020', '2025', '2030', '2035', '2040', '2045', '2050'];

// KPI用アニメ整数（useCountUp・カンマ整形）。実測/推計の切替時も同一運動文法でモーフ。
const AnimInt = ({ value }) => {
  const v = useCountUp(value == null ? 0 : value);
  if (value == null || !isFinite(v)) return <>—</>;
  return <>{fmt(Math.round(v))}</>;
};

// 住基2025(age_pyramid)の年齢帯合算 — 県計・全国計の人口/高齢化率はこちらを使う。
// area_demographics の munis 合算も政令指定都市を含む完全値(2026-07 住基ETL再生成、
// scripts/etl_area_demographics_juki.py)で両者は±0.01%一致するが、分母は age_pyramid に一本化。
const sumBands = (a) => (a || []).reduce((s, v) => s + (v || 0), 0);
const pyramidTotals = (ap) => {
  if (!ap?.male || !ap?.female) return null;
  const total = sumBands(ap.male) + sumBands(ap.female);
  if (total <= 0) return null;
  const p15 = sumBands(ap.male.slice(0, 3)) + sumBands(ap.female.slice(0, 3));   // 0-14 = idx 0-2
  const p65 = sumBands(ap.male.slice(13)) + sumBands(ap.female.slice(13));       // 65+ = idx 13+
  return { total, p15, p65, rate65: p65 / total * 100 };
};

export default function MuniView({ mob, areaDemoData, demoPref, setDemoPref, demoArea, setDemoArea, demoPrefList, japanMap, hovPref, setHovPref, tooltipPos, setTooltipPos, futureDemo, futureYear, setFutureYear, agePyramid }) {
  // 全国表示モード判定 (demoPref が null/'全国' の時)
  const isNationalView = !demoPref || demoPref === '全国';

  // 全国合計 / 県表示の集計
  let ms, areas, areaNames, selArea, tPop, t15, t65, tW, tB, tD, tNC, r15, rW, r65;
  if (isNationalView) {
    // 全国: 総人口・年齢構成は住基2025(agePyramid.national)から(単一分母ポリシー)。
    // 出生・死亡は munis 合算(政令指定都市を含む完全値)
    ms = []; // 全国の市区町村は表示しない (47県 × 数十市区町村 = 数千件で重い)
    areas = [];
    areaNames = [];
    selArea = null;
    const nat = pyramidTotals(agePyramid?.national);
    tPop = nat?.total || 0; t15 = nat?.p15 || 0; t65 = nat?.p65 || 0;
    tB = 0; tD = 0;
    areaDemoData.forEach(d => {
      (d.munis || []).forEach(m => {
        tB += m.births || 0;
        tD += m.deaths || 0;
      });
    });
    tW = tPop - t15 - t65;
    tNC = tB - tD;
    r15 = tPop ? (t15/tPop*100).toFixed(1) : '0';
    rW  = tPop ? (tW/tPop*100).toFixed(1) : '0';
    r65 = tPop ? (t65/tPop*100).toFixed(1) : '0';
  } else {
    areas = areaDemoData.filter(a=>a.pref===demoPref);
    areaNames = areas.map(a=>a.area);
    selArea = areas.find(a=>a.area===demoArea) || areas[0];
    ms = selArea?.munis || [];
    tPop = ms.reduce((s,m)=>s+m.pop,0);
    t15 = ms.reduce((s,m)=>s+m.p15,0);
    t65 = ms.reduce((s,m)=>s+m.p65,0);
    tW = tPop - t15 - t65;
    tB = ms.reduce((s,m)=>s+m.births,0);
    tD = ms.reduce((s,m)=>s+m.deaths,0);
    tNC = tB - tD;
    r15 = tPop ? (t15/tPop*100).toFixed(1) : '0';
    rW  = tPop ? (tW/tPop*100).toFixed(1) : '0';
    r65 = tPop ? (t65/tPop*100).toFixed(1) : '0';
  }

  // Determine if using future projection
  const isFuture = futureYear && futureYear !== '2025';
  const yearLabel = isFuture ? `${futureYear}年推計` : '現在(2025)';
  const YEAR_OPTIONS = ['2025','2030','2035','2040','2045','2050'];

  // ── 将来推計連動（BUG2解消の中枢: futureYear を地図だけでなく KPI/ピラミッド/テーブルへ波及）──
  const fy = DEMO_YEARS.includes(futureYear) ? futureYear : '2025';
  const isFut = fy !== '2025';
  const ageGroups = agePyramid?.age_groups || [];
  const r65num = tPop ? t65 / tPop * 100 : 0;

  // 市区町村×将来推計（社人研 /api/future-demographics?prefecture=X）— city名で lookup。
  // 県切替でのみ取得（cache）。全国モードは市区町村テーブル非表示なので取得しない。
  const [muniFuture, setMuniFuture] = useState({}); // city → {aging_rate_65/75:{year}, total_pop:{year}}
  const futCacheRef = useRef({});
  useEffect(() => {
    if (isNationalView || !demoPref) { setMuniFuture({}); return; }
    if (futCacheRef.current[demoPref]) { setMuniFuture(futCacheRef.current[demoPref]); return; }
    let cancelled = false;
    fetch(`/api/future-demographics?prefecture=${encodeURIComponent(demoPref)}`)
      .then(r => r.json())
      .then(d => {
        const map = {};
        (d.data || []).forEach(m => { if (m.city) map[m.city] = m; });
        futCacheRef.current[demoPref] = map;
        if (!cancelled) setMuniFuture(map);
      })
      .catch(() => { if (!cancelled) setMuniFuture({}); });
    return () => { cancelled = true; };
  }, [demoPref, isNationalView]);

  // 年齢ピラミッド用データ（AgePyramidGhost — 選択県 vs 全国ゴースト + 社人研3帯リボン）
  const pyrAp = isNationalView ? agePyramid?.national : agePyramid?.prefectures?.[demoPref];
  const pyrName = isNationalView ? '全国' : demoPref;
  // 社人研3帯リボン（tlBands）: 県=当該県系列 / 全国=47県の人口加重。厳密導出（0-64=100−rate65 / 65-74=rate65−rate75 / 75+=rate75）
  const tlBands = (() => {
    if (!futureDemo?.prefectures) return null;
    if (isNationalView) {
      let pop = 0, s65 = 0, s75 = 0;
      futureDemo.prefectures.forEach(p => {
        const P = p.total_pop?.[fy], a65 = p.aging_rate_65?.[fy], a75 = p.aging_rate_75?.[fy];
        if (P && a65 != null && a75 != null) { pop += P; s65 += a65 * P / 100; s75 += a75 * P / 100; }
      });
      if (pop <= 0) return null;
      const r65 = s65 / pop * 100, r75 = s75 / pop * 100;
      return { b064: 100 - r65, b6574: r65 - r75, b75: r75 };
    }
    const fp = futureDemo.prefectures.find(p => p.pref === demoPref);
    if (!fp) return null;
    const r65 = fp.aging_rate_65?.[fy], r75 = fp.aging_rate_75?.[fy];
    if (r65 == null || r75 == null) return null;
    return { b064: 100 - r65, b6574: r65 - r75, b75: r75 };
  })();

  // 将来KPI集計: 県表示=選択医療圏の市区町村を社人研市区町村推計で合算 / 全国=47県加重。
  // 出生・年少・生産年齢は市区町村将来推計に存在しないため推計モードでは「—」（捏造しない）。
  const futAgg = (() => {
    if (!isFut) return null;
    if (isNationalView) {
      if (!futureDemo?.prefectures) return null;
      let pop = 0, s65 = 0, s75 = 0;
      futureDemo.prefectures.forEach(p => {
        const P = p.total_pop?.[fy], a65 = p.aging_rate_65?.[fy], a75 = p.aging_rate_75?.[fy];
        if (P && a65 != null) { pop += P; s65 += a65 * P / 100; if (a75 != null) s75 += a75 * P / 100; }
      });
      return pop > 0 ? { pop, rate65: s65 / pop * 100, rate75: s75 / pop * 100, covered: 47, total: 47 } : null;
    }
    let pop = 0, s65 = 0, s75 = 0, covered = 0;
    ms.forEach(m => {
      const f = muniFuture[m.name];
      if (!f) return;
      const P = f.total_pop?.[fy], a65 = f.aging_rate_65?.[fy], a75 = f.aging_rate_75?.[fy];
      if (P && a65 != null) { pop += P; s65 += a65 * P / 100; covered++; if (a75 != null) s75 += a75 * P / 100; }
    });
    return pop > 0 ? { pop, rate65: s65 / pop * 100, rate75: s75 / pop * 100, covered, total: ms.length } : null;
  })();

  // ── ダンベル表: 各市区町村の高齢化率(65+)を 起点2025推計 → 終点fy推計 で行内モーフ ──
  const muniRows = ms.map(m => {
    const f = muniFuture[m.name] || null;
    const s = f?.aging_rate_65?.['2025'];
    const e = f?.aging_rate_65?.[fy];
    return { ...m, fut: f, s, e, hasFut: f != null && s != null && e != null };
  });
  // 共通ドメイン（全DEMO年の65+推計 + 住基実測を含めスクラバー中も軸を固定）
  let dmin = Infinity, dmax = -Infinity;
  muniRows.forEach(r => {
    if (r.hasFut) DEMO_YEARS.forEach(y => { const v = r.fut.aging_rate_65?.[y]; if (v != null) { if (v < dmin) dmin = v; if (v > dmax) dmax = v; } });
    if (typeof r.aging === 'number') { if (r.aging < dmin) dmin = r.aging; if (r.aging > dmax) dmax = r.aging; }
  });
  if (!isFinite(dmin) || !isFinite(dmax) || dmin === dmax) { dmin = 10; dmax = 55; }
  dmin = Math.floor(dmin); dmax = Math.ceil(dmax);
  const muniCoverage = muniRows.filter(r => r.hasFut).length;
  const muniMissing = muniRows.length - muniCoverage;

  // ソート（列ヘッダ click・useFlipRows で行が滑走）
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const onSort = (k) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'name' ? 'asc' : 'desc'); }
  };
  const sortedRows = useMemo(() => {
    if (!sortKey) return muniRows;
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (r) => {
      switch (sortKey) {
        case 'name': return r.name;
        case 'pop': return r.pop;
        case 'aging': return r.hasFut ? r.e : (typeof r.aging === 'number' ? r.aging : null);
        case 'births': return r.births;
        case 'deaths': return r.deaths;
        case 'nc': return r.nc;
        case 'hh': return r.hh;
        default: return 0;
      }
    };
    return [...muniRows].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;   // 推計対象外は末尾
      if (bv == null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv, 'ja') * dir;
      return (av - bv) * dir;
    });
  }, [muniRows, sortKey, sortDir]);

  // 行click=◆ピン（比較・橙#f97316）。県/医療圏切替でクリア。
  const [pinnedMuni, setPinnedMuni] = useState(null);
  useEffect(() => { setPinnedMuni(null); }, [demoPref, demoArea]);
  const pinnedRow = pinnedMuni ? muniRows.find(r => r.name === pinnedMuni) : null;

  const rowRefs = useRef({});
  useFlipRows(rowRefs, [sortKey, sortDir, demoArea, demoPref, fy, pinnedMuni], mob);

  // KPIカウントアップは県/医療圏/年の切替で必ず正しい現在値へ収束させる（切替時はkey変更で再マウント→
  // useState(target)が正値で初期化。連続する将来年スクラブ中もfyをkeyに含め、実測と推計の取り違えを防ぐ）。
  const kpiKeyBase = `${isNationalView ? 'nat' : demoPref}|${demoArea || ''}`;
  const kpiKey = `${kpiKeyBase}|${(isFut && futAgg) ? 'f' + fy : 'n'}`;

  return <>

          {/* Aging rate map — full viewport with year selector */}
          {(()=>{
            // Compute aging rates: current from areaDemoData, future from futureDemo
            let agingRates = {};
            let prefPops = {};
            if (isFuture && futureDemo?.prefectures) {
              futureDemo.prefectures.forEach(p => {
                if (p.aging_rate_65?.[futureYear]) agingRates[p.pref] = p.aging_rate_65[futureYear];
                if (p.total_pop?.[futureYear]) prefPops[p.pref] = p.total_pop[futureYear];
              });
            } else {
              // 現在(2025): 住基2025(agePyramid)の完全な県人口・65+率
              Object.entries(agePyramid?.prefectures || {}).forEach(([p, ap]) => {
                const t = pyramidTotals(ap);
                if (t) { agingRates[p] = t.rate65; prefPops[p] = t.total; }
              });
            }

            const vals = Object.values(agingRates).filter(v => v > 0);
            const minA = Math.min(...vals) || 20, maxA = Math.max(...vals) || 40;
            const agingColor = v => { if (!v) return '#f5f5f5'; const r = (v - minA) / (maxA - minA); return r > .8 ? '#b91c1c' : r > .6 ? '#dc2626' : r > .4 ? '#ea580c' : r > .2 ? '#f59e0b' : '#fef3c7'; };
            const totalPop47 = Object.values(prefPops).reduce((s, v) => s + v, 0);
            const natAvg = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
            // 全国モード時: selRate=全国加重平均, selRank=null
            let totalP65_47 = 0;
            Object.entries(prefPops).forEach(([p, pop]) => { totalP65_47 += (agingRates[p] || 0) * pop / 100; });
            const natWeighted = totalPop47 > 0 ? totalP65_47/totalPop47*100 : 0;
            const selRate = isNationalView ? natWeighted : (agingRates[demoPref] || 0);
            const rankList = Object.entries(agingRates).sort((a, b) => b[1] - a[1]);
            const selRank = isNationalView ? null : (rankList.findIndex(([p]) => p === demoPref) + 1);

            // Get current rate for delta display — 住基2025(agePyramid)基準
            let currentRate = 0;
            if (isFuture) {
              const t = pyramidTotals(isNationalView ? agePyramid?.national : agePyramid?.prefectures?.[demoPref]);
              currentRate = t ? t.rate65 : 0;
            }
            const delta = isFuture ? selRate - currentRate : 0;

            return japanMap && vals.length > 0 ? (
            <div style={{background:'#fff',borderRadius:14,padding:mob?'8px 8px 4px':'10px 16px 6px',border:'1px solid #f0f0f0',position:'relative',minHeight:mob?'calc(100vh - 170px)':'calc(100vh - 140px)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',display:'flex',flexDirection:'column'}}>
              {/* Year selector */}
              <div style={{display:'flex',gap:3,marginBottom:6,flexWrap:'wrap',alignItems:'center'}}>
                <span style={{fontSize:11,color:'#94a3b8',marginRight:4}}>時点:</span>
                {YEAR_OPTIONS.map(y => (
                  <button key={y} onClick={()=>setFutureYear(y)} style={{
                    padding:'3px 10px',borderRadius:14,border:futureYear===y?'2px solid #2563EB':'1px solid #e2e8f0',
                    background:futureYear===y?'#eff6ff':'#fff',color:futureYear===y?'#2563EB':'#94a3b8',
                    fontSize:11,fontWeight:futureYear===y?700:400,cursor:'pointer',
                  }}>{y==='2025'?'現在(2025)':y}</button>
                ))}
                {isFuture && <span style={{fontSize:10,color:'#f59e0b',marginLeft:6}}>※社人研 令和5年推計</span>}
              </div>

              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
                <div style={{display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap'}}>
                  <span style={{fontSize:mob?26:32,fontWeight:700,color:'#b91c1c'}}>{selRate.toFixed(1)}%</span>
                  {isFuture && delta !== 0 && <span style={{fontSize:14,fontWeight:700,color:delta>0?'#dc2626':'#059669'}}>{delta>0?'↑':'↓'}{Math.abs(delta).toFixed(1)}pt</span>}
                  <span style={{fontSize:14,fontWeight:600,color:'#1e293b'}}>{isNationalView ? '全国合計' : demoPref}</span>
                  <span style={{fontSize:12,color:'#94a3b8'}}>{isNationalView ? `(47県加重平均 | 単純平均 ${natAvg.toFixed(1)}%)` : `(${selRank}/47位 | 全国平均 ${natAvg.toFixed(1)}%)`}</span>
                </div>
                <div style={{display:'flex',gap:3,alignItems:'center',fontSize:10,color:'#94a3b8',flexShrink:0}}>
                  <span>{minA.toFixed(0)}%</span>
                  {['#fef3c7','#f59e0b','#ea580c','#dc2626','#b91c1c'].map((c,i)=><div key={i} style={{width:mob?12:18,height:8,background:c,borderRadius:2}}/>)}
                  <span>{maxA.toFixed(0)}%</span>
                </div>
              </div>

              <svg viewBox="-5 -5 448 526" style={{width:'100%',flex:1,minHeight:0}} preserveAspectRatio="xMidYMid meet">
                {japanMap.prefs.map(pf=>{
                  const rate=agingRates[pf.ja]||0;
                  const isHov=hovPref===pf.ja;
                  const isSel=demoPref===pf.ja;
                  return <path key={pf.id} d={pf.d}
                    fill={isHov?'#7c2d12':isSel?'#1e40af':agingColor(rate)}
                    stroke={isSel?'#1e40af':'#fff'} strokeWidth={isSel?1.5:0.5}
                    style={{cursor:'pointer',transition:'fill 0.15s'}}
                    onMouseEnter={e=>{setHovPref(pf.ja);const r2=e.currentTarget.getBoundingClientRect();const svgR=e.currentTarget.closest('svg').getBoundingClientRect();setTooltipPos({x:r2.x-svgR.x+r2.width/2,y:r2.y-svgR.y});}}
                    onMouseLeave={()=>setHovPref(null)}
                    onClick={()=>{setDemoPref(pf.ja);const a2=areaDemoData.filter(x=>x.pref===pf.ja);if(a2.length)setDemoArea(a2[0].area);setHovPref(null);}}
                  />;
                })}
              </svg>
              {hovPref&&agingRates[hovPref]&&(
                <div style={{position:'absolute',left:Math.min(tooltipPos.x,mob?200:400),top:tooltipPos.y+(mob?90:120),background:'#1e293b',color:'#fff',padding:'10px 16px',borderRadius:8,fontSize:12,pointerEvents:'none',zIndex:10,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',whiteSpace:'nowrap'}}>
                  <div style={{fontWeight:700,marginBottom:3,fontSize:13}}>{hovPref} {isFuture?`(${futureYear}年推計)`:''}</div>
                  <div>高齢化率: <span style={{color:'#fbbf24',fontWeight:700,fontSize:15}}>{agingRates[hovPref].toFixed(1)}%</span></div>
                  {prefPops[hovPref] && <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>人口: {fmt(prefPops[hovPref])}</div>}
                </div>
              )}
            </div>
            ) : null;
          })()}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Demographics & Projection</div>
            <h1 style={{fontSize:mob?20:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>人口動態・将来推計</h1>
            <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>市区町村別の人口構成・高齢化率・自然増減を分析。社人研推計で2050年までの将来予測を俯瞰。</p>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
            <select value={demoPref || '全国'} onChange={e=>{
              const v = e.target.value === '全国' ? null : e.target.value;
              setDemoPref(v);
              if (v) { const a=areaDemoData.filter(x=>x.pref===v); if(a.length)setDemoArea(a[0].area); }
            }} style={{padding:'8px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff'}}>
              <option value="全国">全国</option>
              {sortPrefs(demoPrefList).map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            {!isNationalView && (
              <select value={demoArea} onChange={e=>setDemoArea(e.target.value)} style={{padding:'8px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff'}}>
                {areaNames.map(a=><option key={a} value={a}>{a}</option>)}
              </select>
            )}
          </div>
          <h2 style={{fontSize:mob?16:18,fontWeight:600,margin:'0 0 16px',color:'#1e293b'}}>人口・人口動態 — {isNationalView ? '全国合計 (47都道府県)' : `${demoPref} ${selArea?.area||''}`}</h2>
          <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(4,1fr)',gap:10,marginBottom:12}}>
            {(isFut && futAgg ? [
              {l:'総人口',s:`${fy}年推計`,c:'#2563EB',num:futAgg.pop},
              {l:'高齢化率',s:`65歳以上 · ${fy}推計`,c:'#dc2626',pct:futAgg.rate65},
              {l:'75歳以上',s:`${fy}推計`,c:'#b91c1c',pct:futAgg.rate75},
              {l:'年少・生産年齢',s:'市区町村推計に無し',c:'#94a3b8',dash:true},
            ] : [
              {l:'総人口',s:'',c:'#2563EB',num:tPop},
              {l:'高齢化率',s:'65歳以上',c:'#dc2626',pct:r65num},
              {l:'年少人口',s:'0-14歳',c:'#3b82f6',num:t15},
              {l:'生産年齢',s:'15-64歳',c:'#059669',num:tW},
            ]).map((k,i)=>(
              <div key={i} style={{background:'#fff',borderRadius:10,padding:'12px 16px',border:'1px solid #f0f0f0'}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{k.l}</div>
                <div style={{fontSize:mob?20:24,fontWeight:700,color:k.c}}>
                  {k.dash ? '—' : k.pct != null ? <CountUpNum key={kpiKey} value={k.pct} decimals={1} suffix="%" /> : <AnimInt key={kpiKey} value={k.num} />}
                </div>
                {k.s&&<div style={{fontSize:10,color:'#94a3b8'}}>{k.s}</div>}
              </div>))}
          </div>
          {isFut && !isNationalView && futAgg && futAgg.covered < futAgg.total && (
            <div style={{fontSize:10,color:'#94a3b8',margin:'-6px 0 10px'}}>※ 推計はこの医療圏 {futAgg.total} 市区町村中 {futAgg.covered} 件で集計（残り {futAgg.total - futAgg.covered} 件は社人研公表外＝推計対象外）。</div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
            {[{l:'出生数',num:tB,c:'#059669'},{l:'死亡数',num:tD,c:'#64748b'},{l:'自然増減',num:tNC,signed:true,c:tNC>=0?'#059669':'#dc2626'}].map((k,i)=>(
              <div key={i} style={{background:'#fff',borderRadius:10,padding:'12px 16px',border:'1px solid #f0f0f0'}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{k.l}</div>
                <div style={{fontSize:mob?18:22,fontWeight:700,color:k.c}}>{k.signed && k.num>=0 ? '+' : ''}<AnimInt key={kpiKeyBase} value={k.num} /></div>
              </div>))}
          </div>
          {isFut && <div style={{fontSize:10,color:'#94a3b8',margin:'-10px 0 12px'}}>※ 出生・死亡・自然増減は住基動態（令和6年中）の実測。市区町村別の将来推計は総人口・高齢化率のみのため、これらは推計モードでも実測値を表示。</div>}
          {tPop>0&&<div style={{background:'#fff',borderRadius:10,padding:'14px 16px',border:'1px solid #f0f0f0',marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>年齢構成</div>
            <div style={{display:'flex',height:26,borderRadius:6,overflow:'hidden',marginBottom:6}}>
              <div style={{width:`${r15}%`,background:'#3b82f6',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff',fontWeight:600}}>{r15}%</div>
              <div style={{width:`${rW}%`,background:'#22c55e',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff',fontWeight:600}}>{rW}%</div>
              <div style={{width:`${r65}%`,background:'#ef4444',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff',fontWeight:600}}>{r65}%</div>
            </div>
            <div style={{display:'flex',gap:16,fontSize:11,color:'#64748b'}}>
              {[['#3b82f6','0-14歳'],['#22c55e','15-64歳'],['#ef4444','65歳以上']].map(([c,l])=><span key={l}><span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:c,marginRight:3}}/>{l}</span>)}
            </div>
          </div>}
          {/* Age Pyramid — AgePyramidGhost（%正規化・全国ゴースト重畳・社人研3帯リボンが fy 連動モーフ） */}
          {agePyramid && agePyramid.national && pyrAp?.male && pyrAp?.female && (
            <div style={{background:'#fff',borderRadius:10,padding:'14px 16px',border:'1px solid #f0f0f0',marginBottom:16}}>
              <AgePyramidGhost
                ap={pyrAp}
                natAp={agePyramid.national}
                ageGroups={ageGroups}
                prefName={pyrName}
                tlBands={tlBands}
                tlYear={fy}
                mob={mob}
                yearBadges={{ pyramid: yb('agePyramid'), ribbon: yb('futureDemo') }}
              />
            </div>
          )}
          {!isNationalView && (()=>{
            const COLS = [
              {k:'name',label:'市区町村',align:'left'},
              {k:'pop',label:'人口規模',align:'right'},
              {k:null,label:'構成比',align:'right',sortable:false},
              {k:'aging',label:`高齢化率 2025→${fy}`,align:'left'},
              {k:'births',label:'出生数',align:'right'},
              {k:'deaths',label:'死亡数',align:'right'},
              {k:'nc',label:'自然増減',align:'right'},
              {k:'hh',label:'世帯数',align:'right'},
            ];
            const DW = mob?92:150, PAD=4;
            const dx = (v)=> PAD + (dmax>dmin ? Math.max(0,Math.min(1,(v-dmin)/(dmax-dmin))) : 0)*(DW-2*PAD);
            const agingChipCol = (a)=> a>30?{bg:'#fef2f2',fg:'#dc2626'} : a<20?{bg:'#f0fdf4',fg:'#16a34a'} : {bg:'#f8fafc',fg:'#64748b'};
            return (
          <div style={{background:'#fff',borderRadius:12,border:'1px solid #f0f0f0',overflow:'hidden'}}>
            {/* ダンベル凡例 */}
            <div style={{display:'flex',gap:14,flexWrap:'wrap',padding:'10px 12px 4px',fontSize:10,color:'#64748b',alignItems:'center'}}>
              <span style={{fontWeight:600,color:'#475569'}}>高齢化率(65+)の推移</span>
              <span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:4,background:'#cbd5e1',display:'inline-block'}} />起点 2025推計</span>
              <span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:4,background:'#f59e0b',display:'inline-block'}} />終点 {fy}推計</span>
              <span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{color:'#94a3b8'}}>▲</span> 住基2025実測</span>
              <span style={{color:'#94a3b8'}}>行click＝◆ピン比較 · 列見出しclickでソート</span>
            </div>
            {/* ピン読み取り */}
            {pinnedRow && (
              <div style={{margin:'2px 12px 6px',padding:'6px 10px',borderRadius:8,background:'#fff7ed',border:'1px solid #fed7aa',fontSize:11,color:'#9a3412',display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
                <span style={{fontWeight:700}}>◆ {pinnedRow.name}</span>
                {pinnedRow.hasFut
                  ? <span>高齢化率 65+: <b>{pinnedRow.s.toFixed(1)}%</b>(2025推計) → <b>{pinnedRow.e.toFixed(1)}%</b>({fy}推計) <span style={{color:pinnedRow.e-pinnedRow.s>=0?'#dc2626':'#059669',fontWeight:700}}>{pinnedRow.e-pinnedRow.s>=0?'+':''}{(pinnedRow.e-pinnedRow.s).toFixed(1)}pt</span> · 住基2025実測 {pinnedRow.aging}%</span>
                  : <span>住基2025実測 高齢化率 {pinnedRow.aging}% · <span style={{color:'#94a3b8'}}>社人研推計対象外</span></span>}
                <button onClick={()=>setPinnedMuni(null)} style={{marginLeft:'auto',background:'none',border:'none',color:'#c2410c',cursor:'pointer',fontSize:11,fontWeight:600}}>解除</button>
              </div>
            )}
            <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr style={{background:'#fafbfc'}}>
                {COLS.map((c,i)=>{
                  const active = c.k && sortKey===c.k;
                  return <th key={i} onClick={c.sortable===false?undefined:()=>onSort(c.k)}
                    style={{padding:'9px 10px',fontSize:11,fontWeight:600,color:active?'#2563EB':'#94a3b8',textAlign:c.align,borderBottom:'1px solid #f1f5f9',whiteSpace:'nowrap',cursor:c.sortable===false?'default':'pointer',userSelect:'none'}}>
                    {c.label}{c.sortable!==false && <span style={{marginLeft:3,fontSize:9,opacity:active?1:0.35}}>{active?(sortDir==='asc'?'▲':'▼'):'↕'}</span>}
                  </th>;
                })}
              </tr></thead>
              <tbody>{sortedRows.map((r)=>{
                const pin = pinnedMuni===r.name;
                const endCol = pin ? '#f97316' : '#f59e0b';
                const ch = agingChipCol(r.aging);
                return (
                <tr key={r.name} ref={el=>{ if(el) rowRefs.current[r.name]=el; else delete rowRefs.current[r.name]; }}
                  onClick={()=>setPinnedMuni(p=>p===r.name?null:r.name)}
                  onMouseEnter={e=>{ if(!pin) e.currentTarget.style.background='#f8faff'; }}
                  onMouseLeave={e=>{ e.currentTarget.style.background = pin?'#fff7ed':'transparent'; }}
                  style={{borderBottom:'1px solid #f8f9fa',cursor:'pointer',background:pin?'#fff7ed':'transparent',borderLeft:pin?'3px solid #f97316':'3px solid transparent'}}>
                  <td style={{padding:'9px 10px',fontWeight:pin?700:500,color:pin?'#9a3412':'#1e293b'}}>{pin?'◆ ':''}{r.name}</td>
                  <td style={{padding:'9px 10px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(r.pop)}</td>
                  <td style={{padding:'9px 10px',textAlign:'right',color:'#64748b'}}>{tPop?(r.pop/tPop*100).toFixed(1):'0'}%</td>
                  <td style={{padding:'9px 6px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      {r.hasFut ? (
                        <svg viewBox={`0 0 ${DW} 16`} width={DW} height={16} style={{flexShrink:0,display:'block'}}>
                          <line x1={PAD} y1={8} x2={DW-PAD} y2={8} stroke="#f1f5f9" strokeWidth={1} />
                          <line x1={dx(r.s)} y1={8} x2={dx(r.e)} y2={8} stroke="#fcd34d" strokeWidth={2.5} strokeLinecap="round" style={{transition:'x1 300ms ease, x2 300ms ease'}} />
                          <circle cx={dx(r.s)} cy={8} r={2.6} fill="#cbd5e1" />
                          {typeof r.aging==='number' && <path d={`M ${dx(r.aging)} 3 L ${dx(r.aging)-3} 9 L ${dx(r.aging)+3} 9 Z`} fill="#94a3b8" />}
                          <circle cx={dx(r.e)} cy={8} r={pin?4:3.4} fill={endCol} style={{transition:'cx 300ms ease'}} />
                        </svg>
                      ) : (
                        <span style={{fontSize:10,color:'#cbd5e1',width:DW,display:'inline-block',flexShrink:0}}>推計対象外</span>
                      )}
                      {r.hasFut
                        ? <span style={{fontSize:12,fontWeight:700,color:endCol,fontVariantNumeric:'tabular-nums',minWidth:34}}>{r.e.toFixed(1)}%</span>
                        : <span style={{padding:'1px 7px',borderRadius:16,fontSize:12,fontWeight:500,background:ch.bg,color:ch.fg}}>{r.aging}%</span>}
                    </div>
                  </td>
                  <td style={{padding:'9px 10px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(r.births)}</td>
                  <td style={{padding:'9px 10px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(r.deaths)}</td>
                  <td style={{padding:'9px 10px',textAlign:'right',fontWeight:500,color:r.nc>=0?'#16a34a':'#dc2626',fontVariantNumeric:'tabular-nums'}}>{r.nc>=0?'+':''}{fmt(r.nc)}</td>
                  <td style={{padding:'9px 10px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(r.hh)}</td>
                </tr>);
              })}</tbody>
            </table>
            </div>
            <div style={{padding:'10px 12px',fontSize:11,color:'#94a3b8',borderTop:'1px solid #f1f5f9'}}>
              高齢化率トレンドは社人研 令和5年推計（市区町村別・2020年国勢調査ベース）の65歳以上割合で、起点2025→終点{fy}推計。人口規模・出生・死亡・世帯は住民基本台帳（2025年1月1日 / 動態は令和6年中）の実測。
              {muniMissing>0 && ` この医療圏 ${muniRows.length} 件中 ${muniMissing} 件は社人研公表外（推計対象外）。`}
            </div>
          </div>
          );})()}
          {isNationalView && (
            <div style={{background:'#fff',borderRadius:12,border:'1px solid #f0f0f0',padding:'14px 16px',fontSize:12,color:'#64748b',lineHeight:1.6}}>
              ※ 全国モードでは市区町村別の明細は省略しています。詳細を見るには上のセレクタで都道府県を選択してください。出典: 住民基本台帳人口（2025年1月1日現在）/ 出生・死亡: 住基に基づく令和6年中人口動態{isFuture && ' / 将来推計: 社人研 令和5年推計（2020年国勢調査ベース）'}
            </div>
          )}

  </>;
}
