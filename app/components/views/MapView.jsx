'use client';
import { useMemo } from 'react';
import { fmt, METRICS, mKey } from '../shared';

export default function MapView({ mob, prefs, metric, setMetric, japanMap, hovPref, setHovPref, tooltipPos, setTooltipPos, setSelectedPref, setView }) {
  const maxVal = useMemo(() => Math.max(...prefs.map(p=>p[metric]||0), 1), [prefs,metric]);
  const getColor = v => { const r=v/maxVal; return r>.7?'#b91c1c':r>.4?'#ea580c':r>.2?'#f59e0b':r>.1?'#fbbf24':'#fef3c7'; };
  const prefByName = useMemo(() => {
    const m = {}; prefs.forEach(p => m[p.name] = p); return m;
  }, [prefs]);

  return <>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:mob?8:12,flexWrap:'wrap',gap:8}}>
    <div>
      <h1 style={{fontSize:mob?18:20,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>都道府県別 医療機関分布</h1>
    </div>
    <div style={{display:'flex',gap:4}}>
      {Object.entries(mKey).map(([k,v])=>(
        <button key={k} onClick={()=>setMetric(v)} style={{padding:mob?'5px 10px':'6px 14px',borderRadius:20,border:metric===v?'2px solid #b91c1c':'1px solid #e2e8f0',background:metric===v?'#fef2f2':'#fff',color:metric===v?'#b91c1c':'#64748b',fontSize:12,fontWeight:metric===v?600:400,cursor:'pointer'}}>{METRICS[k]}</button>
      ))}
    </div>
  </div>
  <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'1fr 240px',gap:12}}>
    <div style={{background:'#fff',borderRadius:14,padding:mob?'8px':'12px 16px',border:'1px solid #f0f0f0',position:'relative',minHeight:mob?'calc(100vh - 180px)':'calc(100vh - 160px)'}}>
      <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:4}}>
        <span style={{fontSize:26,fontWeight:700,color:'#b91c1c'}}>{fmt(prefs.reduce((s,p)=>s+(p[metric]||0),0))}</span>
        <span style={{fontSize:11,color:'#94a3b8'}}>{Object.values(METRICS)[Object.values(mKey).indexOf(metric)]} ｜ hover/タップで詳細</span>
      </div>
      {japanMap && (
        <svg viewBox={japanMap.viewBox} style={{width:'100%',height:mob?'calc(100vh - 220px)':'calc(100vh - 200px)'}} preserveAspectRatio="xMidYMid meet">
          {japanMap.prefs.map(pf => {
            const data = prefByName[pf.ja];
            const val = data?.[metric]||0;
            const isHov = hovPref===pf.ja;
            return (
              <path key={pf.id} d={pf.d}
                fill={isHov?'#7c2d12':getColor(val)}
                stroke="#fff" strokeWidth="0.5"
                style={{cursor:'pointer',transition:'fill 0.15s'}}
                onMouseEnter={e=>{setHovPref(pf.ja);const r=e.currentTarget.getBoundingClientRect();const svgR=e.currentTarget.closest('svg').getBoundingClientRect();setTooltipPos({x:r.x-svgR.x+r.width/2,y:r.y-svgR.y});}}
                onMouseLeave={()=>setHovPref(null)}
                onClick={()=>{setSelectedPref(pf.ja);setView('muni');}}
              />
            );
          })}
        </svg>
      )}
      {hovPref && (()=>{const d=prefByName[hovPref];return d?(
        <div style={{position:'absolute',left:Math.min(tooltipPos.x,mob?200:400),top:tooltipPos.y+60,background:'#1e293b',color:'#fff',padding:'8px 14px',borderRadius:8,fontSize:12,pointerEvents:'none',zIndex:10,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',whiteSpace:'nowrap'}}>
          <div style={{fontWeight:700,marginBottom:2}}>{hovPref}</div>
          <div>{Object.values(METRICS)[Object.values(mKey).indexOf(metric)]}: <span style={{color:'#fbbf24',fontWeight:600}}>{fmt(d[metric])}</span></div>
        </div>
      ):null;})()}
    </div>
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',overflow:'hidden',maxHeight:mob?300:'calc(100vh - 160px)',overflowY:'auto',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
      <div style={{padding:'10px 12px',borderBottom:'1px solid #f0f0f0',fontSize:12,fontWeight:600,position:'sticky',top:0,background:'#fff',zIndex:1}}>全{prefs.length}都道府県</div>
      {[...prefs].sort((a,b)=>(b[metric]||0)-(a[metric]||0)).map((p,i)=>(
        <div key={p.code} onClick={()=>{setSelectedPref(p.name);setView('muni');}} style={{display:'flex',alignItems:'center',padding:'6px 12px',borderBottom:'1px solid #f8f9fa',cursor:'pointer',fontSize:12}} onMouseEnter={e=>e.currentTarget.style.background='#f0f7ff'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <span style={{width:20,fontWeight:600,color:'#94a3b8',fontSize:10}}>{i+1}</span>
          <span style={{flex:1,fontWeight:500}}>{p.name}</span>
          <span style={{fontWeight:600,color:'#b91c1c',fontVariantNumeric:'tabular-nums',fontSize:12}}>{fmt(p[metric])}</span>
          <div style={{width:60,height:6,borderRadius:3,background:'#f1f5f9',marginLeft:8,overflow:'hidden'}}>
            <div style={{height:'100%',borderRadius:3,background:getColor(p[metric]||0),width:`${(p[metric]||0)/maxVal*100}%`}}/>
          </div>
        </div>
      ))}
    </div>
  </div>
  </>;
}
