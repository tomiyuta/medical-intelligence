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

export default function PopulationKpiSection(props){
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
  demoKpi && (
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
      {/* ヒーロー2/3（ゴースト・ミラーピラミッド）+ KPIレール1/3 — mob=縦積み（ピラミッド上） */}
      <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'minmax(0,2fr) minmax(0,1fr)',gap:mob?12:18,alignItems:'start'}}>
        <div style={{minWidth:0}}>
          <AgePyramidGhost
            ap={agePyramid?.prefectures?.[ndbPref]}
            natAp={agePyramid?.national}
            pinnedAp={pinnedPref && pinnedPref!==ndbPref && isP47(pinnedPref) ? (agePyramid?.prefectures?.[pinnedPref] || null) : null}
            pinnedName={pinnedPref && pinnedPref!==ndbPref && isP47(pinnedPref) && agePyramid?.prefectures?.[pinnedPref] ? pinnedPref : null}
            ageGroups={agePyramid?.age_groups || []}
            prefName={ndbPref}
            tlBands={tlBands}
            tlYear={tlYear}
            mob={mob}
            onZoneClick={()=>setDumbbellOpen(o=>!o)}
            yearBadges={{pyramid: yb('agePyramid'), ribbon: yb('futureDemo')}}
          />
          {/* 解釈文（自動生成・ピラミッド直下 — 形状言及を追記） */}
          {demoNat && (()=>{
            const d75 = demoKpi.rate75 - demoNat.rate75;
            let msg, shape;
            if (d75 > 1.5) { msg = `${ndbPref}は75歳以上割合が全国平均より${d75.toFixed(1)}pt高く、在宅医療・処方薬・慢性期医療の需要が大きく見えやすい構造です。`; shape = 'ピラミッド上部（75+帯）が全国輪郭からはみ出す「頭でっかち」の形状です。'; }
            else if (d75 < -1.5) { msg = `${ndbPref}は75歳以上割合が全国平均より${Math.abs(d75).toFixed(1)}pt低く、NDB算定回数の多さは人口規模の影響を受けている可能性があります。`; shape = 'ピラミッド上部は全国輪郭より薄く、生産年齢帯が厚い形状です。'; }
            else { msg = `${ndbPref}の75歳以上割合は全国平均水準。NDB指標は人口構造補正の影響を受けにくい解釈となります。`; shape = 'ピラミッドの形状はほぼ全国輪郭と重なります。'; }
            return <div style={{fontSize:11,color:'#475569',marginTop:10,padding:'8px 12px',background:'#f8fafc',borderRadius:6,lineHeight:1.5,borderLeft:'3px solid #2563EB'}}>💡 {msg} {shape}</div>;
          })()}
        </div>
        {/* KPIレール（既存5カード移設・縦積み密度減 padding 10→7px。demoStrips/stripCommon/yb 呼び出しは無変更） */}
        <div style={{display:'grid',gridTemplateColumns:mob?'repeat(2,1fr)':'1fr',gap:8,minWidth:0}}>
          {/* 1: 総人口 */}
          <div style={{background:'#f8fafc',borderRadius:8,padding:'7px 12px'}}>
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:6,flexWrap:'wrap'}}>
              <div style={{fontSize:10,color:'#64748b'}}>総人口 <span style={{fontSize:9,color:'#94a3b8'}}>2025年1月（人）</span></div>
              <div style={{fontSize:mob?15:16,fontWeight:700,color:'#1e293b'}}>{fmt(demoKpi.total)}</div>
            </div>
            {demoStrips.total.length >= 40 && <div style={{marginTop:5}}><PrefStrip47 {...stripCommon} values={demoStrips.total} yearBadge={yb('agePyramid')} mode="micro" /></div>}
          </div>
          {/* 2: 65+ */}
          <div style={{background:'#f8fafc',borderRadius:8,padding:'7px 12px'}}>
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:6,flexWrap:'wrap'}}>
              <div style={{fontSize:10,color:'#64748b'}}>65歳以上</div>
              <div style={{fontSize:mob?15:16,fontWeight:700,color:'#1e293b'}}><CountUpNum value={demoKpi.rate65} decimals={1} suffix="%" /></div>
            </div>
            {demoNat && <div style={{fontSize:10,color:demoKpi.rate65>demoNat.rate65?'#dc2626':'#059669'}}>
              全国比 {demoKpi.rate65>demoNat.rate65?'+':''}{(demoKpi.rate65-demoNat.rate65).toFixed(1)}pt
            </div>}
            {demoStrips.r65.length >= 40 && <div style={{marginTop:5}}><PrefStrip47 {...stripCommon} values={demoStrips.r65} natAvg={demoNat?.rate65} yearBadge={yb('agePyramid')} mode="micro" /></div>}
          </div>
          {/* 3: 75+ */}
          <div style={{background:'#f8fafc',borderRadius:8,padding:'7px 12px'}}>
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:6,flexWrap:'wrap'}}>
              <div style={{fontSize:10,color:'#64748b'}}>75歳以上 {rank75 && <span style={{fontSize:9,color:'#94a3b8'}}>#{rank75.rank}/{rank75.total}</span>}</div>
              <div style={{fontSize:mob?15:16,fontWeight:700,color:'#1e293b'}}><CountUpNum value={demoKpi.rate75} decimals={1} suffix="%" /></div>
            </div>
            {demoNat && <div style={{fontSize:10,color:demoKpi.rate75>demoNat.rate75?'#dc2626':'#059669'}}>
              全国比 {demoKpi.rate75>demoNat.rate75?'+':''}{(demoKpi.rate75-demoNat.rate75).toFixed(1)}pt
            </div>}
            {demoStrips.r75.length >= 40 && <div style={{marginTop:5}}><PrefStrip47 {...stripCommon} values={demoStrips.r75} natAvg={demoNat?.rate75} yearBadge={yb('agePyramid')} mode="micro" /></div>}
          </div>
          {/* 4: 85+ */}
          <div style={{background:'#f8fafc',borderRadius:8,padding:'7px 12px'}}>
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:6,flexWrap:'wrap'}}>
              <div style={{fontSize:10,color:'#64748b'}}>85歳以上</div>
              <div style={{fontSize:mob?15:16,fontWeight:700,color:'#1e293b'}}><CountUpNum value={demoKpi.rate85} decimals={1} suffix="%" /></div>
            </div>
            {demoNat && <div style={{fontSize:10,color:demoKpi.rate85>demoNat.rate85?'#dc2626':'#059669'}}>
              全国比 {demoKpi.rate85>demoNat.rate85?'+':''}{(demoKpi.rate85-demoNat.rate85).toFixed(1)}pt
            </div>}
            {demoStrips.r85.length >= 40 && <div style={{marginTop:5}}><PrefStrip47 {...stripCommon} values={demoStrips.r85} natAvg={demoNat?.rate85} yearBadge={yb('agePyramid')} mode="micro" /></div>}
          </div>
          {/* 5: 2050（推計 — CountUpNumは使わない: 実測と推計を同じ運動文法で混ぜない） */}
          <div style={{background:'#fef3c7',borderRadius:8,padding:'7px 12px'}}>
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:6,flexWrap:'wrap'}}>
              <div style={{fontSize:10,color:'#92400e'}}>2050年予測</div>
              <div style={{fontSize:mob?15:16,fontWeight:700,color:'#92400e'}}>
                {demoKpi.change2050!=null ? `${demoKpi.change2050>0?'+':''}${demoKpi.change2050.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div style={{fontSize:10,color:'#92400e'}}>
              {demoKpi.rate75_2050!=null ? `75+→${demoKpi.rate75_2050.toFixed(1)}%` : '人口変化(2020比)'}
            </div>
            {demoStrips.chg.length >= 40 && <div style={{marginTop:5}}><PrefStrip47 {...stripCommon} values={demoStrips.chg} yearBadge={yb('futureDemo')} mode="micro" /></div>}
          </div>
        </div>
      </div>

      {/* ══ rank9: 人口タイムレンズ（2020-2050スクラバー・3帯モーフィング・47県ダンベル） ══ */}
      {tlBands && (()=>{
        const isFut = tlYear !== '2025';
        const TL_XL = 24, TL_XR = 676, TL_SPAN = TL_XR - TL_XL;
        const tickX = (i) => TL_XL + i * (TL_SPAN / (DEMO_YEARS.length - 1));
        const idxFromClientX = (clientX) => {
          if (!tlRef.current) return tlIdx;
          const rect = tlRef.current.getBoundingClientRect();
          const x = ((clientX - rect.left) / rect.width) * 700;
          const i = Math.round((x - TL_XL) / (TL_SPAN / (DEMO_YEARS.length - 1)));
          return Math.max(0, Math.min(DEMO_YEARS.length - 1, i));
        };
        const setByClientX = (cx) => setFutureYear(DEMO_YEARS[idxFromClientX(cx)]);
        const BANDS = [
          { key: 'b064', label: '0-64', color: '#e2e8f0', tcol: '#475569', v: tlBands.b064 },
          { key: 'b6574', label: '65-74', color: '#fcd34d', tcol: '#78350f', v: tlBands.b6574 },
          { key: 'b75', label: '75+', color: '#f59e0b', tcol: '#7c2d12', v: tlBands.b75 },
        ];
        return (
        <div style={{marginTop:14,padding:'14px 16px',borderRadius:10,transition:'background 400ms ease',
          background:isFut?'#fffbeb':'#f8fafc',border:'1px solid '+(isFut?'#fde68a':'#eef2f7')}}>
          {/* ヘッダ + 系列バッジ */}
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:10}}>
            <span style={{fontSize:13,fontWeight:700,color:'#1e293b'}}>⏳ 人口タイムレンズ</span>
            <span style={{fontSize:10,color:'#94a3b8'}}>2020 → 2050 の高齢化ドリフト</span>
            {isFut
              ? <span style={{fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#f59e0b',color:'#fff'}}>参考推計（社人研）</span>
              : <span style={{fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#dbeafe',color:'#1e40af'}}>2025基準（社人研推計・住基実測▲重畳）</span>}
          </div>
          {/* スクラバー（カスタムSVG・7目盛スナップ / ドラッグ / ←→キー / 再生） */}
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <button onClick={tlToggle}
              aria-label={tlPlaying?'停止':'再生'} style={{flex:'0 0 auto',width:30,height:30,borderRadius:15,border:'1px solid '+(isFut?'#fbbf24':'#cbd5e1'),
              background:'#fff',cursor:'pointer',color:'#f59e0b',fontSize:12,fontWeight:700,lineHeight:1}}>{tlPlaying?'⏸':'▶'}</button>
            <div tabIndex={0} role="slider" aria-valuemin={0} aria-valuemax={DEMO_YEARS.length-1} aria-valuenow={tlIdx} aria-valuetext={tlYear+'年'}
              onKeyDown={(e)=>{ if(e.key==='ArrowRight'){e.preventDefault(); if(tlIdx<DEMO_YEARS.length-1) setFutureYear(DEMO_YEARS[tlIdx+1]);}
                else if(e.key==='ArrowLeft'){e.preventDefault(); if(tlIdx>0) setFutureYear(DEMO_YEARS[tlIdx-1]);} }}
              style={{flex:1,outline:'none',cursor:'pointer',touchAction:'none'}}>
              <svg ref={tlRef} viewBox="0 0 700 48" width="100%" style={{display:'block',userSelect:'none'}}
                onPointerDown={(e)=>{ tlDrag.current=true; try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}; setByClientX(e.clientX); }}
                onPointerMove={(e)=>{ if(tlDrag.current) setByClientX(e.clientX); }}
                onPointerUp={()=>{ tlDrag.current=false; }} onPointerLeave={()=>{ tlDrag.current=false; }}>
                <line x1={TL_XL} y1={20} x2={TL_XR} y2={20} stroke="#e2e8f0" strokeWidth={3} strokeLinecap="round" />
                <line x1={tickX(1)} y1={20} x2={tickX(tlIdx)} y2={20} stroke="#f59e0b" strokeWidth={3} strokeLinecap="round" style={{transition:'x2 300ms ease'}} />
                {DEMO_YEARS.map((y,i)=>{
                  const cx=tickX(i), on=i===tlIdx;
                  const col = y==='2025' ? '#2563EB' : (y==='2020' ? '#94a3b8' : '#f59e0b');
                  return (
                    <g key={y} onClick={()=>setFutureYear(y)} style={{cursor:'pointer'}}>
                      <circle cx={cx} cy={20} r={on?7:4} fill={on?col:'#fff'} stroke={col} strokeWidth={2} style={{transition:'r 150ms ease'}} />
                      {y==='2025' && <text x={cx} y={44} textAnchor="middle" fontSize={7} fill="#2563EB" fontWeight={700}>住基実測</text>}
                      <text x={cx} y={y==='2025'?37:37} textAnchor="middle" fontSize={9.5} fontWeight={on?700:400} fill={on?'#1e293b':'#94a3b8'}>{y}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
          {/* 選択年 KPI（モーフィング更新） */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,margin:'6px 0 10px'}}>
            {[['総人口', tlBands.pop!=null?fmt(tlBands.pop):'—', '人'],
              ['65歳以上', tlBands.r65.toFixed(1)+'%', tlJusaki?`住基実測 ${tlJusaki.r65.toFixed(1)}%`:''],
              ['75歳以上', tlBands.r75.toFixed(1)+'%', tlJusaki?`住基実測 ${tlJusaki.r75.toFixed(1)}%`:'']
            ].map(([lab,val,sub],i)=>(
              <div key={i} style={{background:'#fff',borderRadius:8,padding:'8px 10px',border:'1px solid #f1f5f9'}}>
                <div style={{fontSize:10,color:'#64748b'}}>{lab} <span style={{fontSize:9,color:'#94a3b8'}}>({tlYear})</span></div>
                <div style={{fontSize:mob?15:18,fontWeight:700,color:isFut?'#b45309':'#1e293b',transition:'color 300ms ease'}}>{val}</div>
                {sub && <div style={{fontSize:9,color:'#94a3b8'}}>{i===0?sub:sub}</div>}
              </div>
            ))}
          </div>
          {/* 3帯域 水平積み上げバー（width% を CSS transition でモーフィング） */}
          <div>
            <div style={{display:'flex',height:26,borderRadius:6,overflow:'hidden',border:'1px solid #f1f5f9'}}>
              {BANDS.map(b=>(
                <div key={b.key} title={`${b.label}歳 ${b.v.toFixed(1)}%`} style={{width:`${b.v}%`,background:b.color,
                  transition:'width 400ms ease',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
                  {b.v>=8 && <span style={{fontSize:9,fontWeight:700,color:b.tcol,whiteSpace:'nowrap'}}>{b.v.toFixed(0)}%</span>}
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:12,marginTop:5,flexWrap:'wrap'}}>
              {BANDS.map(b=>(
                <span key={b.key} style={{fontSize:9.5,color:'#64748b',display:'inline-flex',alignItems:'center',gap:4}}>
                  <span style={{width:9,height:9,borderRadius:2,background:b.color,display:'inline-block'}} />{b.label}歳 {b.v.toFixed(1)}%
                </span>
              ))}
            </div>
            <div style={{fontSize:9,color:'#94a3b8',marginTop:6}}>
              3帯域は total_pop × aging_rate から厳密導出（0-64=100−rate65 / 65-74=rate65−rate75 / 75+=rate75）。全年とも社人研推計系列（{isFut?tlYear+'年':'2025年基準'}）。
              {!isFut && tlJusaki && ` 住基2025実測との75+乖離 ${(tlBands.r75-tlJusaki.r75>=0?'+':'')}${(tlBands.r75-tlJusaki.r75).toFixed(1)}pt。`}
            </div>
          </div>
          {/* 47県ダンベル 展開 */}
          <button onClick={()=>setDumbbellOpen(o=>!o)} style={{marginTop:12,padding:'6px 12px',borderRadius:8,
            border:'1px solid '+(isFut?'#fbbf24':'#cbd5e1'),background:'#fff',color:'#475569',fontSize:11,fontWeight:600,cursor:'pointer'}}>
            {dumbbellOpen?'▲ 閉じる':`▾ 47県の中での動きを見る（起点2025推計 → 終点${tlYear}推計）`}
          </button>
          {dumbbellOpen && dumbbell && (()=>{
            const { rows, vmin, vmax } = dumbbell;
            const DXL=96, DXR=668, DSPAN=DXR-DXL, ROWH=13, DH=rows.length*ROWH+30;
            const xS=(v)=>DXL+(vmax>vmin?(v-vmin)/(vmax-vmin):0)*DSPAN;
            return (
              <div style={{marginTop:10}}>
                <div style={{display:'flex',gap:14,flexWrap:'wrap',marginBottom:6,fontSize:9.5,color:'#64748b'}}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:4,background:'#cbd5e1',display:'inline-block'}} />起点 2025推計</span>
                  <span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:4,background:'#f59e0b',display:'inline-block'}} />終点 {tlYear}推計</span>
                  <span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{color:'#94a3b8'}}>▲</span> 住基2025実測</span>
                  <span style={{color:'#94a3b8'}}>指標=75歳以上割合(%)・行順=2025推計の高い順で固定</span>
                </div>
                <div style={{maxHeight:520,overflowY:'auto',border:'1px solid #f1f5f9',borderRadius:8,background:'#fff'}}>
                  <svg viewBox={`0 0 700 ${DH}`} width="100%" style={{display:'block'}}>
                    {/* 値軸 */}
                    {[vmin,Math.round((vmin+vmax)/2),vmax].map((v,i)=>(
                      <g key={i}>
                        <line x1={xS(v)} y1={16} x2={xS(v)} y2={DH-6} stroke="#f1f5f9" strokeWidth={1} />
                        <text x={xS(v)} y={11} textAnchor="middle" fontSize={8} fill="#cbd5e1">{v}%</text>
                      </g>
                    ))}
                    {rows.map((r,i)=>{
                      const y=24+i*ROWH, sel=r.pref===ndbPref, pin=r.pref===pinnedPref, hov=r.pref===hoverPref;
                      const endCol=sel?'#2563EB':(pin?'#ea580c':'#f59e0b');
                      return (
                        <g key={r.pref} onMouseEnter={()=>setHoverPref(r.pref)} onMouseLeave={()=>setHoverPref(null)}
                          onClick={()=>stripCommon.onPin(r.pref)} style={{cursor:'pointer'}}>
                          <rect x={0} y={y-6} width={700} height={ROWH} fill={hov?'#eff6ff':(sel?'#f8fbff':'transparent')} />
                          <text x={6} y={y+3} fontSize={8.5} fontWeight={sel||pin?700:400}
                            fill={sel?'#2563EB':(pin?'#ea580c':'#64748b')}>{pin?'◆ ':''}{r.pref}</text>
                          <line x1={xS(r.v2025)} y1={y} x2={xS(r.vEnd)} y2={y} stroke="#fcd34d" strokeWidth={2.5} strokeLinecap="round" style={{transition:'x2 300ms ease'}} />
                          <circle cx={xS(r.v2025)} cy={y} r={2.6} fill="#cbd5e1" />
                          <circle cx={xS(r.vEnd)} cy={y} r={sel?4:3.4} fill={endCol} style={{transition:'cx 300ms ease'}} />
                          {r.jusaki!=null && <path d={`M ${xS(r.jusaki)} ${y-5} L ${xS(r.jusaki)-3} ${y+1} L ${xS(r.jusaki)+3} ${y+1} Z`} fill="#94a3b8" />}
                          <text x={xS(r.vEnd)+7} y={y+3} fontSize={8} fill={endCol} fontWeight={sel?700:400}>{r.vEnd.toFixed(0)}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <div style={{fontSize:9,color:'#94a3b8',marginTop:6}}>
                  行click＝比較ピン（他ストリップと連動）。起点・終点とも社人研推計系列で統一（系列不連続による傾き歪みを回避）し、住基2025実測は▲で別途重畳。順位・傾きは<b>推計値</b>に基づく参考値です。
                </div>
              </div>
            );
          })()}
        </div>
        );
      })()}
    </div>
  )

  );
}
