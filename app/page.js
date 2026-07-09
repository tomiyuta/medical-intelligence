'use client';
import { useState, useEffect, useMemo } from 'react';
import NdbView from './components/views/NdbView';
import RegionalBedFunctionView from './components/views/RegionalBedFunctionView';
import FacilityExplorerView from './components/views/FacilityExplorerView';
import AreaView from './components/views/AreaView';
import AreaReportView from './components/views/AreaReportView';
import MuniView from './components/views/MuniView';
import MapView from './components/views/MapView';

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => { const c = () => setM(window.innerWidth < 768); c(); window.addEventListener('resize', c); return () => window.removeEventListener('resize', c); }, []);
  return m;
}

const Nav = ({icon,label,active,onClick}) => (
  <button onClick={onClick} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:8,border:'none',cursor:'pointer',width:'100%',textAlign:'left',fontSize:13,fontWeight:active?600:400,color:active?'#2563EB':'#64748b',background:active?'#eff6ff':'transparent',transition:'all 0.15s'}}>
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={active?'#2563EB':'#94a3b8'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icon}/></svg>
    {label}
  </button>
);


// Medical Area data: loaded dynamically from /api/medical-areas

// 2階層ナビ: 4グループ × サブビュー（地理粒度・テーマで整理）
const NAV_GROUPS = [
  { id: 'social', label: '社会・人口', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2M9 11a4 4 0 100-8 4 4 0 000 8z',
    views: [['map', '高齢社会 概況'], ['muni', '人口動態・将来推計']] },
  { id: 'disease', label: '医療・疾病', icon: 'M22 12h-4l-3 9L9 3l-3 9H2',
    views: [['area', '医療圏・疾病構造'], ['ndb', '医療プロファイル'], ['bedfunc', '地域医療構想・病床機能']] },
  { id: 'karte', label: '医療圏カルテ', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
    views: [['report', '医療圏カルテ']] },
  { id: 'facility', label: '施設', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    views: [['explorer', '施設エクスプローラ']] },
];
const groupOfView = (v) => NAV_GROUPS.find(g => g.views.some(([id]) => id === v)) || NAV_GROUPS[0];

export default function Home() {
  const mob = useIsMobile();
  const [view, setView] = useState('map');
  const [metric, setMetric] = useState('facilities');
  const [prefs, setPrefs] = useState([]);
  const [munis, setMunis] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [topFac, setTopFac] = useState([]);
  const [globalPref, setGlobalPref] = useState('東京都');
  const [reportCode, setReportCode] = useState(null); // 圏一覧→カルテのディープリンク圏コード
  const [muniPref, setMuniPref] = useState(null); // 人口動態・将来推計 (null=全国)
  const [muniSearch, setMuniSearch] = useState('');
  const [muniSort, setMuniSort] = useState('pop');
  const [facSearch, setFacSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [areaData, setAreaData] = useState([]);
  const [areaPrefList, setAreaPrefList] = useState([]);
  const [geoFacilities, setGeoFacilities] = useState([]);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [japanMap, setJapanMap] = useState(null);
  const [hovPref, setHovPref] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({x:0,y:0});
  const [areaDemoData, setAreaDemoData] = useState([]);
  const [demoArea, setDemoArea] = useState('区中央部');
  const [demoPrefList, setDemoPrefList] = useState([]);
  const [ndbDiag, setNdbDiag] = useState([]);
  const [homecareCapability, setHomecareCapability] = useState(null);
  const [ndbRx, setNdbRx] = useState([]);
  const [ndbHc, setNdbHc] = useState([]);
  const [ndbCheckupRiskRates, setNdbCheckupRiskRates] = useState(null);
  const [ndbCheckupRiskRatesStd, setNdbCheckupRiskRatesStd] = useState(null);
  const [kijunData, setKijunData] = useState([]);
  const [kijunSummary, setKijunSummary] = useState(null);
  const [kijunPage, setKijunPage] = useState(0);
  const [kijunSearch, setKijunSearch] = useState('');
  const [kijunSort, setKijunSort] = useState('std_count');
  const [kijunExpanded, setKijunExpanded] = useState(null);
  const [futureDemo, setFutureDemo] = useState(null);
  const [futureYear, setFutureYear] = useState('2025');
  const [vitalStats, setVitalStats] = useState(null);
  const [agePyramid, setAgePyramid] = useState(null);
  const [ndbQ, setNdbQ] = useState(null);
  const [patientSurvey, setPatientSurvey] = useState(null);
  const [bedFunc, setBedFunc] = useState(null);
  const [mortalityOutcome2020, setMortalityOutcome2020] = useState(null);
  const [cancerSites2024, setCancerSites2024] = useState(null);

  // URL状態同期: ?v=<view>&pref=<都道府県> を復元・反映（code は AreaReportView が管理）
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get('v'); if (v) setView(v);
    const pr = p.get('pref'); if (pr) setGlobalPref(pr);
    const cd = p.get('code'); if (cd) setReportCode(cd);
  }, []);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set('v', view); p.set('pref', globalPref);
    if (reportCode) p.set('code', reportCode); else p.delete('code');
    window.history.replaceState(null, '', '?' + p.toString());
  }, [view, globalPref, reportCode]);

  useEffect(() => {
    Promise.all([
      fetch('/api/prefectures-full').then(r=>r.json()),
      fetch('/api/municipalities').then(r=>r.json()),
      fetch('/api/tiers').then(r=>r.json()),
      fetch('/api/facilities?limit=3000').then(r=>r.json()),
    ]).then(([p,m,t,f]) => {
      setPrefs(p); setMunis(m.data||[]); setTiers(t); setTopFac(f.data||[]);
    });
    fetch('/api/medical-areas').then(r=>r.json()).then(d => {
      setAreaPrefList(d.prefectures||[]);
      setAreaData(d.data?.filter(a=>a.pref===globalPref)||[]);
    });
    fetch('/api/facilities-geo').then(r=>r.json()).then(d => setGeoFacilities(d.data||[]));
    fetch('/api/japan-map').then(r=>r.json()).then(d => setJapanMap(d));
    fetch('/api/area-demographics').then(r=>r.json()).then(d => {
      setDemoPrefList(d.prefectures||[]);
      setAreaDemoData(d.data||[]);
    });
    fetch('/api/ndb/diagnostics').then(r=>r.json()).then(d=>setNdbDiag(d));
    fetch('/api/homecare-capability').then(r=>r.json()).then(d=>setHomecareCapability(d));
    fetch('/api/ndb/health-checkup').then(r=>r.json()).then(d=>setNdbHc(d));
    fetch('/api/ndb/checkup-risk-rates').then(r=>r.json()).then(d=>setNdbCheckupRiskRates(d));
    fetch('/api/ndb/checkup-risk-rates-standardized').then(r=>r.json()).then(d=>setNdbCheckupRiskRatesStd(d));
    fetch('/api/future-demographics').then(r=>r.json()).then(d=>setFutureDemo(d));
    fetch('/api/vital-statistics').then(r=>r.json()).then(d=>setVitalStats(d));
    fetch('/api/age-pyramid').then(r=>r.json()).then(d=>setAgePyramid(d));
    fetch('/api/ndb/questionnaire').then(r=>r.json()).then(d=>setNdbQ(d));
    fetch('/api/patient-survey').then(r=>r.json()).then(d=>setPatientSurvey(d));
    fetch('/api/bed-function').then(r=>r.json()).then(d=>setBedFunc(d));
    fetch('/api/mortality-outcome-2020').then(r=>r.json()).then(d=>setMortalityOutcome2020(d));
    fetch('/api/cancer-sites-2024').then(r=>r.json()).then(d=>setCancerSites2024(d));
    fetch('/api/facility-standards?summary=true').then(r=>r.json()).then(d=>setKijunSummary(d));
  }, []);

  useEffect(() => {
    if (!globalPref) return;
    fetch('/api/medical-areas?prefecture='+encodeURIComponent(globalPref))
      .then(r=>r.json()).then(d => setAreaData(d.data||[]));
    fetch('/api/ndb/prescriptions?prefecture='+encodeURIComponent(globalPref))
      .then(r=>r.json()).then(d => setNdbRx(d));
    fetch('/api/facility-standards?prefecture='+encodeURIComponent(globalPref))
      .then(r=>r.json()).then(d => setKijunData(d.data||[]));
  }, [globalPref]);

  const filteredMunis = useMemo(() => {
    let d = [...munis];
    if (globalPref) d = d.filter(m=>m.pref===globalPref);
    if (muniSearch) d = d.filter(m=>m.name.includes(muniSearch)||m.pref.includes(muniSearch));
    d.sort((a,b)=>(b[muniSort]||0)-(a[muniSort]||0));
    return d;
  }, [munis, globalPref, muniSearch, muniSort]);

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
          {NAV_GROUPS.map(g=>{const on=groupOfView(view).id===g.id;return(
            <button key={g.id} onClick={()=>setView(g.views[0][0])} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3,padding:'6px 0',border:'none',background:'transparent',cursor:'pointer',color:on?'#2563EB':'#94a3b8',fontSize:10.5,fontWeight:on?700:400}}>
              <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={on?'#2563EB':'#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={g.icon}/></svg>
              {g.label}
            </button>
          )})}
        </nav>
      ) : (
      <aside style={{width:214,background:'#fff',borderRight:'1px solid #f0f0f0',padding:'20px 12px',flexShrink:0,position:'sticky',top:0,height:'100vh',boxSizing:'border-box',display:'flex',flexDirection:'column',gap:3}}>
        <div style={{padding:'0 14px 16px',borderBottom:'1px solid #f0f0f0',marginBottom:8}}>
          <div style={{fontSize:18,fontWeight:700,letterSpacing:'-0.03em'}}>MedIntel</div>
          <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>日本の医療と高齢社会</div>
        </div>
        {NAV_GROUPS.map(g=>(
          <Nav key={g.id} icon={g.icon} label={g.label} active={groupOfView(view).id===g.id} onClick={()=>setView(g.views[0][0])}/>
        ))}
        <div style={{flex:1}}/>
        <div style={{padding:'12px 14px',borderTop:'1px solid #f0f0f0',fontSize:11,color:'#cbd5e1'}}>
          出典: 厚労省/総務省/社人研<br/>97,024施設 × 976,149届出 × 住基2025
        </div>
      </aside>
      )}
      <main style={{flex:1,padding:mob?'16px 16px 80px':'28px 32px',maxWidth:1100,overflow:'auto'}}>
        {/* サブタブ（グループ内に複数ビューがある場合） */}
        {groupOfView(view).views.length>1 && (
          <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap',borderBottom:'1px solid #f0f0f0',paddingBottom:12}}>
            {groupOfView(view).views.map(([id,l])=>(
              <button key={id} onClick={()=>setView(id)} style={{padding:'7px 14px',borderRadius:8,border:'1px solid '+(view===id?'#2563EB':'#e2e8f0'),background:view===id?'#eff6ff':'#fff',color:view===id?'#2563EB':'#64748b',fontSize:13,fontWeight:600,cursor:'pointer'}}>{l}</button>
            ))}
          </div>
        )}

        {/* ═══ MAP VIEW ═══ */}
        {view==='map' && <MapView mob={mob} prefs={prefs} metric={metric} setMetric={setMetric} japanMap={japanMap} hovPref={hovPref} setHovPref={setHovPref} tooltipPos={tooltipPos} setTooltipPos={setTooltipPos} setGlobalPref={setGlobalPref} setView={setView} vitalStats={vitalStats} globalPref={globalPref} />}

        {/* ═══ MUNI VIEW ═══ */}
        {view==='muni' && <MuniView mob={mob} areaDemoData={areaDemoData} demoPref={muniPref} setDemoPref={setMuniPref} demoArea={demoArea} setDemoArea={setDemoArea} demoPrefList={demoPrefList} japanMap={japanMap} hovPref={hovPref} setHovPref={setHovPref} tooltipPos={tooltipPos} setTooltipPos={setTooltipPos} futureDemo={futureDemo} futureYear={futureYear} setFutureYear={setFutureYear} agePyramid={agePyramid} />}

        {/* ═══ AREA VIEW ═══ */}
        {view==='area' && <AreaView mob={mob} areaData={areaData} areaPref={globalPref} setAreaPref={setGlobalPref} areaPrefList={areaPrefList} vitalStats={vitalStats} japanMap={japanMap} onOpenKarte={(code)=>{ setReportCode(code); setView('report'); }} />}

        {/* ═══ AREA REPORT VIEW (医療圏カルテ) ═══ */}
        {view==='report' && <AreaReportView mob={mob} globalPref={globalPref} setGlobalPref={setGlobalPref} setView={setView} initialCode={reportCode} onInitialCodeConsumed={()=>setReportCode(null)} />}

        {/* ═══ SCORING VIEW ═══ */}
        {view==='bedfunc' && <RegionalBedFunctionView mob={mob} bedFunc={bedFunc} regPref={globalPref} setRegPref={setGlobalPref} agePyramid={agePyramid} ndbDiag={ndbDiag} homecareCapability={homecareCapability} />}

        {/* ═══ NDB VIEW ═══ */}
        {view==='ndb' && <NdbView mob={mob} ndbDiag={ndbDiag} ndbRx={ndbRx} ndbHc={ndbHc} ndbPref={globalPref} setNdbPref={setGlobalPref} setNdbRx={setNdbRx} vitalStats={vitalStats} ndbQ={ndbQ} agePyramid={agePyramid} futureDemo={futureDemo} patientSurvey={patientSurvey} bedFunc={bedFunc} ndbCheckupRiskRates={ndbCheckupRiskRates} ndbCheckupRiskRatesStd={ndbCheckupRiskRatesStd} mortalityOutcome2020={mortalityOutcome2020} cancerSites2024={cancerSites2024} homecareCapability={homecareCapability} japanMap={japanMap} futureYear={futureYear} setFutureYear={setFutureYear} />}

        {/* ═══ FACILITY STANDARDS VIEW ═══ */}
        {view==='explorer' && <FacilityExplorerView mob={mob} kijunData={kijunData} setKijunData={setKijunData} kijunSummary={kijunSummary} kijunPref={globalPref} setKijunPref={setGlobalPref} kijunPage={kijunPage} setKijunPage={setKijunPage} kijunSearch={kijunSearch} setKijunSearch={setKijunSearch} kijunSort={kijunSort} setKijunSort={setKijunSort} kijunExpanded={kijunExpanded} setKijunExpanded={setKijunExpanded} topFac={topFac} facSearch={facSearch} setFacSearch={setFacSearch} searchResults={searchResults} doSearch={doSearch} geoFacilities={geoFacilities} />}

        {/* ═══ GEO MAP VIEW ═══ */}


        <div style={{fontSize:11,color:'#cbd5e1',textAlign:'center',marginTop:32,lineHeight:1.6}}>
          MedIntel — 厚労省/総務省/社人研/全国8地方厚生局 オープンデータを加工して作成<br/>
          本サイトは公的統計データを独自に統合・分析したものであり、政府が作成したものではありません
        </div>
      </main>
    </div>
  );
}
