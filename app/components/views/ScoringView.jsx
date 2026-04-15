'use client';
import { fmt, TC, downloadCSV } from '../shared';
import { generateScoringPDF } from '../pdfExport';

export default function ScoringView({ mob, tiers, topFac, facSearch, setFacSearch, searchResults, doSearch }) {
  return <>
  <div style={{marginBottom:24}}>
    <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Priority Scoring</div>
    <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>訪問優先度スコアリング</h1>
    <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>9因子複合スコア（v4）— Tier S/A/B 上位2,802施設をDPC件数×病床数×成長率で自動ランク付け</p>
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
    <button onClick={()=>{
      const header=['Rank','Score','Tier','施設名','都道府県','住所','病床数','年間症例数','平均在院日数','Confidence','推奨理由','不足情報','出典','取得日'];
      const data=topFac.map(f=>{
        const reasons=[];
        if(f.total_beds>=1000) reasons.push('1000床超大規模');
        else if(f.total_beds>=500) reasons.push('500床超中規模');
        if(f.annual_cases>=20000) reasons.push('症例2万超');
        else if(f.annual_cases>=10000) reasons.push('症例1万超');
        if(f.is_dpc_participant) reasons.push('DPC参加病院');
        if(f.case_growth_pct>0) reasons.push(`症例増加+${f.case_growth_pct}%`);
        if(f.avg_los&&f.avg_los<12) reasons.push('短期在院(効率的)');
        const missing=[];
        if(!f.annual_cases) missing.push('症例数非開示');
        if(!f.is_dpc_participant) missing.push('DPC実績なし');
        if(!f.avg_los) missing.push('在院日数不明');
        if(!f.address) missing.push('住所不明');
        const coverage=[f.total_beds,f.annual_cases,f.avg_los,f.is_dpc_participant,f.case_growth_pct].filter(v=>v!=null&&v!==0).length;
        const conf=coverage>=4?'High':coverage>=2?'Medium':'Low';
        return [f.rank,f.priority_score,f.tier,f.facility_name,f.prefecture_name,f.address||'',f.total_beds||'',f.annual_cases||'',f.avg_los||'',conf,reasons.join(' / ')||'—',missing.join(' / ')||'なし','厚労省DPC/G-MIS','2026-04'];
      });
      downloadCSV([header,...data],`medintel_scoring_${new Date().toISOString().slice(0,10)}.csv`);
    }} style={{padding:'10px 16px',borderRadius:8,border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',fontSize:13,cursor:'pointer',whiteSpace:'nowrap'}}>📥 CSV</button>
    <button onClick={()=>generateScoringPDF(topFac,{title:'Priority Target List — Tier S'})} style={{padding:'10px 16px',borderRadius:8,border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',fontSize:13,cursor:'pointer',whiteSpace:'nowrap'}}>📄 PDF</button>
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
        {(mob?['#','Score','施設名']:['#','Score','施設名','都道府県','病床','症例','信頼度','推奨理由']).map((h,i)=>(
          <th key={i} style={{padding:'10px 12px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:i<3?'left':'right',borderBottom:'1px solid #f1f5f9'}}>{h}</th>))}
      </tr></thead>
      <tbody>{topFac.map((f,i)=>{
        const confColor = f.confidence==='High'?'#059669':f.confidence==='Medium'?'#f59e0b':'#94a3b8';
        return (
        <tr key={i} style={{borderBottom:'1px solid #f8f9fa'}} onMouseEnter={e=>e.currentTarget.style.background='#f8faff'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <td style={{padding:'10px 12px',color:'#94a3b8'}}>#{f.rank}</td>
          <td style={{padding:'10px 12px'}}><span style={{padding:'2px 10px',borderRadius:20,fontSize:12,fontWeight:700,background:(TC[f.tier]||'#ccc')+'18',color:TC[f.tier]}}>{f.priority_score}</span></td>
          <td style={{padding:'10px 12px',fontWeight:500,color:'#1e293b'}}>{f.facility_name}{f.missing&&f.missing.length>0&&<span style={{fontSize:10,color:'#f59e0b',marginLeft:4}} title={f.missing.join(', ')}>⚠</span>}</td>
          {!mob&&<td style={{padding:'10px 12px',textAlign:'right',color:'#64748b'}}>{f.prefecture_name}</td>}
          {!mob&&<td style={{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(f.total_beds)}</td>}
          {!mob&&<td style={{padding:'10px 12px',textAlign:'right',color:'#2563EB',fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{fmt(f.annual_cases)}</td>}
          {!mob&&<td style={{padding:'10px 12px',textAlign:'right'}}><span style={{fontSize:11,fontWeight:600,color:confColor}}>{f.confidence||'—'}</span></td>}
          {!mob&&<td style={{padding:'10px 12px',fontSize:11,color:'#64748b',maxWidth:180}}>{(f.reasons||[]).join(' / ')||'—'}</td>}
        </tr>);})}</tbody>
    </table>
  </div>
  </>;
}
