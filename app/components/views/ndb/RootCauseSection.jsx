'use client';
import { Fragment } from 'react';
import { fmt, sortPrefs, PREF_ORDER } from '../../shared';
import { prefersReducedMotion, useCountUp, CountUpNum, useFlipRows, useStripCommon, useYearSweep } from '../../ui/vizHooks';
import { dispersionForCause, classifyDispersion } from '../../../../lib/dispersionMetrics';
import { getSourceBadge } from '../../../../lib/sourceRegistry';
import { DOMAIN_MAPPING, DOMAIN_ORDER, rowInDomain, domainSectionStatus, DOMAIN_TO_RX_LABEL, FP_TIERS, tierOf } from '../../../../lib/domainMapping';
import InterpretationGuard from '../../ui/InterpretationGuard';
import PrefStrip47 from '../../ui/PrefStrip47';
import PsIris from '../../ui/PsIris';
import PrefChoropleth from '../../ui/PrefChoropleth';
import CheckupBinsHistogram, { RISK_BIN_THRESHOLD, METRIC_TO_RISK_KEY } from '../../ui/CheckupBinsHistogram';
import RiskGauge from '../../ui/RiskGauge';
import AgePyramidGhost from '../../ui/AgePyramidGhost';
import DeathWaffle100, { buildWaffleItems, WAFFLE_CAUSE_COLORS, WAFFLE_OTHER, WAFFLE_OTHER_COLOR } from '../../ui/DeathWaffle100';
import { PREF47_SET, isP47, yb, UnitDotLane, RHYTHM_X0, RHYTHM_X1, RHYTHM_W, rhythmX, RHYTHM_MONTHS, RhythmLane, YearRhythmTrack, CAT_LABELS, DIAG_UNIT, RISK_META, RISK_CARDS, RISK_COLOR_DEEP, DRUG_DOMAIN, DOMAIN_COLORS, GAP_TEMPLATES, DOMAIN_GAP_TEMPLATE, DEMO_YEARS, computeAgeRates } from './ndbShared';

export default function RootCauseSection(props){
  const {
  mob, navTitle, ndbDiag, ndbRx, ndbHc, ndbPref, setNdbPref, setNdbRx, vitalStats, ndbQ, agePyramid,
  futureDemo, patientSurvey, bedFunc, ndbCheckupRiskRates, ndbCheckupRiskRatesStd, mortalityOutcome2020,
  cancerSites2024, homecareCapability, japanMap, futureYear, setFutureYear, diagByPref, hcPref, vp, causes,
  pinnedPref, setPinnedPref, hoverPref, setHoverPref, stripCommon, demoKpi, demoNat, rank75, demoStrips,
  tlYear, tlIdx, dumbbellOpen, setDumbbellOpen, tlRef, tlDrag, tlPlaying, tlToggle, fpSel, tlBands, tlJusaki,
  dumbbell, prefPop, perCap, rxDomains, gapTemplate, setGapTemplate, psMode, setPsMode, psSort, setPsSort,
  psShowTop7, setPsShowTop7, psExpanded, setPsExpanded, hoverPSKey, setHoverPSKey, psFlashKey, setPsFlashKey,
  psRowRefs, psFlashTimer, psJumpToRow, psMapOpen, setPsMapOpen, qExpandedKey, setQExpandedKey, qSort,
  setQSort, qHoverKey, setQHoverKey, qRowRefs, demandProj, setDemandProj, mortalityMode, setMortalityMode,
  mortalitySex, setMortalitySex, selectedCause, setSelectedCause, hoverCause, setHoverCause, waffleItems,
  cancerTrend, setCancerTrend, cancerTrendSex, setCancerTrendSex, trendSite, setTrendSite, trendHoverIdx,
  setTrendHoverIdx, rxAll, setRxAll, riskStdMode, setRiskStdMode, binsOpen, setBinsOpen, binsMetric,
  setBinsMetric, binsSex, setBinsSex, binsAge, setBinsAge, binsMirror, setBinsMirror, binsCdf, setBinsCdf,
  binsData, setBinsData, binsPinData, setBinsPinData, binsPulse, setBinsPulse, binsZoneHover,
  setBinsZoneHover, binsBoxRef, binsPulseTimer, binsJumpTo, activeDomain, setActiveDomain, dm, dMatch, dFade,
  dBorder, rxFade, sectionFade, rxSort, setRxSort, rxExpanded, setRxExpanded, rxHoverKey, setRxHoverKey,
  rxFlashKey, setRxFlashKey, rx4bExpanded, setRx4bExpanded, rxRowRefs, rxFlashTimer, rxJumpToRow,
  displayCauses, prefPops, prefMaps, rxShared, rxClassStrip,
  } = props;
  return (
  ndbQ && ndbQ.prefectures?.[ndbPref] && (()=>{
    const qd = ndbQ.prefectures[ndbPref];
    const qs = ndbQ.questions || {};
    const RISK_ICONS = {
      // 生活習慣 (lifestyle)
      smoking:'🚬', weight_gain:'⚖️', exercise:'🏃', walking:'🚶',
      late_dinner:'🌙', drinking_daily:'🍶', heavy_drinker:'🥃', sleep_ok:'😴',
      // 服薬 (medication)
      hypertension_med:'💊', diabetes_medication:'💊', lipid_medication:'💊',
      // 既往歴 (history)
      heart_disease:'🏥', stroke_history:'🏥', ckd_history:'🏥',
    };
    // 高い値=低リスクの項目 — delta色判定を反転。
    // ★sleep_okのみ: exercise/walkingの格納値は「いいえ」率=運動不足率/歩行不足率
    // （risk_labelもデータ側で「◯◯不足率」・原典xlsx検証済）で高=リスク方向のため反転しない。
    const INVERSE_KEYS = new Set(['sleep_ok']);
    // Compute national averages（rank1修正: 「都道府県判別不可」を除外し47県のみで平均）
    const prefEntries47 = Object.entries(ndbQ.prefectures).filter(([p])=>isP47(p));
    const allPrefs = prefEntries47.map(([,v])=>v);
    const natAvg = {};
    for (const key of Object.keys(qd)) {
      const vals = allPrefs.map(p=>p[key]).filter(v=>v!=null);
      natAvg[key] = vals.length > 0 ? vals.reduce((s,v)=>s+v,0)/vals.length : 0;
    }
    // rank1: 各項目の47県分布ストリップ用 values
    const stripVals = (key) => prefEntries47.map(([p,v])=>({pref:p, value:v[key]})).filter(d=>d.value!=null);
    // ── tierゾーン発散バー「県の性格プロファイル」──
    // 3バンド化（qs[key].category）: ①生活習慣8=方向色（赤=リスク方向/緑=保護方向・睡眠充足のみ反転）
    // ②服薬3 ③既往歴3=中立発散（rose=多い/indigo=少ない — FP_TIERS両端と同一・良し悪しでない）
    const BANDS = [
      { cat:'lifestyle',  label:'生活習慣', badge:'高=リスク方向・睡眠充足のみ高=良',
        badgeStyle:{background:'#fef2f2',color:'#b91c1c',border:'1px solid #fecaca'}, sortable:true },
      { cat:'medication', label:'服薬',     badge:'方向中立（事実）',
        badgeStyle:{background:'#eef2ff',color:'#4338ca',border:'1px solid #c7d2fe'}, sortable:false },
      { cat:'history',    label:'既往歴',   badge:'方向中立（事実）',
        badgeStyle:{background:'#eef2ff',color:'#4338ca',border:'1px solid #c7d2fe'}, sortable:false },
    ];
    const bandKeys = (cat) => Object.keys(qs).filter(k => qs[k]?.category === cat && qd[k] != null);
    // 発散トラック: x=対全国比−100 のリニア写像・domain[−40,+40]%固定
    // （受療率フォレスト/Layer4のlog2比軸とは別文法 — tierゾーン帯±5/±15を面で常設）
    const DOM = 40;
    const devOf = (v, nat) => (v != null && nat > 0) ? (v / nat - 1) * 100 : null;
    const xPct = (dev) => 50 + Math.max(-DOM, Math.min(DOM, dev)) / DOM * 50;
    const devMap = {};
    Object.keys(qd).forEach(k => { devMap[k] = devOf(qd[k], natAvg[k] || 0); });
    const reduced = prefersReducedMotion();
    const badge = yb('ndbQ');
    const renderRow = (key, sortable) => {
      const q = qs[key] || {};
      const rate = qd[key];
      const nat = natAvg[key] || 0;
      const dev = devMap[key];
      if (rate == null || dev == null) return null;
      const delta = rate - nat;
      const isLife = q.category === 'lifestyle';
      const inverse = INVERSE_KEYS.has(key);
      // 色: 生活習慣=リスク方向へ乖離で赤/保護方向で緑。服薬・既往=多rose/少indigo中立（判定対象外）
      const dirColor = isLife
        ? ((inverse ? dev < 0 : dev > 0) ? '#dc2626' : '#059669')
        : (dev >= 0 ? '#9f1239' : '#4338ca');
      const t = tierOf(dev);
      const clamped = dev > DOM ? 'high' : dev < -DOM ? 'low' : null;
      const tipX = xPct(dev);
      const sv = stripVals(key);
      const rank = 1 + sv.filter(x => x.value > rate).length;
      // 人間スケール翻訳（rate<2%は1000人中へ自動切替 — 低base項目の1人未満不可視を回避）
      const chipTxt = rate < 2
        ? `1000人中${Math.round(rate * 10)}人（全国${Math.round(nat * 10)}人）`
        : `100人中${Math.round(rate)}人（全国${Math.round(nat)}人）`;
      const pinVal = (pinnedPref && pinnedPref !== ndbPref) ? (ndbQ.prefectures[pinnedPref]?.[key] ?? null) : null;
      const pinDev = devOf(pinVal, nat);
      const open = qExpandedKey === key;
      const barL = Math.min(50, tipX), barW = Math.abs(tipX - 50);
      // tierことばチップ: バー先端に併置（端付近はトラック内側へ反転し見切れ回避）
      const chipInward = dev >= 0 ? tipX > 72 : tipX < 28;
      const tierChipStyle = dev >= 0
        ? (chipInward ? { left: `calc(${tipX}% - 5px)`, transform: 'translate(-100%,-50%)' } : { left: `calc(${tipX}% + 5px)`, transform: 'translateY(-50%)' })
        : (chipInward ? { left: `calc(${tipX}% + 5px)`, transform: 'translateY(-50%)' } : { left: `calc(${tipX}% - 5px)`, transform: 'translate(-100%,-50%)' });
      return (
      <div key={key} ref={sortable ? (el) => { qRowRefs.current[key] = el; } : undefined}
        style={{ ...dFade('ndbQKey', key), ...dBorder('ndbQKey', key) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: mob ? 6 : 10, cursor: 'pointer' }}
          onClick={() => setQExpandedKey(open ? null : key)}
          onMouseEnter={() => setQHoverKey(key)} onMouseLeave={() => setQHoverKey(null)}>
          <span style={{ fontSize: 16, width: 24, flexShrink: 0 }}>{RISK_ICONS[key] || '📋'}</span>
          <span style={{ width: mob ? 70 : 90, fontSize: mob ? 11 : 12, fontWeight: 600, color: '#475569', flexShrink: 0 }}>
            {q.risk_label || key}<span style={{ marginLeft: 3, fontSize: 9, color: '#cbd5e1' }}>{open ? '▾' : '▸'}</span>
          </span>
          <div style={{ flex: 1, position: 'relative', height: 26, minWidth: 80 }}>
            {/* tierゾーン帯（±5内/±5〜15/±15超=tier色8%）+発散バー — overflow hidden内層 */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 4, overflow: 'hidden' }}>
              {[[-DOM, -15, 'rgba(67,56,202,0.08)'], [-15, -5, '#f1f5f9'], [-5, 5, '#f8fafc'], [5, 15, '#f1f5f9'], [15, DOM, 'rgba(159,18,57,0.08)']].map(([a, b, bg], zi) => (
                <div key={zi} style={{ position: 'absolute', left: `${xPct(a)}%`, width: `${xPct(b) - xPct(a)}%`, top: 0, bottom: 0, background: bg }} />
              ))}
              {[-15, -5, 5, 15].map(z => (
                <div key={z} style={{ position: 'absolute', left: `${xPct(z)}%`, top: 0, bottom: 0, borderLeft: '1px dashed #cbd5e1' }} />
              ))}
              {/* 発散バー（中央0→乖離%・width/left 400ms・reduced-motionで無効） */}
              <div style={{ position: 'absolute', top: 6, height: 14, borderRadius: 7, left: `${barL}%`, width: `${barW}%`, background: dirColor, opacity: 0.8,
                transition: reduced ? 'none' : 'left 400ms ease, width 400ms ease, background 300ms ease' }} />
            </div>
            {/* 中央0=全国線（#2563EB 2px実線+上端△ — PrefStrip47のavg語彙） */}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, marginLeft: -1, background: '#2563EB', opacity: 0.85, zIndex: 1 }} />
            <div style={{ position: 'absolute', left: '50%', top: -4, transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '4px solid #2563EB', zIndex: 2 }} />
            {/* ◆ピン県tick（橙・同トラック上の乖離位置 — 域外は端クランプ） */}
            {pinDev != null && (
              <div title={`◆${pinnedPref} ${pinVal.toFixed(1)}%（対全国比${pinDev > 0 ? '+' : ''}${pinDev.toFixed(1)}%）`}
                style={{ position: 'absolute', left: `calc(${xPct(pinDev)}% - 4px)`, top: 9, width: 8, height: 8, background: '#f97316', border: '1px solid #c2410c', transform: 'rotate(45deg)', zIndex: 3 }} />
            )}
            {/* 域外クランプ ◂/▸（値は捏造しない — チップ・ツールチップに常時実値） */}
            {clamped && (
              <span style={{ position: 'absolute', [clamped === 'high' ? 'right' : 'left']: -2, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, color: '#1e293b', zIndex: 3 }}>{clamped === 'high' ? '▸' : '◂'}</span>
            )}
            {/* tierことばチップ（バー先端併置・±5/±15のことばスケール） */}
            {t && <span style={{ position: 'absolute', top: '50%', ...tierChipStyle, fontSize: 8.5, fontWeight: 700, color: t.color, background: '#fff', border: `1px solid ${t.color}55`, borderRadius: 3, padding: '0 4px', lineHeight: '13px', whiteSpace: 'nowrap', zIndex: 2, pointerEvents: 'none' }}>{mob ? t.short : t.label}</span>}
            {/* hover=濃紺ツールチップ（実値/全国/Δpt/対全国比/47県中順位/年度） */}
            {qHoverKey === key && !mob && (
              <div style={{ position: 'absolute', left: '50%', top: -6, transform: 'translate(-50%,-100%)', background: '#1e293b', color: '#fff', fontSize: 10, lineHeight: 1.5, padding: '5px 8px', borderRadius: 4, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.18)' }}>
                <b>{ndbPref}</b> <span style={{ color: '#93c5fd', fontWeight: 700 }}>{rate.toFixed(1)}%</span>
                <span style={{ color: '#cbd5e1' }}>（全国 {nat.toFixed(1)}%・Δ{delta > 0 ? '+' : ''}{delta.toFixed(1)}pt）</span><br />
                対全国比 {dev > 0 ? '+' : ''}{dev.toFixed(1)}%{clamped ? '（軸域外→端に表示）' : ''} ・ 47県中{rank}位 ・ {badge.label}
              </div>
            )}
          </div>
          {/* 右端: 実値%大数字（useCountUp・tabular-nums）+Δptサブ+人間スケールチップ */}
          <div style={{ width: mob ? 86 : 122, flexShrink: 0, textAlign: 'right', lineHeight: 1.25 }}>
            <div>
              <span style={{ fontSize: mob ? 15 : 17, fontWeight: 800, color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}><CountUpNum value={rate} decimals={1} /></span>
              <span style={{ fontSize: 9, color: '#64748b' }}>%</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: dirColor, marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}pt</span>
            </div>
            <div style={{ fontSize: 8.5, color: '#94a3b8' }}>{chipTxt}</div>
          </div>
        </div>
        {/* click=展開: 質問文原文+PrefStrip47 inline+47県中順位+◆比較行（単一openアコーディオン） */}
        {open && (
          <div style={{ margin: '6px 0 8px 34px', padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #eef2f7' }}>
            <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>Q: {q.question}{q.label && q.label !== q.risk_label ? `（${q.label}）` : ''}</div>
            <PrefStrip47 {...stripCommon} values={sv} natAvg={nat} inverse={inverse} yearBadge={badge} mode="inline" />
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>
              47県中 <b style={{ color: '#334155' }}>{rank}位</b>（1位=最高値）・全国 {nat.toFixed(1)}%・対全国比 <b style={{ color: t ? t.color : '#334155' }}>{dev > 0 ? '+' : ''}{dev.toFixed(1)}%＝{t ? t.label : ''}</b>
            </div>
            {pinVal != null && (
              <div style={{ fontSize: 10, color: '#c2410c', marginTop: 2 }}>
                ◆{pinnedPref} {pinVal.toFixed(1)}%（Δ全国 {(pinVal - nat) > 0 ? '+' : ''}{(pinVal - nat).toFixed(1)}pt・{ndbPref}との差 {(rate - pinVal) > 0 ? '+' : ''}{(rate - pinVal).toFixed(1)}pt）
              </div>
            )}
          </div>
        )}
      </div>);
    };
    return (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
        <span style={{fontSize:18}}>⚠️</span>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>生活習慣・服薬・既往歴 — 県の性格プロファイル
            <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#e0e7ff',color:'#3730a3',fontWeight:500}}>質問票14項目</span>
            <span style={{marginLeft:4,fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:4,color:badge.color,background:badge.color+'1a',border:`1px solid ${badge.color}33`}}>{badge.label}</span>
          </div>
          <div style={{fontSize:11,color:'#94a3b8'}}>特定健診 質問票（40〜74歳受診者の自己申告）— 対全国比%の発散バー・±5/±15のことばゾーン常設</div>
        </div>
      </div>
      {/* 軸ヘッダ（−40%…全国0…+40% リニア軸） */}
      <div style={{display:'flex',alignItems:'center',gap:mob?6:10,marginBottom:2}}>
        <span style={{width:24,flexShrink:0}}/>
        <span style={{width:mob?70:90,flexShrink:0}}/>
        <div style={{flex:1,position:'relative',height:12,fontSize:8.5,color:'#94a3b8',minWidth:80}}>
          <span style={{position:'absolute',left:0}}>−40%</span>
          <span style={{position:'absolute',left:'50%',transform:'translateX(-50%)',color:'#2563EB',fontWeight:700}}>全国=0</span>
          <span style={{position:'absolute',right:0}}>+40%</span>
        </div>
        <span style={{width:mob?86:122,flexShrink:0}}/>
      </div>
      {BANDS.map((band)=>{
        let keys = bandKeys(band.cat);
        if (band.sortable && qSort==='divergence') keys = [...keys].sort((a,b)=>Math.abs(devMap[b]??0)-Math.abs(devMap[a]??0));
        return (
        <div key={band.cat} style={{marginBottom:8}}>
          <div style={{display:'flex',alignItems:'center',gap:8,margin:'8px 0 6px',flexWrap:'wrap'}}>
            <span style={{fontSize:11,fontWeight:700,color:'#334155'}}>{band.label} <span style={{color:'#94a3b8',fontWeight:500}}>{keys.length}項目</span></span>
            <span style={{fontSize:8.5,fontWeight:600,padding:'1px 6px',borderRadius:4,...band.badgeStyle}}>{band.badge}</span>
            {band.sortable && (
              <span style={{marginLeft:'auto',display:'flex',gap:4}}>
                {[['item','項目順'],['divergence','乖離大順']].map(([k,l])=>(
                  <button key={k} onClick={()=>{ setQSort(k); setQExpandedKey(null); /* ソート切替時は展開を閉じる(FLIP文法) */ }}
                    style={{padding:'2px 8px',borderRadius:5,border:`1px solid ${qSort===k?'#9f1239':'#e2e8f0'}`,
                      background:qSort===k?'#9f1239':'#fff',color:qSort===k?'#fff':'#475569',fontSize:10,fontWeight:600,cursor:'pointer'}}>{l}</button>
                ))}
              </span>
            )}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {keys.map((k)=>renderRow(k, band.sortable))}
          </div>
        </div>);
      })}
      <div style={{fontSize:10,color:'#94a3b8',marginTop:10,lineHeight:1.7}}>
        ※軸=対全国比%（−40〜+40固定のリニア軸）。背景の帯=±5/±15の<b>ことばゾーン</b>（標準域/やや高・低/突出高・低）。バー色は生活習慣=<b style={{color:'#dc2626'}}>赤=リスク方向へ乖離</b>/<b style={{color:'#059669'}}>緑=保護方向へ乖離</b>（睡眠充足のみ高=低リスク方向。運動不足率・歩行不足率は高=リスク方向）、服薬・既往歴=<b style={{color:'#9f1239'}}>rose=全国より多い</b>/<b style={{color:'#4338ca'}}>indigo=全国より少ない</b>の中立発散 — <b>服薬・既往は治療負荷・既往の事実で良し悪しの判定対象外</b>。<br/>
        ※40〜74歳特定健診受診者の<b>自己申告</b>（受診者バイアスあり）。低該当率項目（既往歴等）の対全国比%は小さな実数差でも大きく振れます（Δpt併記）。|対全国比|&gt;40%は端に表示（◂/▸マーカー・実値は人数チップとツールチップ）。行クリックで質問文原文と47県分布を展開。◆=比較ピン県。
      </div>
    </div>);
  })()

  );
}
