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

export default function CheckupRiskSection(props){
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
  (hcPref.length > 0 || ndbCheckupRiskRates) && <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <span style={{fontSize:18}}>🔬</span>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>健診リスク <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#dbeafe',color:'#1e40af',fontWeight:500}}>検査値+該当者率</span></div>
        <div style={{fontSize:11,color:'#94a3b8'}}>特定健診（40〜74歳受診者） — B.リスクメーター盤（5指標） + 参考:A.検査値平均</div>
      </div>
    </div>

    {/* ── サブセクション B: リスク該当者率 — リスクメーター盤（ヒーロー昇格・B→A順） ── */}
    {ndbCheckupRiskRates?.risk_rates && (() => {
      // RISK_CARDS はモジュールレベルへ昇格（分布ドロワーの指標タブと共用・内容不変）
      // リスクメーター盤: 粗率/年齢標準化 両モードの per-card 統計を一括算出（47件×5リスクの軽量ソート）
      // 値の取り出し: crude=by_pref[p].rate / std=Std側 by_pref[p].age_standardized_rate
      const gaugeStats = (key) => {
        const src = riskStdMode
          ? ndbCheckupRiskRatesStd?.risk_rates?.[key]?.by_pref
          : ndbCheckupRiskRates.risk_rates[key]?.by_pref;
        const field = riskStdMode ? 'age_standardized_rate' : 'rate';
        if (!src) return null;
        const stripVals = Object.entries(src).filter(([p])=>isP47(p))
          .map(([p,v])=>({pref:p, value:v?.[field]})).filter(d=>typeof d.value==='number');
        if (stripVals.length < 40) return null;
        const sorted = [...stripVals.map(d=>d.value)].sort((a,b)=>a-b);
        const q = (t) => sorted[Math.max(0, Math.min(sorted.length-1, Math.round(t*(sorted.length-1))))];
        const prefVal = src[ndbPref]?.[field];
        if (prefVal == null) return null;
        return {
          stripVals, prefVal,
          natAvg: sorted.reduce((s,v)=>s+v,0)/sorted.length,
          min: sorted[0], max: sorted[sorted.length-1], p10: q(0.1), p90: q(0.9),
          rank: 1 + stripVals.filter(d=>d.value > prefVal).length,
        };
      };
      return <div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8,flexWrap:'wrap'}}>
          <span style={{fontSize:11,fontWeight:700,color:'#475569',padding:'2px 8px',background:'#fef3c7',borderRadius:4}}>B. リスクメーター盤</span>
          <span style={{fontSize:8.5,fontWeight:700,padding:'1px 5px',borderRadius:3,border:`1px solid ${yb('checkupRisk').color}`,color:yb('checkupRisk').color,background:'#fff'}}>{yb('checkupRisk').label}</span>
          {!mob && <span style={{fontSize:10,color:'#94a3b8'}}>針=当県・帯=47県分布・tick=全国 — 5本の針の傾き＝県のリスク体質</span>}
          {/* 粗率|年齢標準化 セグメントトグル（針・帯・tick・ストリップが丸ごと切替） */}
          <div style={{marginLeft:'auto',display:'flex',border:'1px solid #e2e8f0',borderRadius:6,overflow:'hidden'}}>
            {[[false,'粗率'],[true,'年齢標準化']].map(([m,l])=>(
              <button key={l} onClick={()=>setRiskStdMode(m)}
                style={{padding:'4px 10px',border:'none',fontSize:10,fontWeight:600,cursor:'pointer',
                  background:riskStdMode===m?(m?'#7c3aed':'#475569'):'#fff',color:riskStdMode===m?'#fff':'#475569'}}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:mob?'1fr 1fr':'repeat(5,1fr)',gap:10}}>
          {RISK_CARDS.map((rc, ci) => {
            const st = gaugeStats(rc.key);
            if (!st) return null;
            const { stripVals, prefVal, natAvg, min, max, p10, p90, rank } = st;
            const deltaPct = natAvg ? (prefVal/natAvg - 1) * 100 : null;
            // 自然言語化（既存cmp閾値ロジック — 針色にも流用。緑=「平均より低い」であり安全宣言ではない）
            let cmpShort = '', cmpColor = '#64748b';
            if (deltaPct != null) {
              const abs = Math.abs(deltaPct);
              if (abs < 5) { cmpShort = '同程度'; cmpColor = '#64748b'; }
              else if (deltaPct > 0) { cmpShort = abs >= 15 ? '顕著に高い' : '高い'; cmpColor = abs >= 15 ? '#dc2626' : '#f59e0b'; }
              else { cmpShort = abs >= 15 ? '顕著に低い' : '低い'; cmpColor = '#059669'; }
            }
            // もう一方のモードの値（粗率モード=紫の標準化行 / 標準化モード=粗率の逆表示）
            const stdInfo = ndbCheckupRiskRatesStd?.risk_rates?.[rc.key]?.by_pref?.[ndbPref];
            const crudeVal = ndbCheckupRiskRates.risk_rates[rc.key]?.by_pref?.[ndbPref]?.rate;
            // ゴースト針: hover県（全ストリップ・全ゲージが同期して揺れる）/ ◆ピン県
            const field = riskStdMode ? 'age_standardized_rate' : 'rate';
            const srcAll = riskStdMode ? ndbCheckupRiskRatesStd?.risk_rates?.[rc.key]?.by_pref : ndbCheckupRiskRates.risk_rates[rc.key]?.by_pref;
            const hoverVal = (hoverPref && hoverPref !== ndbPref) ? srcAll?.[hoverPref]?.[field] : null;
            const pinVal = (pinnedPref && pinnedPref !== ndbPref) ? srcAll?.[pinnedPref]?.[field] : null;
            // 分布ドロワー連携: click=該当指標でドロワーへ / 網掛けhover時は該当カードをリング強調
            const binsCardActive = binsOpen && RISK_BIN_THRESHOLD[rc.key]?.metric === binsMetric;
            return <div key={rc.key}
              onClick={(e)=>{ if (e.target && e.target.closest && e.target.closest('svg,button,a')) return; binsJumpTo(rc.key); }}
              title={`${rc.fullLabel} — クリックで下の分布ドロワーに階級分布を表示`}
              style={{background:'#f8fafc',borderRadius:10,padding:'10px 12px',cursor:'pointer',borderLeft:`3px solid ${(activeDomain&&dMatch('riskKey',rc.key))?dm.color:rc.color}`,...dFade('riskKey',rc.key),
                boxShadow: binsZoneHover && binsCardActive ? `0 0 0 2px ${rc.color}` : 'none',
                transition:'opacity 300ms ease, box-shadow 300ms ease',
                ...(mob && ci === RISK_CARDS.length-1 ? {gridColumn:'span 2', maxWidth:'60%', justifySelf:'center', width:'100%'} : {})}}>
              <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:4}}>
                <span style={{fontSize:14}}>{rc.icon}</span>
                <span style={{fontSize:11,fontWeight:600,color:'#1e293b'}}>{rc.label}</span>
              </div>
              {/* 半円アークゲージ（冠）: click=ドロワー / アークスクラブ=最近傍県→hoverPref同期 */}
              <RiskGauge value={prefVal} natAvg={natAvg} p10={p10} p90={p90} min={min} max={max}
                rank={rank} color={cmpColor} unit="%" prefName={ndbPref} mob={mob}
                reduced={prefersReducedMotion()}
                hoverValue={hoverVal} hoverName={hoverPref} pinValue={pinVal} pinName={pinnedPref}
                values={stripVals} onScrub={setHoverPref} onJump={()=>binsJumpTo(rc.key)} />
              {/* 値+短縮チップ（20px降格・角度でなく実値が正） */}
              <div style={{display:'flex',alignItems:'baseline',gap:6,marginTop:2,flexWrap:'wrap'}}>
                <span style={{fontSize:20,fontWeight:700,color:'#1e293b',lineHeight:1.1,fontVariantNumeric:'tabular-nums'}}>
                  <CountUpNum value={prefVal} decimals={1} /><span style={{fontSize:11,fontWeight:500,color:'#64748b'}}>%</span>
                </span>
                {cmpShort && deltaPct != null && (
                  <span style={{fontSize:9.5,fontWeight:700,color:cmpColor,background:cmpColor+'14',border:`1px solid ${cmpColor}33`,padding:'1px 6px',borderRadius:4,whiteSpace:'nowrap'}}>
                    {deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}% {cmpShort}
                  </span>
                )}
              </div>
              <div style={{fontSize:8.5,color:'#94a3b8',marginTop:1}}>47県中{rank}位{riskStdMode ? '（年齢標準化）' : ''}</div>
              {riskStdMode
                ? (crudeVal != null && <div title="標準化前の粗率" style={{fontSize:9,color:'#64748b',marginTop:3,fontWeight:500}}>粗率 {crudeVal.toFixed(1)}%</div>)
                : (stdInfo && stdInfo.age_standardized_rate != null && (
                    <div title="NDB内標準人口で直接標準化（47県合算 sex × age_group）" style={{fontSize:9,color:'#7c3aed',marginTop:3,fontWeight:500}}>
                      年齢標準化 {stdInfo.age_standardized_rate.toFixed(1)}% ({stdInfo.delta_pp >= 0 ? '+' : ''}{stdInfo.delta_pp.toFixed(1)}pp)
                    </div>
                  ))}
              {stripVals.length >= 40 && <div style={{marginTop:6}}><PrefStrip47 {...stripCommon} values={stripVals} natAvg={natAvg} yearBadge={yb('checkupRisk')} mode="micro" /></div>}
            </div>;
          })}
        </div>
        <div style={{fontSize:10,color:'#94a3b8',marginTop:8,fontStyle:'italic',lineHeight:1.6}}>
          ※NDB特定健診の階級分布から算出した該当者率です。40–74歳の健診受診者ベースであり、地域住民全体の有病率ではありません。<br/>
          ※<span style={{color:'#7c3aed',fontWeight:500}}>年齢標準化率</span>: NDB特定健診データ内の性・年齢階級構成を標準人口とした直接標準化率（地域住民全体の年齢調整率ではありません）。
        </div>

        {/* ── 分布ドロワー: 臨床閾値ヒストグラム（Phase 2D-Layer2 追加型・A/Bカード非破壊） ──
            県=塗りバー / 全国=灰ゴースト輪郭 / 臨床閾値から先=リスク色網掛け（面積=Bカード該当者率と一致） */}
        <div ref={binsBoxRef} style={{marginTop:12,border:'1px solid #e2e8f0',borderRadius:10,background:'#fff',overflow:'hidden'}}>
          <button onClick={()=>setBinsOpen(o=>!o)} aria-expanded={binsOpen}
            style={{width:'100%',display:'flex',alignItems:'center',gap:8,padding:mob?'9px 12px':'10px 14px',border:'none',background:binsOpen?'#f8fafc':'#fff',cursor:'pointer',textAlign:'left'}}>
            <span style={{fontSize:13}}>📊</span>
            <span style={{fontSize:11.5,fontWeight:700,color:'#1e293b'}}>分布ドロワー — 検査値階級の分布と臨床閾値</span>
            {/* yb('checkupRisk')=R4 バッジ（ドロワーヘッダ必須） */}
            <span style={{fontSize:8.5,fontWeight:700,padding:'1px 5px',borderRadius:3,border:`1px solid ${yb('checkupRisk').color}`,color:yb('checkupRisk').color,background:'#fff',flexShrink:0}}>{yb('checkupRisk').label}</span>
            {riskStdMode && <span title="盤は年齢標準化モードですが、本図（階級分布）は粗分布のみです" style={{fontSize:9,fontWeight:600,color:'#7c3aed',background:'#f5f3ff',border:'1px solid #ddd6fe',padding:'1px 6px',borderRadius:3,flexShrink:0}}>本図は粗分布</span>}
            {!mob && <span style={{fontSize:9.5,color:'#94a3b8'}}>県=塗り / 全国=灰輪郭 / 閾値から先=網掛け</span>}
            <span style={{marginLeft:'auto',fontSize:10,color:'#64748b',fontWeight:600,flexShrink:0}}>{binsOpen?'▲ 閉じる':'▼ 分布を見る'}</span>
          </button>
          {binsOpen && (()=>{
            const riskKeyOfMetric = METRIC_TO_RISK_KEY[binsMetric];
            const activeCard = RISK_CARDS.find(c=>c.key===riskKeyOfMetric) || RISK_CARDS[0];
            // rank2: ドメインレンズ — 該当指標タブを前面化（例: 循環器→SBP/LDLが先頭）
            const tabCards = activeDomain ? [...RISK_CARDS].sort((a,b)=>(dMatch('riskKey',b.key)?1:0)-(dMatch('riskKey',a.key)?1:0)) : RISK_CARDS;
            const binLabels = binsData?.binOrder?.[binsMetric] || [];
            const ageGroups = binsData?.ageGroups || [];
            return <div style={{padding:mob?'10px 12px 12px':'12px 16px 14px'}}>
              {/* 指標タブ5種（RISK_CARDS流用: key/色/fullLabel） */}
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
                {tabCards.map(c=>{
                  const m = RISK_BIN_THRESHOLD[c.key].metric;
                  const on = binsMetric === m;
                  return <button key={c.key} onClick={()=>setBinsMetric(m)} title={c.fullLabel}
                    style={{padding:mob?'4px 8px':'4px 10px',fontSize:10,fontWeight:600,borderRadius:5,cursor:'pointer',
                      border:`1px solid ${on?c.color:'#e2e8f0'}`,background:on?c.color:'#fff',color:on?'#fff':'#475569',
                      opacity: activeDomain && !dMatch('riskKey',c.key) ? 0.4 : 1, transition:'opacity 300ms ease'}}>
                    {c.icon} {c.label}
                  </button>;
                })}
              </div>
              {/* 性別トグル（全体=男女クライアント合算）+ ⇄ミラー + 累積%副トグル */}
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:8}}>
                <div style={{display:'flex',border:'1px solid #e2e8f0',borderRadius:6,overflow:'hidden',opacity:binsMirror?0.45:1,pointerEvents:binsMirror?'none':'auto'}}
                  title={binsMirror?'ミラーモード中は男女両方を表示しています':''}>
                  {[['all','全体'],['male','男'],['female','女']].map(([k,l])=>(
                    <button key={k} onClick={()=>setBinsSex(k)}
                      style={{padding:'4px 10px',border:'none',fontSize:10,fontWeight:600,cursor:'pointer',
                        background:binsSex===k?(k==='male'?'#2563EB':k==='female'?'#dc2626':'#475569'):'#fff',
                        color:binsSex===k?'#fff':'#475569'}}>{l}</button>
                  ))}
                </div>
                <button onClick={()=>setBinsMirror(m=>!m)} title="男女を左右鏡像で並置（モバイルは縦積み）"
                  style={{padding:'4px 10px',fontSize:10,fontWeight:600,borderRadius:6,cursor:'pointer',
                    border:`1px solid ${binsMirror?'#1e293b':'#e2e8f0'}`,background:binsMirror?'#1e293b':'#fff',color:binsMirror?'#fff':'#475569'}}>
                  ⇄ ミラー
                </button>
                <button onClick={()=>setBinsCdf(c=>!c)}
                  style={{padding:'4px 6px',fontSize:10,fontWeight:600,borderRadius:6,cursor:'pointer',border:'none',
                    background:'transparent',color:binsCdf?'#1d4ed8':'#64748b',textDecoration:'underline'}}>
                  {binsCdf?'構成%に戻す':'累積%で見る'}
                </button>
              </div>
              {/* 年齢帯セグメント（7帯+全年齢） */}
              {ageGroups.length>0 && (
                <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:10}}>
                  {['all',...ageGroups].map(a=>(
                    <button key={a} onClick={()=>setBinsAge(a)}
                      style={{padding:'3px 8px',fontSize:9.5,fontWeight:600,borderRadius:10,cursor:'pointer',
                        border:`1px solid ${binsAge===a?'#475569':'#e2e8f0'}`,
                        background:binsAge===a?'#475569':'#fff',color:binsAge===a?'#fff':'#64748b'}}>
                      {a==='all'?'全年齢':`${a}歳`}
                    </button>
                  ))}
                </div>
              )}
              {/* 本体（prefResolved=false 防御 — データ未取得県では描画しない） */}
              <div style={dFade('riskKey', riskKeyOfMetric)}>
                {binsData == null ? (
                  <div style={{fontSize:11,color:'#94a3b8',padding:'26px 0',textAlign:'center'}}>分布データ取得中…</div>
                ) : !binsData.prefResolved || binLabels.length===0 ? (
                  <div style={{fontSize:11,color:'#94a3b8',padding:'20px 0',textAlign:'center'}}>この都道府県の{binsMetric}分布データが取得できませんでした。</div>
                ) : (
                  <CheckupBinsHistogram
                    rows={binsData.rows}
                    pinRows={binsPinData?.rows || null}
                    binLabels={binLabels}
                    metric={binsMetric}
                    sex={binsSex} age={binsAge} mirror={binsMirror} cdf={binsCdf}
                    color={activeCard.color} colorDeep={RISK_COLOR_DEEP[activeCard.key] || activeCard.color}
                    prefName={ndbPref}
                    pinnedName={binsPinData ? pinnedPref : null}
                    yearBadge={yb('checkupRisk')}
                    mob={mob} pulse={binsPulse}
                    onZoneHover={setBinsZoneHover}
                  />
                )}
                {/* 凡例 */}
                <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',fontSize:9.5,color:'#64748b',marginTop:8}}>
                  <span><span style={{display:'inline-block',width:10,height:10,background:'#94a3b8',borderRadius:2,verticalAlign:'-1px'}}/> {ndbPref}（構成%）</span>
                  <span><span style={{display:'inline-block',width:10,height:10,border:'1.5px solid #cbd5e1',borderRadius:2,verticalAlign:'-1px',background:'#fff'}}/> 全国（灰輪郭）</span>
                  <span style={{color:RISK_COLOR_DEEP[activeCard.key]||activeCard.color,fontWeight:600}}>▨ 閾値{RISK_BIN_THRESHOLD[activeCard.key].thLabel}から先=リスク該当域（網掛け面積=Bカードの該当者率）</span>
                  {binsPinData && <span style={{color:'#c2410c',fontWeight:600}}>◆ {pinnedPref}（橙点線輪郭）</span>}
                </div>
              </div>
              {/* 脚注（guardrails: 分母・全国合算・閾値・マスク・年齢標準化との区別・色使い分け） */}
              <div style={{fontSize:10,color:'#94a3b8',marginTop:6,fontStyle:'italic',lineHeight:1.6}}>
                ※{binsData?.denominatorNote || '分母=特定健診受診者(40-74歳)。住民全体ではない。比較は同性×同年齢帯同士に限る。'}<br/>
                ※{binsData?.nationalNote || '全国は47都道府県のcountをサーバ側で合算(擬似県「都道府県判別不可」を除外)。公式全国集計とは微差の可能性。'}<br/>
                ※閾値（BMI25等）は集団把握のための臨床カットオフであり、個人の診断基準ではありません。<br/>
                ※斜線ハッチのビン=集計値なし（NDBの10未満マスクによる非公開の可能性）。値ゼロとは断定しません。<br/>
                ※本図は<b>粗分布</b>です。Bカードの<span style={{color:'#7c3aed',fontWeight:500}}>年齢標準化率</span>は本図には適用していません（年齢帯セグメントで同年齢帯比較が可能）。<br/>
                ※色の使い分け: Bカード内47県ストリップ=中立色（県間の位置）、本図の赤系網掛け=臨床閾値超え（高=リスク方向が臨床的に確立した指標のため）。
              </div>
            </div>;
          })()}
        </div>
      </div>;
    })()}

    {/* ── サブセクション A: 検査値平均（参考・Bの下へ移設。計算ロジックは移設のみ無改変） ── */}
    {hcPref.length > 0 && <div style={{marginTop:14}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:'#64748b',padding:'2px 8px',background:'#f1f5f9',borderRadius:4}}>参考: A. 検査値平均</span>
        <span style={{fontSize:10,color:'#94a3b8'}}>Hb / Cr / eGFR — 5リスク該当者率とは別系の男女別平均値</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(3,1fr)',gap:12}}>
        {hcPref.map((h,i)=>{
          const meta = RISK_META[h.metric] || {};
          // rank1: 検査値の47県分布（男女平均、判別不可除外）
          const hcVals = (ndbHc||[]).filter(x=>x.metric===h.metric && isP47(x.pref) && x.male!=null && x.female!=null)
            .map(x=>({pref:x.pref, value:(x.male+x.female)/2}));
          return <div key={i} style={{background:'#f8fafc',borderRadius:10,padding:'10px 14px',...dFade('hcMetric',h.metric),...dBorder('hcMetric',h.metric)}}>
            <div style={{display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap'}}>
              <span style={{fontSize:12,fontWeight:600}}>{meta.icon||''} {h.metric}</span>
              <span style={{fontSize:11}}><span style={{color:'#3b82f6'}}>男</span> <b style={{fontSize:15,color:'#2563EB'}}>{h.male}</b></span>
              <span style={{fontSize:11}}><span style={{color:'#dc2626'}}>女</span> <b style={{fontSize:15,color:'#dc2626'}}>{h.female}</b></span>
              <span style={{fontSize:9,color:'#94a3b8',marginLeft:'auto'}}>{meta.unit||''}{meta.note?` ・ ${meta.note}`:''}</span>
            </div>
            {hcVals.length >= 40 && <div style={{marginTop:6}}><PrefStrip47 {...stripCommon} values={hcVals} yearBadge={yb('ndbHc')} mode="inline" /><div style={{fontSize:9,color:'#94a3b8',marginTop:1}}>男女平均の47県分布</div></div>}
          </div>;
        })}
      </div>
      <div style={{fontSize:10,color:'#94a3b8',marginTop:6,fontStyle:'italic'}}>※男女別平均値をもとにした参考値。疾病診断率ではありません。</div>
    </div>}
  </div>

  );
}
