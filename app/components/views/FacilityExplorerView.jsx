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
  const PER_PAGE = 25;

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
    return true;
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
      <button onClick={() => setCapFilter('')} style={{padding:'3px 10px',borderRadius:12,border:!capFilter?'2px solid #2563EB':'1px solid #e2e8f0',background:!capFilter?'#eff6ff':'#fff',color:!capFilter?'#2563EB':'#94a3b8',fontSize:11,fontWeight:!capFilter?600:400,cursor:'pointer'}}>全て</button>
      {Object.entries(CAT_LABELS).map(([k, v]) => (
        <button key={k} onClick={() => setCapFilter(capFilter === k ? '' : k)} style={{padding:'3px 10px',borderRadius:12,border:capFilter===k?`2px solid ${CAT_COLORS[k]}`:'1px solid #e2e8f0',background:capFilter===k?CAT_COLORS[k]+'18':'#fff',color:capFilter===k?CAT_COLORS[k]:'#94a3b8',fontSize:11,fontWeight:capFilter===k?600:400,cursor:'pointer'}}>{v}</button>
      ))}
    </div>
    <div style={{display:'flex',gap:4,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
      <span style={{fontSize:11,color:'#94a3b8',marginRight:4}}>Tier:</span>
      {['', 'S', 'A', 'B'].map(t => (
        <button key={t} onClick={() => setTierFilter(tierFilter === t ? '' : t)} style={{padding:'3px 10px',borderRadius:12,border:tierFilter===t?`2px solid ${TC2[t]||'#64748b'}`:'1px solid #e2e8f0',background:tierFilter===t?(TC2[t]||'#64748b')+'18':'#fff',color:tierFilter===t?(TC2[t]||'#64748b'):'#94a3b8',fontSize:11,fontWeight:tierFilter===t?600:400,cursor:'pointer'}}>{t || '全て'}</button>
      ))}
      <span style={{fontSize:11,color:'#64748b',marginLeft:8}}>{dpcFiltered.length} 施設 (都道府県:{kijunPref})</span>
      <span style={{fontSize:10,color:'#cbd5e1',marginLeft:'auto'}}>※Tier/scoreは内製複合指標</span>
    </div>

    {/* DPC施設テーブル */}
    <div style={{background:'#fff',borderRadius:12,border:'1px solid #f0f0f0',overflow:'hidden'}}>
      <div style={{maxHeight:'calc(100vh - 320px)',overflowY:'auto',overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{background:'#fafbfc',position:'sticky',top:0,zIndex:1}}>
            {(mob ? ['#', 'Score', '施設名'] : ['#', 'Score', '施設名', '都道府県', '病床', '症例', '在院日数', '特徴']).map((h, i) => (
              <th key={i} style={{padding:'10px 12px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:i<3?'left':'right',borderBottom:'1px solid #f1f5f9',background:'#fafbfc'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{dpcFiltered.slice(0, 100).map((f, i) => (
            <tr key={i} style={{borderBottom:'1px solid #f8f9fa'}} onMouseEnter={e => e.currentTarget.style.background='#f8faff'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <td style={{padding:'10px 12px',color:'#94a3b8'}}>#{f.rank}</td>
              <td style={{padding:'10px 12px'}}><span style={{padding:'2px 10px',borderRadius:20,fontSize:12,fontWeight:700,background:(TC[f.tier]||'#ccc')+'18',color:TC[f.tier]||'#999'}}>{f.priority_score}</span></td>
              <td style={{padding:'10px 12px',fontWeight:500,color:'#1e293b'}}>{f.facility_name}{f.missing && f.missing.length > 0 && <span style={{fontSize:10,color:'#f59e0b',marginLeft:4}} title={f.missing.join(', ')}>⚠</span>}</td>
              {!mob && <td style={{padding:'10px 12px',textAlign:'right',color:'#64748b'}}>{f.prefecture_name}</td>}
              {!mob && <td style={{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(f.total_beds)}</td>}
              {!mob && <td style={{padding:'10px 12px',textAlign:'right',color:'#2563EB',fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{fmt(f.annual_cases)}</td>}
              {!mob && <td style={{padding:'10px 12px',textAlign:'right'}}>{f.avg_los || '—'}</td>}
              {!mob && <td style={{padding:'10px 12px',fontSize:11,color:'#64748b',maxWidth:180}}>{(f.reasons || []).slice(0, 3).join(' / ') || '—'}</td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
    <div style={{fontSize:10,color:'#94a3b8',marginTop:10,lineHeight:1.5}}>
      ※全国上位{(topFac || []).length}施設(Tier S=22 / Tier A=280 / Tier B=2,500のサブセット)。100件まで表示。出典: 厚労省DPC公開データ + G-MIS。
    </div>
  </>}

  {/* ==== Tab 3: スコア説明 ==== */}
  {tab === 'score' && (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'24px 28px'}}>
      <h3 style={{fontSize:16,fontWeight:700,margin:'0 0 12px',color:'#1e293b'}}>priority_score / Tier の透明性ノート</h3>
      <div style={{padding:'10px 14px',background:'#fef3c7',borderLeft:'4px solid #f59e0b',borderRadius:6,fontSize:12,color:'#92400e',marginBottom:16}}>
        <b>⚠️ 重要</b>: priority_score / Tier は本サイト独自の<b>内製複合指標</b>であり、厚労省・公的機関による公式ランキングではありません。施設探索の補助として参照してください。
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
        <p style={{fontSize:11,color:'#94a3b8',marginTop:16}}>
          peer reviewer は本仕様を別途 <code style={{padding:'1px 4px',background:'#f1f5f9',borderRadius:3}}>priority_score_methodology.md</code> として要求する可能性があります。本ノートはその文書化が完了するまでの暫定的な開示です。
        </p>
      </div>
    </div>
  )}
  </>;
}
