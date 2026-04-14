'use client';
import { useState, useEffect } from 'react';

export default function Home() {
  const [tiers, setTiers] = useState([]);
  const [top, setTop] = useState([]);
  const [prefs, setPrefs] = useState([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/tiers').then(r=>r.json()),
      fetch('/api/facilities?tier=S&limit=25').then(r=>r.json()),
      fetch('/api/prefectures').then(r=>r.json()),
    ]).then(([t,f,p]) => { setTiers(t); setTop(f.data||[]); setPrefs(p); });
  }, []);

  const doSearch = () => {
    if (!search) return;
    fetch('/api/facilities?q='+encodeURIComponent(search)+'&limit=20')
      .then(r=>r.json()).then(r=>setResults(r));
  };

  const fmt = n => n?.toLocaleString() ?? '-';
  const tc = { S:'#dc2626', A:'#f97316', B:'#eab308', C:'#22c55e', D:'#94a3b8' };

  return (
    <div style={{ minHeight:'100vh', background:'#f8f9fb', padding:'40px 48px', maxWidth:1200, margin:'0 auto' }}>
      <h1 style={{ fontSize:28, fontWeight:700, letterSpacing:'-0.03em', margin:0 }}>MedIntel</h1>
      <p style={{ fontSize:14, color:'#94a3b8', margin:'4px 0 24px' }}>医療市場インテリジェンス — 96,488施設 × 9因子スコアリング</p>
      <div style={{ display:'flex', gap:12, marginBottom:28, flexWrap:'wrap' }}>
        {tiers.map(t=>(
          <div key={t.tier} style={{ flex:1, minWidth:140, background:'#fff', borderRadius:12, padding:'16px 20px', border:'1px solid #f0f0f0', borderLeft:'4px solid '+(tc[t.tier]||'#ccc') }}>
            <div style={{ fontSize:18, fontWeight:800, color:tc[t.tier] }}>Tier {t.tier}</div>
            <div style={{ fontSize:24, fontWeight:700 }}>{fmt(t.count)}</div>
            <div style={{ fontSize:11, color:'#94a3b8' }}>avg {t.avg_score}pt</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:24 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doSearch()}
          placeholder="施設名で検索（例: 東大, 慶應, 藤田）" style={{ flex:1, padding:'10px 16px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:14, outline:'none' }}/>
        <button onClick={doSearch} style={{ padding:'10px 20px', borderRadius:8, border:'none', background:'#2563EB', color:'#fff', fontWeight:600, cursor:'pointer' }}>検索</button>
      </div>
      {results && (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #f0f0f0', padding:20, marginBottom:24 }}>
          <div style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>検索結果: {results.total}件</div>
          {results.data?.map((f,i)=>(
            <div key={i} style={{ padding:'8px 0', borderBottom:'1px solid #f8f9fa', fontSize:13, display:'flex', gap:12 }}>
              <span style={{ padding:'1px 8px', borderRadius:12, fontSize:11, fontWeight:700, background:(tc[f.tier]||'#ccc')+'18', color:tc[f.tier] }}>{f.priority_score}</span>
              <span style={{ fontWeight:500 }}>{f.facility_name}</span>
              <span style={{ color:'#94a3b8' }}>{f.prefecture_name}</span>
              <span style={{ marginLeft:'auto', color:'#64748b' }}>beds={fmt(f.total_beds)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #f0f0f0', overflow:'hidden', marginBottom:24 }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #f0f0f0', fontSize:16, fontWeight:600 }}>Tier S/A 施設</div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead><tr style={{ background:'#fafbfc' }}>
            {['#','Score','施設名','都道府県','病床','年間症例'].map((h,i)=>(
              <th key={i} style={{ padding:'10px 14px', fontSize:11, fontWeight:600, color:'#94a3b8', textAlign:i<3?'left':'right', borderBottom:'1px solid #f1f5f9' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{top.map((f,i)=>(
            <tr key={i} style={{ borderBottom:'1px solid #f8f9fa' }}>
              <td style={{ padding:'10px 14px', color:'#94a3b8' }}>#{f.rank}</td>
              <td style={{ padding:'10px 14px' }}><span style={{ padding:'2px 10px', borderRadius:20, fontSize:12, fontWeight:700, background:(tc[f.tier]||'#ccc')+'18', color:tc[f.tier] }}>{f.priority_score}</span></td>
              <td style={{ padding:'10px 14px', fontWeight:500, color:'#1e293b' }}>{f.facility_name}</td>
              <td style={{ padding:'10px 14px', textAlign:'right', color:'#64748b' }}>{f.prefecture_name}</td>
              <td style={{ padding:'10px 14px', textAlign:'right' }}>{fmt(f.total_beds)}</td>
              <td style={{ padding:'10px 14px', textAlign:'right', color:'#2563EB', fontWeight:600 }}>{fmt(f.annual_cases)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{ fontSize:12, color:'#cbd5e1', textAlign:'center', marginTop:24 }}>MedIntel v1.0 — 厚労省/総務省/社人研 オープンデータ統合</div>
    </div>
  );
}
