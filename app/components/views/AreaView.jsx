'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fmt, Tip, sortPrefs } from '../shared';

export default function AreaView({ mob, areaData, areaPref, setAreaPref, areaPrefList, vitalStats }) {
  const vp = vitalStats?.prefectures?.find(p => p.pref === areaPref);
  const causes = vp?.causes || [];
  return <>
  <div style={{marginBottom:24,display:'flex',flexDirection:mob?'column':'row',justifyContent:'space-between',alignItems:mob?'flex-start':'flex-end',gap:12}}>
    <div>
      <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Medical Area Analysis</div>
      <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>3階層 医療圏分析</h1>
      <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>全国339二次医療圏の医療体制を都道府県別に比較。</p>
    </div>
    <select value={areaPref} onChange={e=>setAreaPref(e.target.value)} style={{padding:'8px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff',cursor:'pointer',minWidth:140}}>
      {sortPrefs(areaPrefList).map(p=><option key={p} value={p}>{p}</option>)}
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
    <div style={{padding:'12px 16px',fontSize:11,color:'#94a3b8',borderTop:'1px solid #f1f5f9'}}>
      出典: 厚労省 病床機能報告（令和6年度）2025/9/30公表 ・ 全国330二次医療圏対応<br/>
      <span style={{color:'#b45309'}}>※過年度データとは集計処理が異なるため、現時点では時系列比較ではなく現況把握用として表示しています。</span>
    </div>
  </div>

  {/* ═══ DEATH CAUSE STRUCTURE ═══ */}
  {causes.length > 0 && <>
    <div style={{background:'#fff',borderRadius:14,padding:'20px 24px',border:'1px solid #f0f0f0',marginTop:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:16}}>
        <div>
          <div style={{fontSize:14,fontWeight:600}}>死因構造 — {areaPref}</div>
          <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>厚労省人口動態統計 2024年確定数 ｜ 死亡率（人口10万対）</div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(250, causes.length * 28)}>
        <BarChart data={causes.map(c=>({...c, label: c.cause?.replace(/\(.+\)/,'') || c.cause}))} layout="vertical" margin={{left:10}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
          <XAxis type="number" tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
          <YAxis type="category" dataKey="label" tick={{fontSize:11,fill:'#475569'}} axisLine={false} tickLine={false} width={90}/>
          <Tooltip content={<Tip/>}/>
          <Bar dataKey="rate" name="死亡率(/10万)" fill="#7c3aed" radius={[0,4,4,0]} barSize={16}/>
        </BarChart>
      </ResponsiveContainer>
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:12}}>
        {causes.slice(0,5).map((c,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',background:'#f5f3ff',borderRadius:16,fontSize:11}}>
            <span style={{fontWeight:600,color:'#7c3aed'}}>{c.cause?.replace(/\(.+\)/,'') || c.cause}</span>
            <span style={{color:'#64748b'}}>{c.rate}/10万</span>
          </div>
        ))}
      </div>
    </div>
  </>}
  </>;
}
