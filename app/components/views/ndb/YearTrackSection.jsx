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

export default function YearTrackSection(props){
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
  diagByPref.length > 0 && (()=>{
    // レーン順=A→B→Cのカテゴリ固定順（従来のtotal_claims降順は県により入替わり
    // ヒーローのレーン順と不一致を起こすため廃止。in-place sortも回避）
    const RHYTHM_CATS = ['A_初再診料','B_医学管理等','C_在宅医療'];
    const diagOrdered = RHYTHM_CATS.map(c=>diagByPref.find(x=>x.category===c)).filter(Boolean);
    const rhythmLanes = diagOrdered.map(d => {
      const cat = d.category;
      const u = DIAG_UNIT[cat] || { div: 100000, denom: '県民1人あたり・年', unit: '回/人・年', dec: 1 };
      const per100k = prefMaps.diag[ndbPref]?.[cat] ?? null;
      const nat100k = prefMaps.diagNat?.[cat] ?? null;
      if (per100k == null || nat100k == null || nat100k <= 0) return null;
      const hv = (hoverPref && hoverPref !== ndbPref) ? (prefMaps.diag[hoverPref]?.[cat] ?? null) : null;
      const pv = (pinnedPref && pinnedPref !== ndbPref) ? (prefMaps.diag[pinnedPref]?.[cat] ?? null) : null;
      const rank = 1 + Object.entries(prefMaps.diag).filter(([p])=>isP47(p)).filter(([,m])=>m[cat]!=null && m[cat]>per100k).length;
      return {
        key: cat, label: CAT_LABELS[cat]||cat,
        value: per100k/u.div, natValue: nat100k/u.div,
        hoverValue: hv != null ? hv/u.div : null, pinnedValue: pv != null ? pv/u.div : null,
        unit: u.unit, denomBadge: u.denom, rank,
        sep: cat === 'C_在宅医療', // 分母が違う（10人あたり）→区切り+淡色帯でA/Bと別群を明示
        reframe: cat === 'C_在宅医療' ? `県内で1日${fmt(Math.round(d.total_claims/365))}件` : null,
      };
    }).filter(Boolean);
    return <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16,...sectionFade}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <span style={{fontSize:18}}>🏥</span>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>医療利用 <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#cffafe',color:'#155e75',fontWeight:500}}>医療利用量</span>{activeDomain && <span style={{marginLeft:6,fontSize:9,color:'#94a3b8',fontWeight:500}}>（診療行為カテゴリ・疾患縦串の対象外）</span>}</div>
        <div style={{fontSize:11,color:'#94a3b8'}}>医科診療行為 算定回数（令和5年度レセプト）</div>
      </div>
    </div>
    {/* ヒーロー: 県民の1年 — 受診リズム（hoverPref同期モーフ・◆ピン行・均等割り模式バッジ常設） */}
    {rhythmLanes.length > 0 && (
      <YearRhythmTrack lanes={rhythmLanes} mob={mob} prefName={ndbPref}
        hoverPrefName={hoverPref && hoverPref !== ndbPref ? hoverPref : null}
        pinnedName={pinnedPref} yearBadge={yb('ndbDiag')} />
    )}
    <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(3,1fr)',gap:10}}>
      {diagOrdered.map((d)=>{
        // rank1: 人口10万対の47県分布（判別不可除外・prefMaps.diag は既に人口正規化済）
        const diagStrip = Object.entries(prefMaps.diag).filter(([p])=>isP47(p))
          .map(([p,m])=>({pref:p, value:m[d.category]})).filter(x=>x.value!=null);
        // 人間換算: per100k(=diag) ÷ DIAG_UNIT.div。全国値は diagNat（人口加重・isP47・
        // 47県単純平均でない — strip natAvg ズレ修正を含む）
        const per100k = prefMaps.diag[ndbPref]?.[d.category] ?? null;
        const nat100k = prefMaps.diagNat?.[d.category] ?? null;
        const u = DIAG_UNIT[d.category] || { div: 100000, denom: '県民1人あたり・年', unit: '回/人・年', dec: 1 };
        const disp = per100k != null ? per100k / u.div : null;
        const dispNat = (nat100k != null && nat100k > 0) ? nat100k / u.div : null;
        const pin100k = (pinnedPref && pinnedPref !== ndbPref) ? (prefMaps.diag[pinnedPref]?.[d.category] ?? null) : null;
        const dispPin = pin100k != null ? pin100k / u.div : null;
        const ratioPct = (per100k != null && nat100k > 0) ? (per100k / nat100k - 1) * 100 : null;
        const t = ratioPct != null ? tierOf(ratioPct) : null;
        const rank = per100k != null ? 1 + diagStrip.filter((x) => x.value > per100k).length : null;
        // 生活感覚リフレーム（人間換算の参考表現・実値はジャンボ数字とツールチップが正）
        const reframe = disp == null ? null
          : d.category === 'A_初再診料' ? `≒ 月${(disp / 12).toFixed(1)}回の外来受診`
          : d.category === 'B_医学管理等' ? (disp > 0 ? `≒ ${(52 / disp).toFixed(1)}週間に1回` : null)
          : d.category === 'C_在宅医療' ? `≒ 県内で1日${fmt(Math.round(d.total_claims / 365))}件` : null;
        return (
        <div key={d.category} style={{background:'#f0f7ff',borderRadius:10,padding:'12px 16px'}}>
          {/* ラベル行 + tierことばチップ + 全国比%（rose/indigo中立発散 — 高低は良し悪しでない） */}
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
            <span style={{fontSize:11,color:'#64748b'}}>{CAT_LABELS[d.category]||d.category}</span>
            {t && <span title={`全国比${ratioPct>0?'+':''}${ratioPct.toFixed(1)}%＝${t.label}（±5/±15%のことばスケール）。高低は良し悪しではありません`}
              style={{marginLeft:'auto',display:'inline-flex',alignItems:'center',gap:4,flexShrink:0}}>
              <span style={{fontSize:9,fontWeight:700,color:t.color,padding:'1px 5px',borderRadius:4,background:t.color+'14',border:`1px solid ${t.color}33`}}>{t.label}</span>
              <span style={{fontSize:9,fontWeight:600,color:'#94a3b8',fontVariantNumeric:'tabular-nums'}}><CountUpNum value={ratioPct} decimals={1} signed suffix="%" /></span>
            </span>}
          </div>
          {/* ジャンボ数字（人間換算・色に価値判断を語らせない#1e293b） */}
          {disp != null && <div style={{display:'flex',alignItems:'baseline',gap:5,flexWrap:'wrap'}}>
            <span style={{fontSize:mob?26:32,fontWeight:800,color:'#1e293b',fontVariantNumeric:'tabular-nums',lineHeight:1.1}}>
              <CountUpNum value={disp} decimals={u.dec} />
            </span>
            <span style={{fontSize:12,fontWeight:700,color:'#475569'}}>回</span>
            <span style={{fontSize:10,color:'#94a3b8'}}>{u.denom}</span>
          </div>}
          {reframe && <div style={{fontSize:10,color:'#64748b',marginTop:1}}>{reframe}</div>}
          {/* カードは「数値正+分布」に純化 — 1ドット=1回の語彙はヒーロー(イヤートラック)が
              時間軸付きで上位互換継承（同一値のドット表現が2箇所並ぶと一目性が希釈されるため
              カード内UnitDotLaneは撤去。UnitDotLane部品コード自体は他区画流用可能な確立部品として残置） */}
          {/* 従来値（生値残置 — 換算値の独り歩き防止・10px二次情報） */}
          <div style={{fontSize:10,color:'#94a3b8',marginTop:6}}>総算定 {fmt(d.total_claims)}回 ・ 人口10万対 {perCap(d.total_claims)}</div>
          {diagStrip.length >= 40 && <div style={{marginTop:6}}><PrefStrip47 {...stripCommon} values={diagStrip} natAvg={nat100k} yearBadge={yb('ndbDiag')} mode="inline" /></div>}
        </div>
        );
      })}
    </div>
    <div style={{fontSize:9,color:'#94a3b8',marginTop:10,lineHeight:1.7}}>
      ※ NDBは<b>医療機関所在地ベースの供給側集計</b>です。人口10万対・人間換算は住民人口（住基2025-01-01）で除した<b>参考値</b>で、受診流出入・審査集計仕様の影響を含みます（分子=令和5年度レセプト・分母人口の年次は一致しません）。
      換算の分母はカテゴリで異なります（外来受診・慢性疾患管理=<b>県民1人あたり</b>／在宅医療=<b>県民10人あたり</b> — リズムのドット密度をレーン間で比較しないでください）。<b>高低は良し悪しではありません</b>。
      リズム凡例: <span style={{color:'#64748b'}}>●=受診1回（年間総数の<b>均等割り模式</b>・端数は部分塗り）</span>・<span style={{color:'#2563EB'}}>◌破線=全国ゴースト行</span>・<span style={{color:'#c2410c'}}>◆=ピン県</span>。実際の月次・季節分布はデータに存在しません。実値は常にツールチップ（小数1桁）。
      週数の色は<span style={{color:'#9f1239'}}>rose=全国より間隔が短い（多い）</span>／<span style={{color:'#4338ca'}}>indigo=長い（少ない）</span>の中立発散です。
    </div>
  </div>;
  })()

  );
}
