'use client';
import { fmt, sortPrefs } from '../shared';

const FUNC_COLORS = {
  '高度急性期': '#dc2626',
  '急性期': '#f59e0b',
  '回復期': '#059669',
  '慢性期': '#2563eb',
};
const ACTIVE_FUNCS = ['高度急性期', '急性期', '回復期', '慢性期'];

// 地域類型 (5-pattern, 優先順位順に評価)
function classifyRegion(prefShares, natShares, beds_per_75plus, nat_beds_per_75plus) {
  if (!prefShares) return null;
  const dHi = prefShares['高度急性期'] - natShares['高度急性期'];
  const dCh = prefShares['慢性期'] - natShares['慢性期'];
  const dRe = prefShares['回復期'] - natShares['回復期'];
  const acuteShare = prefShares['急性期'];
  const supplyRatio = (beds_per_75plus && nat_beds_per_75plus)
    ? beds_per_75plus / nat_beds_per_75plus
    : null;

  // 優先順位:供給薄型 > 大都市・高機能集中型 > 急性期偏重型 > 高齢化・慢性期型 > 回復期補完型 > 標準型
  if (supplyRatio != null && supplyRatio < 0.85) {
    return { type:'供給薄型の可能性', color:'#dc2626', desc:'75歳以上人口に対する病床数が全国平均の0.85倍未満。アクセス・在宅代替の確認が示唆される。', icon:'⚠️' };
  }
  if (dHi > 2) {
    return { type:'大都市・高機能集中型', color:'#7c3aed', desc:`高度急性期シェアが全国比 +${dHi.toFixed(1)}pt。大学病院・専門病院の集積する大都市型の傾向。`, icon:'🏙️' };
  }
  if (acuteShare > 50) {
    return { type:'急性期偏重型の傾向', color:'#f59e0b', desc:`急性期シェアが${acuteShare.toFixed(1)}%と過半。回復期・慢性期とのバランスは要確認。`, icon:'⚖️' };
  }
  if (dCh > 5) {
    return { type:'高齢化・慢性期型の傾向', color:'#2563eb', desc:`慢性期シェアが全国比 +${dCh.toFixed(1)}pt。長期療養・慢性疾患需要が相対的に大きい構造。`, icon:'🌿' };
  }
  if (dRe > 3) {
    return { type:'回復期補完型の傾向', color:'#059669', desc:`回復期シェアが全国比 +${dRe.toFixed(1)}pt。脳卒中・整形後の受け皿が厚めの構造。`, icon:'🔄' };
  }
  return { type:'標準型', color:'#64748b', desc:'機能配分は全国平均に近い。', icon:'➖' };
}

export default function RegionalBedFunctionView({ mob, bedFunc, regPref, setRegPref, agePyramid }) {
  const isNational = !regPref || regPref === '全国';
  const bf = bedFunc?.prefectures?.[regPref];
  const bfNat = bedFunc?.national;

  const computeShares = (d) => {
    if (!d) return null;
    const total = d['総床数'] || 0;
    if (total === 0) return null;
    return ACTIVE_FUNCS.reduce((acc, f) => { acc[f] = (d[f]?.beds || 0) / total * 100; return acc; }, {});
  };
  const prefShares = isNational ? null : computeShares(bf);
  const natShares = computeShares(bfNat);

  const allPrefs = bedFunc?.prefectures ? sortPrefs(Object.keys(bedFunc.prefectures)) : [];

  // 75歳以上人口の集計 (agePyramid: 21年齢帯, idx 15-=75-79, 17=85-89...)
  const compute75plus = (prefName) => {
    if (!agePyramid) return null;
    const ap = prefName === '全国' ? agePyramid.national : agePyramid.prefectures?.[prefName];
    if (!ap?.male || !ap?.female) return null;
    let sum = 0;
    for (let i = 15; i < ap.male.length; i++) sum += (ap.male[i] || 0) + (ap.female[i] || 0);
    return sum;
  };
  const pop75 = isNational ? compute75plus('全国') : compute75plus(regPref);
  const totalBeds = bf?.['総床数'] || (isNational ? bfNat?.['総床数'] : null);
  const beds_per_75plus = (totalBeds && pop75) ? (totalBeds / pop75 * 100000) : null;

  // 全国基準
  const nat_pop75 = compute75plus('全国');
  const nat_total = bfNat?.['総床数'];
  const nat_beds_per_75plus = (nat_total && nat_pop75) ? (nat_total / nat_pop75 * 100000) : null;

  // 病棟数集計
  const totalWards = bf
    ? ACTIVE_FUNCS.reduce((s, f) => s + (bf[f]?.wards || 0), 0)
    : (bfNat ? ACTIVE_FUNCS.reduce((s, f) => s + (bfNat[f]?.wards || 0), 0) : null);

  const region = !isNational ? classifyRegion(prefShares, natShares, beds_per_75plus, nat_beds_per_75plus) : null;

  return <>
  {/* Header */}
  <div style={{marginBottom:20}}>
    <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Regional Bed Function</div>
    <h1 style={{fontSize:mob?20:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>地域医療構想・病床機能</h1>
    <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>R6病床機能報告に基づく、地域の医療提供体制(機能配分・規模・75歳以上人口あたり供給)の俯瞰</p>
  </div>

  {/* Pref selector */}
  <div style={{display:'flex',gap:8,marginBottom:20,alignItems:'center',flexWrap:'wrap'}}>
    <select value={regPref || '全国'} onChange={e => setRegPref && setRegPref(e.target.value === '全国' ? null : e.target.value)} style={{padding:'10px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:14,background:'#fff',fontWeight:600}}>
      <option value="全国">全国</option>
      {allPrefs.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  </div>

  {/* KPI Grid (5指標) */}
  {(bf || bfNat) && (
    <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(5,1fr)',gap:10,marginBottom:16}}>
      {[
        {l:'総床数', v: totalBeds ? fmt(totalBeds) : '—', sub:'許可病床(一般+療養)', c:'#2563eb'},
        {l:'病棟数', v: totalWards ? fmt(totalWards) : '—', sub:'4機能合計', c:'#059669'},
        {l:'75歳以上人口', v: pop75 ? fmt(pop75) : '—', sub:'住基2025', c:'#9f1239'},
        {l:'75+あたり病床数', v: beds_per_75plus ? beds_per_75plus.toFixed(0) : '—', sub:'人口10万対 ※年次差あり',
         c:'#f59e0b',
         delta: (beds_per_75plus && nat_beds_per_75plus && !isNational) ? ((beds_per_75plus/nat_beds_per_75plus-1)*100) : null},
        {l: isNational ? '基準' : '全国比', v: isNational ? '—' : (nat_total ? `${(totalBeds/nat_total*100).toFixed(2)}%` : '—'), sub:'総床数の全国シェア', c:'#64748b'},
      ].map((k,i) => (
        <div key={i} style={{background:'#fff',borderRadius:10,padding:'12px 14px',border:'1px solid #f0f0f0'}}>
          <div style={{fontSize:11,color:'#94a3b8'}}>{k.l}</div>
          <div style={{fontSize:mob?16:20,fontWeight:700,color:k.c}}>{k.v}</div>
          {k.delta != null && <div style={{fontSize:10,fontWeight:600,color:k.delta>0?'#dc2626':'#059669'}}>{k.delta>0?'+':''}{k.delta.toFixed(1)}% vs全国</div>}
          {k.sub && <div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>{k.sub}</div>}
        </div>
      ))}
    </div>
  )}

  {/* Layer A: 機能区分構成 */}
  {(prefShares || (isNational && natShares)) && (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <span style={{fontSize:18}}>🏥</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>
            機能区分構成 — {isNational ? '全国' : regPref}
            <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fef3c7',color:'#92400e',fontWeight:500}}>機能配分・現況</span>
          </div>
          <div style={{fontSize:11,color:'#94a3b8'}}>令和6年度病床機能報告(2024/7/1時点) — 各機能の床数シェア・全国基準との偏差</div>
        </div>
      </div>
      {(() => {
        const target = prefShares || natShares;
        const showDelta = !isNational && natShares;
        return (
          <div>
            <div style={{display:'flex',height:32,borderRadius:6,overflow:'hidden',marginBottom:10}}>
              {ACTIVE_FUNCS.map(f => (
                <div key={f} style={{width:`${target[f]}%`,background:FUNC_COLORS[f],display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:700}}>
                  {target[f] >= 6 ? `${target[f].toFixed(1)}%` : ''}
                </div>
              ))}
            </div>
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
          </div>
        );
      })()}
      <div style={{fontSize:10,color:'#94a3b8',marginTop:10,lineHeight:1.5}}>
        ※機能区分は施設の自己申告(2024/7/1時点)。地域医療構想の評価指標として使用。
      </div>
    </div>
  )}

  {/* 地域類型 */}
  {region && (
    <div style={{background:'#fff',borderRadius:14,border:`1px solid ${region.color}33`,borderLeft:`6px solid ${region.color}`,padding:'16px 20px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
        <span style={{fontSize:18}}>{region.icon}</span>
        <div style={{fontSize:13,fontWeight:700,color:region.color}}>地域類型: {region.type}</div>
      </div>
      <div style={{fontSize:12,color:'#475569',lineHeight:1.6}}>{region.desc}</div>
    </div>
  )}

  {/* データの取扱いについて (注記) */}
  <div style={{background:'#fffbeb',borderRadius:14,border:'1px solid #fde68a',padding:'14px 18px',marginBottom:16}}>
    <div style={{fontSize:12,fontWeight:600,color:'#92400e',marginBottom:6}}>📋 データの取扱いについて</div>
    <ul style={{margin:0,paddingLeft:18,fontSize:11,color:'#78350f',lineHeight:1.7}}>
      <li><b>自己申告</b>: 病床機能区分は施設の自己申告(2024/7/1時点)に基づき、実際の患者構成と乖離する可能性。</li>
      <li><b>時点差</b>: 病床機能=2024/7/1時点、人口データ=住基2025年1月。年次差があり厳密な同年比較ではなく現況把握用。</li>
      <li><b>地域類型は暫定ルール</b>: 「供給薄型の可能性」「急性期偏重型の傾向」等は経験則に基づく暫定分類で、z-score化等の統計的根拠は未実装(Phase 2課題)。</li>
    </ul>
  </div>

  {/* 需要との接続 (Phase 2 placeholder) */}
  <div style={{background:'#fafbfc',borderRadius:14,border:'1px dashed #cbd5e1',padding:'16px 20px',marginBottom:16}}>
    <div style={{fontSize:12,fontWeight:600,color:'#64748b',marginBottom:4}}>📊 需要との接続 (Coming next)</div>
    <div style={{fontSize:11,color:'#94a3b8',lineHeight:1.6}}>
      患者調査受療率(P6で実装済) / NDB在宅医療 / NDBリハビリ / NDB入院基本料 と機能配分の対比による supply-demand mapping を Phase 2 で予定。
    </div>
  </div>
  </>;
}
