'use client';
import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

const PREF_ORDER = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const sortPrefs = arr => [...arr].sort((a,b) => PREF_ORDER.indexOf(a) - PREF_ORDER.indexOf(b));
const NDB_CAT = {'A_初再診料':'初再診料','B_医学管理等':'医学管理等','C_在宅医療':'在宅医療','D_検査':'検査','E_画像診断':'画像診断','K_手術':'手術'};

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => { const c = () => setM(window.innerWidth < 768); c(); window.addEventListener('resize', c); return () => window.removeEventListener('resize', c); }, []);
  return m;
}

const fmt = n => n?.toLocaleString?.() ?? '—';
const METRICS = { f:'施設数', h:'病院数', d:'DPC病院', b:'総病床数' };
const mKey = { f:'facilities', h:'hospitals', d:'dpc', b:'beds' };
const TC = { S:'#dc2626', A:'#f97316', B:'#eab308', C:'#22c55e', D:'#94a3b8' };

const Tip = ({active,payload,label}) => {
  if(!active||!payload?.length) return null;
  return <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',boxShadow:'0 4px 12px rgba(0,0,0,0.08)',fontSize:12}}>
    <div style={{fontWeight:600,marginBottom:3}}>{label}</div>
    {payload.map((p,i)=><div key={i} style={{color:p.color,display:'flex',justifyContent:'space-between',gap:16}}>
      <span>{p.name}</span><span style={{fontWeight:600}}>{fmt(p.value)}</span></div>)}
  </div>;
};

const Nav = ({icon,label,active,onClick}) => (
  <button onClick={onClick} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:8,border:'none',cursor:'pointer',width:'100%',textAlign:'left',fontSize:13,fontWeight:active?600:400,color:active?'#2563EB':'#64748b',background:active?'#eff6ff':'transparent',transition:'all 0.15s'}}>
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={active?'#2563EB':'#94a3b8'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icon}/></svg>
    {label}
  </button>
);


// Medical Area data: loaded dynamically from /api/medical-areas

export default function Home() {
  const mob = useIsMobile();
  const [view, setView] = useState('map');
  const [metric, setMetric] = useState('facilities');
  const [prefs, setPrefs] = useState([]);
  const [munis, setMunis] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [topFac, setTopFac] = useState([]);
  const [selectedPref, setSelectedPref] = useState(null);
  const [muniSearch, setMuniSearch] = useState('');
  const [muniSort, setMuniSort] = useState('pop');
  const [facSearch, setFacSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [areaPref, setAreaPref] = useState('東京都');
  const [areaData, setAreaData] = useState([]);
  const [areaPrefList, setAreaPrefList] = useState([]);
  const [geoFacilities, setGeoFacilities] = useState([]);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [mapPref, setMapPref] = useState('');
  const [japanMap, setJapanMap] = useState(null);
  const [hovPref, setHovPref] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({x:0,y:0});
  const [areaDemoData, setAreaDemoData] = useState([]);
  const [demoPref, setDemoPref] = useState('東京都');
  const [demoArea, setDemoArea] = useState('区中央部');
  const [demoPrefList, setDemoPrefList] = useState([]);
  const [ndbDiag, setNdbDiag] = useState([]);
  const [ndbRx, setNdbRx] = useState([]);
  const [ndbHc, setNdbHc] = useState([]);
  const [ndbPref, setNdbPref] = useState('東京都');
  const [kijunData, setKijunData] = useState([]);
  const [kijunSummary, setKijunSummary] = useState(null);
  const [kijunPref, setKijunPref] = useState('東京都');
  const [kijunPage, setKijunPage] = useState(0);
  const [kijunSearch, setKijunSearch] = useState('');
  const [kijunSort, setKijunSort] = useState('std_count');
  const [kijunExpanded, setKijunExpanded] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/prefectures-full').then(r=>r.json()),
      fetch('/api/municipalities').then(r=>r.json()),
      fetch('/api/tiers').then(r=>r.json()),
      fetch('/api/facilities?tier=S&limit=25').then(r=>r.json()),
    ]).then(([p,m,t,f]) => {
      setPrefs(p); setMunis(m.data||[]); setTiers(t); setTopFac(f.data||[]);
    });
    fetch('/api/medical-areas').then(r=>r.json()).then(d => {
      setAreaPrefList(d.prefectures||[]);
      setAreaData(d.data?.filter(a=>a.pref==='東京都')||[]);
    });
    fetch('/api/facilities-geo').then(r=>r.json()).then(d => setGeoFacilities(d.data||[]));
    fetch('/api/japan-map').then(r=>r.json()).then(d => setJapanMap(d));
    fetch('/api/area-demographics').then(r=>r.json()).then(d => {
      setDemoPrefList(d.prefectures||[]);
      setAreaDemoData(d.data||[]);
    });
    fetch('/api/ndb/diagnostics').then(r=>r.json()).then(d=>setNdbDiag(d));
    fetch('/api/ndb/health-checkup').then(r=>r.json()).then(d=>setNdbHc(d));
    fetch('/api/facility-standards?summary=true').then(r=>r.json()).then(d=>setKijunSummary(d));
    fetch('/api/facility-standards?prefecture='+encodeURIComponent('東京都')).then(r=>r.json()).then(d=>setKijunData(d.data||[]));
  }, []);

  useEffect(() => {
    if (areaPref) {
      fetch('/api/medical-areas?prefecture='+encodeURIComponent(areaPref))
        .then(r=>r.json()).then(d => setAreaData(d.data||[]));
    }
  }, [areaPref]);

  const maxVal = useMemo(() => Math.max(...prefs.map(p=>p[metric]||0), 1), [prefs,metric]);
  const getColor = v => { const r=v/maxVal; return r>.7?'#b91c1c':r>.4?'#ea580c':r>.2?'#f59e0b':r>.1?'#fbbf24':'#fef3c7'; };

  // Build pref name→data lookup for SVG map
  const prefByName = useMemo(() => {
    const m = {};
    prefs.forEach(p => { m[p.name] = p; });
    return m;
  }, [prefs]);

  const filteredMunis = useMemo(() => {
    let d = [...munis];
    if (selectedPref) d = d.filter(m=>m.pref===selectedPref);
    if (muniSearch) d = d.filter(m=>m.name.includes(muniSearch)||m.pref.includes(muniSearch));
    d.sort((a,b)=>(b[muniSort]||0)-(a[muniSort]||0));
    return d;
  }, [munis, selectedPref, muniSearch, muniSort]);

  const doSearch = () => {
    if (!facSearch) return;
    fetch('/api/facilities?q='+encodeURIComponent(facSearch)+'&limit=20').then(r=>r.json()).then(setSearchResults);
  };

  const totalPop = filteredMunis.reduce((s,m)=>s+m.pop,0);
  const total65 = filteredMunis.reduce((s,m)=>s+m.p65,0);
  const totalBirths = filteredMunis.reduce((s,m)=>s+m.births,0);
  const totalDeaths = filteredMunis.reduce((s,m)=>s+m.deaths,0);


  return (
    <div style={{display:'flex',flexDirection:mob?'column':'row',minHeight:'100vh',fontFamily:"'DM Sans',system-ui,sans-serif",background:'#f8f9fb',color:'#0f172a'}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      {/* Desktop Sidebar / Mobile Bottom Nav */}
      {mob ? (
        <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',borderTop:'1px solid #e2e8f0',display:'flex',zIndex:50,padding:'6px 0 env(safe-area-inset-bottom)',boxShadow:'0 -2px 8px rgba(0,0,0,0.06)',overflowX:'auto'}}>
          {[['map','分布','M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z'],['muni','人口','M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2M9 11a4 4 0 100-8 4 4 0 000 8z'],['area','医療圏','M22 12h-4l-3 9L9 3l-3 9H2'],['geomap','地図','M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z'],['score','Score','M18 20V10M12 20V4M6 20v-6'],['ndb','NDB','M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'],['kijun','基準','M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z']].map(([id,l,ic])=>(
            <button key={id} onClick={()=>setView(id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'6px 0',border:'none',background:'transparent',cursor:'pointer',color:view===id?'#2563EB':'#94a3b8',fontSize:10,fontWeight:view===id?700:400}}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={view===id?'#2563EB':'#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ic}/></svg>
              {l}
            </button>
          ))}
        </nav>
      ) : (
      <aside style={{width:230,background:'#fff',borderRight:'1px solid #f0f0f0',padding:'20px 12px',flexShrink:0,position:'sticky',top:0,height:'100vh',boxSizing:'border-box',display:'flex',flexDirection:'column',gap:2}}>
        <div style={{padding:'0 14px 16px',borderBottom:'1px solid #f0f0f0',marginBottom:8}}>
          <div style={{fontSize:18,fontWeight:700,letterSpacing:'-0.03em'}}>MedIntel</div>
          <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>医療市場インテリジェンス</div>
        </div>
        <Nav icon="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" label="都道府県別 分布" active={view==='map'} onClick={()=>setView('map')}/>
        <Nav icon="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2M9 11a4 4 0 100-8 4 4 0 000 8z" label="市区町村 人口動態" active={view==='muni'} onClick={()=>setView('muni')}/>
        <Nav icon="M22 12h-4l-3 9L9 3l-3 9H2" label="医療圏分析" active={view==='area'} onClick={()=>setView('area')}/>
        <Nav icon="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" label="施設マップ" active={view==='geomap'} onClick={()=>setView('geomap')}/>
        <Nav icon="M18 20V10M12 20V4M6 20v-6" label="スコアリング" active={view==='score'} onClick={()=>setView('score')}/>
        <Nav icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" label="NDB分析" active={view==='ndb'} onClick={()=>setView('ndb')}/>
        <Nav icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" label="施設基準" active={view==='kijun'} onClick={()=>setView('kijun')}/>
        <div style={{flex:1}}/>
        <div style={{padding:'12px 14px',borderTop:'1px solid #f0f0f0',fontSize:11,color:'#cbd5e1'}}>
          出典: 厚労省/総務省/社人研<br/>96,488施設 × 9因子スコアリング
        </div>
      </aside>
      )}
      <main style={{flex:1,padding:mob?'16px 16px 80px':'28px 32px',maxWidth:1100,overflow:'auto'}}>

        {/* ═══ MAP VIEW ═══ */}
        {view==='map' && <>
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
        </>}

        {/* ═══ MUNICIPALITY VIEW (Pottech式: 二次医療圏別) ═══ */}
        {view==='muni' && (()=>{
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
        </>;})()}

        {/* ═══ MEDICAL AREA VIEW (全国対応) ═══ */}
        {view==='area' && <>
          <div style={{marginBottom:24,display:'flex',flexDirection:mob?'column':'row',justifyContent:'space-between',alignItems:mob?'flex-start':'flex-end',gap:12}}>
            <div>
              <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Medical Area Analysis</div>
              <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>3階層 医療圏分析</h1>
              <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>全国339二次医療圏の医療体制を都道府県別に比較。</p>
            </div>
            <select value={areaPref} onChange={e=>setAreaPref(e.target.value)} style={{padding:'8px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff',cursor:'pointer',minWidth:140}}>
              {areaPrefList.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(3,1fr)',gap:12,marginBottom:20}}>
            {[{l:'病院数',v:fmt(areaData.reduce((s,a)=>s+(a.hosp||0),0)),sub:`${areaPref} ${areaData.length}圏域`,c:'#2563EB'},{l:'総病床数',v:fmt(areaData.reduce((s,a)=>s+(a.beds||0),0)),sub:'許可病床数合計',c:'#0891b2'},{l:'病棟数',v:fmt(areaData.reduce((s,a)=>s+(a.wards||0),0)),sub:'病床機能報告対象',c:'#059669'}].map((k,i)=>(
              <div key={i} style={{background:'#fff',borderRadius:12,padding:'16px 20px',border:'1px solid #f0f0f0'}}>
                <div style={{fontSize:11,color:'#94a3b8',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4}}>{k.l}</div>
                <div style={{fontSize:28,fontWeight:700,color:k.c,letterSpacing:'-0.02em'}}>{k.v}</div>
                <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{k.sub}</div>
              </div>))}
          </div>
          <div style={{background:'#fff',borderRadius:14,padding:'20px 24px',border:'1px solid #f0f0f0',marginBottom:20}}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:16}}>二次医療圏別 病院数・病床数比較 — {areaPref}</div>
            <ResponsiveContainer width="100%" height={Math.max(200, areaData.length * 32)}>
              <BarChart data={[...areaData].sort((a,b)=>(b.beds||0)-(a.beds||0))} layout="vertical" margin={{left:20}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                <XAxis type="number" tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="area" tick={{fontSize:11,fill:'#475569'}} axisLine={false} tickLine={false} width={100}/>
                <Tooltip content={<Tip/>}/>
                <Bar dataKey="beds" name="病床数" fill="#2563EB" radius={[0,4,4,0]} barSize={18}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',overflow:'hidden',overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr style={{background:'#fafbfc'}}>
                {['二次医療圏','病院数','病棟数','病床数'].map((h,i)=>(
                  <th key={i} style={{padding:'10px 14px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:i===0?'left':'right',borderBottom:'1px solid #f1f5f9',textTransform:'uppercase',letterSpacing:'0.05em'}}>{h}</th>))}
              </tr></thead>
              <tbody>{[...areaData].sort((a,b)=>(b.hosp||0)-(a.hosp||0)).map((a,i)=>(
                <tr key={i} style={{borderBottom:'1px solid #f8f9fa'}} onMouseEnter={e=>e.currentTarget.style.background='#f8faff'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{padding:'10px 14px',fontWeight:500}}>{a.area}</td>
                  <td style={{padding:'10px 14px',textAlign:'right',fontWeight:600,color:'#2563EB'}}>{a.hosp}</td>
                  <td style={{padding:'10px 14px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{a.wards}</td>
                  <td style={{padding:'10px 14px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(a.beds)}</td>
                </tr>))}</tbody>
            </table>
            <div style={{padding:'12px 16px',fontSize:11,color:'#94a3b8',borderTop:'1px solid #f1f5f9'}}>出典: 厚労省 病床機能報告（令和元年度）全国339二次医療圏対応</div>
          </div>
        </>}

        {/* ═══ GEO MAP VIEW (Leaflet + Facility Detail) ═══ */}
        {view==='geomap' && <>
          <div style={{marginBottom:24,display:'flex',flexDirection:mob?'column':'row',justifyContent:'space-between',alignItems:mob?'flex-start':'flex-end',gap:12}}>
            <div>
              <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Facility Map</div>
              <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>施設マッピング</h1>
              <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>Tier S/A {geoFacilities.length}施設を地図上に表示。施設をクリックで詳細表示。</p>
            </div>
            <select value={mapPref} onChange={e=>{setMapPref(e.target.value);setSelectedFacility(null);}} style={{padding:'8px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff',cursor:'pointer'}}>
              <option value="">全国</option>
              {sortPrefs([...new Set(geoFacilities.map(f=>f.pref))]).map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div style={{display:'flex',flexDirection:mob?'column-reverse':'row',gap:16}}>
            {/* Facility List */}
            <div style={{flex:1,background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',overflow:'hidden'}}>
              <div style={{maxHeight:mob?400:560,overflowY:'auto',padding:12}}>
                <div style={{fontSize:13,fontWeight:600,marginBottom:8,color:'#0f172a'}}>
                  {mapPref||'全国'} — {(mapPref?geoFacilities.filter(f=>f.pref===mapPref):geoFacilities).length}施設
                </div>
                {(mapPref?geoFacilities.filter(f=>f.pref===mapPref):geoFacilities).map((f,i)=>(
                  <div key={i} onClick={()=>setSelectedFacility(f)} style={{padding:'8px 10px',marginBottom:4,borderRadius:8,cursor:'pointer',background:selectedFacility?.code===f.code?'#eff6ff':'#fff',border:'1px solid '+(selectedFacility?.code===f.code?'#2563EB':'#f0f0f0'),fontSize:12,transition:'all 0.1s'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontWeight:600,color:'#1e293b'}}>{f.name.slice(0,25)}</span>
                      <span style={{padding:'1px 8px',borderRadius:12,fontSize:10,fontWeight:700,background:f.tier==='S'?'#fef2f2':'#fff7ed',color:f.tier==='S'?'#dc2626':'#f97316'}}>{f.score}pt</span>
                    </div>
                    <div style={{color:'#94a3b8',fontSize:11,marginTop:2}}>{f.pref} | {f.beds}床 | {fmt(f.cases)}症例</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Facility Detail Panel */}
            {selectedFacility && (
              <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',overflow:'hidden',display:'flex',flexDirection:'column',width:mob?'100%':380,flexShrink:0}}>
                <div style={{padding:'16px 20px',borderBottom:'1px solid #f0f0f0'}}>
                  <div style={{fontSize:16,fontWeight:700,color:'#0f172a',marginBottom:4}}>{selectedFacility.name}</div>
                  <div style={{fontSize:12,color:'#64748b'}}>{selectedFacility.pref} / {selectedFacility.addr}</div>
                  <div style={{display:'flex',gap:6,marginTop:8}}>
                    <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:TC[selectedFacility.tier]+'18',color:TC[selectedFacility.tier]}}>Tier {selectedFacility.tier}</span>
                    <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:'#eff6ff',color:'#2563EB'}}>{selectedFacility.score}pt</span>
                  </div>
                </div>
                <div style={{padding:'16px 20px',borderBottom:'1px solid #f0f0f0'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    {[{l:'病床数',v:fmt(selectedFacility.beds),c:'#2563EB'},{l:'年間症例',v:fmt(selectedFacility.cases),c:'#059669'}].map((k,i)=>(
                      <div key={i} style={{textAlign:'center'}}>
                        <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{k.l}</div>
                        <div style={{fontSize:22,fontWeight:700,color:k.c}}>{k.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Google Maps iframe */}
                <div style={{flex:1,minHeight:250}}>
                  <iframe
                    width="100%" height="100%" frameBorder="0" style={{border:0}}
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(selectedFacility.pref + selectedFacility.addr + ' ' + selectedFacility.name)}&t=m&z=15&output=embed`}
                    allowFullScreen
                  />
                </div>
              </div>
            )}
          </div>
        </>}

        {/* ═══ SCORING VIEW ═══ */}
        {view==='score' && <>
          <div style={{marginBottom:24}}>
            <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Priority Scoring</div>
            <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>訪問優先度スコアリング</h1>
            <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>9因子複合スコア（v4）— 96,488施設をDPC件数×病床数×成長率で自動ランク付け</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(5,1fr)',gap:10,marginBottom:24}}>
            {tiers.map(t=>(
              <div key={t.tier} style={{flex:1,minWidth:130,background:'#fff',borderRadius:12,padding:'16px 18px',border:'1px solid #f0f0f0',borderLeft:`4px solid ${TC[t.tier]||'#ccc'}`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <span style={{fontSize:20,fontWeight:800,color:TC[t.tier]}}>Tier {t.tier}</span>
                  <span style={{fontSize:11,color:'#94a3b8'}}>avg {t.avg_score}pt</span>
                </div>
                <div style={{fontSize:22,fontWeight:700}}>{fmt(t.count)}</div>
              </div>))}
          </div>
          <div style={{display:'flex',gap:8,marginBottom:20}}>
            <input value={facSearch} onChange={e=>setFacSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doSearch()} placeholder="施設名で検索（例: 東大, 慶應, 藤田）" style={{flex:1,padding:'10px 16px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:14,outline:'none'}}/>
            <button onClick={doSearch} style={{padding:'10px 20px',borderRadius:8,border:'none',background:'#2563EB',color:'#fff',fontWeight:600,cursor:'pointer'}}>検索</button>
          </div>
          {searchResults&&<div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:20,marginBottom:24}}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>検索結果: {searchResults.total}件</div>
            {searchResults.data?.map((f,i)=>(
              <div key={i} style={{padding:'8px 0',borderBottom:'1px solid #f8f9fa',fontSize:13,display:'flex',gap:12,alignItems:'center'}}>
                <span style={{padding:'1px 8px',borderRadius:12,fontSize:11,fontWeight:700,background:(TC[f.tier]||'#ccc')+'18',color:TC[f.tier]}}>{f.priority_score}</span>
                <span style={{fontWeight:500,flex:1}}>{f.facility_name}</span>
                <span style={{color:'#94a3b8',fontSize:12}}>{f.prefecture_name}</span>
                <span style={{color:'#64748b',fontSize:12}}>beds={fmt(f.total_beds)}</span>
              </div>))}
          </div>}
          <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',overflow:'hidden',overflowX:'auto'}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #f0f0f0',fontSize:16,fontWeight:600}}>Tier S 施設一覧</div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr style={{background:'#fafbfc'}}>
                {['#','Score','施設名','都道府県','病床','年間症例'].map((h,i)=>(
                  <th key={i} style={{padding:'10px 14px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:i<3?'left':'right',borderBottom:'1px solid #f1f5f9'}}>{h}</th>))}
              </tr></thead>
              <tbody>{topFac.map((f,i)=>(
                <tr key={i} style={{borderBottom:'1px solid #f8f9fa'}} onMouseEnter={e=>e.currentTarget.style.background='#f8faff'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{padding:'10px 14px',color:'#94a3b8'}}>#{f.rank}</td>
                  <td style={{padding:'10px 14px'}}><span style={{padding:'2px 10px',borderRadius:20,fontSize:12,fontWeight:700,background:(TC[f.tier]||'#ccc')+'18',color:TC[f.tier]}}>{f.priority_score}</span></td>
                  <td style={{padding:'10px 14px',fontWeight:500,color:'#1e293b'}}>{f.facility_name}</td>
                  <td style={{padding:'10px 14px',textAlign:'right',color:'#64748b'}}>{f.prefecture_name}</td>
                  <td style={{padding:'10px 14px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(f.total_beds)}</td>
                  <td style={{padding:'10px 14px',textAlign:'right',color:'#2563EB',fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{fmt(f.annual_cases)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </>}

        {/* ═══ NDB ANALYSIS VIEW ═══ */}
        {view==='ndb' && (()=>{
          const diagByPref = ndbDiag.filter(d=>d.prefecture===ndbPref);
          const diagTotal = diagByPref.reduce((s,d)=>s+d.total_claims,0);
          const hcPref = ndbHc.filter(d=>d.pref===ndbPref);
          return <>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>NDB Open Data</div>
            <h1 style={{fontSize:mob?20:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>NDBオープンデータ分析</h1>
            <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>第10回NDBオープンデータ（令和5年度）— 診療行為・処方薬・特定健診の地域差を分析。</p>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:16}}>
            <select value={ndbPref} onChange={e=>{setNdbPref(e.target.value);fetch('/api/ndb/prescriptions?prefecture='+encodeURIComponent(e.target.value)).then(r=>r.json()).then(d=>setNdbRx(d));}} style={{padding:'8px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff'}}>
              {sortPrefs([...new Set(ndbDiag.map(d=>d.prefecture))]).map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <h2 style={{fontSize:16,fontWeight:600,margin:'0 0 4px',color:'#1e293b'}}>診療行為 — {ndbPref}</h2>
          <p style={{fontSize:11,color:'#94a3b8',margin:'0 0 12px'}}>※ 算定回数＝診療報酬点数表に定められた一行為の保険請求回数（延べ）。患者数ではありません。</p>
          <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(3,1fr)',gap:10,marginBottom:20}}>
            {diagByPref.sort((a,b)=>b.total_claims-a.total_claims).map((d,i)=>(
              <div key={i} style={{background:'#fff',borderRadius:10,padding:'12px 16px',border:'1px solid #f0f0f0'}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>{NDB_CAT[d.category]||d.category}</div>
                <div style={{fontSize:mob?16:20,fontWeight:700,color:'#2563EB'}}>{fmt(d.total_claims)}</div>
                <div style={{fontSize:10,color:'#94a3b8'}}>算定回数</div>
              </div>))}
          </div>
          {hcPref.length>0&&(()=>{
            const HC_UNIT={'ヘモグロビン':'g/dL','血清クレアチニン':'mg/dL','eGFR':'mL/min/1.73m²'};
            const HC_NOTE={'ヘモグロビン':'低値＝貧血リスク','血清クレアチニン':'高値＝腎機能低下','eGFR':'60未満でCKD'};
            return <>
            <h2 style={{fontSize:16,fontWeight:600,margin:'0 0 4px',color:'#1e293b'}}>特定健診 検査値平均 — {ndbPref}</h2>
            <p style={{fontSize:11,color:'#94a3b8',margin:'0 0 12px'}}>※ 40〜74歳の特定健診受診者の検査結果平均値（男女別中計）。全人口の平均ではありません。</p>
            <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(3,1fr)',gap:10,marginBottom:20}}>
              {hcPref.map((h,i)=>(
                <div key={i} style={{background:'#fff',borderRadius:10,padding:'14px 16px',border:'1px solid #f0f0f0'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
                    <span style={{fontSize:13,fontWeight:600}}>{h.metric}</span>
                    <span style={{fontSize:10,color:'#94a3b8',background:'#f8fafc',padding:'1px 6px',borderRadius:4}}>{HC_UNIT[h.metric]||''}</span>
                  </div>
                  <div style={{display:'flex',gap:16}}>
                    <div><div style={{fontSize:10,color:'#94a3b8'}}>男性</div><div style={{fontSize:20,fontWeight:700,color:'#2563EB'}}>{h.male}</div></div>
                    <div><div style={{fontSize:10,color:'#94a3b8'}}>女性</div><div style={{fontSize:20,fontWeight:700,color:'#dc2626'}}>{h.female}</div></div>
                  </div>
                  <div style={{fontSize:10,color:'#b0b8c4',marginTop:6}}>{HC_NOTE[h.metric]||''}</div>
                </div>))}
            </div>
          </>;})()}
          {ndbRx.length>0&&<>
            <h2 style={{fontSize:16,fontWeight:600,margin:'0 0 4px',color:'#1e293b'}}>処方薬 薬効分類別 — {ndbPref}</h2>
            <p style={{fontSize:11,color:'#94a3b8',margin:'0 0 12px'}}>※ 処方数量の単位は薬剤ごとに異なります（錠・mL・g等）。薬効分類間の数量比較は適切ではありません。</p>
            <div style={{background:'#fff',borderRadius:12,border:'1px solid #f0f0f0',overflow:'hidden',overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead><tr style={{background:'#fafbfc'}}>
                  {['薬効分類','薬効名','処方数量'].map((h,i)=>(
                    <th key={i} style={{padding:'9px 12px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:i===2?'right':'left',borderBottom:'1px solid #f1f5f9',whiteSpace:'nowrap'}}>{h}</th>))}
                </tr></thead>
                <tbody>{ndbRx.sort((a,b)=>b.qty-a.qty).slice(0,15).map((r,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid #f8f9fa'}}>
                    <td style={{padding:'8px 12px',color:'#94a3b8',fontSize:12}}>{r.code}</td>
                    <td style={{padding:'8px 12px',fontWeight:500}}>{r.name}</td>
                    <td style={{padding:'8px 12px',textAlign:'right',fontWeight:600,color:'#2563EB',fontVariantNumeric:'tabular-nums'}}>{fmt(r.qty)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </>}
          <div style={{padding:'10px 0',fontSize:11,color:'#94a3b8',marginTop:12}}>出典: 厚生労働省 第10回NDBオープンデータ（令和5年度レセプト・令和4年度特定健診）</div>
        </>;})()}

        {/* ═══ FACILITY STANDARDS VIEW ═══ */}
        {view==='kijun' && (()=>{
          const TC2 = {S:'#dc2626',A:'#f59e0b',B:'#2563EB',C:'#64748b',D:'#cbd5e1'};
          const PER_PAGE = 100;
          const filtered = kijunData.filter(f => !kijunSearch || f.name.includes(kijunSearch) || (f.addr||'').includes(kijunSearch));
          const sorted = [...filtered].sort((a,b) => {
            if (kijunSort==='std_count') return b.std_count - a.std_count;
            if (kijunSort==='beds') return (b.beds||0) - (a.beds||0);
            if (kijunSort==='cases') return (b.cases||0) - (a.cases||0);
            if (kijunSort==='score') return (b.score||0) - (a.score||0);
            return 0;
          });
          const totalPages = Math.ceil(sorted.length / PER_PAGE) || 1;
          const pg = Math.min(kijunPage, totalPages - 1);
          const paged = sorted.slice(pg * PER_PAGE, (pg + 1) * PER_PAGE);
          const changePref = (p) => { setKijunPref(p); setKijunPage(0); setKijunSearch(''); setKijunExpanded(null); fetch('/api/facility-standards?prefecture='+encodeURIComponent(p)).then(r=>r.json()).then(d=>setKijunData(d.data||[])); };
          return <>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Facility Standards</div>
            <h1 style={{fontSize:mob?20:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>施設基準の届出状況</h1>
          </div>
          {kijunSummary&&<>
            <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(4,1fr)',gap:10,marginBottom:16}}>
              {[['総届出件数',fmt(kijunSummary.total_standards),'#2563EB'],['対象施設数',fmt(kijunSummary.total_facilities),'#059669'],['都道府県','47','#f59e0b'],['出典','全8厚生局','#64748b']].map(([l,v,c],i)=>(
                <div key={i} style={{background:'#fff',borderRadius:10,padding:'12px 14px',border:'1px solid #f0f0f0'}}>
                  <div style={{fontSize:11,color:'#94a3b8'}}>{l}</div>
                  <div style={{fontSize:i===3?14:22,fontWeight:700,color:c}}>{v}</div>
                </div>))}
            </div>
            <h2 style={{fontSize:15,fontWeight:600,margin:'0 0 10px',color:'#1e293b'}}>届出件数の多い施設基準（上位15）</h2>
            <div style={{background:'#fff',borderRadius:12,border:'1px solid #f0f0f0',overflow:'hidden',overflowX:'auto',marginBottom:20}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead><tr style={{background:'#fafbfc'}}>
                  {['#','施設基準名称','届出件数'].map((h,i)=>(
                    <th key={i} style={{padding:'8px 12px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:i===2?'right':'left',borderBottom:'1px solid #f1f5f9',whiteSpace:'nowrap'}}>{h}</th>))}
                </tr></thead>
                <tbody>{(kijunSummary.top_standards||[]).map((s,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid #f8f9fa'}}>
                    <td style={{padding:'7px 12px',color:'#94a3b8',fontSize:12}}>{i+1}</td>
                    <td style={{padding:'7px 12px',fontWeight:500}}>{s.name}</td>
                    <td style={{padding:'7px 12px',textAlign:'right',fontWeight:600,color:'#2563EB',fontVariantNumeric:'tabular-nums'}}>{fmt(s.count)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
            <h2 style={{fontSize:15,fontWeight:600,margin:'0 0 10px',color:'#1e293b'}}>都道府県別 施設一覧</h2>
            <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
              <select value={kijunPref} onChange={e=>changePref(e.target.value)} style={{padding:'7px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff'}}>
                {sortPrefs(kijunSummary.prefectures||[]).map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <input value={kijunSearch} onChange={e=>{setKijunSearch(e.target.value);setKijunPage(0);}} placeholder="施設名・住所で検索" style={{padding:'7px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff',width:mob?'100%':180}}/>
              <select value={kijunSort} onChange={e=>setKijunSort(e.target.value)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:12,background:'#fff'}}>
                <option value="std_count">届出数順</option><option value="beds">病床数順</option><option value="cases">症例数順</option><option value="score">スコア順</option>
              </select>
              <span style={{fontSize:12,color:'#64748b'}}>{filtered.length>0?`${fmt(filtered.length)}施設`:'—'}{totalPages>1?` (${pg+1}/${totalPages}p)`:''}</span>
            </div>
            {paged.length>0&&<div style={{background:'#fff',borderRadius:12,border:'1px solid #f0f0f0',overflow:'hidden',overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead><tr style={{background:'#fafbfc'}}>
                  {(mob?['施設名','届出']:['施設名','住所','病床','届出','Tier']).map((h,i)=>(
                    <th key={i} style={{padding:'8px 10px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:['届出','病床','Tier'].includes(h)?'right':'left',borderBottom:'1px solid #f1f5f9',whiteSpace:'nowrap'}}>{h}</th>))}
                </tr></thead>
                <tbody>{paged.map((f,i)=>{
                  const idx=pg*PER_PAGE+i;const isExp=kijunExpanded===idx;
                  const mapQ=encodeURIComponent((f.name||'')+' '+(f.addr||''));
                  const bedsD=f.beds?fmt(f.beds):(f.beds_text||'—');
                  return [
                  <tr key={idx} onClick={()=>setKijunExpanded(isExp?null:idx)} style={{borderBottom:isExp?'none':'1px solid #f8f9fa',cursor:'pointer',background:isExp?'#f0f7ff':'transparent'}} onMouseEnter={e=>{if(!isExp)e.currentTarget.style.background='#fafbfc'}} onMouseLeave={e=>{if(!isExp)e.currentTarget.style.background='transparent'}}>
                    <td style={{padding:'8px 10px',fontWeight:500}}><span style={{color:isExp?'#2563EB':'#1e293b'}}>{f.name}</span></td>
                    {!mob&&<td style={{padding:'8px 10px',color:'#64748b',fontSize:12,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.addr||'—'}</td>}
                    {!mob&&<td style={{padding:'8px 10px',textAlign:'right',fontSize:12,color:'#64748b'}}>{bedsD}</td>}
                    <td style={{padding:'8px 10px',textAlign:'right',fontWeight:600,color:'#2563EB'}}>{f.std_count}</td>
                    {!mob&&<td style={{padding:'8px 10px',textAlign:'right'}}>{f.tier?<span style={{padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:700,background:(TC2[f.tier]||'#ccc')+'18',color:TC2[f.tier]||'#999'}}>{f.tier}</span>:'—'}</td>}
                  </tr>,
                  isExp&&<tr key={idx+'d'}><td colSpan={mob?2:5} style={{padding:0,background:'#f8faff',borderBottom:'1px solid #e8ecf0'}}>
                    <div style={{padding:'12px 16px',display:'grid',gridTemplateColumns:mob?'1fr':'1fr 1fr',gap:10}}>
                      <div>
                        <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>住所</div>
                        <div style={{fontSize:13}}>{f.addr||'—'}{f.addr&&<a href={'https://www.google.com/maps/search/?api=1&query='+mapQ} target="_blank" rel="noopener" style={{marginLeft:8,fontSize:11,color:'#2563EB',textDecoration:'none',fontWeight:600}}>📍 Google Mapで開く</a>}</div>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                        <div><div style={{fontSize:11,color:'#94a3b8'}}>病床数</div><div style={{fontSize:15,fontWeight:600}}>{f.beds?fmt(f.beds):f.beds_text||'—'}</div></div>
                        <div><div style={{fontSize:11,color:'#94a3b8'}}>届出数</div><div style={{fontSize:15,fontWeight:600,color:'#2563EB'}}>{f.std_count}</div></div>
                        {f.score?<div><div style={{fontSize:11,color:'#94a3b8'}}>スコア</div><div style={{fontSize:15,fontWeight:600}}>{f.score}pt</div></div>:null}
                        {f.cases?<div><div style={{fontSize:11,color:'#94a3b8'}}>症例数</div><div style={{fontSize:15,fontWeight:600,color:'#059669'}}>{fmt(f.cases)}</div></div>:null}
                        {f.los?<div><div style={{fontSize:11,color:'#94a3b8'}}>平均在院日数</div><div style={{fontSize:15,fontWeight:600}}>{f.los}日</div></div>:null}
                        {f.tier?<div><div style={{fontSize:11,color:'#94a3b8'}}>ティア</div><div style={{fontSize:15,fontWeight:700,color:TC2[f.tier]||'#999'}}>{f.tier}</div></div>:null}
                      </div>
                    </div>
                  </td></tr>
                  ];})}</tbody>
              </table>
            </div>}
            {totalPages>1&&<div style={{display:'flex',justifyContent:'center',gap:4,marginTop:12,flexWrap:'wrap'}}>
              <button onClick={()=>setKijunPage(Math.max(0,pg-1))} disabled={pg===0} style={{padding:'6px 12px',borderRadius:6,border:'1px solid #e2e8f0',background:pg===0?'#f8f9fa':'#fff',cursor:pg===0?'default':'pointer',fontSize:12,color:pg===0?'#cbd5e1':'#64748b'}}>◀ 前へ</button>
              {[...Array(Math.min(7,totalPages))].map((_,i)=>{let p2;if(totalPages<=7)p2=i;else if(pg<3)p2=i;else if(pg>totalPages-4)p2=totalPages-7+i;else p2=pg-3+i;return <button key={p2} onClick={()=>setKijunPage(p2)} style={{padding:'6px 10px',borderRadius:6,border:p2===pg?'1px solid #2563EB':'1px solid #e2e8f0',background:p2===pg?'#2563EB':'#fff',color:p2===pg?'#fff':'#64748b',cursor:'pointer',fontSize:12,fontWeight:p2===pg?700:400}}>{p2+1}</button>;})}
              <button onClick={()=>setKijunPage(Math.min(totalPages-1,pg+1))} disabled={pg>=totalPages-1} style={{padding:'6px 12px',borderRadius:6,border:'1px solid #e2e8f0',background:pg>=totalPages-1?'#f8f9fa':'#fff',cursor:pg>=totalPages-1?'default':'pointer',fontSize:12,color:pg>=totalPages-1?'#cbd5e1':'#64748b'}}>次へ ▶</button>
            </div>}
          </>}
          <div style={{padding:'10px 0',fontSize:11,color:'#94a3b8',marginTop:12}}>出典: 全国8地方厚生局 届出受理医療機関名簿（医科）令和8年2月〜4月現在</div>
        </>;})()}

        <div style={{fontSize:12,color:'#cbd5e1',textAlign:'center',marginTop:32}}>MedIntel v2.0 — 厚労省/総務省/社人研 オープンデータ統合 — 9因子スコアリングエンジン v4</div>
      </main>
    </div>
  );
}
