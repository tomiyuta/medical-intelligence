'use client';
import { fmt, sortPrefs } from '../shared';

const NDB_CAT = {'A_初再診料':'初再診料','B_医学管理等':'医学管理等','C_在宅医療':'在宅医療','D_検査':'検査','E_画像診断':'画像診断','K_手術':'手術'};

export default function NdbView({ mob, ndbDiag, ndbRx, ndbHc, ndbPref, setNdbPref, setNdbRx }) {
  const diagByPref = ndbDiag.filter(d=>d.prefecture===ndbPref);
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
  </>;
}
