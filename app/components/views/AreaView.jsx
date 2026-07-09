'use client';
import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fmt, Tip, sortPrefs } from '../shared';
import PrefChoropleth from '../ui/PrefChoropleth';
import { getSourceBadge } from '../../../lib/sourceRegistry';

// 県コロプレスの指標セレクタ(圏の県内単純合計=実数、圏数のみ件数)
const METRICS = [
  { key: 'hosp', label: '病院数', unit: '施設' },
  { key: 'beds', label: '病床数', unit: '床' },
  { key: 'count', label: '医療圏数', unit: '圏' },
];

export default function AreaView({ mob, areaData, areaPref, setAreaPref, areaPrefList, vitalStats, japanMap, onOpenKarte }) {
  const vp = vitalStats?.prefectures?.find(p => p.pref === areaPref);
  const causes = vp?.causes || [];

  const [metric, setMetric] = useState('beds');
  const [allAreas, setAllAreas] = useState([]);          // 全国330圏(県集計用)
  const [emerg, setEmerg] = useState([]);                // 選択県の救急/在宅 圏別
  const [emergMeta, setEmergMeta] = useState(null);      // 件数差の脚注メタ
  const [karteMap, setKarteMap] = useState(null);        // pref|area -> hsa圏コード (null=未取得/未抽出)

  // 全国医療圏(県集計コロプレス用)を一度だけ取得
  useEffect(() => {
    fetch('/api/medical-areas').then(r => r.json()).then(d => setAllAreas(d.data || [])).catch(() => {});
  }, []);

  // 医療圏カルテ(hsa)の圏コード対応表を一度だけ取得(未抽出なら空)
  useEffect(() => {
    fetch('/api/hsa/manifest').then(r => r.json()).then(d => {
      if (!d.ready) { setKarteMap({}); return; }
      const m = {};
      for (const a of (d.areas || [])) m[a.pref + '|' + a.area] = a.code;
      setKarteMap(m);
    }).catch(() => setKarteMap({}));
  }, []);

  // 選択県の救急告示・在宅療養支援(圏別)を取得
  useEffect(() => {
    if (!areaPref) return;
    fetch('/api/area-emergency-homecare?pref=' + encodeURIComponent(areaPref))
      .then(r => r.json()).then(d => {
        setEmerg(d.data || []);
        setEmergMeta({ note: d.countMismatchNote, source: d.source, rowCount: d.rowCount, areaCount: d.medicalAreaCount });
      }).catch(() => { setEmerg([]); setEmergMeta(null); });
  }, [areaPref]);

  // 県別集計(実数の単純合計 / 圏数はカウント)
  const valueByPref = useMemo(() => {
    const acc = {};
    for (const a of allAreas) {
      if (!acc[a.pref]) acc[a.pref] = { hosp: 0, beds: 0, count: 0 };
      acc[a.pref].hosp += a.hosp || 0;
      acc[a.pref].beds += a.beds || 0;
      acc[a.pref].count += 1;
    }
    const out = {};
    for (const k in acc) out[k] = acc[k][metric];
    return out;
  }, [allAreas, metric]);

  // 圏名 -> 救急/在宅レコード(pref+圏名でjoin)
  const emergByArea = useMemo(() => {
    const m = {};
    for (const r of emerg) m[r.area] = r;
    return m;
  }, [emerg]);

  const mBadge = getSourceBadge('medicalAreas');
  const mInfo = METRICS.find(m => m.key === metric);

  return <>
  <div style={{marginBottom:24,display:'flex',flexDirection:mob?'column':'row',justifyContent:'space-between',alignItems:mob?'flex-start':'flex-end',gap:12}}>
    <div>
      <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Medical Area Analysis</div>
      <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>3階層 医療圏分析</h1>
      <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>全国339二次医療圏の医療体制を都道府県別に比較・圏カルテへドリルダウン。</p>
    </div>
    <select value={areaPref} onChange={e=>setAreaPref(e.target.value)} style={{padding:'8px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff',cursor:'pointer',minWidth:140}}>
      {sortPrefs(areaPrefList).map(p=><option key={p} value={p}>{p}</option>)}
    </select>
  </div>

  {/* ═══ 県コロプレス(指標セレクタ・県click=切替) ═══ */}
  {japanMap && (
    <div style={{marginBottom:20}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
        <span style={{fontSize:11,color:'#94a3b8',fontWeight:600}}>指標</span>
        {METRICS.map(m=>(
          <button key={m.key} onClick={()=>setMetric(m.key)} style={{padding:'6px 13px',borderRadius:8,border:'1px solid '+(metric===m.key?'#2563EB':'#e2e8f0'),background:metric===m.key?'#eff6ff':'#fff',color:metric===m.key?'#2563EB':'#64748b',fontSize:12.5,fontWeight:600,cursor:'pointer'}}>{m.label}</button>
        ))}
      </div>
      <PrefChoropleth
        japanMap={japanMap}
        valueByPref={valueByPref}
        selected={areaPref}
        onSelect={setAreaPref}
        title={'都道府県別 ' + (mInfo?.label || '')}
        unit={mInfo?.unit || ''}
        yearBadge={{ label: mBadge.label + ' ' + mBadge.year, color: mBadge.color }}
        mob={mob}
      />
      <div style={{fontSize:11,color:'#94a3b8',marginTop:6}}>
        県内二次医療圏の単純合計（実数）。地図をクリックすると対象県を切り替えます。
        <span style={{color:'#b45309'}}>圏別の人口分母が本データ群に無いため、人口当たり換算（10万対）は行っていません。</span>
      </div>
    </div>
  )}

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
        {[
          {h:'二次医療圏',a:'left'},
          {h:'病院数',a:'right'},
          {h:'病棟数',a:'right'},
          {h:'病床数',a:'right'},
          {h:'救急告示',a:'right'},
          {h:'在宅療養支援',a:'right'},
          {h:'カルテ',a:'center'},
        ].map((c,i)=>(
          <th key={i} style={{padding:'10px 14px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:c.a,borderBottom:'1px solid #f1f5f9',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{c.h}</th>))}
      </tr>
      <tr style={{background:'#fafbfc'}}>
        <th colSpan={4} style={{padding:'0 14px 8px',fontSize:9.5,fontWeight:500,color:'#cbd5e1',textAlign:'left'}}>病床機能報告 R6</th>
        <th colSpan={2} style={{padding:'0 14px 8px',fontSize:9.5,fontWeight:500,color:'#cbd5e1',textAlign:'right'}}>医療需給総覧（圏別）</th>
        <th style={{padding:'0 14px 8px'}}/>
      </tr></thead>
      <tbody>{[...areaData].sort((a,b)=>(b.hosp||0)-(a.hosp||0)).map((a,i)=>{
        const e = emergByArea[a.area];
        const code = karteMap ? karteMap[areaPref + '|' + a.area] : undefined;
        return (
        <tr key={i} style={{borderBottom:'1px solid #f8f9fa'}} onMouseEnter={e=>e.currentTarget.style.background='#f8faff'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <td style={{padding:'10px 14px',fontWeight:500}}>{a.area}</td>
          <td style={{padding:'10px 14px',textAlign:'right',fontWeight:600,color:'#2563EB'}}>{a.hosp}</td>
          <td style={{padding:'10px 14px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{a.wards}</td>
          <td style={{padding:'10px 14px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(a.beds)}</td>
          <td style={{padding:'10px 14px',textAlign:'right',fontVariantNumeric:'tabular-nums',color:e?'#0f172a':'#cbd5e1'}}>{e?fmt(e.emerg):'—'}</td>
          <td style={{padding:'10px 14px',textAlign:'right',fontVariantNumeric:'tabular-nums',color:e?'#0f172a':'#cbd5e1'}}>{e?fmt(e.homecare):'—'}</td>
          <td style={{padding:'8px 14px',textAlign:'center',whiteSpace:'nowrap'}}>
            {code ? (
              <button onClick={()=>onOpenKarte&&onOpenKarte(code)} style={{padding:'5px 11px',borderRadius:7,border:'1px solid #bfdbfe',background:'#eff6ff',color:'#2563EB',fontSize:12,fontWeight:600,cursor:'pointer'}}
                onMouseEnter={ev=>{ev.currentTarget.style.background='#dbeafe';}} onMouseLeave={ev=>{ev.currentTarget.style.background='#eff6ff';}}>
                カルテを開く→
              </button>
            ) : (
              <span style={{fontSize:11,color:'#cbd5e1'}}>{karteMap===null?'…':'—'}</span>
            )}
          </td>
        </tr>);
      })}</tbody>
    </table>
    <div style={{padding:'12px 16px',fontSize:11,color:'#94a3b8',borderTop:'1px solid #f1f5f9',lineHeight:1.7}}>
      出典: 厚労省 病床機能報告（令和6年度）2025/9/30公表 ・ 全国330二次医療圏対応 ｜ 救急告示・在宅療養支援列: 医療需給総覧（圏別集計）<br/>
      <span style={{color:'#b45309'}}>※過年度データとは集計処理が異なるため、現時点では時系列比較ではなく現況把握用として表示しています。</span><br/>
      <span>※圏レベルは実数表示のみ。圏別人口分母が本データ群に無いため、人口当たり換算（10万対）は県単位のみで、圏別10万対は算出しません。</span><br/>
      <span>※病床機能報告の医療圏マスタ（330圏）と救急/在宅データ（{emergMeta?.rowCount || 339}行）は圏定義が異なるため、都道府県＋圏名で突合し、対応が無い圏は「—」表示です。</span>
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
