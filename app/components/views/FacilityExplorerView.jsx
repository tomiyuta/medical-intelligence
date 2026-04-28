'use client';
import { useState } from 'react';
import { fmt, sortPrefs, downloadCSV, TC } from '../shared';
import { generateKijunPDF } from '../pdfExport';

const CAT_LABELS = {imaging:'画像診断',surgery:'手術',acute:'急性期',rehab:'リハビリ',homecare:'在宅',oncology:'がん',psychiatry:'精神',pediatric:'小児',infection:'感染',dx_it:'DX'};
const CAT_COLORS = {imaging:'#2563EB',surgery:'#dc2626',acute:'#f59e0b',rehab:'#059669',homecare:'#8b5cf6',oncology:'#ec4899',psychiatry:'#6366f1',pediatric:'#14b8a6',infection:'#f97316',dx_it:'#64748b'};
const TC2 = {S:'#dc2626',A:'#f59e0b',B:'#2563EB',C:'#64748b',D:'#cbd5e1'};

export default function FacilityExplorerView({
  mob,
  // 届出ベース (KijunView継承)
  kijunData, setKijunData, kijunSummary, kijunPref, setKijunPref,
  kijunPage, setKijunPage, kijunSearch, setKijunSearch, kijunSort, setKijunSort,
  kijunExpanded, setKijunExpanded,
  // DPC・高機能 (ScoringView Layer C継承)
  topFac, facSearch, setFacSearch, searchResults, doSearch,
  // 地理 (GeoMapView継承)
  geoFacilities,
}) {
  const [tab, setTab] = useState('kijun'); // 'kijun' | 'dpc' | 'score'
  const [capFilter, setCapFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [dpcPage, setDpcPage] = useState(0);
  const [dpcSearch, setDpcSearch] = useState('');
  const [dpcSort, setDpcSort] = useState('score'); // 'score' | 'beds' | 'cases' | 'los' | 'growth' | 'rank'
  const [dpcExpanded, setDpcExpanded] = useState(null);
  const PER_PAGE = 25;
  // capability/tier filter変化時にdpcPageを0リセット
  const resetDpcPage = () => { setDpcPage(0); setDpcExpanded(null); };

  // Build geo lookup by code
  const geoByCode = {};
  (geoFacilities || []).forEach(g => { geoByCode[g.code] = g; });

  // ==== 届出ベース (Tab 1) ====
  const kijunFiltered = (kijunData || []).filter(f => {
    if (kijunSearch && !f.name.includes(kijunSearch) && !(f.addr || '').includes(kijunSearch)) return false;
    if (capFilter && (!f.caps || !f.caps[capFilter])) return false;
    if (tierFilter && f.tier !== tierFilter) return false;
    return true;
  });
  const kijunSorted = [...kijunFiltered].sort((a, b) => {
    if (kijunSort === 'std_count') return b.std_count - a.std_count;
    if (kijunSort === 'beds') return (b.beds || 0) - (a.beds || 0);
    if (kijunSort === 'cases') return (b.cases || 0) - (a.cases || 0);
    if (kijunSort === 'score') return (b.score || 0) - (a.score || 0);
    return 0;
  });
  const kijunTotalPages = Math.ceil(kijunSorted.length / PER_PAGE) || 1;
  const kpg = Math.min(kijunPage, kijunTotalPages - 1);
  const kijunPaged = kijunSorted.slice(kpg * PER_PAGE, (kpg + 1) * PER_PAGE);

  const changePref = (p) => {
    setKijunPref(p);
    setKijunPage(0);
    setKijunSearch('');
    setKijunExpanded(null);
    fetch('/api/facility-standards?prefecture=' + encodeURIComponent(p))
      .then(r => r.json()).then(d => setKijunData(d.data || []));
  };

  // ==== DPC・高機能 (Tab 2) ====
  const dpcFiltered = (topFac || []).filter(f => {
    if (capFilter && (!f.cap || !(f.cap[capFilter] > 0))) return false;
    if (tierFilter && f.tier !== tierFilter) return false;
    if (kijunPref && f.prefecture_name !== kijunPref) return false;
    if (dpcSearch) {
      const q = dpcSearch;
      if (!(f.facility_name || '').includes(q) && !(f.address || '').includes(q)) return false;
    }
    return true;
  });
  const dpcSorted = [...dpcFiltered].sort((a, b) => {
    if (dpcSort === 'score') return (b.priority_score || 0) - (a.priority_score || 0);
    if (dpcSort === 'beds') return (b.total_beds || 0) - (a.total_beds || 0);
    if (dpcSort === 'cases') return (b.annual_cases || 0) - (a.annual_cases || 0);
    if (dpcSort === 'los') return (a.avg_los || 99) - (b.avg_los || 99); // 短い方が上
    if (dpcSort === 'growth') return (b.case_growth_pct || 0) - (a.case_growth_pct || 0);
    if (dpcSort === 'rank') return (a.rank || 99999) - (b.rank || 99999);
    return 0;
  });

  return <>
  {/* Header */}
  <div style={{marginBottom:20}}>
    <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Facility Explorer</div>
    <h1 style={{fontSize:mob?20:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>施設エクスプローラ</h1>
    <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>届出基準・DPC実績・地理情報を統合した施設探索 — capability主軸で対応可能機能から探す</p>
  </div>

  {/* Tabs */}
  <div style={{display:'flex',gap:0,marginBottom:16,borderBottom:'1px solid #e2e8f0'}}>
    {[
      ['kijun', '届出ベース', kijunSummary?.total_facilities ? `${fmt(kijunSummary.total_facilities)}施設` : ''],
      ['dpc', 'DPC・高機能', topFac?.length ? `${fmt(topFac.length)}施設` : ''],
      ['score', 'スコア説明', ''],
    ].map(([id, label, sub]) => (
      <button key={id} onClick={() => setTab(id)} style={{
        padding:'10px 18px',
        background:'transparent',
        border:'none',
        borderBottom: tab === id ? '2px solid #2563EB' : '2px solid transparent',
        color: tab === id ? '#2563EB' : '#64748b',
        fontWeight: tab === id ? 700 : 500,
        cursor:'pointer',
        fontSize:13,
        marginRight:4,
      }}>{label}{sub && <span style={{fontSize:10,marginLeft:6,color:'#94a3b8'}}>({sub})</span>}</button>
    ))}
  </div>

  {/* ==== Tab 1: 届出ベース ==== */}
  {tab === 'kijun' && <>
    {/* サマリ */}
    {kijunSummary && (
      <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(4,1fr)',gap:10,marginBottom:16}}>
        {[
          ['総届出件数', fmt(kijunSummary.total_standards), '#2563EB'],
          ['対象施設数', fmt(kijunSummary.total_facilities), '#059669'],
          ['都道府県', '47', '#f59e0b'],
          ['出典', '全8厚生局', '#64748b'],
        ].map(([l, v, c], i) => (
          <div key={i} style={{background:'#fff',borderRadius:10,padding:'12px 14px',border:'1px solid #f0f0f0'}}>
            <div style={{fontSize:11,color:'#94a3b8'}}>{l}</div>
            <div style={{fontSize:i===3?14:22,fontWeight:700,color:c}}>{v}</div>
          </div>
        ))}
      </div>
    )}

    {/* capability + tier filters */}
    <div style={{display:'flex',gap:4,marginBottom:8,flexWrap:'wrap',alignItems:'center'}}>
      <span style={{fontSize:11,color:'#94a3b8',marginRight:4}}>capability:</span>
      <button onClick={() => { setCapFilter(''); setKijunPage(0); }} style={{padding:'3px 10px',borderRadius:12,border:!capFilter?'2px solid #2563EB':'1px solid #e2e8f0',background:!capFilter?'#eff6ff':'#fff',color:!capFilter?'#2563EB':'#94a3b8',fontSize:11,fontWeight:!capFilter?600:400,cursor:'pointer'}}>全て</button>
      {Object.entries(CAT_LABELS).map(([k, v]) => (
        <button key={k} onClick={() => { setCapFilter(capFilter === k ? '' : k); setKijunPage(0); }} style={{padding:'3px 10px',borderRadius:12,border:capFilter===k?`2px solid ${CAT_COLORS[k]}`:'1px solid #e2e8f0',background:capFilter===k?CAT_COLORS[k]+'18':'#fff',color:capFilter===k?CAT_COLORS[k]:'#94a3b8',fontSize:11,fontWeight:capFilter===k?600:400,cursor:'pointer'}}>{v}</button>
      ))}
    </div>
    <div style={{display:'flex',gap:4,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
      <span style={{fontSize:11,color:'#94a3b8',marginRight:4}}>Tier補助:</span>
      {['', 'S', 'A', 'B', 'C', 'D'].map(t => (
        <button key={t} onClick={() => { setTierFilter(tierFilter === t ? '' : t); setKijunPage(0); }} style={{padding:'3px 10px',borderRadius:12,border:tierFilter===t?`2px solid ${TC2[t]||'#64748b'}`:'1px solid #e2e8f0',background:tierFilter===t?(TC2[t]||'#64748b')+'18':'#fff',color:tierFilter===t?(TC2[t]||'#64748b'):'#94a3b8',fontSize:11,fontWeight:tierFilter===t?600:400,cursor:'pointer'}}>{t || '全て'}</button>
      ))}
      <span style={{fontSize:10,color:'#cbd5e1',marginLeft:8}}>※Tier=内製複合指標(参考値)</span>
    </div>

    {/* selectors + search */}
    <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
      {kijunSummary && (
        <select value={kijunPref} onChange={e => changePref(e.target.value)} style={{padding:'7px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff'}}>
          {sortPrefs(kijunSummary.prefectures || []).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      )}
      <input value={kijunSearch} onChange={e => { setKijunSearch(e.target.value); setKijunPage(0); }} placeholder="施設名・住所で検索" style={{padding:'7px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff',width:mob?'100%':180}}/>
      <select value={kijunSort} onChange={e => setKijunSort(e.target.value)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:12,background:'#fff'}}>
        <option value="std_count">届出数順</option>
        <option value="beds">病床数順</option>
        <option value="cases">症例数順</option>
        <option value="score">スコア順</option>
      </select>
      <span style={{fontSize:12,color:'#64748b'}}>{kijunFiltered.length > 0 ? `${fmt(kijunFiltered.length)}施設` : '—'}{kijunTotalPages > 1 ? ` (${kpg+1}/${kijunTotalPages}p)` : ''}</span>
      <button onClick={() => {
        const header = ['施設コード','施設名','都道府県','住所','病床数','届出数','スコア','ティア','出典'];
        const data = kijunSorted.map(f => [f.code, f.name, kijunPref, f.addr || '', f.beds || f.beds_text || '', f.std_count, f.score || '', f.tier || '', '厚生局 届出受理名簿']);
        downloadCSV([header, ...data], `medintel_explorer_kijun_${kijunPref}_${new Date().toISOString().slice(0,10)}.csv`);
      }} style={{padding:'5px 12px',borderRadius:6,border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',fontSize:12,cursor:'pointer'}}>📥 CSV</button>
      <button onClick={() => generateKijunPDF(kijunSorted.slice(0, 200), { prefecture: kijunPref })} style={{padding:'5px 12px',borderRadius:6,border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',fontSize:12,cursor:'pointer'}}>📄 PDF</button>
    </div>

    {/* テーブル */}
    {kijunPaged.length > 0 && (
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #f0f0f0',overflow:'hidden'}}>
        <div style={{maxHeight:'calc(100vh - 380px)',overflowY:'auto',overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{background:'#fafbfc',position:'sticky',top:0,zIndex:1}}>
              {(mob ? ['施設名', '届出'] : ['施設名', '住所', '病床', '届出', 'Tier']).map((h, i) => (
                <th key={i} style={{padding:'8px 10px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:['届出','病床','Tier'].includes(h)?'right':'left',borderBottom:'1px solid #f1f5f9',whiteSpace:'nowrap',background:'#fafbfc'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{kijunPaged.map((f, i) => {
              const idx = kpg * PER_PAGE + i;
              const isExp = kijunExpanded === idx;
              const mapQ = encodeURIComponent((f.name || '') + ' ' + (f.addr || ''));
              const bedsD = f.beds ? fmt(f.beds) : (f.beds_text || '—');
              const geo = geoByCode[f.code];
              return [
                <tr key={idx} onClick={() => setKijunExpanded(isExp ? null : idx)} style={{borderBottom:isExp?'none':'1px solid #f8f9fa',cursor:'pointer',background:isExp?'#f0f7ff':'transparent'}}>
                  <td style={{padding:'8px 10px',fontWeight:500}}><span style={{color:isExp?'#2563EB':'#1e293b'}}>{f.name}</span></td>
                  {!mob && <td style={{padding:'8px 10px',color:'#64748b',fontSize:12,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.addr || '—'}</td>}
                  {!mob && <td style={{padding:'8px 10px',textAlign:'right',fontSize:12,color:'#64748b'}}>{bedsD}</td>}
                  <td style={{padding:'8px 10px',textAlign:'right',fontWeight:600,color:'#2563EB'}}>{f.std_count}</td>
                  {!mob && <td style={{padding:'8px 10px',textAlign:'right'}}>{f.tier ? <span style={{padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:700,background:(TC2[f.tier]||'#ccc')+'18',color:TC2[f.tier]||'#999'}}>{f.tier}</span> : '—'}</td>}
                </tr>,
                isExp && <tr key={idx + 'd'}><td colSpan={mob ? 2 : 5} style={{padding:0,background:'#f8faff',borderBottom:'1px solid #e8ecf0'}}>
                  <div style={{padding:'12px 16px',display:'grid',gridTemplateColumns:mob?'1fr':'2fr 1fr',gap:12}}>
                    <div>
                      <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>住所</div>
                      <div style={{fontSize:13,marginBottom:8}}>{f.addr || '—'}</div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:10}}>
                        <div><div style={{fontSize:10,color:'#94a3b8'}}>病床数</div><div style={{fontSize:14,fontWeight:600}}>{f.beds ? fmt(f.beds) : f.beds_text || '—'}</div></div>
                        <div><div style={{fontSize:10,color:'#94a3b8'}}>届出数</div><div style={{fontSize:14,fontWeight:600,color:'#2563EB'}}>{f.std_count}</div></div>
                        {f.score ? <div><div style={{fontSize:10,color:'#94a3b8'}}>スコア</div><div style={{fontSize:14,fontWeight:600}}>{f.score}pt</div></div> : null}
                        {f.cases ? <div><div style={{fontSize:10,color:'#94a3b8'}}>症例数</div><div style={{fontSize:14,fontWeight:600,color:'#059669'}}>{fmt(f.cases)}</div></div> : null}
                        {f.los ? <div><div style={{fontSize:10,color:'#94a3b8'}}>平均在院日数</div><div style={{fontSize:14,fontWeight:600}}>{f.los}日</div></div> : null}
                        {f.tier ? <div><div style={{fontSize:10,color:'#94a3b8'}}>ティア</div><div style={{fontSize:14,fontWeight:700,color:TC2[f.tier]||'#999'}}>{f.tier}</div></div> : null}
                      </div>
                      {f.caps && Object.keys(f.caps).length > 0 && (
                        <div style={{marginTop:6}}>
                          <div style={{fontSize:11,color:'#94a3b8',marginBottom:4}}>対応領域</div>
                          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                            {Object.entries(f.caps).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                              <span key={k} style={{padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600,background:(CAT_COLORS[k]||'#ccc')+'18',color:CAT_COLORS[k]||'#999'}}>{CAT_LABELS[k] || k} {v}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Google Maps iframe (geo coord優先, fallback to address search) */}
                    <div style={{minHeight:200,borderRadius:8,overflow:'hidden',border:'1px solid #e2e8f0'}}>
                      <iframe
                        width="100%" height="100%" frameBorder="0" style={{border:0,minHeight:200}}
                        src={geo
                          ? `https://maps.google.com/maps?q=${geo.lat},${geo.lng}&t=m&z=15&output=embed`
                          : `https://maps.google.com/maps?q=${mapQ}&t=m&z=15&output=embed`}
                        allowFullScreen
                      />
                    </div>
                  </div>
                </td></tr>
              ];
            })}</tbody>
          </table>
        </div>
      </div>
    )}

    {/* Pagination */}
    {kijunTotalPages > 1 && (
      <div style={{display:'flex',justifyContent:'center',gap:4,marginTop:12,flexWrap:'wrap'}}>
        <button onClick={() => setKijunPage(Math.max(0, kpg - 1))} disabled={kpg === 0} style={{padding:'6px 12px',borderRadius:6,border:'1px solid #e2e8f0',background:kpg===0?'#f8f9fa':'#fff',cursor:kpg===0?'default':'pointer',fontSize:12,color:kpg===0?'#cbd5e1':'#64748b'}}>◀ 前へ</button>
        {[...Array(Math.min(7, kijunTotalPages))].map((_, i) => {
          let p2;
          if (kijunTotalPages <= 7) p2 = i;
          else if (kpg < 3) p2 = i;
          else if (kpg > kijunTotalPages - 4) p2 = kijunTotalPages - 7 + i;
          else p2 = kpg - 3 + i;
          return <button key={p2} onClick={() => setKijunPage(p2)} style={{padding:'6px 10px',borderRadius:6,border:p2===kpg?'1px solid #2563EB':'1px solid #e2e8f0',background:p2===kpg?'#2563EB':'#fff',color:p2===kpg?'#fff':'#64748b',cursor:'pointer',fontSize:12,fontWeight:p2===kpg?700:400}}>{p2+1}</button>;
        })}
        <button onClick={() => setKijunPage(Math.min(kijunTotalPages - 1, kpg + 1))} disabled={kpg >= kijunTotalPages - 1} style={{padding:'6px 12px',borderRadius:6,border:'1px solid #e2e8f0',background:kpg>=kijunTotalPages-1?'#f8f9fa':'#fff',cursor:kpg>=kijunTotalPages-1?'default':'pointer',fontSize:12,color:kpg>=kijunTotalPages-1?'#cbd5e1':'#64748b'}}>次へ ▶</button>
      </div>
    )}

    <div style={{padding:'10px 0',fontSize:11,color:'#94a3b8',marginTop:12}}>出典: 全国8地方厚生局 届出受理医療機関名簿(医科) 令和8年2月〜4月現在</div>
  </>}

  {/* ==== Tab 2: DPC・高機能 ==== */}
  {tab === 'dpc' && <>
    <div style={{display:'flex',gap:4,marginBottom:8,flexWrap:'wrap',alignItems:'center'}}>
      <span style={{fontSize:11,color:'#94a3b8',marginRight:4}}>capability:</span>
      <button onClick={() => { setCapFilter(''); resetDpcPage(); }} style={{padding:'3px 10px',borderRadius:12,border:!capFilter?'2px solid #2563EB':'1px solid #e2e8f0',background:!capFilter?'#eff6ff':'#fff',color:!capFilter?'#2563EB':'#94a3b8',fontSize:11,fontWeight:!capFilter?600:400,cursor:'pointer'}}>全て</button>
      {Object.entries(CAT_LABELS).map(([k, v]) => (
        <button key={k} onClick={() => { setCapFilter(capFilter === k ? '' : k); resetDpcPage(); }} style={{padding:'3px 10px',borderRadius:12,border:capFilter===k?`2px solid ${CAT_COLORS[k]}`:'1px solid #e2e8f0',background:capFilter===k?CAT_COLORS[k]+'18':'#fff',color:capFilter===k?CAT_COLORS[k]:'#94a3b8',fontSize:11,fontWeight:capFilter===k?600:400,cursor:'pointer'}}>{v}</button>
      ))}
    </div>
    <div style={{display:'flex',gap:4,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
      <span style={{fontSize:11,color:'#94a3b8',marginRight:4}}>Tier:</span>
      {['', 'S', 'A', 'B'].map(t => (
        <button key={t} onClick={() => { setTierFilter(tierFilter === t ? '' : t); resetDpcPage(); }} style={{padding:'3px 10px',borderRadius:12,border:tierFilter===t?`2px solid ${TC2[t]||'#64748b'}`:'1px solid #e2e8f0',background:tierFilter===t?(TC2[t]||'#64748b')+'18':'#fff',color:tierFilter===t?(TC2[t]||'#64748b'):'#94a3b8',fontSize:11,fontWeight:tierFilter===t?600:400,cursor:'pointer'}}>{t || '全て'}</button>
      ))}
      <span style={{fontSize:10,color:'#cbd5e1',marginLeft:'auto'}}>※Tier/scoreは内製複合指標</span>
    </div>
    {/* 検索 + sort + CSV (Tab 2) */}
    <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
      <input value={dpcSearch} onChange={e => { setDpcSearch(e.target.value); resetDpcPage(); }} placeholder="施設名・住所で検索" style={{padding:'7px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff',width:mob?'100%':180}}/>
      <select value={dpcSort} onChange={e => setDpcSort(e.target.value)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:12,background:'#fff'}}>
        <option value="score">規模・実績スコア順</option>
        <option value="rank">全国順位</option>
        <option value="beds">病床数順</option>
        <option value="cases">症例数順</option>
        <option value="los">在院日数順 (短い順)</option>
        <option value="growth">成長率順</option>
      </select>
      <span style={{fontSize:12,color:'#64748b'}}>{fmt(dpcFiltered.length)} 施設 (都道府県:{kijunPref || '全国'})</span>
      <button onClick={() => {
        const header = ['順位','施設コード','施設名','都道府県','住所','病床数','年間症例','平均在院日数','成長率%','スコア','ティア','特徴','出典'];
        const data = dpcSorted.map(f => [f.rank, f.facility_code_10, f.facility_name, f.prefecture_name, f.address || '', f.total_beds || '', f.annual_cases || '', f.avg_los || '', f.case_growth_pct || '', f.priority_score || '', f.tier || '', (f.reasons || []).join('/'), '厚労省DPC + G-MIS']);
        downloadCSV([header, ...data], `medintel_explorer_dpc_${kijunPref || 'all'}_${new Date().toISOString().slice(0,10)}.csv`);
      }} style={{padding:'5px 12px',borderRadius:6,border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',fontSize:12,cursor:'pointer'}}>📥 CSV</button>
    </div>

    {/* DPC施設テーブル (pagination化 + 検索 + sort + 行詳細) */}
    {(() => {
      const dpcTotalPages = Math.ceil(dpcSorted.length / PER_PAGE) || 1;
      const dpg = Math.min(dpcPage, dpcTotalPages - 1);
      const dpcPaged = dpcSorted.slice(dpg * PER_PAGE, (dpg + 1) * PER_PAGE);
      const totalCount = (topFac || []).length;
      return (
        <>
          {dpcSorted.length === 0 ? (
            <div style={{padding:'24px',textAlign:'center',color:'#94a3b8',fontSize:13,background:'#f8fafc',borderRadius:8}}>
              該当する施設がありません ({fmt(totalCount)}施設のキャッシュから絞り込み中){kijunPref && ` / 都道府県=${kijunPref}`}{capFilter && ` / capability=${CAT_LABELS[capFilter]}`}{tierFilter && ` / Tier=${tierFilter}`}{dpcSearch && ` / 検索="${dpcSearch}"`}
            </div>
          ) : (
            <>
              <div style={{background:'#fff',borderRadius:12,border:'1px solid #f0f0f0',overflow:'hidden'}}>
                <div style={{maxHeight:'calc(100vh - 420px)',overflowY:'auto',overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                    <thead><tr style={{background:'#fafbfc',position:'sticky',top:0,zIndex:1}}>
                      {(mob ? ['#', 'Score', '施設名'] : ['#', '規模・実績', '施設名', '都道府県', '病床', '症例', '在院日数', '特徴']).map((h, i) => (
                        <th key={i} style={{padding:'10px 12px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:i<3?'left':'right',borderBottom:'1px solid #f1f5f9',background:'#fafbfc'}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{dpcPaged.map((f, i) => {
                      const dIdx = dpg * PER_PAGE + i;
                      const isExp = dpcExpanded === dIdx;
                      const geo = geoByCode[f.facility_code_10];
                      const mapQ = encodeURIComponent((f.facility_name || '') + ' ' + (f.address || ''));
                      return [
                        <tr key={dIdx} onClick={() => setDpcExpanded(isExp ? null : dIdx)} style={{borderBottom:isExp?'none':'1px solid #f8f9fa',cursor:'pointer',background:isExp?'#f0f7ff':'transparent'}}>
                          <td style={{padding:'10px 12px',color:'#94a3b8'}}>#{f.rank}</td>
                          <td style={{padding:'10px 12px'}}><span style={{padding:'2px 10px',borderRadius:20,fontSize:12,fontWeight:700,background:(TC[f.tier]||'#ccc')+'18',color:TC[f.tier]||'#999'}}>{f.priority_score}</span></td>
                          <td style={{padding:'10px 12px',fontWeight:500,color:isExp?'#2563EB':'#1e293b'}}>{f.facility_name}{f.missing && f.missing.length > 0 && <span style={{fontSize:10,color:'#f59e0b',marginLeft:4}} title={f.missing.join(', ')}>⚠</span>}</td>
                          {!mob && <td style={{padding:'10px 12px',textAlign:'right',color:'#64748b'}}>{f.prefecture_name}</td>}
                          {!mob && <td style={{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(f.total_beds)}</td>}
                          {!mob && <td style={{padding:'10px 12px',textAlign:'right',color:'#2563EB',fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{fmt(f.annual_cases)}</td>}
                          {!mob && <td style={{padding:'10px 12px',textAlign:'right'}}>{f.avg_los || '—'}</td>}
                          {!mob && <td style={{padding:'10px 12px',fontSize:11,color:'#64748b',maxWidth:180}}>{(f.reasons || []).slice(0, 3).join(' / ') || '—'}</td>}
                        </tr>,
                        isExp && <tr key={dIdx + 'd'}><td colSpan={mob ? 3 : 8} style={{padding:0,background:'#f8faff',borderBottom:'1px solid #e8ecf0'}}>
                          <div style={{padding:'14px 18px',display:'grid',gridTemplateColumns:mob?'1fr':'2fr 1fr',gap:14}}>
                            <div>
                              <div style={{fontSize:11,color:'#94a3b8',marginBottom:2}}>住所</div>
                              <div style={{fontSize:13,marginBottom:10}}>{f.address || '—'}</div>
                              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:10}}>
                                <div><div style={{fontSize:10,color:'#94a3b8'}}>規模・実績</div><div style={{fontSize:14,fontWeight:600,color:TC[f.tier]||'#999'}}>{f.priority_score} pt (Tier {f.tier})</div></div>
                                <div><div style={{fontSize:10,color:'#94a3b8'}}>病床数</div><div style={{fontSize:14,fontWeight:600}}>{fmt(f.total_beds)}</div></div>
                                <div><div style={{fontSize:10,color:'#94a3b8'}}>年間症例</div><div style={{fontSize:14,fontWeight:600,color:'#2563EB'}}>{fmt(f.annual_cases)}</div></div>
                                <div><div style={{fontSize:10,color:'#94a3b8'}}>平均在院日数</div><div style={{fontSize:14,fontWeight:600}}>{f.avg_los || '—'}日</div></div>
                                <div><div style={{fontSize:10,color:'#94a3b8'}}>成長率</div><div style={{fontSize:14,fontWeight:600}}>{f.case_growth_pct ? `${f.case_growth_pct > 0 ? '+' : ''}${f.case_growth_pct}%` : '—'}</div></div>
                                <div><div style={{fontSize:10,color:'#94a3b8'}}>DPC参加</div><div style={{fontSize:14,fontWeight:600}}>{f.is_dpc_participant ? '✓ 参加' : '—'}</div></div>
                              </div>
                              {f.cap && Object.keys(f.cap).length > 0 && (
                                <div style={{marginTop:6}}>
                                  <div style={{fontSize:11,color:'#94a3b8',marginBottom:4}}>capability proxy</div>
                                  <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                                    {Object.entries(f.cap).filter(([,v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                                      <span key={k} style={{padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600,background:(CAT_COLORS[k]||'#ccc')+'18',color:CAT_COLORS[k]||'#999'}}>{CAT_LABELS[k] || k} {v}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {f.reasons && f.reasons.length > 0 && (
                                <div style={{marginTop:8}}>
                                  <div style={{fontSize:11,color:'#94a3b8',marginBottom:4}}>スコア寄与ラベル</div>
                                  <div style={{fontSize:11,color:'#475569'}}>{f.reasons.join(' / ')}</div>
                                </div>
                              )}
                              {f.missing && f.missing.length > 0 && (
                                <div style={{marginTop:8,padding:'4px 8px',background:'#fef3c7',borderRadius:4}}>
                                  <div style={{fontSize:10,color:'#92400e'}}>⚠ 欠損: {f.missing.join(', ')}</div>
                                </div>
                              )}
                            </div>
                            {/* Google Maps iframe */}
                            <div style={{minHeight:200,borderRadius:8,overflow:'hidden',border:'1px solid #e2e8f0'}}>
                              <iframe
                                width="100%" height="100%" frameBorder="0" style={{border:0,minHeight:200}}
                                src={geo
                                  ? `https://maps.google.com/maps?q=${geo.lat},${geo.lng}&t=m&z=15&output=embed`
                                  : `https://maps.google.com/maps?q=${mapQ}&t=m&z=15&output=embed`}
                                allowFullScreen
                              />
                            </div>
                          </div>
                        </td></tr>
                      ];
                    })}</tbody>
                  </table>
                </div>
              </div>
              {/* Pagination */}
              {dpcTotalPages > 1 && (
                <div style={{display:'flex',justifyContent:'center',gap:4,marginTop:12,flexWrap:'wrap'}}>
                  <button onClick={() => setDpcPage(Math.max(0, dpg - 1))} disabled={dpg === 0} style={{padding:'6px 12px',borderRadius:6,border:'1px solid #e2e8f0',background:dpg===0?'#f8f9fa':'#fff',cursor:dpg===0?'default':'pointer',fontSize:12,color:dpg===0?'#cbd5e1':'#64748b'}}>◀ 前へ</button>
                  {[...Array(Math.min(7, dpcTotalPages))].map((_, i) => {
                    let p2;
                    if (dpcTotalPages <= 7) p2 = i;
                    else if (dpg < 3) p2 = i;
                    else if (dpg > dpcTotalPages - 4) p2 = dpcTotalPages - 7 + i;
                    else p2 = dpg - 3 + i;
                    return <button key={p2} onClick={() => setDpcPage(p2)} style={{padding:'6px 10px',borderRadius:6,border:p2===dpg?'1px solid #2563EB':'1px solid #e2e8f0',background:p2===dpg?'#2563EB':'#fff',color:p2===dpg?'#fff':'#64748b',cursor:'pointer',fontSize:12,fontWeight:p2===dpg?700:400}}>{p2+1}</button>;
                  })}
                  <button onClick={() => setDpcPage(Math.min(dpcTotalPages - 1, dpg + 1))} disabled={dpg >= dpcTotalPages - 1} style={{padding:'6px 12px',borderRadius:6,border:'1px solid #e2e8f0',background:dpg>=dpcTotalPages-1?'#f8f9fa':'#fff',cursor:dpg>=dpcTotalPages-1?'default':'pointer',fontSize:12,color:dpg>=dpcTotalPages-1?'#cbd5e1':'#64748b'}}>次へ ▶</button>
                </div>
              )}
            </>
          )}
          <div style={{fontSize:10,color:'#94a3b8',marginTop:10,lineHeight:1.5}}>
            出典: 厚労省DPC公開データ + G-MIS。全{fmt(totalCount)}施設(Tier S=22 / A=280 / B=2,500)から絞込み {fmt(dpcFiltered.length)} 件 ({PER_PAGE}件/ページ)。
          </div>
        </>
      );
    })()}
  </>}

  {/* ==== Tab 3: スコア説明 ==== */}
  {tab === 'score' && (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'24px 28px'}}>
      <h3 style={{fontSize:16,fontWeight:700,margin:'0 0 12px',color:'#1e293b'}}>priority_score / Tier の透明性ノート (観測ベース分析)</h3>
      <div style={{padding:'10px 14px',background:'#fef3c7',borderLeft:'4px solid #f59e0b',borderRadius:6,fontSize:12,color:'#92400e',marginBottom:12}}>
        <b>⚠️ 重要</b>: priority_score / Tier は本サイト独自の<b>内製複合指標</b>であり、厚労省・公的機関による公式ランキングではありません。施設探索の補助として参照してください。
      </div>
      <div style={{padding:'10px 14px',background:'#fef2f2',borderLeft:'4px solid #dc2626',borderRadius:6,fontSize:11,color:'#991b1b',marginBottom:16}}>
        <b>📌 本ノートの性質</b>: 以下は <code>top_facilities.json</code> の<b>観測値から逆算した分析</b>であり、ETL内部の正確な算出式・重みではありません。9因子の正式な定義・重み係数は未確認。Phase 2 で内部実装からの正式 spec exporter を作成予定。
      </div>
      <div style={{fontSize:13,color:'#475569',lineHeight:1.8}}>
        <p><b>現在 priority_score に含まれる(と認識している)要素</b>:</p>
        <ul style={{paddingLeft:20,margin:'8px 0'}}>
          <li>許可病床数 (規模)</li>
          <li>DPC年間症例数</li>
          <li>DPC参加病院ステータス</li>
          <li>症例成長率</li>
          <li>平均在院日数</li>
          <li>capability (10カテゴリ) の充実度</li>
        </ul>
        <p><b>Tier境界 (現在の閾値)</b>:</p>
        <div style={{padding:'8px 12px',background:'#f8fafc',borderRadius:6,fontSize:12,marginBottom:12,fontFamily:'monospace'}}>
          Tier S: priority_score &ge; 60.0 (全国22施設)<br/>
          Tier A: priority_score &ge; ~45 (全国280施設)<br/>
          Tier B: priority_score &lt; 45 (全国2,500施設)
        </div>
        <p style={{color:'#dc2626'}}><b>未文書化 (Phase 2課題)</b>:</p>
        <ul style={{paddingLeft:20,margin:'8px 0'}}>
          <li>9因子の正確な構成式・重み付けの公開</li>
          <li>各因子のデータ充足率と欠損時のpolicy</li>
          <li>Tier境界の統計的根拠 (現在は経験値)</li>
          <li>capability スコア計算ロジック (届出件数→数値の変換式)</li>
        </ul>
        <p style={{fontSize:12,color:'#475569',marginTop:16,padding:'10px 14px',background:'#eff6ff',borderRadius:6,borderLeft:'3px solid #2563EB'}}>
          📄 観測ベース逆算分析の詳細 (相関係数・偏向リスク・Tier境界実測値) は <a href="https://github.com/tomiyuta/medical-intelligence/blob/main/docs/priority_score_methodology.md" target="_blank" rel="noopener" style={{color:'#2563EB',fontWeight:600,textDecoration:'underline'}}><code>docs/priority_score_methodology.md</code></a> を参照。<br/>
          <span style={{fontSize:11,color:'#64748b'}}>主成分分析: <b>annual_cases (r=0.877)</b> + <b>total_beds (r=0.804)</b> で大半が説明される = 実質的に「規模スコア」。専門特化型小病院が過小評価される傾向あり。</span>
        </p>
      </div>
    </div>
  )}
  </>;
}
