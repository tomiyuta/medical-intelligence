'use client';
import { useState, useEffect } from 'react';
import { fmt, sortPrefs } from '../shared';

const CAT_LABELS = {'A_初再診料':'外来受診','B_医学管理等':'慢性疾患管理','C_在宅医療':'在宅医療'};
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

// Gap Finder テンプレート定義
// xType: 'q'(質問票) | 'aging'(65歳以上割合) | 'egfr'(健診eGFR平均)
// yType: 'cause'(死因 人口10万対) | 'diag'(医療利用 人口10万対)
// xInverse: true=低い値が高リスク (色判定・象限ラベルを反転)
const GAP_TEMPLATES = [
  {id:'smoke_cancer', label:'喫煙×がん死亡', xLabel:'喫煙率 (%)', yLabel:'がん死亡率',
    xType:'q', xKey:'smoking', yType:'cause', yKey:'がん', xInverse:false,
    note:'喫煙は最大の予防可能ながんリスク。地域差から需給ギャップを抽出。'},
  {id:'aging_homecare', label:'高齢化×在宅医療', xLabel:'65歳以上 (%)', yLabel:'在宅医療/10万人',
    xType:'aging', yType:'diag', yKey:'C_在宅医療', xInverse:false,
    note:'高齢化進行に対し在宅医療供給が追いつくか。左上(高齢×低算定)が供給不足候補。'},
  {id:'exercise_heart', label:'運動不足×心疾患死亡', xLabel:'運動習慣あり (%)', yLabel:'心疾患死亡率',
    xType:'q', xKey:'exercise', yType:'cause', yKey:'心疾患', xInverse:true,
    note:'X軸は運動習慣保有率（高=低リスク）。色は反転処理済み。'},
  {id:'weight_diabetes', label:'体重増加×糖尿病死亡', xLabel:'体重増加歴 (%)', yLabel:'糖尿病死亡率',
    xType:'q', xKey:'weight_gain', yType:'cause', yKey:'糖尿病', xInverse:false,
    note:'20歳比10kg以上の増加は2型糖尿病の独立リスク因子。'},
  {id:'walking_senility', label:'歩行不足×老衰', xLabel:'1日60分歩行 (%)', yLabel:'老衰死亡率',
    xType:'q', xKey:'walking', yType:'cause', yKey:'老衰', xInverse:true,
    note:'X軸は歩行習慣保有率（高=低リスク）。地域の身体活動量と老衰の関連を可視化。'},
  {id:'late_dinner_htn', label:'夕食遅×高血圧死亡', xLabel:'就寝前夕食 (%)', yLabel:'高血圧性疾患死亡率',
    xType:'q', xKey:'late_dinner', yType:'cause', yKey:'高血圧性疾患', xInverse:false,
    note:'夜間摂食と血圧の関連は近年注目。代理指標として扱う。'},
  {id:'aging_outpatient', label:'高齢化×外来受診', xLabel:'65歳以上 (%)', yLabel:'外来受診/10万人',
    xType:'aging', yType:'diag', yKey:'A_初再診料', xInverse:false,
    note:'高齢化と外来受診頻度の関係。受診抑制は左上または右下に現れる。'},
  {id:'egfr_kidney', label:'腎機能×腎不全死亡', xLabel:'eGFR平均 (mL/min)', yLabel:'腎不全死亡率',
    xType:'egfr', yType:'cause', yKey:'腎不全', xInverse:true,
    note:'X軸は健診eGFR平均（低値=腎機能低下=リスク）。男女平均値を使用。'},
  {id:'daily_drink_heart', label:'毎日飲酒×心疾患死亡', xLabel:'毎日飲酒率 (%)', yLabel:'心疾患死亡率',
    xType:'q', xKey:'drinking_daily', yType:'cause', yKey:'心疾患', xInverse:false,
    note:'毎日飲酒と循環器疾患の関連は用量依存とされる。地域差として可視化。'},
  {id:'heavy_drink_liver', label:'高量飲酒×肝疾患死亡', xLabel:'2合以上飲酒率 (%)', yLabel:'肝疾患死亡率',
    xType:'q', xKey:'heavy_drinker', yType:'cause', yKey:'肝疾患', xInverse:false,
    note:'分母は飲酒者のみ。地域の飲酒文化と肝疾患死亡の関連を探索。'},
  {id:'sleep_heart', label:'睡眠充足×心疾患死亡', xLabel:'睡眠充足率 (%)', yLabel:'心疾患死亡率',
    xType:'q', xKey:'sleep_ok', yType:'cause', yKey:'心疾患', xInverse:true,
    note:'X軸は睡眠で休養がとれている人の割合（高=低リスク）。睡眠不足と循環器の関連は確立。'},
];

export default function NdbView({ mob, ndbDiag, ndbRx, ndbHc, ndbPref, setNdbPref, setNdbRx, vitalStats, areaDemoData, ndbQ, agePyramid, futureDemo }) {
  const diagByPref = ndbDiag.filter(d=>d.prefecture===ndbPref);
  const hcPref = ndbHc.filter(d=>d.pref===ndbPref);
  const vp = vitalStats?.prefectures?.find(p=>p.pref===ndbPref);
  const causes = vp?.causes || [];

  // ── 人口KPI: age_pyramid (住基2025) + future_demographics (社人研2050) ──
  // age_groups 21帯: idx 13=65-69, 15=75-79, 17=85-89
  const computeAgeRates = (ap) => {
    if (!ap || !ap.male || !ap.female) return null;
    const sum = arr => arr.reduce((s,v)=>s+(v||0),0);
    const m = ap.male, f = ap.female;
    const total = sum(m) + sum(f);
    if (total <= 0) return null;
    return {
      total,
      rate65: (sum(m.slice(13)) + sum(f.slice(13))) / total * 100,
      rate75: (sum(m.slice(15)) + sum(f.slice(15))) / total * 100,
      rate85: (sum(m.slice(17)) + sum(f.slice(17))) / total * 100,
    };
  };
  const demoKpi = (()=>{
    if (!agePyramid?.prefectures?.[ndbPref]) return null;
    const r = computeAgeRates(agePyramid.prefectures[ndbPref]);
    if (!r) return null;
    let change2050 = null, rate75_2050 = null;
    if (futureDemo?.prefectures) {
      const fp = futureDemo.prefectures.find(p => p.pref === ndbPref && (p.type === 'a' || p.type === 1));
      if (fp) {
        const p20 = fp.total_pop?.['2020'], p50 = fp.total_pop?.['2050'];
        if (p20 && p50) change2050 = (p50/p20 - 1) * 100;
        rate75_2050 = fp.aging_rate_75?.['2050'];
      }
    }
    return { ...r, change2050, rate75_2050 };
  })();
  // 全国平均（人口加重）
  const demoNat = (()=>{
    if (!agePyramid?.prefectures) return null;
    let totals = {tot:0, s65:0, s75:0, s85:0};
    Object.values(agePyramid.prefectures).forEach(ap => {
      const sum = arr => arr.reduce((s,v)=>s+(v||0),0);
      totals.tot += sum(ap.male) + sum(ap.female);
      totals.s65 += sum(ap.male.slice(13)) + sum(ap.female.slice(13));
      totals.s75 += sum(ap.male.slice(15)) + sum(ap.female.slice(15));
      totals.s85 += sum(ap.male.slice(17)) + sum(ap.female.slice(17));
    });
    if (totals.tot <= 0) return null;
    return { rate65: totals.s65/totals.tot*100, rate75: totals.s75/totals.tot*100, rate85: totals.s85/totals.tot*100 };
  })();
  // 75+順位（47都道府県中, 高い順）
  const rank75 = (()=>{
    if (!agePyramid?.prefectures || !demoKpi) return null;
    const arr = Object.entries(agePyramid.prefectures).map(([p, ap]) => {
      const r = computeAgeRates(ap);
      return r ? { pref: p, rate75: r.rate75 } : null;
    }).filter(Boolean).sort((a,b)=>b.rate75-a.rate75);
    const idx = arr.findIndex(x=>x.pref===ndbPref);
    return idx >= 0 ? { rank: idx+1, total: arr.length } : null;
  })();

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

  // ── Gap Finder: state & 全都道府県メトリック計算 ──
  const [gapTemplate, setGapTemplate] = useState('smoke_cancer');
  const prefMaps = (()=>{
    const popByPref = {}, p65ByPref = {};
    if (areaDemoData) {
      areaDemoData.forEach(a => {
        popByPref[a.pref] = popByPref[a.pref] || 0;
        p65ByPref[a.pref] = p65ByPref[a.pref] || 0;
        (a.munis||[]).forEach(m => { popByPref[a.pref] += m.pop||0; p65ByPref[a.pref] += m.p65||0; });
      });
    }
    const aging = {};
    Object.keys(popByPref).forEach(p => { aging[p] = popByPref[p]>0 ? p65ByPref[p]/popByPref[p]*100 : 0; });
    const diag = {};
    if (ndbDiag) {
      ndbDiag.forEach(d => {
        const pop = popByPref[d.prefecture] || 0;
        if (pop > 0) {
          if (!diag[d.prefecture]) diag[d.prefecture] = {};
          diag[d.prefecture][d.category] = d.total_claims/pop*100000;
        }
      });
    }
    const egfr = {};
    if (ndbHc) {
      ndbHc.filter(h=>h.metric==='eGFR').forEach(h => { egfr[h.pref] = (h.male+h.female)/2; });
    }
    return { aging, diag, egfr };
  })();

  return <>

  {/* Header */}
  <div style={{marginBottom:20}}>
    <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Healthcare Atlas</div>
    <h1 style={{fontSize:mob?20:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>都道府県 医療プロファイル</h1>
    <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>NDB・人口動態統計・特定健診を統合し、地域の「根因→リスク→治療→結果」を俯瞰。</p>
  </div>
  <div style={{display:'flex',gap:8,marginBottom:20,alignItems:'center'}}>
    <select value={ndbPref} onChange={e=>setNdbPref(e.target.value)} style={{padding:'10px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:14,background:'#fff',fontWeight:600}}>
      {sortPrefs([...new Set(ndbDiag.map(d=>d.prefecture))]).map(p=><option key={p} value={p}>{p}</option>)}
    </select>
    {prefPop > 0 && <span style={{fontSize:12,color:'#94a3b8'}}>人口 {fmt(prefPop)}人</span>}
  </div>

  {/* ═══ DEMOGRAPHIC CONTEXT (人口KPI) ═══ */}
  {demoKpi && (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'16px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <span style={{fontSize:18}}>👥</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>
            人口コンテキスト
            <span style={{marginLeft:8,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#f1f5f9',color:'#64748b',fontWeight:500}}>実測+推計</span>
          </div>
          <div style={{fontSize:11,color:'#94a3b8'}}>NDB指標を解釈する基盤として — 住基2025 + 社人研2050</div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:mob?'repeat(2,1fr)':'repeat(5,1fr)',gap:8}}>
        {/* 1: 総人口 */}
        <div style={{background:'#f8fafc',borderRadius:8,padding:'10px 12px'}}>
          <div style={{fontSize:10,color:'#64748b',marginBottom:2}}>総人口</div>
          <div style={{fontSize:mob?15:18,fontWeight:700,color:'#1e293b'}}>{fmt(demoKpi.total)}</div>
          <div style={{fontSize:10,color:'#94a3b8'}}>2025年1月（人）</div>
        </div>
        {/* 2: 65+ */}
        <div style={{background:'#f8fafc',borderRadius:8,padding:'10px 12px'}}>
          <div style={{fontSize:10,color:'#64748b',marginBottom:2}}>65歳以上</div>
          <div style={{fontSize:mob?15:18,fontWeight:700,color:'#1e293b'}}>{demoKpi.rate65.toFixed(1)}%</div>
          {demoNat && <div style={{fontSize:10,color:demoKpi.rate65>demoNat.rate65?'#dc2626':'#059669'}}>
            全国比 {demoKpi.rate65>demoNat.rate65?'+':''}{(demoKpi.rate65-demoNat.rate65).toFixed(1)}pt
          </div>}
        </div>
        {/* 3: 75+ */}
        <div style={{background:'#f8fafc',borderRadius:8,padding:'10px 12px'}}>
          <div style={{fontSize:10,color:'#64748b',marginBottom:2}}>75歳以上 {rank75 && <span style={{fontSize:9,color:'#94a3b8'}}>#{rank75.rank}/{rank75.total}</span>}</div>
          <div style={{fontSize:mob?15:18,fontWeight:700,color:'#1e293b'}}>{demoKpi.rate75.toFixed(1)}%</div>
          {demoNat && <div style={{fontSize:10,color:demoKpi.rate75>demoNat.rate75?'#dc2626':'#059669'}}>
            全国比 {demoKpi.rate75>demoNat.rate75?'+':''}{(demoKpi.rate75-demoNat.rate75).toFixed(1)}pt
          </div>}
        </div>
        {/* 4: 85+ */}
        <div style={{background:'#f8fafc',borderRadius:8,padding:'10px 12px'}}>
          <div style={{fontSize:10,color:'#64748b',marginBottom:2}}>85歳以上</div>
          <div style={{fontSize:mob?15:18,fontWeight:700,color:'#1e293b'}}>{demoKpi.rate85.toFixed(1)}%</div>
          {demoNat && <div style={{fontSize:10,color:demoKpi.rate85>demoNat.rate85?'#dc2626':'#059669'}}>
            全国比 {demoKpi.rate85>demoNat.rate85?'+':''}{(demoKpi.rate85-demoNat.rate85).toFixed(1)}pt
          </div>}
        </div>
        {/* 5: 2050 */}
        <div style={{background:'#fef3c7',borderRadius:8,padding:'10px 12px'}}>
          <div style={{fontSize:10,color:'#92400e',marginBottom:2}}>2050年予測</div>
          <div style={{fontSize:mob?15:18,fontWeight:700,color:'#92400e'}}>
            {demoKpi.change2050!=null ? `${demoKpi.change2050>0?'+':''}${demoKpi.change2050.toFixed(1)}%` : '—'}
          </div>
          <div style={{fontSize:10,color:'#92400e'}}>
            {demoKpi.rate75_2050!=null ? `75+→${demoKpi.rate75_2050.toFixed(1)}%` : '人口変化(2020比)'}
          </div>
        </div>
      </div>
      {/* 解釈文（自動生成） */}
      {demoNat && (()=>{
        const d75 = demoKpi.rate75 - demoNat.rate75;
        let msg;
        if (d75 > 1.5) msg = `${ndbPref}は75歳以上割合が全国平均より${d75.toFixed(1)}pt高く、在宅医療・処方薬・慢性期医療の需要が大きく見えやすい構造です。`;
        else if (d75 < -1.5) msg = `${ndbPref}は75歳以上割合が全国平均より${Math.abs(d75).toFixed(1)}pt低く、NDB算定回数の多さは人口規模の影響を受けている可能性があります。`;
        else msg = `${ndbPref}の75歳以上割合は全国平均水準。NDB指標は人口構造補正の影響を受けにくい解釈となります。`;
        return <div style={{fontSize:11,color:'#475569',marginTop:10,padding:'8px 12px',background:'#f8fafc',borderRadius:6,lineHeight:1.5,borderLeft:'3px solid #2563EB'}}>💡 {msg}</div>;
      })()}
    </div>
  )}

  {/* ═══ Layer 1: ROOT CAUSE (生活習慣リスク) ═══ */}
  {ndbQ && ndbQ.prefectures?.[ndbPref] && (()=>{
    const qd = ndbQ.prefectures[ndbPref];
    const qs = ndbQ.questions || {};
    const RISK_ICONS = {smoking:'🚬', weight_gain:'⚖️', exercise:'🏃', walking:'🚶', late_dinner:'🌙', drinking_daily:'🍶', heavy_drinker:'🥃', sleep_ok:'😴'};
    const RISK_COLORS = {smoking:'#dc2626', weight_gain:'#f59e0b', exercise:'#2563eb', walking:'#059669', late_dinner:'#8b5cf6', drinking_daily:'#b91c1c', heavy_drinker:'#7f1d1d', sleep_ok:'#6366f1'};
    // 高い値=低リスクの項目（運動/歩行/睡眠充足）— delta色判定を反転
    const INVERSE_KEYS = new Set(['exercise', 'walking', 'sleep_ok']);
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
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>生活習慣リスク <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#e0e7ff',color:'#3730a3',fontWeight:500}}>生活習慣</span></div>
          <div style={{fontSize:11,color:'#94a3b8'}}>特定健診 質問票（40〜74歳）— 全国平均との差をΔ表示</div>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {items.map(([key, rate]) => {
          const q = qs[key] || {};
          const delta = rate - (natAvg[key]||0);
          // inverse: 値が低い方が高リスク（運動/歩行/睡眠充足）
          const isHigherRisk = INVERSE_KEYS.has(key) ? delta < 0 : delta > 0;
          return <div key={key} style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:16,width:24}}>{RISK_ICONS[key]||'📋'}</span>
            <span style={{width:mob?70:90,fontSize:12,fontWeight:600,color:'#475569',flexShrink:0}}>{q.risk_label||key}</span>
            <div style={{flex:1,height:22,background:'#f1f5f9',borderRadius:4,overflow:'hidden',position:'relative'}}>
              <div style={{height:'100%',borderRadius:4,background:RISK_COLORS[key]||'#94a3b8',width:`${Math.min(rate,100)}%`,opacity:0.75}}/>
              <span style={{position:'absolute',right:6,top:3,fontSize:10,color:'#475569',fontWeight:600}}>{rate}%</span>
            </div>
            <span style={{fontSize:10,fontWeight:600,color:isHigherRisk?'#dc2626':'#059669',width:60,textAlign:'right',flexShrink:0}}>{delta>0?'↑':'↓'}{Math.abs(delta).toFixed(1)}pt</span>
          </div>;
        })}
      </div>
      <div style={{fontSize:10,color:'#94a3b8',marginTop:10}}>※Δは全国平均との差。色は<b style={{color:'#dc2626'}}>赤=高リスク方向</b>/<b style={{color:'#059669'}}>緑=低リスク方向</b>。運動・歩行・睡眠充足は値が高いほど低リスク（色判定を反転）。40-74歳特定健診受診者が対象。</div>
    </div>);
  })()}

  {/* ═══ Layer 2: RISK (健診リスク) ═══ */}
  {hcPref.length > 0 && <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <span style={{fontSize:18}}>🔬</span>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>健診リスク <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#dbeafe',color:'#1e40af',fontWeight:500}}>検査値</span></div>
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
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>医療利用 <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#cffafe',color:'#155e75',fontWeight:500}}>医療利用量</span></div>
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
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>治療パターン — 疾患領域別 <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fef3c7',color:'#92400e',fontWeight:500}}>治療代理</span></div>
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
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>処方薬 薬効分類別 Top10 <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fef3c7',color:'#92400e',fontWeight:500}}>治療代理</span></div>
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
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>死因構造 <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fce7f3',color:'#9f1239',fontWeight:500}}>結果</span></div>
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

  {/* ═══ GAP FINDER: リスク×結果の不一致検出（テンプレ切替）═══ */}
  {ndbQ && vitalStats?.prefectures && (()=>{
    const tpl = GAP_TEMPLATES.find(t=>t.id===gapTemplate) || GAP_TEMPLATES[0];
    const allQ = ndbQ.prefectures || {};
    const allV = vitalStats.prefectures || [];
    // 軸アクセサ
    const getX = (pref) => {
      if (tpl.xType==='q') return allQ[pref]?.[tpl.xKey];
      if (tpl.xType==='aging') return prefMaps.aging[pref];
      if (tpl.xType==='egfr') return prefMaps.egfr[pref];
      return null;
    };
    const getY = (vp) => {
      if (tpl.yType==='cause') return vp.causes?.find(c=>c.cause.includes(tpl.yKey))?.rate;
      if (tpl.yType==='diag') return prefMaps.diag[vp.pref]?.[tpl.yKey];
      return null;
    };
    const dots = allV.map(vp => {
      const x = getX(vp.pref);
      const y = getY(vp);
      if (x==null || y==null || isNaN(x) || isNaN(y)) return null;
      return { pref: vp.pref, x, y };
    }).filter(Boolean);
    if (dots.length < 10) return (
      <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
        <div style={{fontSize:13,color:'#94a3b8'}}>Gap Finder: テンプレ「{tpl.label}」のデータが不足しています</div>
      </div>
    );

    const xMin = Math.min(...dots.map(d=>d.x));
    const xMax = Math.max(...dots.map(d=>d.x));
    const yMin = Math.min(...dots.map(d=>d.y));
    const yMax = Math.max(...dots.map(d=>d.y));
    const xAvg = dots.reduce((s,d)=>s+d.x,0)/dots.length;
    const yAvg = dots.reduce((s,d)=>s+d.y,0)/dots.length;
    // ピアソン相関係数
    const xSd = Math.sqrt(dots.reduce((s,d)=>s+(d.x-xAvg)**2,0)/dots.length);
    const ySd = Math.sqrt(dots.reduce((s,d)=>s+(d.y-yAvg)**2,0)/dots.length);
    const corr = (xSd>0 && ySd>0) ? dots.reduce((s,d)=>s+(d.x-xAvg)*(d.y-yAvg),0)/(dots.length*xSd*ySd) : 0;

    const W = mob ? 320 : 460;
    const H = 280;
    const pad = {t:20,r:20,b:35,l:50};
    const cw = W-pad.l-pad.r;
    const ch = H-pad.t-pad.b;
    const sx = v => pad.l + (xMax===xMin ? 0.5 : (v-xMin)/(xMax-xMin))*cw;
    const sy = v => pad.t + (1-(yMax===yMin ? 0.5 : (v-yMin)/(yMax-yMin)))*ch;
    const sel = dots.find(d=>d.pref===ndbPref);

    // xInverse対応: 高リスク象限を反転
    const xRiskHi = (d) => tpl.xInverse ? d.x < xAvg : d.x > xAvg;
    const yRiskHi = (d) => d.y > yAvg;
    // 象限矩形（リスク=赤=高Y、安全=緑=低Y）
    const riskRectX = tpl.xInverse ? pad.l : sx(xAvg);
    const riskRectW = tpl.xInverse ? sx(xAvg)-pad.l : cw-(sx(xAvg)-pad.l);
    const safeRectX = tpl.xInverse ? sx(xAvg) : pad.l;
    const safeRectW = tpl.xInverse ? cw-(sx(xAvg)-pad.l) : sx(xAvg)-pad.l;

    return (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
        <span style={{fontSize:18}}>🔍</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>Gap Finder — リスク×結果の不一致検出</div>
          <div style={{fontSize:11,color:'#94a3b8'}}>{tpl.xLabel}（横軸）× {tpl.yLabel}（縦軸） — 47都道府県の地域差・相関係数 r={corr.toFixed(2)}</div>
        </div>
      </div>
      {/* テンプレ切替 */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
        {GAP_TEMPLATES.map(t => (
          <button key={t.id} onClick={()=>setGapTemplate(t.id)}
            style={{padding:'5px 10px',borderRadius:6,border:'1px solid '+(gapTemplate===t.id?'#2563EB':'#e2e8f0'),
                    background:gapTemplate===t.id?'#2563EB':'#fff', color:gapTemplate===t.id?'#fff':'#475569',
                    fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>{t.label}</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',maxWidth:W}}>
        {/* 象限背景: 赤=高リスク高死亡, 緑=低リスク低死亡 */}
        <rect x={riskRectX} y={pad.t} width={riskRectW} height={sy(yAvg)-pad.t} fill="#fef2f2" opacity={0.3} rx={4}/>
        <rect x={safeRectX} y={sy(yAvg)} width={safeRectW} height={ch-(sy(yAvg)-pad.t)} fill="#f0fdf4" opacity={0.3} rx={4}/>
        {/* 平均線 */}
        <line x1={sx(xAvg)} y1={pad.t} x2={sx(xAvg)} y2={H-pad.b} stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="4,3"/>
        <line x1={pad.l} y1={sy(yAvg)} x2={W-pad.r} y2={sy(yAvg)} stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="4,3"/>
        {/* ドット */}
        {dots.map(d => {
          const isSel = d.pref === ndbPref;
          const xR = xRiskHi(d), yR = yRiskHi(d);
          const fill = (xR && yR) ? '#dc2626' : (!xR && !yR) ? '#059669' : '#94a3b8';
          return <circle key={d.pref} cx={sx(d.x)} cy={sy(d.y)} r={isSel?7:4}
            fill={fill} opacity={isSel?1:0.6} stroke={isSel?'#1e293b':'none'} strokeWidth={isSel?2:0}/>;
        })}
        {/* 選択県ラベル */}
        {sel && <text x={sx(sel.x)+10} y={sy(sel.y)-4} fontSize={11} fontWeight={700} fill="#1e293b">{ndbPref}</text>}
        {/* 軸ラベル */}
        <text x={W/2} y={H-4} textAnchor="middle" fontSize={10} fill="#64748b">{tpl.xLabel}</text>
        <text x={12} y={H/2} textAnchor="middle" fontSize={10} fill="#64748b" transform={`rotate(-90,12,${H/2})`}>{tpl.yLabel}</text>
        {/* 象限ラベル（xInverseで位置反転） */}
        <text x={tpl.xInverse?pad.l+4:W-pad.r-4} y={pad.t+12}
              textAnchor={tpl.xInverse?'start':'end'} fontSize={8} fill="#dc2626">高リスク×高死亡</text>
        <text x={tpl.xInverse?W-pad.r-4:pad.l+4} y={H-pad.b-4}
              textAnchor={tpl.xInverse?'end':'start'} fontSize={8} fill="#059669">低リスク×低死亡</text>
      </svg>
      <div style={{display:'flex',gap:12,fontSize:11,color:'#64748b',marginTop:8,flexWrap:'wrap'}}>
        <span><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#dc2626',marginRight:3}}/>高リスク高死亡</span>
        <span><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#059669',marginRight:3}}/>低リスク低死亡</span>
        <span><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#94a3b8',marginRight:3}}/>不一致(GAP)</span>
        <span style={{color:'#94a3b8'}}>点線=全国平均</span>
      </div>
      <div style={{fontSize:10,color:'#94a3b8',marginTop:8,lineHeight:1.6}}>
        ※{tpl.note}<br/>
        ※相関係数は47都道府県間の地域差を示す指標であり、個人レベルの因果関係を意味するものではありません。
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
