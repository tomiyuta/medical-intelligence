'use client';
import { fmt, sortPrefs } from '../shared';

const FUNC_COLORS = {
  '高度急性期': '#dc2626',
  '急性期': '#f59e0b',
  '回復期': '#059669',
  '慢性期': '#2563eb',
};
const ACTIVE_FUNCS = ['高度急性期', '急性期', '回復期', '慢性期'];

// ════════════════════════════════════════════════════════════════════════════
// 在宅移行 補助分類 (v0, peer review 2026-04-28 採択)
// ════════════════════════════════════════════════════════════════════════════
// Gate: 75歳以上割合 ≥ 47県平均 → 高齢化県のみ判定対象
// 3指標 (NDB在宅/75+10万対 / 回復期シェア / 慢性期シェア) を47県平均比で評価
// high≥2 → 在宅移行支援型の可能性 / low≥2 → 在宅移行ギャップ型の可能性
// 表現は必ず「可能性」とし、断定しない
function classifyHomecareType(stats) {
  if (!stats) return null;
  const { share75plus, share75plus_natAvg, homecarePer75, homecarePer75_avg, recoveryShare, recoveryShare_natAvg, chronicShare, chronicShare_natAvg } = stats;
  if (share75plus == null || share75plus_natAvg == null) return null;

  const isAging = share75plus >= share75plus_natAvg;
  if (!isAging) return { type:'該当なし', icon:'➖', color:'#94a3b8', desc:'75歳以上割合が全国平均未満のため、本分類は判定対象外', signals:[] };

  const signals = [];
  let highCount = 0, lowCount = 0;
  if (homecarePer75 != null && homecarePer75_avg != null && homecarePer75_avg > 0) {
    const isHigh = homecarePer75 > homecarePer75_avg;
    signals.push({ name:'NDB在宅医療(75+10万対)', value:homecarePer75, ref:homecarePer75_avg, isHigh, delta:((homecarePer75/homecarePer75_avg-1)*100).toFixed(1) });
    if (isHigh) highCount++; else lowCount++;
  }
  if (recoveryShare != null && recoveryShare_natAvg != null) {
    const isHigh = recoveryShare > recoveryShare_natAvg;
    signals.push({ name:'回復期病床シェア', value:recoveryShare, ref:recoveryShare_natAvg, isHigh, delta:(recoveryShare-recoveryShare_natAvg).toFixed(1) });
    if (isHigh) highCount++; else lowCount++;
  }
  if (chronicShare != null && chronicShare_natAvg != null) {
    const isHigh = chronicShare > chronicShare_natAvg;
    signals.push({ name:'慢性期病床シェア', value:chronicShare, ref:chronicShare_natAvg, isHigh, delta:(chronicShare-chronicShare_natAvg).toFixed(1) });
    if (isHigh) highCount++; else lowCount++;
  }
  if (signals.length === 0) return null;

  if (highCount >= 2) {
    return { type:'在宅移行支援型の可能性', color:'#059669', icon:'🏠', desc:`75歳以上割合が全国平均以上(${share75plus.toFixed(1)}%) かつ 在宅・回復期・慢性期の${highCount}/3指標が47県平均より高い。在宅・退院後受け皿が比較的厚い構造の可能性。`, signals };
  }
  if (lowCount >= 2) {
    return { type:'在宅移行ギャップ型の可能性', color:'#dc2626', icon:'⚠️', desc:`75歳以上割合が全国平均以上(${share75plus.toFixed(1)}%) かつ 在宅・回復期・慢性期の${lowCount}/3指標が47県平均より低い。高齢化に対し在宅・退院後受け皿が薄い可能性 — 追加検証要。`, signals };
  }
  return { type:'該当なし', icon:'➖', color:'#94a3b8', desc:`高齢化はあるが指標が拮抗(high=${highCount}, low=${lowCount})`, signals };
}

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

  // 在宅移行 補助分類 (v0) — 47県平均との比較
  const compute47Avg = () => {
    if (!agePyramid?.prefectures || !bedFunc?.prefectures || !ndbDiag) return null;
    const prefs = Object.keys(agePyramid.prefectures);
    let s75Sum = 0, s75N = 0, hcSum = 0, hcN = 0, recSum = 0, recN = 0, chrSum = 0, chrN = 0;
    prefs.forEach(pp => {
      const ap = agePyramid.prefectures[pp];
      if (ap) {
        const tot = ap.male.reduce((a,b)=>a+b,0) + ap.female.reduce((a,b)=>a+b,0);
        const p75 = ap.male.slice(15).reduce((a,b)=>a+b,0) + ap.female.slice(15).reduce((a,b)=>a+b,0);
        if (tot > 0) { s75Sum += p75/tot*100; s75N++; }
        const ndbRec = ndbDiag.find(d => d.category === 'C_在宅医療' && d.prefecture === pp);
        if (ndbRec && p75 > 0) { hcSum += ndbRec.total_claims/p75*100000; hcN++; }
      }
      const bd = bedFunc.prefectures[pp];
      if (bd && bd['総床数'] > 0) {
        recSum += bd['回復期'].beds/bd['総床数']*100; recN++;
        chrSum += bd['慢性期'].beds/bd['総床数']*100; chrN++;
      }
    });
    return {
      share75plus_natAvg: s75N ? s75Sum/s75N : null,
      homecarePer75_avg: hcN ? hcSum/hcN : null,
      recoveryShare_natAvg: recN ? recSum/recN : null,
      chronicShare_natAvg: chrN ? chrSum/chrN : null,
    };
  };

  let homecareType = null;
  if (!isNational && agePyramid?.prefectures?.[regPref] && prefShares) {
    const ap = agePyramid.prefectures[regPref];
    const tot = ap.male.reduce((a,b)=>a+b,0) + ap.female.reduce((a,b)=>a+b,0);
    const p75 = ap.male.slice(15).reduce((a,b)=>a+b,0) + ap.female.slice(15).reduce((a,b)=>a+b,0);
    const share75 = tot > 0 ? p75/tot*100 : null;
    const ndbRec = ndbDiag?.find(d => d.category === 'C_在宅医療' && d.prefecture === regPref);
    const hcPer75 = (ndbRec && p75 > 0) ? ndbRec.total_claims/p75*100000 : null;
    const ref = compute47Avg();
    if (ref) {
      homecareType = classifyHomecareType({
        share75plus: share75,
        share75plus_natAvg: ref.share75plus_natAvg,
        homecarePer75: hcPer75,
        homecarePer75_avg: ref.homecarePer75_avg,
        recoveryShare: prefShares['回復期'],
        recoveryShare_natAvg: ref.recoveryShare_natAvg,
        chronicShare: prefShares['慢性期'],
        chronicShare_natAvg: ref.chronicShare_natAvg,
      });
    }
  }

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

  {/* 在宅移行 補助分類 (v0) */}
  {!isNational && homecareType && (
    <div style={{background:'#fff',borderRadius:14,border:`1px solid ${(homecareType.color || '#cbd5e1') + '40'}`,padding:'16px 20px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
        <span style={{fontSize:20}}>{homecareType.icon || '➖'}</span>
        <div style={{fontSize:13,fontWeight:700,color:homecareType.color || '#64748b'}}>在宅移行 補助分類: {homecareType.type}</div>
        <span style={{fontSize:9,padding:'1px 6px',borderRadius:3,background:'#fef3c7',color:'#92400e',fontWeight:600}}>v0</span>
      </div>
      <div style={{fontSize:12,color:'#475569',lineHeight:1.6,marginBottom:8}}>{homecareType.desc}</div>
      {Array.isArray(homecareType.signals) && homecareType.signals.length > 0 && (
        <div style={{marginTop:8,padding:'8px 12px',background:'#f8fafc',borderRadius:6,fontSize:11}}>
          <div style={{fontWeight:600,color:'#64748b',marginBottom:4}}>判定根拠 (47県平均比):</div>
          <ul style={{paddingLeft:18,margin:0,lineHeight:1.7,color:'#475569'}}>
            {homecareType.signals.map((sig, i) => (
              <li key={i}>
                {sig.name}: <b style={{color:sig.isHigh?'#059669':'#dc2626'}}>{sig.isHigh?'平均より高い':'平均より低い'}</b> ({Number(sig.delta) > 0 ? '+' : ''}{sig.delta}{(sig.name||'').includes('シェア') ? 'pt' : '%'})
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={{fontSize:10,color:'#94a3b8',marginTop:8,padding:'6px 10px',background:'#fff7ed',borderRadius:4,lineHeight:1.5}}>
        ⚠️ 本分類はNDB在宅医療算定・病床機能からみた地域構造の<b>暫定分類</b>です。
        実際の訪問診療件数、看取り件数、在宅酸素実施数、cap.homecare/cap.rehab施設密度を直接示すものではありません。
        cap proxyはv1で追加予定。
      </div>
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
