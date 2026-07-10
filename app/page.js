'use client';
import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { SelectionProvider, useSelection, useUrlSync } from './components/SelectionContext';
import ContextRail from './components/ContextRail';
import TourBar from './components/TourBar';
import HomeView from './components/views/HomeView'; // 既定ランディング＝静的 import で初回表示を即時化
import { useData, fetchData } from '../lib/dataClient';

// ビューは next/dynamic で遅延ロード(初期チャンクからビュー本体+jspdf等を分離)。ssr:false・簡易ローディング付き。
const ViewLoading = () => <div style={{padding:'48px 0',textAlign:'center',color:'#94a3b8',fontSize:13}}>読み込み中…</div>;
const NdbView = dynamic(() => import('./components/views/NdbView'), { ssr:false, loading: ViewLoading });
const RegionalBedFunctionView = dynamic(() => import('./components/views/RegionalBedFunctionView'), { ssr:false, loading: ViewLoading });
const FacilityExplorerView = dynamic(() => import('./components/views/FacilityExplorerView'), { ssr:false, loading: ViewLoading });
const AreaView = dynamic(() => import('./components/views/AreaView'), { ssr:false, loading: ViewLoading });
const AreaReportView = dynamic(() => import('./components/views/AreaReportView'), { ssr:false, loading: ViewLoading });
const MuniView = dynamic(() => import('./components/views/MuniView'), { ssr:false, loading: ViewLoading });
const MapView = dynamic(() => import('./components/views/MapView'), { ssr:false, loading: ViewLoading });

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

// 2階層ナビ: 地理階層 4グループ（全国・都道府県 → 医療圏 → 市区町村 → 施設）
// views の各要素は [id, サブタブ短縮ラベル, 見出しh1(省略時はサブタブラベル)]
const NAV_GROUPS = [
  { id: 'national', label: '全国・都道府県', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2a15 15 0 010 20 15 15 0 010-20z',
    views: [['map', '地図', '高齢社会 概況'], ['ndb', '医療プロファイル', '医療プロファイル'], ['bedfunc', '病床機能', '地域医療構想・病床機能']] },
  { id: 'iryoken', label: '医療圏', icon: 'M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
    views: [['area', '一覧・比較', '医療圏 一覧・比較'], ['report', 'カルテ', '医療圏カルテ']] },
  { id: 'city', label: '市区町村', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2M9 11a4 4 0 100-8 4 4 0 000 8z',
    views: [['muni', '人口動態・将来推計']] },
  { id: 'facility', label: '施設', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    views: [['explorer', '施設エクスプローラ']] },
];
const groupOfView = (v) => NAV_GROUPS.find(g => g.views.some(([id]) => id === v)) || NAV_GROUPS[0];
// NAV_GROUPS のラベルを唯一の正とし、各ビューの見出し(h1/冠)へ供給する（h1は3要素目→無ければサブタブ名）
const labelOfView = (v) => { for (const g of NAV_GROUPS) { const f = g.views.find(([id]) => id === v); if (f) return f[2] || f[1]; } return ''; };

export default function Home() {
  // SelectionProvider を最上部で Provide（全ビューが共有分析状態を横断参照）
  return (
    <SelectionProvider>
      <HomeInner />
    </SelectionProvider>
  );
}

function HomeInner() {
  const mob = useIsMobile();
  // ── 共有分析状態は SelectionContext を単一ソースに（旧 page.js ローカル state を昇格） ──
  const {
    view, setView,
    pref: globalPref, setPref: setGlobalPref,
    setReportCode,
    futureYear, setFutureYear,
    setHoverPref,
    tourId,
  } = useSelection();
  useUrlSync(); // ?v&pref&code&year&pin&domain 双方向同期・popstate・後方互換
  // グループ内で最後に見たビューを記憶し、グループタップで views[0] でなくそこへ復帰する
  const [lastViewOfGroup, setLastViewOfGroup] = useState({});
  // home はどの地理階層グループにも属さない（別名前空間）ため記憶対象から除外する
  const inSomeGroup = NAV_GROUPS.some(g => g.views.some(([id]) => id === view));
  const activeGroupId = inSomeGroup ? groupOfView(view).id : null;
  useEffect(() => {
    if (!inSomeGroup) return;
    const gid = groupOfView(view).id;
    setLastViewOfGroup(m => m[gid] === view ? m : { ...m, [gid]: view });
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  const goGroup = (g) => setView(lastViewOfGroup[g.id] || g.views[0][0]);
  const [metric, setMetric] = useState('facilities');
  const [prefs, setPrefs] = useState([]);
  const [munis, setMunis] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [muniSearch, setMuniSearch] = useState('');
  const [muniSort, setMuniSort] = useState('pop');
  const [facSearch, setFacSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [areaData, setAreaData] = useState([]);
  const [areaPrefList, setAreaPrefList] = useState([]);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const japanMap = useData('/api/japan-map');
  const [hovPref, setHovPref] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({x:0,y:0});
  const [areaDemoData, setAreaDemoData] = useState([]);
  const [demoArea, setDemoArea] = useState('区中央部');
  const [demoPrefList, setDemoPrefList] = useState([]);
  const ndbDiag = useData('/api/ndb/diagnostics', []);
  const homecareCapability = useData('/api/homecare-capability');
  const [ndbRx, setNdbRx] = useState([]);
  const ndbHc = useData('/api/ndb/health-checkup', []);
  const ndbCheckupRiskRates = useData('/api/ndb/checkup-risk-rates');
  const ndbCheckupRiskRatesStd = useData('/api/ndb/checkup-risk-rates-standardized');
  const [kijunPage, setKijunPage] = useState(0);
  const [kijunSearch, setKijunSearch] = useState('');
  const [kijunSort, setKijunSort] = useState('std_count');
  const [kijunExpanded, setKijunExpanded] = useState(null);
  const futureDemo = useData('/api/future-demographics');
  const vitalStats = useData('/api/vital-statistics');
  const agePyramid = useData('/api/age-pyramid');
  const ndbQ = useData('/api/ndb/questionnaire');
  const patientSurvey = useData('/api/patient-survey');
  const bedFunc = useData('/api/bed-function');
  const mortalityOutcome2020 = useData('/api/mortality-outcome-2020');
  const cancerSites2024 = useData('/api/cancer-sites-2024');

  // URL状態同期は useUrlSync()（SelectionContext）へ一元化。
  // hoverPref はビュー横断で持ち回らない（transient）ため、ビュー切替で解除する。
  useEffect(() => { setHoverPref(null); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 変換を伴う一括fetchは fetchData(モジュールキャッシュ)経由に集約 ──
  // 単一state対1の静的fetchは useData に移行済み。ここは複数setter/整形が
  // 絡むもののみ残し、キャッシュ層で重複取得を排除する（挙動不変）。
  useEffect(() => {
    Promise.all([
      fetchData('/api/prefectures-full'),
      fetchData('/api/municipalities'),
      fetchData('/api/tiers'),
    ]).then(([p,m,t]) => {
      setPrefs(p); setMunis(m.data||[]); setTiers(t);
    });
    fetchData('/api/medical-areas').then(d => {
      setAreaPrefList(d.prefectures||[]);
      setAreaData(d.data?.filter(a=>a.pref===globalPref)||[]);
    });
    fetchData('/api/area-demographics').then(d => {
      setDemoPrefList(d.prefectures||[]);
      setAreaDemoData(d.data||[]);
    });
  }, []);

  useEffect(() => {
    if (!globalPref) return;
    fetchData('/api/medical-areas?prefecture='+encodeURIComponent(globalPref))
      .then(d => setAreaData(d.data||[]));
    fetchData('/api/ndb/prescriptions?prefecture='+encodeURIComponent(globalPref))
      .then(d => setNdbRx(d));
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


  // モバイルは app-shell（外枠を viewport 高さに固定し main を縦スクローラ化）→ 上部サブタブの sticky を有効化。
  // dvh 非対応時は minHeight にフォールバックし従来の body スクロールへ縮退。
  return (
    <div style={{display:'flex',flexDirection:mob?'column':'row',...(mob?{height:'100dvh',overflow:'hidden'}:{minHeight:'100vh'}),fontFamily:"'DM Sans',system-ui,sans-serif",background:'#f8f9fb',color:'#0f172a'}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      {/* Desktop Sidebar / Mobile Bottom Nav */}
      {mob ? (
        <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',borderTop:'1px solid #e2e8f0',display:'flex',zIndex:50,padding:'6px 0 env(safe-area-inset-bottom)',boxShadow:'0 -2px 8px rgba(0,0,0,0.06)'}}>
          {NAV_GROUPS.map(g=>{const on=activeGroupId===g.id;return(
            <button key={g.id} onClick={()=>goGroup(g)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3,padding:'6px 0',border:'none',background:'transparent',cursor:'pointer',color:on?'#2563EB':'#94a3b8',fontSize:10.5,fontWeight:on?700:400}}>
              <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={on?'#2563EB':'#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={g.icon}/></svg>
              {g.label}
            </button>
          )})}
        </nav>
      ) : (
      <aside style={{width:214,background:'#fff',borderRight:'1px solid #f0f0f0',padding:'20px 12px',flexShrink:0,position:'sticky',top:0,height:'100vh',boxSizing:'border-box',display:'flex',flexDirection:'column',gap:3}}>
        <button onClick={()=>setView('home')} style={{padding:'0 14px 16px',borderBottom:'1px solid #f0f0f0',marginBottom:8,border:'none',background:'transparent',textAlign:'left',cursor:'pointer',width:'100%'}} title="ホーム（全国サマリー）">
          <div style={{fontSize:18,fontWeight:700,letterSpacing:'-0.03em',color:'#0f172a'}}>MedIntel</div>
          <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>日本の医療と高齢社会</div>
        </button>
        <Nav icon="M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" label="ホーム" active={view==='home'} onClick={()=>setView('home')}/>
        {NAV_GROUPS.map(g=>(
          <Nav key={g.id} icon={g.icon} label={g.label} active={activeGroupId===g.id} onClick={()=>goGroup(g)}/>
        ))}
        <div style={{flex:1}}/>
        <div style={{padding:'12px 14px',borderTop:'1px solid #f0f0f0',fontSize:11,color:'#cbd5e1'}}>
          出典: 厚労省/総務省/社人研<br/>97,024施設 × 976,149届出 × 住基2025
        </div>
      </aside>
      )}
      {/* モバイル: 上部ロゴバー＝ホーム割当（下部4タブは維持）。home 上では省略（ヒーローが見出しを兼ねる）。 */}
      {mob && view!=='home' && (
        <div style={{flexShrink:0,display:'flex',alignItems:'center',gap:8,padding:'10px 16px',background:'#fff',borderBottom:'1px solid #f0f0f0'}}>
          <button onClick={()=>setView('home')} style={{border:'none',background:'transparent',padding:0,cursor:'pointer',display:'flex',alignItems:'center',gap:8}}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10"/></svg>
            <span style={{fontSize:15,fontWeight:700,letterSpacing:'-0.03em',color:'#0f172a'}}>MedIntel</span>
          </button>
        </div>
      )}
      <main style={{flex:1,minHeight:mob?0:undefined,padding:mob?`16px 16px ${tourId?180:80}px`:`28px 32px ${tourId?120:28}px`,maxWidth:1100,overflow:'auto'}}>
        {/* ═══ HOME VIEW（全国サマリー・既定ランディング） ═══ */}
        {view==='home' && <HomeView mob={mob} prefs={prefs} vitalStats={vitalStats} agePyramid={agePyramid} bedFunc={bedFunc} futureDemo={futureDemo} />}
        {/* 深掘りチェーン: 全ビュー共通の階層パンくず＋ジャンプチップ（navigate 経由）。home は自前の階層カードを持つため非表示。 */}
        {view!=='home' && <ContextRail mob={mob} />}
        {/* サブタブ（グループ内に複数ビューがある場合） */}
        {view!=='home' && groupOfView(view).views.length>1 && (
          <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:mob?'nowrap':'wrap',overflowX:mob?'auto':'visible',borderBottom:'1px solid #f0f0f0',paddingBottom:12,...(mob?{position:'sticky',top:0,zIndex:45,background:'#f8f9fb'}:{})}}>
            {groupOfView(view).views.map(([id,l])=>(
              <button key={id} onClick={()=>setView(id)} style={{flexShrink:0,padding:'7px 14px',borderRadius:8,border:'1px solid '+(view===id?'#2563EB':'#e2e8f0'),background:view===id?'#eff6ff':'#fff',color:view===id?'#2563EB':'#64748b',fontSize:13,fontWeight:600,cursor:'pointer'}}>{l}</button>
            ))}
          </div>
        )}

        {/* ═══ MAP VIEW ═══ */}
        {view==='map' && <MapView navTitle={labelOfView('map')} mob={mob} prefs={prefs} metric={metric} setMetric={setMetric} japanMap={japanMap} hovPref={hovPref} setHovPref={setHovPref} tooltipPos={tooltipPos} setTooltipPos={setTooltipPos} setGlobalPref={setGlobalPref} setView={setView} vitalStats={vitalStats} globalPref={globalPref} futureDemo={futureDemo} />}

        {/* ═══ MUNI VIEW ═══ */}
        {view==='muni' && <MuniView navTitle={labelOfView('muni')} mob={mob} areaDemoData={areaDemoData} demoPref={globalPref} setDemoPref={setGlobalPref} demoArea={demoArea} setDemoArea={setDemoArea} demoPrefList={demoPrefList} japanMap={japanMap} hovPref={hovPref} setHovPref={setHovPref} tooltipPos={tooltipPos} setTooltipPos={setTooltipPos} futureDemo={futureDemo} futureYear={futureYear} setFutureYear={setFutureYear} agePyramid={agePyramid} />}

        {/* ═══ AREA VIEW ═══ */}
        {view==='area' && <AreaView navTitle={labelOfView('area')} mob={mob} areaData={areaData} areaDemoData={areaDemoData} areaPref={globalPref} setAreaPref={setGlobalPref} areaPrefList={areaPrefList} vitalStats={vitalStats} japanMap={japanMap} onOpenKarte={(code)=>{ setReportCode(code); setView('report'); }} />}

        {/* ═══ AREA REPORT VIEW (医療圏カルテ) ═══ */}
        {view==='report' && <AreaReportView navTitle={labelOfView('report')} mob={mob} globalPref={globalPref} setGlobalPref={setGlobalPref} setView={setView} />}

        {/* ═══ SCORING VIEW ═══ */}
        {view==='bedfunc' && <RegionalBedFunctionView navTitle={labelOfView('bedfunc')} mob={mob} bedFunc={bedFunc} regPref={globalPref} setRegPref={setGlobalPref} agePyramid={agePyramid} ndbDiag={ndbDiag} homecareCapability={homecareCapability} japanMap={japanMap} />}

        {/* ═══ NDB VIEW ═══ */}
        {view==='ndb' && <NdbView navTitle={labelOfView('ndb')} mob={mob} ndbDiag={ndbDiag} ndbRx={ndbRx} ndbHc={ndbHc} ndbPref={globalPref} setNdbPref={setGlobalPref} setNdbRx={setNdbRx} vitalStats={vitalStats} ndbQ={ndbQ} agePyramid={agePyramid} futureDemo={futureDemo} patientSurvey={patientSurvey} bedFunc={bedFunc} ndbCheckupRiskRates={ndbCheckupRiskRates} ndbCheckupRiskRatesStd={ndbCheckupRiskRatesStd} mortalityOutcome2020={mortalityOutcome2020} cancerSites2024={cancerSites2024} homecareCapability={homecareCapability} japanMap={japanMap} futureYear={futureYear} setFutureYear={setFutureYear} setView={setView} />}

        {/* ═══ FACILITY STANDARDS VIEW ═══ */}
        {view==='explorer' && <FacilityExplorerView navTitle={labelOfView('explorer')} mob={mob} kijunPref={globalPref} setKijunPref={setGlobalPref} kijunPage={kijunPage} setKijunPage={setKijunPage} kijunSearch={kijunSearch} setKijunSearch={setKijunSearch} kijunSort={kijunSort} setKijunSort={setKijunSort} kijunExpanded={kijunExpanded} setKijunExpanded={setKijunExpanded} facSearch={facSearch} setFacSearch={setFacSearch} searchResults={searchResults} doSearch={doSearch} japanMap={japanMap} />}

        {/* ═══ GEO MAP VIEW ═══ */}


        <div style={{fontSize:11,color:'#cbd5e1',textAlign:'center',marginTop:32,lineHeight:1.6}}>
          MedIntel — 厚労省/総務省/社人研/全国8地方厚生局 オープンデータを加工して作成<br/>
          本サイトは公的統計データを独自に統合・分析したものであり、政府が作成したものではありません
        </div>
      </main>
      {/* シナリオツアー補助レール（tourId=null＝通常時は非描画・挙動不変） */}
      <TourBar mob={mob} />
    </div>
  );
}
