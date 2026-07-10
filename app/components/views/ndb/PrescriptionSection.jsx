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

export default function PrescriptionSection(props){
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
  ndbRx.length > 0 && (()=>{
    const rs = rxShared;
    const badge = yb('ndbRx');
    const reduced = prefersReducedMotion();
    const chipW = mob ? 48 : 88;
    const labelW = mob ? 72 : 100;
    // 共有log2軸写像（受療率フォレストの domain=[40,250] と同一文法・100%=ちょうど中央）
    const LOG_MIN = Math.log2(40), LOG_MAX = Math.log2(250);
    const xPos = (pct) => Math.max(0, Math.min(1, (Math.log2(Math.max(1e-9, pct)) - LOG_MIN) / (LOG_MAX - LOG_MIN))) * 100;
    // 領域行データ（domainAgg=構成分類qty/natQty各合算の比=全国数量加重）
    const rows = [];
    if (rs) {
      // 領域順トグル用の全国数量（安定順・県非依存）
      const domainNatQty = {};
      Object.entries(rs.natTotals).forEach(([name, q]) => { const d = DRUG_DOMAIN[name]; if (d) domainNatQty[d] = (domainNatQty[d] || 0) + q; });
      Object.keys(rs.domainAgg).forEach(dom => {
        const v = rs.domainAgg[dom][ndbPref];
        if (v == null || !isFinite(v)) return;
        const pinV = (pinnedPref && pinnedPref !== ndbPref) ? rs.domainAgg[dom][pinnedPref] : null;
        const classes = Object.keys(rs.natTotals).filter(n => DRUG_DOMAIN[n] === dom)
          .map(n => ({ name: n, ratio: rs.classRatio(ndbPref, n) }))
          .filter(c => c.ratio != null)
          .sort((a, b) => Math.abs(Math.log2(b.ratio)) - Math.abs(Math.log2(a.ratio)));
        rows.push({ dom, pct: v * 100, pinPct: (pinV != null && isFinite(pinV)) ? pinV * 100 : null,
          classes, natQty: domainNatQty[dom] || 0, prefQty: rxDomains[dom] || 0,
          color: DOMAIN_COLORS[dom] || '#64748b' });
      });
      if (rxSort === 'divergence') rows.sort((a, b) => Math.abs(Math.log2(b.pct / 100)) - Math.abs(Math.log2(a.pct / 100)));
      else rows.sort((a, b) => b.natQty - a.natQty);
    }
    // ヘッドライン: 乖離上位領域のことばチップ（±5%閾値・チェリーピッキング回避の全数明示）
    const rxHighs = rows.filter(r => r.pct - 100 >= 5).sort((a, b) => b.pct - a.pct);
    const rxLows = rows.filter(r => r.pct - 100 <= -5).sort((a, b) => a.pct - b.pct);
    const rxTopHighs = rxHighs.slice(0, 3), rxTopLows = rxLows.slice(0, 2);
    const rxStdCount = rows.length - rxHighs.length - rxLows.length;
    const rxRestDiv = (rxHighs.length - rxTopHighs.length) + (rxLows.length - rxTopLows.length);
    const rxChipEl = (r) => {
      const t = tierOf(r.pct - 100);
      return <button key={r.dom} onClick={() => rxJumpToRow(r.dom)}
        title={`${r.dom} 対全国比${r.pct.toFixed(0)}%（人口当たり数量・単位相殺）— クリックで該当行へ`}
        style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:12,
          border:`1px solid ${t.color}55`,background:`${t.color}14`,color:t.color,
          fontSize:mob?10:11,fontWeight:700,cursor:'pointer',maxWidth:mob?130:180}}>
        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.dom}</span>
        <span style={{fontVariantNumeric:'tabular-nums',flexShrink:0}}>{r.pct-100>0?'+':''}{(r.pct-100).toFixed(0)}%</span>
      </button>;
    };
    // ロリポップ・トラック（中央スパイン=全国100%・×0.5/×2破線・域外クランプ◂▸・◆ピン重畳）
    const lolliTrack = (pct, pinPct, color, h, dotR, onTap) => {
      const clampL = pct < 40, clampR = pct > 250;
      const x = xPos(pct);
      const pinX = pinPct != null ? xPos(pinPct) : null;
      const stemL = Math.min(50, x), stemW = Math.abs(x - 50);
      const trans = reduced ? 'none' : 'left 400ms ease, width 400ms ease';
      return (
        <div onClick={onTap} style={{flex:1,position:'relative',height:h,minWidth:mob?90:140,cursor:onTap?'pointer':'default'}}>
          {/* ×0.5 / ×2 目盛破線 */}
          <div style={{position:'absolute',left:'12.2%',top:2,bottom:2,width:0,borderLeft:'1px dashed #e2e8f0'}}/>
          <div style={{position:'absolute',left:'87.8%',top:2,bottom:2,width:0,borderLeft:'1px dashed #e2e8f0'}}/>
          {/* 中央スパイン=全国100%（#2563EB 2px実線+上端△ — PrefStrip47のavg語彙） */}
          <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:2,marginLeft:-1,background:'#2563EB',opacity:0.85}}/>
          <div style={{position:'absolute',left:'50%',top:-1,width:0,height:0,marginLeft:-3.5,borderLeft:'3.5px solid transparent',borderRight:'3.5px solid transparent',borderTop:'4px solid #2563EB'}}/>
          {/* ◆自県⇔ピン県 接続細線 */}
          {pinX != null && <div style={{position:'absolute',top:'50%',height:1,marginTop:-0.5,background:'#f97316',opacity:0.5,
            left:`${Math.min(x,pinX)}%`,width:`${Math.abs(x-pinX)}%`}}/>}
          {/* 茎（スパイン→ドット・領域色30%） */}
          <div style={{position:'absolute',top:'50%',height:3,marginTop:-1.5,borderRadius:2,background:color,opacity:0.3,
            left:`${stemL}%`,width:`${stemW}%`,transition:trans}}/>
          {/* ドット（領域色塗り+白リング） */}
          <div style={{position:'absolute',top:'50%',left:`${x}%`,width:dotR*2,height:dotR*2,
            transform:'translate(-50%,-50%)',borderRadius:'50%',background:color,
            border:'1.5px solid #fff',boxShadow:`0 0 0 1px ${color}66`,transition:trans}}/>
          {/* 域外クランプマーカー（値は捏造しない・実値は右チップ/ツールチップに常時） */}
          {clampL && <span style={{position:'absolute',left:0,top:'50%',transform:'translateY(-50%)',fontSize:9,fontWeight:700,color}}>◂</span>}
          {clampR && <span style={{position:'absolute',right:0,top:'50%',transform:'translateY(-50%)',fontSize:9,fontWeight:700,color}}>▸</span>}
          {/* ◆ピン県（橙中空 — stripのピン語彙） */}
          {pinX != null && <div title={pinnedPref ? `◆${pinnedPref}` : undefined}
            style={{position:'absolute',top:'50%',left:`${pinX}%`,width:8,height:8,
            transform:'translate(-50%,-50%) rotate(45deg)',background:'#fff',
            border:'1.5px solid #f97316',boxShadow:'0 0 0 1px #c2410c33'}}/>}
        </div>
      );
    };
    return <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap'}}>
      <span style={{fontSize:18}}>💊</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>処方個性ダイアグラム — 疾患領域別
          <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fef3c7',color:'#92400e',fontWeight:500}}>治療代理</span>
          <span style={{marginLeft:6,fontSize:8.5,fontWeight:700,padding:'1px 5px',borderRadius:3,border:`1px solid ${badge.color}`,color:badge.color,background:'#fff'}}>{badge.label}</span>
          {pinnedPref && pinnedPref !== ndbPref && (
            <span title="他セクションで立てた◆ピンによる比較モードです（解除は◆ピンから）"
              style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fff7ed',color:'#c2410c',border:'1px solid #fdba74',fontWeight:600}}>◆ {pinnedPref}と比較中</span>
          )}
        </div>
        <div style={{fontSize:11,color:'#94a3b8'}}>同一薬効分類内の<b>人口当たり数量の対全国比</b>（単位は分子分母で相殺）— 中央=全国100%</div>
      </div>
      {/* ソートトグル（FLIP: 行はtranslateYのみで滑走） */}
      <div style={{display:'flex',gap:0,border:'1px solid #e2e8f0',borderRadius:6,overflow:'hidden',flexShrink:0}}>
        {[['divergence','乖離大順'],['domain','領域順']].map(([k,l])=>(
          <button key={k} onClick={()=>{ setRxSort(k); setRxExpanded(null); /* ソート切替時は展開を閉じる(FLIP文法) */ }}
            style={{padding:'4px 10px',border:'none',background:rxSort===k?'#475569':'#fff',color:rxSort===k?'#fff':'#475569',fontSize:11,fontWeight:600,cursor:'pointer'}}>{l}</button>
        ))}
      </div>
    </div>
    {activeDomain && dm && !DOMAIN_TO_RX_LABEL[activeDomain] && (
      <div style={{fontSize:10,color:'#b45309',marginBottom:8,padding:'5px 8px',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:5,lineHeight:1.5}}>
        ⚠ <b>{dm.label}</b> の医療利用（処方proxy）断面は<b>未整備</b>です{dm.utilizationNote?`: ${dm.utilizationNote}`:''}。この縦串に対応する薬効領域行がありません（全行を退色表示）。
      </div>
    )}
    {!rs && <div style={{fontSize:11,color:'#94a3b8',padding:'14px 0'}}>47都道府県の処方データを取得中…（取得できない場合、対全国比は表示できません）</div>}
    {rs && rows.length > 0 && <>
    {/* ヘッドライン — 乖離上位領域のことばチップ（click→該当行へスクロール+フラッシュ） */}
    <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',fontSize:mob?12:14,fontWeight:700,color:'#1e293b',margin:'0 0 10px'}}>
      <span style={{flexShrink:0}}>{ndbPref}の処方個性 —</span>
      {rxTopHighs.length === 0 && rxTopLows.length === 0
        ? <span style={{color:'#64748b'}}>際立つ乖離のない全国平均型</span>
        : <>
            {rxTopHighs.map(rxChipEl)}
            {rxTopLows.map(rxChipEl)}
            <span style={{fontSize:mob?10:11,fontWeight:600,color:'#94a3b8'}}>
              {rxRestDiv > 0
                ? `/ ほか乖離${rxRestDiv}領域・標準域(±5%以内)は${rxStdCount}領域`
                : `/ 残る${rxStdCount}領域は標準域(±5%以内)`}
            </span>
          </>}
    </div>
    {/* 共有log2軸ヘッダ（×0.5 / 100% / ×2 — 受療率フォレストと同一の背骨） */}
    <div style={{display:'flex',alignItems:'center',gap:mob?6:10,marginBottom:2}}>
      <span style={{width:labelW,flexShrink:0,fontSize:8,color:'#cbd5e1',textAlign:'right',overflow:'hidden',whiteSpace:'nowrap'}}>対全国比(共有log2軸)</span>
      <div style={{flex:1,minWidth:mob?90:140,position:'relative',height:11,fontSize:8,color:'#94a3b8'}}>
        <span style={{position:'absolute',left:'12.2%',transform:'translateX(-50%)'}}>×0.5</span>
        <span style={{position:'absolute',left:'50%',transform:'translateX(-50%)',color:'#2563EB',fontWeight:600}}>100%</span>
        <span style={{position:'absolute',left:'87.8%',transform:'translateX(-50%)'}}>×2</span>
      </div>
      <span style={{width:chipW,flexShrink:0}}/>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:2}}>
      {rows.map(r => {
        const dev = r.pct - 100;
        const t = tierOf(dev);
        const expanded = rxExpanded === r.dom;
        const hovered = rxHoverKey === r.dom;
        return <div key={r.dom} ref={el => { rxRowRefs.current[r.dom] = el; }}
          onMouseEnter={mob ? undefined : () => setRxHoverKey(r.dom)}
          onMouseLeave={mob ? undefined : () => setRxHoverKey(prev => prev === r.dom ? null : prev)}
          style={{padding:'2px 0',borderRadius:6,position:'relative',
            background: rxFlashKey===r.dom ? '#fbcfe8' : expanded ? '#f8fafc' : hovered ? '#f1f5f9' : 'transparent',
            transition:'background 400ms ease', ...rxFade(r.dom)}}>
          <div style={{display:'flex',alignItems:'center',gap:mob?6:10}}>
            <span onClick={()=>setRxExpanded(expanded?null:r.dom)} title={`${r.dom} — クリックで薬効分類別に展開`}
              style={{width:labelW,fontSize:mob?11:12,fontWeight:600,color:r.color,flexShrink:0,cursor:'pointer',
                overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {expanded?'▾ ':''}{r.dom}
            </span>
            {lolliTrack(r.pct, r.pinPct, r.color, 22, 6,
              mob ? (e)=>{ e.stopPropagation(); setRxHoverKey(prev => prev===r.dom?null:r.dom); } : ()=>setRxExpanded(expanded?null:r.dom))}
            {/* tierOfことばチップ+実値%（域外クランプ時も実値を常時表示） */}
            <span title={`対全国比 ${r.pct.toFixed(0)}%（全国との差 ${dev>0?'+':''}${dev.toFixed(1)}%）`}
              style={{width:chipW,flexShrink:0,display:'flex',flexDirection:'column',alignItems:'flex-end',justifyContent:'center',lineHeight:1.15}}>
              <span style={{fontSize:mob?9:10,fontWeight:700,color:t.color}}>{mob?t.short:t.label}</span>
              <span style={{fontSize:9,fontWeight:600,color:'#94a3b8',fontVariantNumeric:'tabular-nums'}}><CountUpNum value={dev} signed suffix="%" /></span>
            </span>
          </div>
          {/* 濃紺ツールチップ（hover / mob 1タップ=情報） */}
          {hovered && (
            <div style={{position:'absolute',left:'50%',top:-4,transform:'translate(-50%,-100%)',zIndex:30,
              background:'#1e293b',color:'#fff',fontSize:10,lineHeight:1.5,padding:'5px 8px',
              borderRadius:4,whiteSpace:'nowrap',pointerEvents:'none',boxShadow:'0 2px 6px rgba(0,0,0,0.18)'}}>
              <div><b>{r.dom}</b> <span style={{color:'#93c5fd',fontWeight:700}}>対全国比 ×{(r.pct/100).toFixed(2)}</span>
                <span style={{color:'#cbd5e1'}}>（{r.pct.toFixed(0)}%・{t.label}・{badge.label}）</span></div>
              <div style={{color:'#cbd5e1'}}>構成{r.classes.length}分類の全国数量加重集約／{ndbPref}生数量 {fmt(r.prefQty)}<span style={{color:'#94a3b8'}}>（単位混在・参考）</span></div>
              {r.pinPct != null && <div style={{color:'#fdba74'}}>◆{pinnedPref} ×{(r.pinPct/100).toFixed(2)}（{r.pinPct.toFixed(0)}%）</div>}
            </div>
          )}
          {/* click=展開: 分類別ロリポップ（同軸・領域色op0.6）+ 領域47県比ストリップ */}
          {expanded && <div style={{margin:`4px 0 6px ${mob?12:24}px`,padding:'8px 10px',background:'#fff',borderRadius:6,border:'1px solid #f1f5f9'}}>
            <div style={{fontSize:10,color:'#64748b',marginBottom:4}}>
              {r.dom} — 構成{r.classes.length}薬効分類（対全国比・乖離大順）。<b>分類展開が一次情報</b>で、領域値は全国数量加重の参考集約です。
            </div>
            {(()=>{ const domStrip = Object.entries(rs.domainAgg[r.dom]).filter(([p])=>isP47(p)).map(([p,v])=>({pref:p,value:v*100}));
              return domStrip.length >= 40 && <div style={{marginBottom:6}}>
                <PrefStrip47 {...stripCommon} values={domStrip} natAvg={100} domain={[40,250]} scale="log2" yearBadge={badge} mode="inline" />
                <div style={{fontSize:9,color:'#94a3b8',marginTop:1}}>領域全体の47県分布（対全国比%・log2軸）</div>
              </div>; })()}
            <div style={{display:'flex',flexDirection:'column',gap:1}}>
              {r.classes.map(c => {
                const cpct = c.ratio * 100, cdev = cpct - 100, ct = tierOf(cdev);
                return <div key={c.name} style={{display:'flex',alignItems:'center',gap:mob?6:10}}
                  title={`${c.name} 対全国比 ×${c.ratio.toFixed(2)}（${cpct.toFixed(0)}%・人口当たり数量・単位相殺）`}>
                  <span style={{width:mob?96:150,fontSize:10,color:'#475569',flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</span>
                  <div style={{flex:1,position:'relative',height:14,minWidth:mob?70:120}}>
                    <div style={{position:'absolute',left:'50%',top:1,bottom:1,width:0,marginLeft:-0.5,borderLeft:'1px solid #2563EB',opacity:0.5}}/>
                    <div style={{position:'absolute',top:'50%',height:2,marginTop:-1,borderRadius:1,background:r.color,opacity:0.25,
                      left:`${Math.min(50,xPos(cpct))}%`,width:`${Math.abs(xPos(cpct)-50)}%`,transition:reduced?'none':'left 400ms ease, width 400ms ease'}}/>
                    <div style={{position:'absolute',top:'50%',left:`${xPos(cpct)}%`,width:8,height:8,transform:'translate(-50%,-50%)',
                      borderRadius:'50%',background:r.color,opacity:0.6,border:'1px solid #fff',transition:reduced?'none':'left 400ms ease'}}/>
                    {cpct < 40 && <span style={{position:'absolute',left:0,top:'50%',transform:'translateY(-50%)',fontSize:8,fontWeight:700,color:r.color}}>◂</span>}
                    {cpct > 250 && <span style={{position:'absolute',right:0,top:'50%',transform:'translateY(-50%)',fontSize:8,fontWeight:700,color:r.color}}>▸</span>}
                  </div>
                  <span style={{width:chipW,flexShrink:0,fontSize:9,fontWeight:700,color:ct.color,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>
                    {mob?ct.short:ct.label} {cdev>0?'+':''}{cdev.toFixed(0)}%
                  </span>
                </div>;
              })}
            </div>
          </div>}
        </div>;
      })}
    </div>
    {/* ことばスケール凡例（5スウォッチ・常設） */}
    <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:mob?6:10,fontSize:9,color:'#94a3b8',marginTop:8}}>
      {FP_TIERS.map(tt => (
        <span key={tt.label} style={{display:'inline-flex',alignItems:'center',gap:3}}>
          <svg width={10} height={10} style={{flexShrink:0}}><rect x={1} y={1} width={8} height={8} rx={2} fill={tt.color}/></svg>
          {tt.label}
        </span>
      ))}
      <span style={{fontWeight:600}}>※処方量の高低は良し悪しではありません</span>
    </div>
    </>}
    <div style={{fontSize:10,color:'#94a3b8',marginTop:10,lineHeight:1.6}}>
      ※ 処方数量は薬剤ごとに単位（錠/g/mL）が異なり、<b>絶対量の県間比較はできません</b>。本図は同一薬効分類内の<b>人口当たり数量の対全国比</b>のみを表示します（単位は分子分母で相殺）。
      領域値は構成分類の全国数量加重集約=<b>参考値</b>で、分類展開が一次情報です。疾患領域は薬効分類からの推定です。
      人口分母は住基2025-01-01（令和5年度レセプトと年次は一致しません）。元データに抗うつ剤・副腎皮質ホルモン剤・腎臓ホルモン剤が存在しないため、精神・神経などの領域は不完全です。
    </div>
  </div>;
  })()

  );
}
