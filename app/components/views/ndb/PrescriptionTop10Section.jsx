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

export default function PrescriptionTop10Section(props){
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
  ndbRx.length > 0 && <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
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
          {['#','薬効分類','疾患領域','対全国比','処方数量 (参考・単位非統一)'].map((h,i)=>(
            <th key={i} style={{padding:'8px 10px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:i>=4?'right':'left',borderBottom:'1px solid #f1f5f9',whiteSpace:'nowrap'}}>{h}</th>))}
        </tr></thead>
        {/* コピーしてsort: prop配列ndbRxのin-place破壊を回避（手順0(b)） */}
        <tbody>{[...ndbRx].sort((a,b)=>b.qty-a.qty).slice(0,10).map((r,i)=>{
          const domain = DRUG_DOMAIN[r.name]||'';
          const cr = rxShared ? rxShared.classRatio(ndbPref, r.name) : null; // 人口当たり数量の対全国比（単位相殺）
          const ct = cr != null ? tierOf(cr*100-100) : null;
          const rowOpen = rx4bExpanded === r.name;
          return <Fragment key={r.name}>
          <tr onClick={()=>setRx4bExpanded(rowOpen?null:r.name)} style={{borderBottom:rowOpen?'none':'1px solid #f8f9fa',cursor:'pointer',background:rowOpen?'#f8fafc':'transparent',...rxFade(domain)}}>
            <td style={{padding:'7px 10px',color:'#94a3b8',fontSize:11}}>{i+1}</td>
            <td style={{padding:'7px 10px',fontWeight:500}}>{rowOpen?'▾ ':''}{r.name}</td>
            <td style={{padding:'7px 10px'}}>{domain && <span style={{fontSize:10,padding:'2px 8px',borderRadius:10,background:(DOMAIN_COLORS[domain]||'#94a3b8')+'18',color:DOMAIN_COLORS[domain]||'#94a3b8',fontWeight:600}}>{domain}</span>}</td>
            <td style={{padding:'7px 10px',whiteSpace:'nowrap'}}>
              {ct
                ? <span title={`人口当たり数量の対全国比 ×${cr.toFixed(2)}（${(cr*100).toFixed(0)}%・単位は分子分母で相殺）— クリックで47県分布`}
                    style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:12,
                      border:`1px solid ${ct.color}55`,background:`${ct.color}14`,color:ct.color}}>
                    {ct.label}<span style={{fontVariantNumeric:'tabular-nums'}}>{cr*100-100>0?'+':''}{(cr*100-100).toFixed(0)}%</span>
                  </span>
                : <span style={{fontSize:10,color:'#cbd5e1'}}>{rxShared?'—':'…'}</span>}
            </td>
            <td style={{padding:'7px 10px',textAlign:'right',fontWeight:500,color:'#94a3b8',fontVariantNumeric:'tabular-nums'}}>{fmt(r.qty)}</td>
          </tr>
          {/* 行click=当該分類の47県 対全国比ストリップ展開（log2軸・全国100%基準） */}
          {rowOpen && <tr style={{borderBottom:'1px solid #f8f9fa',...rxFade(domain)}}>
            <td colSpan={5} style={{padding:'0 10px 10px'}}>
              {(()=>{ const sv = rxClassStrip(r.name);
                return sv.length >= 40
                  ? <div>
                      <PrefStrip47 {...stripCommon} values={sv} natAvg={100} domain={[40,250]} scale="log2" yearBadge={yb('ndbRx')} mode="inline" />
                      <div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{r.name} — 人口当たり数量の対全国比（%）の47県分布。青破線=全国100%。単位は分子分母で相殺。</div>
                    </div>
                  : <span style={{fontSize:10,color:'#94a3b8'}}>47県分布データ{rxShared?'不足':'を取得中…'}</span>; })()}
            </td>
          </tr>}
          </Fragment>;
        })}</tbody>
      </table>
    </div>
    <div style={{fontSize:10,color:'#94a3b8',marginTop:8,lineHeight:1.6}}>
      ※ 処方数量は薬剤ごとに単位（錠/g/mL）が異なるため<b>参考値（単位非統一）</b>です。県間比較は「対全国比」チップ（同一薬効分類内の人口当たり数量比・単位相殺）をご覧ください。行クリックで47県分布を展開します。
    </div>
  </div>

  );
}
