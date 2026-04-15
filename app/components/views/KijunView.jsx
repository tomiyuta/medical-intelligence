'use client';
import { useState } from 'react';
import { fmt, sortPrefs, downloadCSV } from '../shared';
import { generateKijunPDF } from '../pdfExport';

const CAT_LABELS = {imaging:'画像診断',surgery:'手術',acute:'急性期',rehab:'リハビリ',homecare:'在宅',oncology:'がん',psychiatry:'精神',pediatric:'小児',infection:'感染',dx_it:'DX'};
const CAT_COLORS = {imaging:'#2563EB',surgery:'#dc2626',acute:'#f59e0b',rehab:'#059669',homecare:'#8b5cf6',oncology:'#ec4899',psychiatry:'#6366f1',pediatric:'#14b8a6',infection:'#f97316',dx_it:'#64748b'};

export default function KijunView({ mob, kijunData, setKijunData, kijunSummary, kijunPref, setKijunPref, kijunPage, setKijunPage, kijunSearch, setKijunSearch, kijunSort, setKijunSort, kijunExpanded, setKijunExpanded }) {
  const [capFilter, setCapFilter] = useState('');
  const TC2 = {S:'#dc2626',A:'#f59e0b',B:'#2563EB',C:'#64748b',D:'#cbd5e1'};
  const PER_PAGE = 25;
  const filtered = kijunData.filter(f => {
    if (kijunSearch && !f.name.includes(kijunSearch) && !(f.addr||'').includes(kijunSearch)) return false;
    if (capFilter && (!f.caps || !f.caps[capFilter])) return false;
    return true;
  });
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
            <div style={{display:'flex',gap:4,marginBottom:8,flexWrap:'wrap'}}>
              <button onClick={()=>{setCapFilter('');setKijunPage(0);}} style={{padding:'3px 10px',borderRadius:12,border:!capFilter?'2px solid #2563EB':'1px solid #e2e8f0',background:!capFilter?'#eff6ff':'#fff',color:!capFilter?'#2563EB':'#94a3b8',fontSize:11,fontWeight:!capFilter?600:400,cursor:'pointer'}}>全て</button>
              {Object.entries(CAT_LABELS).map(([k,v])=>(
                <button key={k} onClick={()=>{setCapFilter(capFilter===k?'':k);setKijunPage(0);}} style={{padding:'3px 10px',borderRadius:12,border:capFilter===k?`2px solid ${CAT_COLORS[k]}`:'1px solid #e2e8f0',background:capFilter===k?CAT_COLORS[k]+'18':'#fff',color:capFilter===k?CAT_COLORS[k]:'#94a3b8',fontSize:11,fontWeight:capFilter===k?600:400,cursor:'pointer'}}>{v}</button>
              ))}
            </div>
            <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
              <select value={kijunPref} onChange={e=>changePref(e.target.value)} style={{padding:'7px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff'}}>
                {sortPrefs(kijunSummary.prefectures||[]).map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <input value={kijunSearch} onChange={e=>{setKijunSearch(e.target.value);setKijunPage(0);}} placeholder="施設名・住所で検索" style={{padding:'7px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff',width:mob?'100%':180}}/>
              <select value={kijunSort} onChange={e=>setKijunSort(e.target.value)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:12,background:'#fff'}}>
                <option value="std_count">届出数順</option><option value="beds">病床数順</option><option value="cases">症例数順</option><option value="score">スコア順</option>
              </select>
              <span style={{fontSize:12,color:'#64748b'}}>{filtered.length>0?`${fmt(filtered.length)}施設`:'—'}{totalPages>1?` (${pg+1}/${totalPages}p)`:''}</span>
              <button onClick={()=>{
                const header=['施設コード','施設名','都道府県','住所','病床数','届出数','スコア','ティア','Confidence','特徴','不足情報','出典','取得日'];
                const data=sorted.map(f=>{
                  const reasons=[];
                  if(f.std_count>=100) reasons.push('届出100超(高機能)');
                  else if(f.std_count>=50) reasons.push('届出50超');
                  if(f.beds&&f.beds>=500) reasons.push('500床超');
                  else if(f.beds&&f.beds>=200) reasons.push('200床超');
                  if(f.score&&f.score>=45) reasons.push('Tier A以上');
                  if(f.cases) reasons.push(`症例${f.cases.toLocaleString()}`);
                  const missing=[];
                  if(!f.score) missing.push('スコア未算出');
                  if(!f.addr) missing.push('住所不明');
                  if(!f.beds&&!f.beds_text) missing.push('病床数不明');
                  const cov=[f.addr,f.beds||f.beds_text,f.score,f.tier].filter(Boolean).length;
                  const conf=cov>=3?'High':cov>=2?'Medium':'Low';
                  return [f.code,f.name,kijunPref,f.addr||'',f.beds||f.beds_text||'',f.std_count,f.score||'',f.tier||'',conf,reasons.join(' / ')||'—',missing.join(' / ')||'なし','厚生局 届出受理名簿','2026-04'];
                });
                downloadCSV([header,...data],`medintel_kijun_${kijunPref}_${new Date().toISOString().slice(0,10)}.csv`);
              }} style={{padding:'5px 12px',borderRadius:6,border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>📥 CSV</button>
              <button onClick={()=>generateKijunPDF(sorted.slice(0,200),{prefecture:kijunPref})} style={{padding:'5px 12px',borderRadius:6,border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>📄 PDF</button>
            </div>
            {paged.length>0&&<div style={{background:'#fff',borderRadius:12,border:'1px solid #f0f0f0',overflow:'hidden'}}>
             <div style={{maxHeight:'calc(100vh - 340px)',overflowY:'auto',overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead><tr style={{background:'#fafbfc',position:'sticky',top:0,zIndex:1}}>
                  {(mob?['施設名','届出']:['施設名','住所','病床','届出','Tier']).map((h,i)=>(
                    <th key={i} style={{padding:'8px 10px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:['届出','病床','Tier'].includes(h)?'right':'left',borderBottom:'1px solid #f1f5f9',whiteSpace:'nowrap',background:'#fafbfc'}}>{h}</th>))}
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
                      {f.caps&&Object.keys(f.caps).length>0&&<div style={{marginTop:8}}>
                        <div style={{fontSize:11,color:'#94a3b8',marginBottom:4}}>対応領域</div>
                        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                          {Object.entries(f.caps).sort((a,b)=>b[1]-a[1]).map(([k,v])=>(
                            <span key={k} style={{padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600,background:(CAT_COLORS[k]||'#ccc')+'18',color:CAT_COLORS[k]||'#999'}}>{CAT_LABELS[k]||k} {v}</span>
                          ))}
                        </div>
                      </div>}
                    </div>
                  </td></tr>
                  ];})}</tbody>
              </table>
             </div>
            </div>}
            {totalPages>1&&<div style={{display:'flex',justifyContent:'center',gap:4,marginTop:12,flexWrap:'wrap'}}>
              <button onClick={()=>setKijunPage(Math.max(0,pg-1))} disabled={pg===0} style={{padding:'6px 12px',borderRadius:6,border:'1px solid #e2e8f0',background:pg===0?'#f8f9fa':'#fff',cursor:pg===0?'default':'pointer',fontSize:12,color:pg===0?'#cbd5e1':'#64748b'}}>◀ 前へ</button>
              {[...Array(Math.min(7,totalPages))].map((_,i)=>{let p2;if(totalPages<=7)p2=i;else if(pg<3)p2=i;else if(pg>totalPages-4)p2=totalPages-7+i;else p2=pg-3+i;return <button key={p2} onClick={()=>setKijunPage(p2)} style={{padding:'6px 10px',borderRadius:6,border:p2===pg?'1px solid #2563EB':'1px solid #e2e8f0',background:p2===pg?'#2563EB':'#fff',color:p2===pg?'#fff':'#64748b',cursor:'pointer',fontSize:12,fontWeight:p2===pg?700:400}}>{p2+1}</button>;})}
              <button onClick={()=>setKijunPage(Math.min(totalPages-1,pg+1))} disabled={pg>=totalPages-1} style={{padding:'6px 12px',borderRadius:6,border:'1px solid #e2e8f0',background:pg>=totalPages-1?'#f8f9fa':'#fff',cursor:pg>=totalPages-1?'default':'pointer',fontSize:12,color:pg>=totalPages-1?'#cbd5e1':'#64748b'}}>次へ ▶</button>
            </div>}
          </>}
          <div style={{padding:'10px 0',fontSize:11,color:'#94a3b8',marginTop:12}}>出典: 全国8地方厚生局 届出受理医療機関名簿（医科）令和8年2月〜4月現在</div>
        </>;
}
