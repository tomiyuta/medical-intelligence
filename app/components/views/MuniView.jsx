'use client';
import { fmt, sortPrefs } from '../shared';

export default function MuniView({ mob, areaDemoData, demoPref, setDemoPref, demoArea, setDemoArea, demoPrefList, japanMap, hovPref, setHovPref, tooltipPos, setTooltipPos }) {
  const areas = areaDemoData.filter(a=>a.pref===demoPref);
  const areaNames = areas.map(a=>a.area);
  const selArea = areas.find(a=>a.area===demoArea) || areas[0];
  const ms = selArea?.munis || [];
  const tPop=ms.reduce((s,m)=>s+m.pop,0);
  const t15=ms.reduce((s,m)=>s+m.p15,0);
  const t65=ms.reduce((s,m)=>s+m.p65,0);
  const tW=tPop-t15-t65;
  const tB=ms.reduce((s,m)=>s+m.births,0);
  const tD=ms.reduce((s,m)=>s+m.deaths,0);
  const tNC=tB-tD;
  const r15=tPop?(t15/tPop*100).toFixed(1):'0';
  const rW=tPop?(tW/tPop*100).toFixed(1):'0';
  const r65=tPop?(t65/tPop*100).toFixed(1):'0';

  return <>

          {/* Aging rate map — full viewport */}
          {(()=>{
            const prefAging={};
            areaDemoData.forEach(d=>{let pop=0,p65=0;(d.munis||[]).forEach(m=>{pop+=m.pop||0;p65+=m.p65||0;});if(pop>0)prefAging[d.pref]=(prefAging[d.pref]||{pop:0,p65:0});if(prefAging[d.pref]){prefAging[d.pref].pop+=pop;prefAging[d.pref].p65+=p65;}});
            const agingRates={};Object.entries(prefAging).forEach(([p,s])=>{agingRates[p]=s.pop>0?(s.p65/s.pop*100):0;});
            const vals=Object.values(agingRates).filter(v=>v>0);
            const minA=Math.min(...vals)||20,maxA=Math.max(...vals)||40;
            const agingColor=v=>{if(!v)return '#f5f5f5';const r=(v-minA)/(maxA-minA);return r>.8?'#b91c1c':r>.6?'#dc2626':r>.4?'#ea580c':r>.2?'#f59e0b':'#fef3c7';};
            const selRate=agingRates[demoPref]||0;
            const rankList=Object.entries(agingRates).sort((a,b)=>b[1]-a[1]);
            const selRank=rankList.findIndex(([p])=>p===demoPref)+1;
            const totalPop47=Object.values(prefAging).reduce((s,v)=>s+v.pop,0);
            const total65_47=Object.values(prefAging).reduce((s,v)=>s+v.p65,0);
            const natAvg=totalPop47>0?(total65_47/totalPop47*100):0;
            return japanMap && vals.length>0 ? (
            <div style={{background:'#fff',borderRadius:14,padding:mob?'8px 8px 4px':'10px 16px 6px',border:'1px solid #f0f0f0',position:'relative',minHeight:mob?'calc(100vh - 170px)':'calc(100vh - 140px)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)',display:'flex',flexDirection:'column'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
                <div style={{display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap'}}>
                  <span style={{fontSize:mob?26:32,fontWeight:700,color:'#b91c1c'}}>{selRate.toFixed(1)}%</span>
                  <span style={{fontSize:14,fontWeight:600,color:'#1e293b'}}>{demoPref}</span>
                  <span style={{fontSize:12,color:'#94a3b8'}}>({selRank}/47位 | 全国 {natAvg.toFixed(1)}%)</span>
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
                <div style={{position:'absolute',left:Math.min(tooltipPos.x,mob?200:400),top:tooltipPos.y+(mob?90:100),background:'#1e293b',color:'#fff',padding:'10px 16px',borderRadius:8,fontSize:12,pointerEvents:'none',zIndex:10,boxShadow:'0 4px 12px rgba(0,0,0,0.15)',whiteSpace:'nowrap'}}>
                  <div style={{fontWeight:700,marginBottom:3,fontSize:13}}>{hovPref}</div>
                  <div>高齢化率: <span style={{color:'#fbbf24',fontWeight:700,fontSize:15}}>{agingRates[hovPref].toFixed(1)}%</span></div>
                  <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>人口: {fmt(prefAging[hovPref]?.pop||0)}</div>
                </div>
              )}
            </div>
            ) : null;
          })()}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Demographics</div>
            <h1 style={{fontSize:mob?20:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>市区町村別 人口動態</h1>
            <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>1次医療圏単位で人口構成・高齢化率・出生死亡の自然増減を分析。都道府県をクリックで選択。</p>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
            <select value={demoPref} onChange={e=>{setDemoPref(e.target.value);const a=areaDemoData.filter(x=>x.pref===e.target.value);if(a.length)setDemoArea(a[0].area);}} style={{padding:'8px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff'}}>
              {sortPrefs(demoPrefList).map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select value={demoArea} onChange={e=>setDemoArea(e.target.value)} style={{padding:'8px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff'}}>
              {areaNames.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <h2 style={{fontSize:mob?16:18,fontWeight:600,margin:'0 0 16px',color:'#1e293b'}}>人口・人口動態 — {demoPref} {selArea?.area||''}</h2>
          <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(4,1fr)',gap:10,marginBottom:12}}>
            {[{l:'総人口',v:fmt(tPop),s:'',c:'#2563EB'},{l:'高齢化率',v:r65+'%',s:'65歳以上',c:'#dc2626'},{l:'年少人口',v:fmt(t15),s:'0-14歳',c:'#3b82f6'},{l:'生産年齢',v:fmt(tW),s:'15-64歳',c:'#059669'}].map((k,i)=>(
              <div key={i} style={{background:'#fff',borderRadius:10,padding:'12px 16px',border:'1px solid #f0f0f0'}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{k.l}</div>
                <div style={{fontSize:mob?20:24,fontWeight:700,color:k.c}}>{k.v}</div>
                {k.s&&<div style={{fontSize:10,color:'#94a3b8'}}>{k.s}</div>}
              </div>))}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
            {[{l:'出生数',v:fmt(tB),c:'#059669'},{l:'死亡数',v:fmt(tD),c:'#64748b'},{l:'自然増減',v:(tNC>=0?'+':'')+fmt(tNC),c:tNC>=0?'#059669':'#dc2626'}].map((k,i)=>(
              <div key={i} style={{background:'#fff',borderRadius:10,padding:'12px 16px',border:'1px solid #f0f0f0'}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{k.l}</div>
                <div style={{fontSize:mob?18:22,fontWeight:700,color:k.c}}>{k.v}</div>
              </div>))}
          </div>
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
          <div style={{background:'#fff',borderRadius:12,border:'1px solid #f0f0f0',overflow:'hidden',overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr style={{background:'#fafbfc'}}>
                {['市区町村','人口規模','構成比','高齢化率','出生数','死亡数','自然増減','世帯数'].map((h,i)=>(
                  <th key={i} style={{padding:'9px 10px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:i===0?'left':'right',borderBottom:'1px solid #f1f5f9',whiteSpace:'nowrap'}}>{h}</th>))}
              </tr></thead>
              <tbody>{ms.map((m,i)=>(
                <tr key={i} style={{borderBottom:'1px solid #f8f9fa'}} onMouseEnter={e=>e.currentTarget.style.background='#f8faff'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{padding:'9px 10px',fontWeight:500}}>{m.name}</td>
                  <td style={{padding:'9px 10px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(m.pop)}</td>
                  <td style={{padding:'9px 10px',textAlign:'right',color:'#64748b'}}>{tPop?(m.pop/tPop*100).toFixed(1):'0'}%</td>
                  <td style={{padding:'9px 10px',textAlign:'right'}}><span style={{padding:'1px 7px',borderRadius:16,fontSize:12,fontWeight:500,background:m.aging>30?'#fef2f2':m.aging<20?'#f0fdf4':'#f8fafc',color:m.aging>30?'#dc2626':m.aging<20?'#16a34a':'#64748b'}}>{m.aging}%</span></td>
                  <td style={{padding:'9px 10px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(m.births)}</td>
                  <td style={{padding:'9px 10px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(m.deaths)}</td>
                  <td style={{padding:'9px 10px',textAlign:'right',fontWeight:500,color:m.nc>=0?'#16a34a':'#dc2626',fontVariantNumeric:'tabular-nums'}}>{m.nc>=0?'+':''}{fmt(m.nc)}</td>
                  <td style={{padding:'9px 10px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(m.hh)}</td>
                </tr>))}</tbody>
            </table>
            <div style={{padding:'10px 12px',fontSize:11,color:'#94a3b8',borderTop:'1px solid #f1f5f9'}}>出典: e-Stat 社会・人口統計体系 市区町村データ（人口: 2020年国勢調査、出生・死亡: 2022年人口動態統計）</div>
          </div>
        
  </>;
}
