'use client';
import { useMemo } from 'react';
import { fmt, METRICS, mKey } from '../shared';

const VITAL_MAP = { cancer: 'がん(悪性新生物)', heart: '心疾患', stroke: '脳血管疾患' };
const isVital = m => m in VITAL_MAP;

export default function MapView({ mob, prefs, metric, setMetric, japanMap, hovPref, setHovPref, tooltipPos, setTooltipPos, setSelectedPref, setView, vitalStats }) {
  // Build unified data: prefs for facility metrics, vitalStats for death cause metrics
  const displayData = useMemo(() => {
    if (!isVital(metric) || !vitalStats?.prefectures) {
      return prefs.map(p => ({ ...p, val: p[metric] || 0 }));
    }
    const causeName = VITAL_MAP[metric];
    return vitalStats.prefectures.map(vp => {
      const c = vp.causes?.find(x => x.cause === causeName);
      return { name: vp.pref, val: c?.rate || 0, cause: c };
    });
  }, [prefs, metric, vitalStats]);

  const maxVal = useMemo(() => Math.max(...displayData.map(d => d.val), 1), [displayData]);
  const getColor = v => { const r = v / maxVal; return r > .7 ? '#b91c1c' : r > .4 ? '#ea580c' : r > .2 ? '#f59e0b' : r > .1 ? '#fbbf24' : '#fef3c7'; };
  const dataByName = useMemo(() => { const m = {}; displayData.forEach(d => m[d.name] = d); return m; }, [displayData]);
  const metricLabel = Object.values(METRICS)[Object.values(mKey).indexOf(metric)];

  return <>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:mob?8:12,flexWrap:'wrap',gap:8}}>
    <div>
      <h1 style={{fontSize:mob?18:20,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>都道府県別 {isVital(metric)?'疾病構造':'医療機関分布'}</h1>
      {isVital(metric) && <p style={{fontSize:11,color:'#f59e0b',margin:'4px 0 0'}}>※厚労省人口動態統計 2024年確定数</p>}
    </div>
    <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
      {Object.entries(mKey).map(([k,v])=>(
        <button key={k} onClick={()=>setMetric(v)} style={{padding:mob?'4px 8px':'5px 12px',borderRadius:18,border:metric===v?'2px solid '+(isVital(v)?'#7c3aed':'#b91c1c'):'1px solid #e2e8f0',background:metric===v?(isVital(v)?'#f5f3ff':'#fef2f2'):'#fff',color:metric===v?(isVital(v)?'#7c3aed':'#b91c1c'):'#64748b',fontSize:11,fontWeight:metric===v?600:400,cursor:'pointer'}}>{METRICS[k]}</button>
      ))}
    </div>
  </div>
  <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'1fr 240px',gap:12}}>
    <div style={{background:'#fff',borderRadius:14,padding:mob?'8px':'12px 16px',border:'1px solid #f0f0f0',position:'relative',minHeight:mob?'calc(100vh - 180px)':'calc(100vh - 160px)'}}>
      <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:4}}>
        <span style={{fontSize:26,fontWeight:700,color:isVital(metric)?'#7c3aed':'#b91c1c'}}>{fmt(displayData.reduce((s,d)=>s+d.val,0))}</span>
        <span style={{fontSize:11,color:'#94a3b8'}}>{metricLabel}{isVital(metric)?' (2024年)':''} ｜ hover/タップで詳細</span>
      </div>
      {japanMap && (
        <svg viewBox={japanMap.viewBox} style={{width:'100%',height:mob?'calc(100vh - 220px)':'calc(100vh - 200px)'}} preserveAspectRatio="xMidYMid meet">
          {japanMap.prefs.map(pf => {
            const data = dataByName[pf.ja];
            const val = data?.val||0;
            const isHov = hovPref===pf.ja;
            return <path key={pf.id} d={pf.d}
              fill={isHov?'#7c2d12':getColor(val)}
              stroke="#fff" strokeWidth="0.5"
              style={{cursor:'pointer',transition:'fill 0.15s'}}
              onMouseEnter={e=>{setHovPref(pf.ja);const r=e.currentTarget.getBoundingClientRect();const svgR=e.currentTarget.closest('svg').getBoundingClientRect();setTooltipPos({x:r.x-svgR.x+r.width/2,y:r.y-svgR.y});}}
              onMouseLeave={()=>setHovPref(null)}
              onClick={()=>{setSelectedPref(pf.ja);setView('muni');}}
            />;
          })}
        </svg>
      )}
      {hovPref && (()=>{const d=dataByName[hovPref];return d?(
        <div style={{position:'absolute',left:Math.min(tooltipPos.x,mob?200:400),top:tooltipPos.y+60,background:'#1e293b',color:'#fff',padding:'8px 14px',borderRadius:8,fontSize:12,pointerEvents:'none',zIndex:10,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',whiteSpace:'nowrap'}}>
          <div style={{fontWeight:700,marginBottom:2}}>{hovPref}</div>
          <div>{metricLabel}: <span style={{color:'#fbbf24',fontWeight:600}}>{isVital(metric)?d.val.toFixed(1):fmt(d.val)}{isVital(metric)?'/10万':''}</span></div>
          {d.cause && <div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>死因順位 第{d.cause.rank}位</div>}
        </div>
      ):null;})()}
    </div>
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',overflow:'hidden',maxHeight:mob?300:'calc(100vh - 160px)',overflowY:'auto',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
      <div style={{padding:'10px 12px',borderBottom:'1px solid #f0f0f0',fontSize:12,fontWeight:600,position:'sticky',top:0,background:'#fff',zIndex:1}}>全{displayData.length}都道府県</div>
      {[...displayData].sort((a,b)=>b.val-a.val).map((p,i)=>(
        <div key={p.name} onClick={()=>{setSelectedPref(p.name);setView('muni');}} style={{display:'flex',alignItems:'center',padding:'6px 12px',borderBottom:'1px solid #f8f9fa',cursor:'pointer',fontSize:12}} onMouseEnter={e=>e.currentTarget.style.background='#f0f7ff'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <span style={{width:20,fontWeight:600,color:'#94a3b8',fontSize:10}}>{i+1}</span>
          <span style={{flex:1,fontWeight:500}}>{p.name}</span>
          <span style={{fontWeight:600,color:isVital(metric)?'#7c3aed':'#b91c1c',fontVariantNumeric:'tabular-nums',fontSize:12}}>{fmt(p.val)}</span>
          <div style={{width:60,height:6,borderRadius:3,background:'#f1f5f9',marginLeft:8,overflow:'hidden'}}>
            <div style={{height:'100%',borderRadius:3,background:getColor(p.val),width:`${p.val/maxVal*100}%`}}/>
          </div>
        </div>
      ))}
    </div>
  </div>
  </>;
}
