'use client';
import { useState, useEffect } from 'react';
import { fmt, sortPrefs } from '../shared';

const CAT_LABELS = {'A_初再診料':'外来受診','B_医学管理等':'医学管理','C_在宅医療':'在宅医療','D_検査':'検査','E_画像診断':'画像診断','K_手術':'手術'};
const RISK_META = {
  'ヘモグロビン': {unit:'g/dL', note:'低値=貧血リスク', icon:'🩸'},
  '血清クレアチニン': {unit:'mg/dL', note:'高値=腎機能低下', icon:'🫘'},
  'eGFR': {unit:'mL/min', note:'60未満でCKD疑い', icon:'💧'},
};
// 薬効分類→疾患領域マッピング
const DRUG_DOMAIN = {
  '糖尿病用剤':'糖尿病・代謝','高脂血症用剤':'循環器','血圧降下剤':'循環器','不整脈用剤':'循環器',
  '強心剤':'循環器','血管拡張剤':'循環器','利尿剤':'循環器',
  '気管支拡張剤':'呼吸器','鎮咳去たん剤':'呼吸器',
  '催眠鎮静剤，抗不安剤':'精神・神経','抗てんかん剤':'精神・神経','抗うつ剤':'精神・神経',
  '抗パーキンソン剤':'精神・神経','精神神経用剤':'精神・神経',
  '解熱鎮痛消炎剤':'整形・疼痛','副腎皮質ホルモン剤':'免疫・内分泌',
  '消化性潰瘍用剤':'消化器','制酸剤':'消化器','止しゃ剤，整腸剤':'消化器','下剤，浣腸剤':'消化器',
  '肝臓疾患用剤':'消化器','健胃消化剤':'消化器',
  '代謝拮抗剤':'がん','抗腫瘍性植物成分製剤':'がん','その他の腫瘍用薬':'がん',
  '抗ヒスタミン剤':'アレルギー','合成抗菌剤':'感染症','抗ウイルス剤':'感染症',
  '甲状腺，副甲状腺ホルモン剤':'内分泌','副腎ホルモン剤':'内分泌',
  '痛風治療剤':'代謝','腎臓ホルモン剤':'腎疾患',
};
const DOMAIN_COLORS = {'循環器':'#dc2626','糖尿病・代謝':'#f59e0b','呼吸器':'#06b6d4','精神・神経':'#8b5cf6','整形・疼痛':'#059669','消化器':'#64748b','がん':'#be123c','免疫・内分泌':'#0891b2','アレルギー':'#f472b6','感染症':'#fb923c','内分泌':'#14b8a6','代謝':'#a3a3a3','腎疾患':'#6366f1'};

export default function NdbView({ mob, ndbDiag, ndbRx, ndbHc, ndbPref, setNdbPref, setNdbRx, vitalStats, areaDemoData, ndbQ }) {
  const diagByPref = ndbDiag.filter(d=>d.prefecture===ndbPref);
  const hcPref = ndbHc.filter(d=>d.pref===ndbPref);
  const vp = vitalStats?.prefectures?.find(p=>p.pref===ndbPref);
  const causes = vp?.causes || [];

  // Population for per-capita
  const prefPop = (()=>{
    if (!areaDemoData) return 0;
    let pop = 0;
    areaDemoData.filter(a=>a.pref===ndbPref).forEach(a=>(a.munis||[]).forEach(m=>pop+=m.pop||0));
    return pop;
  })();
  const perCap = (v) => prefPop > 0 ? (v / prefPop * 100000).toFixed(0) : '—';

  // Drug domain aggregation
  const rxDomains = {};
  ndbRx.forEach(r => {
    const domain = DRUG_DOMAIN[r.name] || 'その他';
    if (!rxDomains[domain]) rxDomains[domain] = 0;
    rxDomains[domain] += r.qty;
  });
  const sortedDomains = Object.entries(rxDomains).filter(([k])=>k!=='その他').sort((a,b)=>b[1]-a[1]);
  const maxDomainQty = sortedDomains[0]?.[1] || 1;

  return <>

  {/* Header */}
  <div style={{marginBottom:20}}>
    <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Healthcare Atlas</div>
    <h1 style={{fontSize:mob?20:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>都道府県 医療プロファイル</h1>
    <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>NDB・人口動態統計・特定健診を統合し、地域の「根因→リスク→治療→結果」を俯瞰。</p>
  </div>
  <div style={{display:'flex',gap:8,marginBottom:20,alignItems:'center'}}>
    <select value={ndbPref} onChange={e=>{setNdbPref(e.target.value);fetch('/api/ndb/prescriptions?prefecture='+encodeURIComponent(e.target.value)).then(r=>r.json()).then(d=>setNdbRx(d));}} style={{padding:'10px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:14,background:'#fff',fontWeight:600}}>
      {sortPrefs([...new Set(ndbDiag.map(d=>d.prefecture))]).map(p=><option key={p} value={p}>{p}</option>)}
    </select>
    {prefPop > 0 && <span style={{fontSize:12,color:'#94a3b8'}}>人口 {fmt(prefPop)}人</span>}
  </div>

  {/* ═══ Layer 1: ROOT CAUSE (生活習慣リスク) ═══ */}
  {ndbQ && ndbQ.prefectures?.[ndbPref] && (()=>{
    const qd = ndbQ.prefectures[ndbPref];
    const qs = ndbQ.questions || {};
    const RISK_ICONS = {smoking:'🚬', weight_gain:'⚖️', exercise:'🏃', walking:'🚶', late_dinner:'🌙'};
    const RISK_COLORS = {smoking:'#dc2626', weight_gain:'#f59e0b', exercise:'#2563eb', walking:'#059669', late_dinner:'#8b5cf6'};
    // Compute national averages
    const allPrefs = Object.values(ndbQ.prefectures);
    const natAvg = {};
    for (const key of Object.keys(qd)) {
      const vals = allPrefs.map(p=>p[key]).filter(v=>v!=null);
      natAvg[key] = vals.length > 0 ? vals.reduce((s,v)=>s+v,0)/vals.length : 0;
    }
    const items = Object.entries(qd).sort((a,b)=>b[1]-a[1]);
    return (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <span style={{fontSize:18}}>⚠️</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>生活習慣リスク</div>
          <div style={{fontSize:11,color:'#94a3b8'}}>特定健診 質問票（40〜74歳）— 全国平均との差をΔ表示</div>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {items.map(([key, rate]) => {
          const q = qs[key] || {};
          const delta = rate - (natAvg[key]||0);
          return <div key={key} style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:16,width:24}}>{RISK_ICONS[key]||'📋'}</span>
            <span style={{width:mob?70:90,fontSize:12,fontWeight:600,color:'#475569',flexShrink:0}}>{q.risk_label||key}</span>
            <div style={{flex:1,height:22,background:'#f1f5f9',borderRadius:4,overflow:'hidden',position:'relative'}}>
              <div style={{height:'100%',borderRadius:4,background:RISK_COLORS[key]||'#94a3b8',width:`${Math.min(rate,100)}%`,opacity:0.75}}/>
              <span style={{position:'absolute',right:6,top:3,fontSize:10,color:'#475569',fontWeight:600}}>{rate}%</span>
            </div>
            <span style={{fontSize:10,fontWeight:600,color:delta>0?'#dc2626':'#059669',width:60,textAlign:'right',flexShrink:0}}>{delta>0?'↑':'↓'}{Math.abs(delta).toFixed(1)}pt</span>
          </div>;
        })}
      </div>
      <div style={{fontSize:10,color:'#94a3b8',marginTop:10}}>※Δは全国平均との差。正の値=全国より高リスク。40-74歳特定健診受診者が対象。</div>
    </div>);
  })()}

  {/* ═══ Layer 2: RISK (健診リスク) ═══ */}
  {hcPref.length > 0 && <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <span style={{fontSize:18}}>🔬</span>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>健診リスク</div>
        <div style={{fontSize:11,color:'#94a3b8'}}>特定健診 検査値平均（40〜74歳受診者）</div>
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(3,1fr)',gap:12}}>
      {hcPref.map((h,i)=>{
        const meta = RISK_META[h.metric] || {};
        return <div key={i} style={{background:'#f8fafc',borderRadius:10,padding:'14px 16px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
            <span style={{fontSize:13,fontWeight:600}}>{meta.icon||''} {h.metric}</span>
            <span style={{fontSize:10,color:'#94a3b8',background:'#fff',padding:'2px 6px',borderRadius:4}}>{meta.unit||''}</span>
          </div>
          <div style={{display:'flex',gap:20}}>
            <div><div style={{fontSize:10,color:'#3b82f6'}}>男性</div><div style={{fontSize:22,fontWeight:700,color:'#2563EB'}}>{h.male}</div></div>
            <div><div style={{fontSize:10,color:'#dc2626'}}>女性</div><div style={{fontSize:22,fontWeight:700,color:'#dc2626'}}>{h.female}</div></div>
          </div>
          <div style={{fontSize:10,color:'#94a3b8',marginTop:6}}>{meta.note||''}</div>
        </div>;
      })}
    </div>
  </div>}

  {/* ═══ Layer 3: DEMAND (医療利用) ═══ */}
  {diagByPref.length > 0 && <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <span style={{fontSize:18}}>🏥</span>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>医療利用</div>
        <div style={{fontSize:11,color:'#94a3b8'}}>医科診療行為 算定回数（令和5年度レセプト）</div>
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(3,1fr)',gap:10}}>
      {diagByPref.sort((a,b)=>b.total_claims-a.total_claims).map((d,i)=>(
        <div key={i} style={{background:'#f0f7ff',borderRadius:10,padding:'12px 16px'}}>
          <div style={{fontSize:11,color:'#64748b',marginBottom:2}}>{CAT_LABELS[d.category]||d.category}</div>
          <div style={{fontSize:mob?16:20,fontWeight:700,color:'#2563EB'}}>{fmt(d.total_claims)}</div>
          <div style={{fontSize:10,color:'#94a3b8'}}>人口10万対 {perCap(d.total_claims)}</div>
        </div>
      ))}
    </div>
  </div>}

  {/* ═══ Layer 4: TREATMENT (治療パターン — 疾患領域別) ═══ */}
  {sortedDomains.length > 0 && <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <span style={{fontSize:18}}>💊</span>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>治療パターン — 疾患領域別</div>
        <div style={{fontSize:11,color:'#94a3b8'}}>処方薬を疾患領域にマッピング（薬効分類ベース）</div>
      </div>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {sortedDomains.slice(0,8).map(([domain, qty], i) => (
        <div key={i} style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{width:mob?80:100,fontSize:12,fontWeight:600,color:DOMAIN_COLORS[domain]||'#64748b',flexShrink:0}}>{domain}</span>
          <div style={{flex:1,height:20,background:'#f1f5f9',borderRadius:4,overflow:'hidden'}}>
            <div style={{height:'100%',borderRadius:4,background:DOMAIN_COLORS[domain]||'#94a3b8',width:`${qty/maxDomainQty*100}%`,opacity:0.8}}/>
          </div>
          <span style={{fontSize:11,color:'#64748b',fontVariantNumeric:'tabular-nums',width:80,textAlign:'right',flexShrink:0}}>{fmt(qty)}</span>
        </div>
      ))}
    </div>
    <div style={{fontSize:10,color:'#94a3b8',marginTop:10}}>※処方数量の単位は薬剤ごとに異なります。疾患領域は薬効分類からの推定です。</div>
  </div>}

  {/* ═══ Layer 4b: 処方薬 個別Top10 ═══ */}
  {ndbRx.length > 0 && <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <span style={{fontSize:18}}>📋</span>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>処方薬 薬効分類別 Top10</div>
        <div style={{fontSize:11,color:'#94a3b8'}}>NDB第10回（令和5年度）処方数量上位</div>
      </div>
    </div>
    <div style={{overflowX:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
        <thead><tr style={{background:'#fafbfc'}}>
          {['#','薬効分類','疾患領域','処方数量'].map((h,i)=>(
            <th key={i} style={{padding:'8px 10px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:i>=3?'right':'left',borderBottom:'1px solid #f1f5f9'}}>{h}</th>))}
        </tr></thead>
        <tbody>{ndbRx.sort((a,b)=>b.qty-a.qty).slice(0,10).map((r,i)=>{
          const domain = DRUG_DOMAIN[r.name]||'';
          return <tr key={i} style={{borderBottom:'1px solid #f8f9fa'}}>
            <td style={{padding:'7px 10px',color:'#94a3b8',fontSize:11}}>{i+1}</td>
            <td style={{padding:'7px 10px',fontWeight:500}}>{r.name}</td>
            <td style={{padding:'7px 10px'}}>{domain && <span style={{fontSize:10,padding:'2px 8px',borderRadius:10,background:(DOMAIN_COLORS[domain]||'#94a3b8')+'18',color:DOMAIN_COLORS[domain]||'#94a3b8',fontWeight:600}}>{domain}</span>}</td>
            <td style={{padding:'7px 10px',textAlign:'right',fontWeight:600,color:'#2563EB',fontVariantNumeric:'tabular-nums'}}>{fmt(r.qty)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>}

  {/* ═══ Layer 5: OUTCOME (結果 — 死因構造) ═══ */}
  {causes.length > 0 && <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <span style={{fontSize:18}}>📊</span>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>死因構造</div>
        <div style={{fontSize:11,color:'#94a3b8'}}>厚労省人口動態統計 2024年確定数（死亡率 人口10万対）</div>
      </div>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:4}}>
      {causes.map((c,i)=>{
        const maxRate = causes[0]?.rate || 1;
        return <div key={i} style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{width:mob?90:120,fontSize:12,fontWeight:500,color:'#475569',flexShrink:0}}>{c.cause.replace(/\(.+\)/,'')}</span>
          <div style={{flex:1,height:16,background:'#f1f5f9',borderRadius:3,overflow:'hidden'}}>
            <div style={{height:'100%',borderRadius:3,background:i<3?'#7c3aed':'#a78bfa',width:`${c.rate/maxRate*100}%`,opacity:0.85}}/>
          </div>
          <span style={{fontSize:12,fontWeight:600,color:'#7c3aed',fontVariantNumeric:'tabular-nums',width:60,textAlign:'right',flexShrink:0}}>{c.rate}</span>
        </div>;
      })}
    </div>
  </div>}

  {/* ═══ GAP FINDER: リスク×結果の不一致検出 ═══ */}
  {ndbQ && vitalStats?.prefectures && (()=>{
    const allQ = ndbQ.prefectures || {};
    const allV = vitalStats.prefectures || [];
    // Build scatter data: smoking(x) vs cancer death(y)
    const dots = allV.map(vp => {
      const q = allQ[vp.pref];
      if (!q) return null;
      const smoking = q.smoking || 0;
      const cancer = vp.causes?.find(c=>c.cause.includes('がん'))?.rate || 0;
      return { pref: vp.pref, x: smoking, y: cancer };
    }).filter(Boolean);
    if (dots.length < 10) return null;

    const xMin = Math.min(...dots.map(d=>d.x));
    const xMax = Math.max(...dots.map(d=>d.x));
    const yMin = Math.min(...dots.map(d=>d.y));
    const yMax = Math.max(...dots.map(d=>d.y));
    const xAvg = dots.reduce((s,d)=>s+d.x,0)/dots.length;
    const yAvg = dots.reduce((s,d)=>s+d.y,0)/dots.length;
    const W = mob ? 320 : 460;
    const H = 280;
    const pad = {t:20,r:20,b:35,l:50};
    const cw = W-pad.l-pad.r;
    const ch = H-pad.t-pad.b;
    const sx = v => pad.l + (v-xMin)/(xMax-xMin)*cw;
    const sy = v => pad.t + (1-(v-yMin)/(yMax-yMin))*ch;
    const sel = dots.find(d=>d.pref===ndbPref);

    return (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <span style={{fontSize:18}}>🔍</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>Gap Finder — リスク×結果の不一致検出</div>
          <div style={{fontSize:11,color:'#94a3b8'}}>喫煙率（横軸）× がん死亡率（縦軸）の相関。右下=高リスク低死亡、左上=低リスク高死亡</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',maxWidth:W}}>
        {/* Quadrant backgrounds */}
        <rect x={sx(xAvg)} y={pad.t} width={cw-(sx(xAvg)-pad.l)} height={sy(yAvg)-pad.t} fill="#fef2f2" opacity={0.3} rx={4}/>
        <rect x={pad.l} y={sy(yAvg)} width={sx(xAvg)-pad.l} height={ch-(sy(yAvg)-pad.t)} fill="#f0fdf4" opacity={0.3} rx={4}/>
        {/* Average lines */}
        <line x1={sx(xAvg)} y1={pad.t} x2={sx(xAvg)} y2={H-pad.b} stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="4,3"/>
        <line x1={pad.l} y1={sy(yAvg)} x2={W-pad.r} y2={sy(yAvg)} stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="4,3"/>
        {/* Dots */}
        {dots.map(d => {
          const isSel = d.pref === ndbPref;
          return <circle key={d.pref} cx={sx(d.x)} cy={sy(d.y)} r={isSel?7:4}
            fill={d.x>xAvg&&d.y>yAvg?'#dc2626':d.x<xAvg&&d.y<yAvg?'#059669':'#94a3b8'}
            opacity={isSel?1:0.6} stroke={isSel?'#1e293b':'none'} strokeWidth={isSel?2:0}/>;
        })}
        {/* Selected label */}
        {sel && <text x={sx(sel.x)+10} y={sy(sel.y)-4} fontSize={11} fontWeight={700} fill="#1e293b">{ndbPref}</text>}
        {/* Axis labels */}
        <text x={W/2} y={H-4} textAnchor="middle" fontSize={10} fill="#64748b">喫煙率 (%)</text>
        <text x={12} y={H/2} textAnchor="middle" fontSize={10} fill="#64748b" transform={`rotate(-90,12,${H/2})`}>がん死亡率</text>
        {/* Quadrant labels */}
        <text x={W-pad.r-4} y={pad.t+12} textAnchor="end" fontSize={8} fill="#dc2626">高リスク×高死亡</text>
        <text x={pad.l+4} y={H-pad.b-4} fontSize={8} fill="#059669">低リスク×低死亡</text>
      </svg>
      <div style={{display:'flex',gap:12,fontSize:11,color:'#64748b',marginTop:8,flexWrap:'wrap'}}>
        <span><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#dc2626',marginRight:3}}/>高リスク高死亡</span>
        <span><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#059669',marginRight:3}}/>低リスク低死亡</span>
        <span><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#94a3b8',marginRight:3}}/>中間</span>
        <span style={{color:'#94a3b8'}}>点線=全国平均</span>
      </div>
    </div>);
  })()}
  <div style={{padding:'10px 0',fontSize:11,color:'#94a3b8',marginTop:8,lineHeight:1.8}}>
    出典: 厚生労働省 第10回NDBオープンデータ（令和5年度レセプト・令和4年度特定健診）<br/>
    厚労省 人口動態統計 2024年確定数 / 住民基本台帳 2025年1月1日<br/>
    ※処方薬の疾患領域マッピングは薬効分類に基づく推定であり、実際の処方目的とは異なる場合があります
  </div>
  </>;
}
