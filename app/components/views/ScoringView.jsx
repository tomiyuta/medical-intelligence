'use client';
import { useState } from 'react';
import { fmt, sortPrefs, TC, downloadCSV } from '../shared';
import { generateScoringPDF } from '../pdfExport';

const FUNC_COLORS = {
  '高度急性期': '#dc2626',
  '急性期': '#f59e0b',
  '回復期': '#059669',
  '慢性期': '#2563eb',
  '休棟(再開)': '#94a3b8',
  '休棟(廃止)': '#cbd5e1',
};
const ACTIVE_FUNCS = ['高度急性期', '急性期', '回復期', '慢性期'];

const DISEASE_FILTERS = [
  { id: 'all', label: '全施設', caps: [] },
  { id: 'cancer', label: 'がん関連', caps: ['oncology'], color: '#7c3aed' },
  { id: 'heart', label: '循環器', caps: ['acute', 'surgery'], color: '#dc2626' },
  { id: 'stroke', label: '脳血管', caps: ['acute', 'rehab'], color: '#2563eb' },
];

export default function ScoringView({ mob, tiers, topFac, facSearch, setFacSearch, searchResults, doSearch, bedFunc, scoringPref, setScoringPref }) {
  const [diseaseFilter, setDiseaseFilter] = useState('all');
  const activeFilter = DISEASE_FILTERS.find(f => f.id === diseaseFilter);

  const isNational = !scoringPref || scoringPref === '全国';

  // 高機能施設絞り込み (都道府県 + 疾病フィルタ)
  let filteredFac = topFac;
  if (!isNational) filteredFac = filteredFac.filter(f => f.prefecture_name === scoringPref);
  if (diseaseFilter !== 'all') {
    filteredFac = filteredFac.filter(f => {
      if (!f.cap) return false;
      return activeFilter.caps.every(c => (f.cap[c] || 0) > 0);
    });
  }

  // Layer A: 機能区分構成
  const bf = bedFunc?.prefectures?.[scoringPref];
  const bfNat = bedFunc?.national;
  const computeShares = (d) => {
    if (!d) return null;
    const total = d['総床数'] || 0;
    if (total === 0) return null;
    return ACTIVE_FUNCS.reduce((acc, f) => { acc[f] = (d[f]?.beds || 0) / total * 100; return acc; }, {});
  };
  const prefShares = isNational ? null : computeShares(bf);
  const natShares = computeShares(bfNat);

  // Pref dropdown list (from bedFunc keys, fallback to topFac)
  const allPrefs = bedFunc?.prefectures
    ? sortPrefs(Object.keys(bedFunc.prefectures))
    : sortPrefs([...new Set(topFac.map(f => f.prefecture_name).filter(Boolean))]);

  return <>
  {/* Header */}
  <div style={{marginBottom:20}}>
    <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Hospital Function Profile</div>
    <h1 style={{fontSize:mob?20:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>病院機能プロファイル</h1>
    <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>機能配分（R6病床機能報告）・規模分布（Tier）・高機能施設実績の3レイヤーで医療提供体制を俯瞰</p>
  </div>

  {/* Pref selector */}
  <div style={{display:'flex',gap:8,marginBottom:20,alignItems:'center',flexWrap:'wrap'}}>
    <select value={scoringPref || '全国'} onChange={e => setScoringPref && setScoringPref(e.target.value === '全国' ? null : e.target.value)} style={{padding:'10px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:14,background:'#fff',fontWeight:600}}>
      <option value="全国">全国</option>
      {allPrefs.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
    {bf && <span style={{fontSize:12,color:'#94a3b8'}}>総床数 {fmt(bf['総床数'])} 床</span>}
    {isNational && bfNat && <span style={{fontSize:12,color:'#94a3b8'}}>全国総床数 {fmt(bfNat['総床数'])} 床</span>}
  </div>

  {/* ═══ Layer A: 機能区分構成 (R6 病床機能報告) ═══ */}
  {(prefShares || (isNational && natShares)) && (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <span style={{fontSize:18}}>🏥</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>
            機能区分構成 — {isNational ? '全国' : scoringPref}
            <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fef3c7',color:'#92400e',fontWeight:500}}>機能配分・現況</span>
          </div>
          <div style={{fontSize:11,color:'#94a3b8'}}>令和6年度病床機能報告（2024/7/1時点）— 各機能の床数シェア・全国基準との偏差</div>
        </div>
      </div>
      {/* Stacked bar */}
      {(() => {
        const target = prefShares || natShares;
        const showDelta = !isNational && natShares;
        return (
          <div>
            {/* 100% stacked bar */}
            <div style={{display:'flex',height:32,borderRadius:6,overflow:'hidden',marginBottom:10}}>
              {ACTIVE_FUNCS.map(f => (
                <div key={f} style={{width:`${target[f]}%`,background:FUNC_COLORS[f],display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:700}}>
                  {target[f] >= 6 ? `${target[f].toFixed(1)}%` : ''}
                </div>
              ))}
            </div>
            {/* 凡例 + Δ全国 */}
            <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(4,1fr)',gap:10}}>
              {ACTIVE_FUNCS.map(f => {
                const v = target[f];
                const delta = showDelta ? v - natShares[f] : null;
                const beds = (prefShares ? bf[f]?.beds : bfNat[f]?.beds) || 0;
                return (
                  <div key={f} style={{borderLeft:`4px solid ${FUNC_COLORS[f]}`,padding:'8px 10px',background:'#f8fafc',borderRadius:6}}>
                    <div style={{fontSize:10,color:'#64748b'}}>{f}</div>
                    <div style={{fontSize:mob?14:16,fontWeight:700,color:FUNC_COLORS[f]}}>{v.toFixed(1)}%</div>
                    <div style={{fontSize:10,color:'#94a3b8'}}>
                      {fmt(beds)} 床
                      {delta != null && <span style={{marginLeft:6,fontWeight:600,color:Math.abs(delta) > 1.5 ? (delta > 0 ? '#dc2626' : '#059669') : '#94a3b8'}}>
                        ({delta > 0 ? '+' : ''}{delta.toFixed(1)}pt)
                      </span>}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* 解釈ヒント */}
            {showDelta && (() => {
              const dHi = prefShares['高度急性期'] - natShares['高度急性期'];
              const dCh = prefShares['慢性期'] - natShares['慢性期'];
              let msg = null;
              if (dHi > 2) msg = `${scoringPref}は高度急性期シェアが全国平均より${dHi.toFixed(1)}pt高く、大都市型の高機能集中傾向。`;
              else if (dCh > 5) msg = `${scoringPref}は慢性期シェアが全国平均より${dCh.toFixed(1)}pt高く、高齢化・長期療養需要の大きい構造。`;
              else if (prefShares['急性期'] > 50) msg = `${scoringPref}は急性期偏重（${prefShares['急性期'].toFixed(1)}%）— 回復期不足の地域医療構想課題地域の可能性。`;
              return msg ? (
                <div style={{fontSize:11,color:'#475569',marginTop:10,padding:'8px 12px',background:'#f8fafc',borderRadius:6,lineHeight:1.5,borderLeft:'3px solid #f59e0b'}}>💡 {msg}</div>
              ) : null;
            })()}
          </div>
        );
      })()}
      <div style={{fontSize:10,color:'#94a3b8',marginTop:10,lineHeight:1.5}}>
        ※機能区分は施設の自己申告（保有する病棟と機能区分の選択状況, 2024/7/1時点）。地域医療構想の評価指標として使用。
      </div>
    </div>
  )}

  {/* ═══ Layer B: 規模分布 (Tier集計, 全国) ═══ */}
  <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <span style={{fontSize:18}}>📊</span>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>
          規模分布 — Tier集計（全国）
          <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#dbeafe',color:'#1e40af',fontWeight:500}}>規模スコア</span>
        </div>
        <div style={{fontSize:11,color:'#94a3b8'}}>規模・DPC実績・症例数で総合評価された病院の階層分布（全国 2,802施設）</div>
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(5,1fr)',gap:10}}>
      {tiers.map(t => (
        <div key={t.tier} style={{background:'#fff',borderRadius:10,padding:'14px 16px',border:'1px solid #f1f5f9',borderLeft:`4px solid ${TC[t.tier]||'#ccc'}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
            <span style={{fontSize:18,fontWeight:800,color:TC[t.tier]}}>Tier {t.tier}</span>
            <span style={{fontSize:10,color:'#94a3b8'}}>avg {t.avg_score}pt</span>
          </div>
          <div style={{fontSize:mob?18:22,fontWeight:700}}>{fmt(t.count)}</div>
          <div style={{fontSize:10,color:'#94a3b8'}}>施設</div>
        </div>
      ))}
    </div>
  </div>

  {/* ═══ Layer C: 高機能施設一覧 (Tier S) ═══ */}
  <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <span style={{fontSize:18}}>⭐</span>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>
          高機能施設一覧 — Tier S {!isNational && `(${scoringPref}内)`}
          <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fce7f3',color:'#9f1239',fontWeight:500}}>施設実績</span>
        </div>
        <div style={{fontSize:11,color:'#94a3b8'}}>厚労省DPC/G-MIS・規模/症例実績で評価した上位施設 — 9因子総合スコア</div>
      </div>
    </div>
    {/* 疾病フィルタ */}
    <div style={{display:'flex',gap:4,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
      <span style={{fontSize:11,color:'#94a3b8',marginRight:4}}>疾病フィルタ:</span>
      {DISEASE_FILTERS.map(df => (
        <button key={df.id} onClick={() => setDiseaseFilter(df.id)} style={{
          padding:'4px 12px',borderRadius:16,
          border:diseaseFilter===df.id?`2px solid ${df.color||'#2563eb'}`:'1px solid #e2e8f0',
          background:diseaseFilter===df.id?`${df.color||'#2563eb'}10`:'#fff',
          color:diseaseFilter===df.id?(df.color||'#2563eb'):'#94a3b8',
          fontSize:11,fontWeight:diseaseFilter===df.id?600:400,cursor:'pointer',
        }}>{df.label}</button>
      ))}
      <span style={{fontSize:11,color:'#64748b',marginLeft:8}}>{filteredFac.length} 施設</span>
    </div>
    {/* 検索 + Export */}
    <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
      <input value={facSearch} onChange={e=>setFacSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doSearch()} placeholder="病院名で検索（例: 東大, 慶應, 藤田）" style={{flex:1,minWidth:200,padding:'8px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,outline:'none'}}/>
      <button onClick={doSearch} style={{padding:'8px 18px',borderRadius:8,border:'none',background:'#2563EB',color:'#fff',fontWeight:600,cursor:'pointer',fontSize:13}}>検索</button>
      <button onClick={() => {
        const header = ['Rank','Score','Tier','施設名','都道府県','住所','病床数','年間症例数','平均在院日数','Confidence','特徴','不足情報','出典','取得日'];
        const data = filteredFac.map(f => {
          const reasons = [];
          if (f.total_beds >= 1000) reasons.push('1000床超大規模');
          else if (f.total_beds >= 500) reasons.push('500床超中規模');
          if (f.annual_cases >= 20000) reasons.push('症例2万超');
          else if (f.annual_cases >= 10000) reasons.push('症例1万超');
          if (f.is_dpc_participant) reasons.push('DPC参加病院');
          if (f.case_growth_pct > 0) reasons.push(`症例増加+${f.case_growth_pct}%`);
          if (f.avg_los && f.avg_los < 12) reasons.push('短期在院(効率的)');
          const missing = [];
          if (!f.annual_cases) missing.push('症例数非開示');
          if (!f.is_dpc_participant) missing.push('DPC実績なし');
          if (!f.avg_los) missing.push('在院日数不明');
          if (!f.address) missing.push('住所不明');
          const coverage = [f.total_beds, f.annual_cases, f.avg_los, f.is_dpc_participant, f.case_growth_pct].filter(v => v != null && v !== 0).length;
          const conf = coverage >= 4 ? 'High' : coverage >= 2 ? 'Medium' : 'Low';
          return [f.rank, f.priority_score, f.tier, f.facility_name, f.prefecture_name, f.address || '', f.total_beds || '', f.annual_cases || '', f.avg_los || '', conf, reasons.join(' / ') || '—', missing.join(' / ') || 'なし', '厚労省DPC/G-MIS', '2026-04'];
        });
        downloadCSV([header, ...data], `medintel_scoring_${(scoringPref || 'national')}_${new Date().toISOString().slice(0, 10)}.csv`);
      }} style={{padding:'8px 14px',borderRadius:8,border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>📥 CSV</button>
      <button onClick={() => generateScoringPDF(filteredFac, { title: `Hospital Function Profile — Tier S${isNational ? '' : ` (${scoringPref})`}` })} style={{padding:'8px 14px',borderRadius:8,border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>📄 PDF</button>
    </div>
    {/* 検索結果 */}
    {searchResults && (
      <div style={{background:'#f8fafc',borderRadius:8,padding:'12px 16px',marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:600,marginBottom:8}}>検索結果: {searchResults.total}件</div>
        {searchResults.data?.map((f, i) => (
          <div key={i} style={{padding:'6px 0',borderBottom:'1px solid #e2e8f0',fontSize:12,display:'flex',gap:10,alignItems:'center'}}>
            <span style={{padding:'1px 8px',borderRadius:12,fontSize:10,fontWeight:700,background:(TC[f.tier]||'#ccc')+'18',color:TC[f.tier]}}>{f.priority_score}</span>
            <span style={{fontWeight:500,flex:1}}>{f.facility_name}</span>
            <span style={{color:'#94a3b8'}}>{f.prefecture_name}</span>
            <span style={{color:'#64748b'}}>{fmt(f.total_beds)} 床</span>
          </div>
        ))}
      </div>
    )}
    {/* テーブル */}
    {filteredFac.length === 0 ? (
      <div style={{padding:'24px',textAlign:'center',color:'#94a3b8',fontSize:13,background:'#f8fafc',borderRadius:8}}>
        {isNational ? '該当施設なし' : `${scoringPref}にはTier S施設が登録されていません（全国上位25のキャッシュから抽出）`}
      </div>
    ) : (
      <div style={{overflow:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{background:'#fafbfc'}}>
            {(mob ? ['#','Score','施設名'] : ['#','Score','施設名','都道府県','病床','症例','信頼度','特徴']).map((h, i) => (
              <th key={i} style={{padding:'10px 12px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:i<3?'left':'right',borderBottom:'1px solid #f1f5f9'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{filteredFac.map((f, i) => {
            const confColor = f.confidence === 'High' ? '#059669' : f.confidence === 'Medium' ? '#f59e0b' : '#94a3b8';
            return (
              <tr key={i} style={{borderBottom:'1px solid #f8f9fa'}} onMouseEnter={e => e.currentTarget.style.background='#f8faff'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <td style={{padding:'10px 12px',color:'#94a3b8'}}>#{f.rank}</td>
                <td style={{padding:'10px 12px'}}><span style={{padding:'2px 10px',borderRadius:20,fontSize:12,fontWeight:700,background:(TC[f.tier]||'#ccc')+'18',color:TC[f.tier]}}>{f.priority_score}</span></td>
                <td style={{padding:'10px 12px',fontWeight:500,color:'#1e293b'}}>
                  {f.facility_name}
                  {f.missing && f.missing.length > 0 && <span style={{fontSize:10,color:'#f59e0b',marginLeft:4}} title={f.missing.join(', ')}>⚠</span>}
                </td>
                {!mob && <td style={{padding:'10px 12px',textAlign:'right',color:'#64748b'}}>{f.prefecture_name}</td>}
                {!mob && <td style={{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{fmt(f.total_beds)}</td>}
                {!mob && <td style={{padding:'10px 12px',textAlign:'right',color:'#2563EB',fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{fmt(f.annual_cases)}</td>}
                {!mob && <td style={{padding:'10px 12px',textAlign:'right'}}><span style={{fontSize:11,fontWeight:600,color:confColor}}>{f.confidence || '—'}</span></td>}
                {!mob && <td style={{padding:'10px 12px',fontSize:11,color:'#64748b',maxWidth:180}}>{(f.reasons || []).join(' / ') || '—'}</td>}
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    )}
    <div style={{fontSize:10,color:'#94a3b8',marginTop:10,lineHeight:1.5}}>
      ※スコアは規模・症例数・DPC参加・成長率・在院日数の総合評価。全国上位25施設のキャッシュを表示。{!isNational && '都道府県を絞ると該当0件のことがあります（小規模県は他Tierで確認）'}
    </div>
  </div>
  </>;
}
