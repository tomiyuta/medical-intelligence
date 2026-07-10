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

export default function GapFinderSection(props){
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
  ndbQ && vitalStats?.prefectures && (()=>{
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
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>Gap Finder — リスク×結果の不一致観察</div>
          <div style={{fontSize:11,color:'#94a3b8'}}>{tpl.xLabel}（横軸）× {tpl.yLabel}（縦軸） — 47都道府県の地域差・相関係数 r={corr.toFixed(2)}</div>
        </div>
      </div>
      {/* P1-2: 解釈注意 (Gap Finder の不一致観察) */}
      <InterpretationGuard variant="mismatch" compact={true} />
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
  })()

  );
}
