'use client';
import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

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
  }, []);

  useEffect(() => {
    if (areaPref) {
      fetch('/api/medical-areas?prefecture='+encodeURIComponent(areaPref))
        .then(r=>r.json()).then(d => setAreaData(d.data||[]));
    }
  }, [areaPref]);

  const maxVal = useMemo(() => Math.max(...prefs.map(p=>p[metric]||0), 1), [prefs,metric]);
  const getColor = v => { const r=v/maxVal; return r>.7?'#1d4ed8':r>.4?'#3b82f6':r>.2?'#93c5fd':r>.1?'#bfdbfe':'#e0e7ff'; };

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
        <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',borderTop:'1px solid #e2e8f0',display:'flex',zIndex:50,padding:'6px 0 env(safe-area-inset-bottom)',boxShadow:'0 -2px 8px rgba(0,0,0,0.06)'}}>
          {[['map','分布','M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z'],['muni','人口','M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2M9 11a4 4 0 100-8 4 4 0 000 8z'],['area','医療圏','M22 12h-4l-3 9L9 3l-3 9H2'],['geomap','地図','M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z'],['score','Score','M18 20V10M12 20V4M6 20v-6']].map(([id,l,ic])=>(
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
        <div style={{flex:1}}/>
        <div style={{padding:'12px 14px',borderTop:'1px solid #f0f0f0',fontSize:11,color:'#cbd5e1'}}>
          出典: 厚労省/総務省/社人研<br/>96,488施設 × 9因子スコアリング
        </div>
      </aside>
      )}
      <main style={{flex:1,padding:mob?'16px 16px 80px':'28px 32px',maxWidth:1100,overflow:'auto'}}>

        {/* ═══ MAP VIEW ═══ */}
        {view==='map' && <>
          <div style={{marginBottom:24}}>
            <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Live Data</div>
            <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>都道府県別 医療機関分布</h1>
            <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>全国97,024施設の実データを可視化。指標を切り替えて地域差を把握できます。</p>
          </div>
          <div style={{display:'flex',gap:6,marginBottom:20}}>
            {Object.entries(mKey).map(([k,v])=>(
              <button key={k} onClick={()=>setMetric(v)} style={{padding:mob?'6px 12px':'8px 18px',borderRadius:20,border:metric===v?'2px solid #2563EB':'1px solid #e2e8f0',background:metric===v?'#eff6ff':'#fff',color:metric===v?'#2563EB':'#64748b',fontSize:13,fontWeight:metric===v?600:400,cursor:'pointer'}}>{METRICS[k]}</button>
            ))}
          </div>
          <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'1fr 340px',gap:20}}>
            <div style={{background:'#fff',borderRadius:14,padding:'20px 24px',border:'1px solid #f0f0f0',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
              <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>{Object.values(METRICS)[Object.values(mKey).indexOf(metric)]||metric}</div>
              <div style={{fontSize:32,fontWeight:700,color:'#2563EB',letterSpacing:'-0.02em'}}>{fmt(prefs.reduce((s,p)=>s+(p[metric]||0),0))}</div>
              <div style={{fontSize:11,color:'#94a3b8',marginBottom:16}}>全国合計</div>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={[...prefs].sort((a,b)=>(b[metric]||0)-(a[metric]||0)).slice(0,20)} margin={{left:-10}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                  <XAxis dataKey="name" tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} interval={0} angle={-45} textAnchor="end" height={60}/>
                  <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                  <Tooltip content={<Tip/>}/>
                  <Bar dataKey={metric} name={metric} radius={[3,3,0,0]} barSize={16}>
                    {[...prefs].sort((a,b)=>(b[metric]||0)-(a[metric]||0)).slice(0,20).map((p,i)=><Cell key={i} fill={getColor(p[metric]||0)}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',overflow:'hidden',maxHeight:520,overflowY:'auto',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
              <div style={{padding:'14px 16px',borderBottom:'1px solid #f0f0f0',fontSize:13,fontWeight:600,position:'sticky',top:0,background:'#fff',zIndex:1}}>全{prefs.length}都道府県</div>
              {[...prefs].sort((a,b)=>(b[metric]||0)-(a[metric]||0)).map((p,i)=>(
                <div key={p.code} onClick={()=>{setSelectedPref(p.name);setView('muni');}} style={{display:'flex',alignItems:'center',padding:'8px 16px',borderBottom:'1px solid #f8f9fa',cursor:'pointer',fontSize:13}} onMouseEnter={e=>e.currentTarget.style.background='#f0f7ff'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{width:24,fontWeight:600,color:'#94a3b8',fontSize:11}}>{i+1}</span>
                  <span style={{flex:1,fontWeight:500}}>{p.name}</span>
                  <span style={{fontWeight:600,color:'#2563EB',fontVariantNumeric:'tabular-nums'}}>{fmt(p[metric])}</span>
                  <div style={{width:60,height:6,borderRadius:3,background:'#f1f5f9',marginLeft:8,overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:3,background:getColor(p[metric]||0),width:`${(p[metric]||0)/maxVal*100}%`}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>}

        {/* ═══ MUNICIPALITY VIEW ═══ */}
        {view==='muni' && <>
          <div style={{marginBottom:24}}>
            <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Demographics</div>
            <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>市区町村別 人口動態</h1>
            <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>{selectedPref?`${selectedPref} の主要市区町村`:'全国主要80市区町村'}の人口構成・高齢化率・自然増減を分析。</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(4,1fr)',gap:12,marginBottom:20}}>
            {[{l:'総人口',v:fmt(totalPop),c:'#2563EB'},{l:'高齢化率',v:totalPop?(total65/totalPop*100).toFixed(1)+'%':'—',c:'#dc2626'},{l:'出生数',v:fmt(totalBirths),c:'#059669'},{l:'自然増減',v:(totalBirths-totalDeaths>=0?'+':'')+fmt(totalBirths-totalDeaths),c:totalBirths>=totalDeaths?'#059669':'#dc2626'}].map((k,i)=>(
              <div key={i} style={{background:'#fff',borderRadius:12,padding:'16px 20px',border:'1px solid #f0f0f0'}}>
                <div style={{fontSize:11,color:'#94a3b8',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4}}>{k.l}</div>
                <div style={{fontSize:24,fontWeight:700,color:k.c,letterSpacing:'-0.02em'}}>{k.v}</div>
              </div>
            ))}
          </div>
          {totalPop>0 && (()=>{const p15=filteredMunis.reduce((s,m)=>s+m.p15,0);const w=totalPop-p15-total65;const r15=(p15/totalPop*100).toFixed(1);const rW=(w/totalPop*100).toFixed(1);const r65=(total65/totalPop*100).toFixed(1);return(
            <div style={{background:'#fff',borderRadius:12,padding:'16px 20px',border:'1px solid #f0f0f0',marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>年齢構成</div>
              <div style={{display:'flex',height:28,borderRadius:6,overflow:'hidden',marginBottom:8}}>
                <div style={{width:`${r15}%`,background:'#3b82f6',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff',fontWeight:600}}>{r15}%</div>
                <div style={{width:`${rW}%`,background:'#22c55e',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff',fontWeight:600}}>{rW}%</div>
                <div style={{width:`${r65}%`,background:'#ef4444',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff',fontWeight:600}}>{r65}%</div>
              </div>
              <div style={{display:'flex',gap:20,fontSize:12,color:'#64748b'}}>
                {[['#3b82f6','0-14歳'],['#22c55e','15-64歳'],['#ef4444','65歳以上']].map(([c,l])=><span key={l}><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:c,marginRight:4}}/>{l}</span>)}
              </div>
            </div>);})()}
          <div style={{display:'flex',gap:8,marginBottom:16}}>
            <input value={muniSearch} onChange={e=>setMuniSearch(e.target.value)} placeholder="市区町村名で検索" style={{flex:1,padding:'8px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,outline:'none',background:'#fff'}}/>
            {selectedPref&&<button onClick={()=>setSelectedPref(null)} style={{padding:'8px 14px',borderRadius:8,border:'1px solid #fecaca',background:'#fff',fontSize:12,cursor:'pointer',color:'#dc2626'}}>✕ {selectedPref}</button>}
          </div>
          <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',overflow:'hidden',overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead><tr style={{background:'#fafbfc'}}>
                {[['name','市区町村','left'],['pop','人口','right'],['aging','高齢化率','right'],['births','出生数','right'],['deaths','死亡数','right'],['nc','自然増減','right'],['hh','世帯数','right']].map(([k,l,a])=>(
                  <th key={k} onClick={()=>setMuniSort(k)} style={{padding:'10px 12px',fontSize:11,fontWeight:600,color:muniSort===k?'#2563EB':'#94a3b8',textAlign:a,borderBottom:'1px solid #f1f5f9',cursor:'pointer',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{l}{muniSort===k?' ↓':''}</th>
                ))}
              </tr></thead>
              <tbody>{filteredMunis.map((m,i)=>(
                <tr key={i} style={{borderBottom:'1px solid #f8f9fa'}} onMouseEnter={e=>e.currentTarget.style.background='#f8faff'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{padding:'10px 12px'}}><div style={{fontWeight:500}}>{m.name}</div><div style={{fontSize:11,color:'#94a3b8'}}>{m.pref}</div></td>
                  <td style={{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(m.pop)}</td>
                  <td style={{padding:'10px 12px',textAlign:'right'}}><span style={{padding:'2px 8px',borderRadius:20,fontSize:12,fontWeight:500,background:m.aging>30?'#fef2f2':m.aging<22?'#f0fdf4':'#f8fafc',color:m.aging>30?'#dc2626':m.aging<22?'#16a34a':'#64748b'}}>{m.aging}%</span></td>
                  <td style={{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(m.births)}</td>
                  <td style={{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(m.deaths)}</td>
                  <td style={{padding:'10px 12px',textAlign:'right',fontWeight:500,color:m.nc>=0?'#16a34a':'#dc2626',fontVariantNumeric:'tabular-nums'}}>{m.nc>=0?'+':''}{fmt(m.nc)}</td>
                  <td style={{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(m.hh)}</td>
                </tr>))}</tbody>
            </table>
            <div style={{padding:'12px 16px',fontSize:11,color:'#94a3b8',borderTop:'1px solid #f1f5f9'}}>出典: e-Stat（人口: 2020年国勢調査、出生・死亡: 2022年人口動態統計）</div>
          </div>
        </>}

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
              {[...new Set(geoFacilities.map(f=>f.pref))].sort().map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div style={{display:'grid',gridTemplateColumns:mob?'1fr':(selectedFacility?'1fr 380px':'1fr'),gap:16}}>
            {/* Facility List */}
            <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',overflow:'hidden'}}>
              {!mob && <iframe width="100%" height="0" frameBorder="0" style={{border:0,display:'none'}}/>}
              <div style={{maxHeight:mob?'none':'560px',overflowY:mob?'visible':'auto',padding:12}}>
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
              <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',overflow:'hidden',display:'flex',flexDirection:'column'}}>
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

        <div style={{fontSize:12,color:'#cbd5e1',textAlign:'center',marginTop:32}}>MedIntel v2.0 — 厚労省/総務省/社人研 オープンデータ統合 — 9因子スコアリングエンジン v4</div>
      </main>
    </div>
  );
}
