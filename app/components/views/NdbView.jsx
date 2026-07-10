'use client';
import { useState, useEffect, useRef, useMemo, useId, Fragment } from 'react';
import { fmt, sortPrefs, PREF_ORDER } from '../shared';
import { prefersReducedMotion, useCountUp, CountUpNum, useFlipRows, useStripCommon, useYearSweep } from '../ui/vizHooks';
import { useSelection } from '../SelectionContext';
import { dispersionForCause, classifyDispersion } from '../../../lib/dispersionMetrics';

import DomainSupplyDemandBridge from './DomainSupplyDemandBridge';
import InterpretationGuard from '../ui/InterpretationGuard';
import RegionalMismatchExplorer from '../ui/RegionalMismatchExplorer';
import PrefStrip47 from '../ui/PrefStrip47';
import PsIris from '../ui/PsIris';
import PrefChoropleth from '../ui/PrefChoropleth';
import CheckupBinsHistogram, { RISK_BIN_THRESHOLD, METRIC_TO_RISK_KEY } from '../ui/CheckupBinsHistogram';
import RiskGauge from '../ui/RiskGauge';
import AgePyramidGhost from '../ui/AgePyramidGhost';
import DeathWaffle100, { buildWaffleItems, WAFFLE_CAUSE_COLORS, WAFFLE_OTHER, WAFFLE_OTHER_COLOR } from '../ui/DeathWaffle100';
import { getSourceBadge } from '../../../lib/sourceRegistry';
import { DOMAIN_MAPPING, DOMAIN_ORDER, rowInDomain, domainSectionStatus, DOMAIN_TO_RX_LABEL, FP_TIERS, tierOf } from '../../../lib/domainMapping';

import {
  PREF47_SET, isP47, yb, UnitDotLane, RHYTHM_X0, RHYTHM_X1, RHYTHM_W, rhythmX, RHYTHM_MONTHS, RhythmLane,
  YearRhythmTrack, CAT_LABELS, DIAG_UNIT, RISK_META, RISK_CARDS, RISK_COLOR_DEEP, DRUG_DOMAIN, DOMAIN_COLORS,
  GAP_TEMPLATES, DOMAIN_GAP_TEMPLATE, DEMO_YEARS, computeAgeRates,
} from './ndb/ndbShared';
import PopulationKpiSection from './ndb/PopulationKpiSection';
import RootCauseSection from './ndb/RootCauseSection';
import CheckupRiskSection from './ndb/CheckupRiskSection';
import DemandForestSection from './ndb/DemandForestSection';
import YearTrackSection from './ndb/YearTrackSection';
import PrescriptionSection from './ndb/PrescriptionSection';
import PrescriptionTop10Section from './ndb/PrescriptionTop10Section';
import OutcomeSection from './ndb/OutcomeSection';
import GapFinderSection from './ndb/GapFinderSection';

export default function NdbView({ mob, navTitle, ndbDiag, ndbRx, ndbHc, ndbPref, setNdbPref, setNdbRx, vitalStats, ndbQ, agePyramid, futureDemo, patientSurvey, bedFunc, ndbCheckupRiskRates, ndbCheckupRiskRatesStd, mortalityOutcome2020, cancerSites2024, homecareCapability, japanMap, futureYear, setFutureYear }) {
  const diagByPref = ndbDiag.filter(d=>d.prefecture===ndbPref);
  const hcPref = ndbHc.filter(d=>d.pref===ndbPref);
  const vp = vitalStats?.prefectures?.find(p=>p.pref===ndbPref);
  const causes = vp?.causes || [];

  // ── rank1: 分布ストリップ共通state（hover同期・比較ピン） ──
  // pinned/hover は SelectionContext を単一ソースに（◆比較ピンがビュー横断で持ち回り）。
  const { pinnedPref, setPinnedPref, hoverPref, setHoverPref } = useSelection();
  // 全ストリップ共通props（onJump=setNdbPref=globalPref連動）
  const stripCommon = useStripCommon({ selected: ndbPref, onJump: setNdbPref });

  // ── 人口KPI: age_pyramid (住基2025) + future_demographics (社人研2050) ──
  // computeAgeRates はモジュールレベルへ移設（手順1共有基盤）
  const demoKpi = (()=>{
    if (!agePyramid?.prefectures?.[ndbPref]) return null;
    const r = computeAgeRates(agePyramid.prefectures[ndbPref]);
    if (!r) return null;
    let change2050 = null, rate75_2050 = null;
    if (futureDemo?.prefectures) {
      const fp = futureDemo.prefectures.find(p => p.pref === ndbPref);
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

  // rank1: 人口KPI micro ストリップ用 47県分布（判別不可等は isP47 で除外）
  const demoStrips = (()=>{
    const total = [], r65 = [], r75 = [], r85 = [], chg = [];
    if (agePyramid?.prefectures) {
      Object.entries(agePyramid.prefectures).forEach(([p, ap])=>{
        if (!isP47(p)) return;
        const r = computeAgeRates(ap);
        if (!r) return;
        total.push({pref:p, value:r.total});
        r65.push({pref:p, value:r.rate65});
        r75.push({pref:p, value:r.rate75});
        r85.push({pref:p, value:r.rate85});
      });
    }
    if (futureDemo?.prefectures) {
      futureDemo.prefectures.forEach(fp=>{
        if (!isP47(fp.pref) || !(fp.type==='a'||fp.type===1)) return;
        const p20 = fp.total_pop?.['2020'], p50 = fp.total_pop?.['2050'];
        if (p20 && p50) chg.push({pref:fp.pref, value:(p50/p20-1)*100});
      });
    }
    return { total, r65, r75, r85, chg };
  })();

  // ══ rank9: 人口タイムレンズ + 高齢化ドリフト・ダンベル ══
  const tlYear = DEMO_YEARS.includes(futureYear) ? futureYear : '2025';
  const tlIdx = DEMO_YEARS.indexOf(tlYear);
  const [dumbbellOpen, setDumbbellOpen] = useState(false);
  const tlRef = useRef(null);
  const tlDrag = useRef(false);
  // 再生ロジックは useYearSweep() に一本化（MapView 逼迫スイープと共通・700ms/step）。
  // 年軸は共有 futureYear（SelectionContext）を単一ソースに参照。
  const { playing: tlPlaying, toggle: tlToggle } =
    useYearSweep({ years: DEMO_YEARS, current: tlYear, setYear: setFutureYear, interval: 700 });
  // 選択県の社人研系列（type=a）
  const fpSel = useMemo(
    () => futureDemo?.prefectures?.find(p => p.pref === ndbPref) || null,
    [futureDemo, ndbPref]
  );
  // 選択年の3帯域（0-64 / 65-74 / 75+）と KPI — 社人研系列から厳密導出
  const tlBands = (() => {
    if (!fpSel) return null;
    const r65 = fpSel.aging_rate_65?.[tlYear], r75 = fpSel.aging_rate_75?.[tlYear];
    const pop = fpSel.total_pop?.[tlYear];
    if (r65 == null || r75 == null) return null;
    return { r65, r75, pop, b064: 100 - r65, b6574: r65 - r75, b75: r75 };
  })();
  // 住基2025実測（agePyramid）— 推計との乖離を▲で可視化
  const tlJusaki = (() => {
    const ap = agePyramid?.prefectures?.[ndbPref];
    if (!ap) return null;
    const r = computeAgeRates(ap);
    return r ? { r65: r.rate65, r75: r.rate75, b064: 100 - r.rate65, b6574: r.rate65 - r.rate75, b75: r.rate75 } : null;
  })();
  // ダンベル: 47県 × 75歳以上割合（起点2025推計→終点tlYear推計）。行順は2025値で固定・終点のみ移動
  const dumbbell = useMemo(() => {
    if (!futureDemo?.prefectures) return null;
    const jus = {};
    if (agePyramid?.prefectures) Object.entries(agePyramid.prefectures).forEach(([p, ap]) => {
      if (!isP47(p)) return; const r = computeAgeRates(ap); if (r) jus[p] = r.rate75;
    });
    let vmin = Infinity, vmax = -Infinity;
    const rows = [];
    futureDemo.prefectures.forEach(fp => {
      if (!isP47(fp.pref)) return;
      const s = fp.aging_rate_75?.['2025'], e = fp.aging_rate_75?.[tlYear];
      if (s == null || e == null) return;
      DEMO_YEARS.forEach(y => { const v = fp.aging_rate_75?.[y]; if (v != null) { if (v < vmin) vmin = v; if (v > vmax) vmax = v; } });
      rows.push({ pref: fp.pref, v2025: s, vEnd: e, jusaki: jus[fp.pref] ?? null, drift: e - s });
    });
    if (!rows.length) return null;
    rows.sort((a, b) => b.v2025 - a.v2025); // 固定順（2025推計の高い順）
    return { rows, vmin: Math.floor(vmin), vmax: Math.ceil(vmax) };
  }, [futureDemo, agePyramid, tlYear]);

  // Population for per-capita — 住基2025(agePyramid)の県人口(=demoKpi.total)を単一分母とする。
  // area_demographics の munis 合算も政令指定都市を含む完全値(2026-07 住基ETL再生成)だが、
  // 10万対の分母は agePyramid に一本化する。
  const prefPop = demoKpi?.total || 0;
  const perCap = (v) => prefPop > 0 ? (v / prefPop * 100000).toFixed(0) : '—';

  // Drug domain aggregation（選択県の領域別生数量 — ツールチップの「単位混在・参考」表示に使用）
  const rxDomains = {};
  ndbRx.forEach(r => {
    const domain = DRUG_DOMAIN[r.name] || 'その他';
    if (!rxDomains[domain]) rxDomains[domain] = 0;
    rxDomains[domain] += r.qty;
  });

  // ── Gap Finder: state & 全都道府県メトリック計算 ──
  const [gapTemplate, setGapTemplate] = useState('smoke_cancer');
  const [psMode, setPsMode] = useState('outpatient'); // 患者調査: 入院/外来切替
  // rank4: 受療率フィンガープリント（21章フォレスト）用 state
  const [psSort, setPsSort] = useState('divergence'); // 'divergence'(乖離順) | 'abs'(絶対値順) | 'chapter'(章番号順)
  const [psShowTop7, setPsShowTop7] = useState(false); // 旧Top7表示の折りたたみ温存
  const [psExpanded, setPsExpanded] = useState(null);  // 展開中の章key
  // 虹彩(PsIris)↔行リストの双方向hover同期・ヘッドラインチップ→行フラッシュ
  const [hoverPSKey, setHoverPSKey] = useState(null);
  const [psFlashKey, setPsFlashKey] = useState(null);
  const psRowRefs = useRef({});        // 章key→行DOM（scrollIntoView用）
  const psFlashTimer = useRef(null);
  const psJumpToRow = (key) => {
    const el = psRowRefs.current[key];
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPsFlashKey(key);
    if (psFlashTimer.current) clearTimeout(psFlashTimer.current);
    psFlashTimer.current = setTimeout(() => setPsFlashKey(null), 1200);
  };
  useEffect(() => () => { if (psFlashTimer.current) clearTimeout(psFlashTimer.current); }, []);
  // FLIPソート: psSort/psMode(/◆ピン)変更時に行がtranslateYのみで滑走
  // （実装は共通ヘルパ useFlipRows へ集約 — 手順1共有基盤・挙動不変）
  useFlipRows(psRowRefs, [psSort, psMode, pinnedPref], mob);
  // ◆差分モード: ピン解除(またはピン=自県)時は「対◆差順」から乖離順へ復帰
  useEffect(() => {
    if ((!pinnedPref || pinnedPref === ndbPref) && psSort === 'pindiff') setPsSort('divergence');
  }, [pinnedPref, ndbPref, psSort]);
  // マップエコー: 行展開内の47県地図トグル（展開行/入院外来が変われば閉じる）
  const [psMapOpen, setPsMapOpen] = useState(false);
  useEffect(() => { setPsMapOpen(false); }, [psExpanded, psMode]);
  // ── Layer1 tierゾーン発散バー「県の性格プロファイル」state（手順4） ──
  const [qExpandedKey, setQExpandedKey] = useState(null); // click=単一openアコーディオン
  const [qSort, setQSort] = useState('item');             // 'item'(項目順)|'divergence'(乖離大順) — 生活習慣バンドのみ
  const [qHoverKey, setQHoverKey] = useState(null);       // 行hover=濃紺ツールチップ
  const qRowRefs = useRef({});                            // 生活習慣行のFLIP refs（psRowRefs方式）
  useFlipRows(qRowRefs, [qSort, ndbPref], mob);
  // 県切替で展開を閉じる（乖離大順の並びが変わるため）
  useEffect(() => { setQExpandedKey(null); }, [ndbPref]);
  // rank4: 将来傾き（受療率法・参考推計）— 選択県を圏集約した demand projection を取得
  const [demandProj, setDemandProj] = useState(null);
  useEffect(() => {
    let alive = true;
    setDemandProj(null);
    setPsExpanded(null);
    fetch(`/api/demand-projection/pref?pref=${encodeURIComponent(ndbPref)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive) setDemandProj(j); })
      .catch(() => { if (alive) setDemandProj(null); });
    return () => { alive = false; };
  }, [ndbPref]);
  // Phase 4-3 R3: 粗死亡率 (2024 全14) vs 年齢調整死亡率 (2020 6死因) toggle
  const [mortalityMode, setMortalityMode] = useState('crude');
  const [mortalitySex, setMortalitySex] = useState('male');
  // rank5: マップ・エコー — click した死因の 47 県コロプレスを行下に展開
  const [selectedCause, setSelectedCause] = useState(null);
  // Layer5 百人ワッフル: 格子⇔死因行リストの双方向 hover 同期（カテゴリ名 or WAFFLE_OTHER）
  const [hoverCause, setHoverCause] = useState(null);
  useEffect(() => { setHoverCause(null); }, [mortalityMode, ndbPref]);
  // ワッフル items（粗2024モード専用 — 構成%の意味が成立する断面のみ。全国降順top7+その他を最大剰余法で100人化）
  const waffleItems = useMemo(() => {
    if (!vp?.causes?.length || !vitalStats?.national?.causes?.length) return null;
    if (!vp.total_death_rate || !vitalStats.national.total_death_rate) return null;
    return buildWaffleItems({
      prefCauses: vp.causes, prefTotal: vp.total_death_rate,
      natCauses: vitalStats.national.causes, natTotal: vitalStats.national.total_death_rate,
    });
  }, [vp, vitalStats]);

  // rank6: がん部位別30年トレンド (1995-2024 ASR75 スモールマルチプル)
  const [cancerTrend, setCancerTrend] = useState(null);   // /api/cancer-trend?all=1 全量
  const [cancerTrendSex, setCancerTrendSex] = useState('male'); // 'male'|'female'
  const [trendSite, setTrendSite] = useState(null);       // 展開中の部位 short key
  const [trendHoverIdx, setTrendHoverIdx] = useState(null); // 展開チャート scrub の年 index
  useEffect(() => {
    let alive = true;
    fetch('/api/cancer-trend?all=1')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive) setCancerTrend(j); })
      .catch(() => { if (alive) setCancerTrend(null); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { setTrendSite(null); setTrendHoverIdx(null); }, [ndbPref]);

  // ── 手順1共有基盤: 処方 全県版 rxAll（1回fetch・cancerTrendパターン） ──
  // Layer4 処方個性ダイアグラム本体と Bridge(ndbRxAll prop) で共用。
  // 既存Bridgeの compute47Avg が選択県のみの ndbRx で縮退する
  // 「utilization delta 恒等+0.0%」バグの根治を兼ねる。
  const [rxAll, setRxAll] = useState(null); // 全47県×薬効106分類=4,786行
  useEffect(() => {
    let alive = true;
    fetch('/api/ndb/prescriptions')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive) setRxAll(Array.isArray(j) ? j : null); })
      .catch(() => { if (alive) setRxAll(null); });
    return () => { alive = false; };
  }, []);

  // ── Layer2 リスクメーター盤: 粗率|年齢標準化 セグメントトグル（針・帯・tick・ストリップが丸ごと切替） ──
  const [riskStdMode, setRiskStdMode] = useState(false);
  // ── Layer2 分布ドロワー（臨床閾値ヒストグラム）state — 追加型・A/Bカード非破壊 ──
  const [binsOpen, setBinsOpen] = useState(false);      // ドロワー開閉
  const [binsMetric, setBinsMetric] = useState('BMI');  // 指標タブ5種
  const [binsSex, setBinsSex] = useState('all');        // 'all'=男女クライアント合算 | 'male' | 'female'
  const [binsAge, setBinsAge] = useState('all');        // 年齢帯セグメント（7帯+全年齢）
  const [binsMirror, setBinsMirror] = useState(false);  // 男女ミラーモード（男左女右鏡像・mobは縦積み）
  const [binsCdf, setBinsCdf] = useState(false);        // 副トグル: 累積%表示
  const [binsData, setBinsData] = useState(null);       // 選択県レスポンス
  const [binsPinData, setBinsPinData] = useState(null); // ◆ピン県レスポンス（第2輪郭）
  const [binsPulse, setBinsPulse] = useState(false);    // Bカードclick→閾値ゾーンパルス
  const [binsZoneHover, setBinsZoneHover] = useState(false); // 網掛けhover↔Bカード相互ハイライト
  const binsBoxRef = useRef(null);
  const binsPulseTimer = useRef(null);
  // 取得（demandProjパターン・開時のみ）。sexパラメータは常に省略= male/female両行を取得し
  // クライアント側でフィルタ/合算する（「全体」合算とミラーの双方が両性行を要するため・数KB）。
  useEffect(() => {
    if (!binsOpen) return;
    let alive = true;
    setBinsData(null);
    fetch(`/api/ndb/checkup-bins?pref=${encodeURIComponent(ndbPref)}&metric=${encodeURIComponent(binsMetric)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive) setBinsData(j); })
      .catch(() => { if (alive) setBinsData(null); });
    return () => { alive = false; };
  }, [binsOpen, ndbPref, binsMetric]);
  // ◆ピン県は ?pref=pinnedPref で追加fetchし橙第2輪郭に重畳
  useEffect(() => {
    setBinsPinData(null);
    if (!binsOpen || !pinnedPref || pinnedPref === ndbPref) return;
    let alive = true;
    fetch(`/api/ndb/checkup-bins?pref=${encodeURIComponent(pinnedPref)}&metric=${encodeURIComponent(binsMetric)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive) setBinsPinData(j && j.prefResolved ? j : null); })
      .catch(() => { if (alive) setBinsPinData(null); });
    return () => { alive = false; };
  }, [binsOpen, pinnedPref, ndbPref, binsMetric]);
  // Bカードclick → ドロワーを該当指標で開き scrollIntoView + 閾値ゾーンパルス
  const binsJumpTo = (riskKey) => {
    const t = RISK_BIN_THRESHOLD[riskKey];
    if (!t) return;
    setBinsMetric(t.metric);
    setBinsOpen(true);
    setTimeout(() => {
      const el = binsBoxRef.current;
      if (el && typeof el.scrollIntoView === 'function')
        el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    }, 80);
    setBinsPulse(false); // 連打時も <animate> を再挿入させる
    requestAnimationFrame(() => setBinsPulse(true));
    if (binsPulseTimer.current) clearTimeout(binsPulseTimer.current);
    binsPulseTimer.current = setTimeout(() => setBinsPulse(false), 1500);
  };
  useEffect(() => () => { if (binsPulseTimer.current) clearTimeout(binsPulseTimer.current); }, []);

  // ── rank2: ドメインレンズ（疾患縦串フィルタ） ── SelectionContext+URL(&domain) に昇格
  const { domain: activeDomain, setDomain: setActiveDomain } = useSelection();
  const dm = activeDomain ? DOMAIN_MAPPING[activeDomain] : null;
  // chip選択で Gap Finder テンプレを該当ドメインへ自動切替（可能なら）
  useEffect(() => {
    if (activeDomain && DOMAIN_GAP_TEMPLATE[activeDomain]) setGapTemplate(DOMAIN_GAP_TEMPLATE[activeDomain]);
  }, [activeDomain]);
  // 行の該当判定 / 退色 / ドメイン色左ボーダー（300msトランジション）
  const dMatch = (group, key) => !activeDomain || rowInDomain(activeDomain, group, key);
  const dFade = (group, key) => (activeDomain ? { opacity: dMatch(group, key) ? 1 : 0.25, transition: 'opacity 300ms ease' } : { transition: 'opacity 300ms ease' });
  const dBorder = (group, key) => (activeDomain && dMatch(group, key) ? { borderLeft: `3px solid ${dm.color}`, paddingLeft: 8 } : {});
  // Layer4 処方薬（DRUG_DOMAIN 日本語ラベル軸）の退色（utilization未整備ドメインは全行退色）
  const rxFade = (jpDomain) => (activeDomain ? { opacity: DOMAIN_TO_RX_LABEL[activeDomain] === jpDomain ? 1 : 0.25, transition: 'opacity 300ms ease' } : { transition: 'opacity 300ms ease' });
  // ドメイン非該当セクション全体の退色（診療行為カテゴリ等・疾患軸を持たない断面）
  const sectionFade = activeDomain ? { opacity: 0.32, transition: 'opacity 300ms ease' } : { transition: 'opacity 300ms ease' };

  // ── Layer4 処方個性ダイアグラム state（手順6） ──
  const [rxSort, setRxSort] = useState('divergence');   // 'divergence'(乖離大順)|'domain'(領域順=全国数量順)
  const [rxExpanded, setRxExpanded] = useState(null);   // 展開中の領域名（単一openアコーディオン）
  const [rxHoverKey, setRxHoverKey] = useState(null);   // 行hover=濃紺ツールチップ（mobは1タップ=情報）
  const [rxFlashKey, setRxFlashKey] = useState(null);   // ヘッドラインチップ→行フラッシュ（psFlashKey方式）
  const [rx4bExpanded, setRx4bExpanded] = useState(null); // Layer4b: 分類行click=当該分類47県ストリップ展開
  const rxRowRefs = useRef({});                         // 領域行のFLIP refs（psRowRefs方式）
  const rxFlashTimer = useRef(null);
  useFlipRows(rxRowRefs, [rxSort, ndbPref], mob);       // ソート/県切替で行がtranslateY滑走
  const rxJumpToRow = (key) => {
    const el = rxRowRefs.current[key];
    if (el && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    setRxFlashKey(key);
    if (rxFlashTimer.current) clearTimeout(rxFlashTimer.current);
    rxFlashTimer.current = setTimeout(() => setRxFlashKey(null), 1200);
  };
  useEffect(() => () => { if (rxFlashTimer.current) clearTimeout(rxFlashTimer.current); }, []);
  // ドメインレンズ: DOMAIN_TO_RX_LABEL 一致領域行を自動展開（rxFade退色は既存維持）
  useEffect(() => {
    const lbl = activeDomain ? DOMAIN_TO_RX_LABEL[activeDomain] : null;
    if (lbl) setRxExpanded(lbl);
  }, [activeDomain]);

  // Phase 4-3 R3: mode に応じて表示する causes を切り替える
  const displayCauses = (() => {
    if (mortalityMode === 'crude') return causes;
    if (!mortalityOutcome2020?.prefectures?.[ndbPref]) return causes;
    const aaData = mortalityOutcome2020.prefectures[ndbPref];
    const SIX_CAUSES = ['悪性新生物', '心疾患', '脳血管疾患', '肺炎', '糖尿病', '腎不全'];
    return SIX_CAUSES.map(name => {
      const rate = aaData[name]?.age_adjusted?.[mortalitySex]?.rate;
      return rate != null ? { cause: name, rate } : null;
    }).filter(Boolean).sort((a, b) => b.rate - a.rate);
  })();
  // ── 手順1共有基盤: 県別人口 prefPops（住基2025・agePyramid由来の単一分母） ──
  // area_demographics の munis 合算も政令市を含む完全値(2026-07再生成)だが、分母は agePyramid に一本化。
  // prefMaps(popByPref/diagNat) と rxShared(classRatio/domainAgg) で共用する。
  const prefPops = useMemo(() => {
    const m = {};
    if (agePyramid?.prefectures) {
      Object.entries(agePyramid.prefectures).forEach(([p, ap]) => {
        const r = computeAgeRates(ap);
        if (r) m[p] = r.total;
      });
    }
    return m;
  }, [agePyramid]);

  const prefMaps = (()=>{
    // 分母人口・65+率は住基2025(agePyramid)から(単一分母ポリシー)
    const popByPref = prefPops, aging = {};
    if (agePyramid?.prefectures) {
      Object.entries(agePyramid.prefectures).forEach(([p, ap]) => {
        const r = computeAgeRates(ap);
        if (r) aging[p] = r.rate65;
      });
    }
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
    // 手順1共有基盤: diagNat — カテゴリ別の人口加重全国値 Σ_isP47(total_claims)/Σ_isP47(pop)×100000。
    // 47県単純平均でなく人口加重（Layer3のtier判定/全国tick・strip natAvgズレ修正に使用）。
    // データに全国行は無い（isP47で擬似県「都道府県判別不可」等を防御）。
    const diagNat = {};
    if (ndbDiag) {
      const num = {}, den = {};
      ndbDiag.forEach(d => {
        if (!isP47(d.prefecture)) return;
        const pop = popByPref[d.prefecture] || 0;
        if (pop <= 0) return;
        num[d.category] = (num[d.category] || 0) + d.total_claims;
        den[d.category] = (den[d.category] || 0) + pop;
      });
      Object.keys(num).forEach(c => { if (den[c] > 0) diagNat[c] = num[c] / den[c] * 100000; });
    }
    const egfr = {};
    if (ndbHc) {
      ndbHc.filter(h=>h.metric==='eGFR').forEach(h => { egfr[h.pref] = (h.male+h.female)/2; });
    }
    return { aging, diag, diagNat, egfr };
  })();

  // ── 手順1共有基盤: rxAll 由来の処方集計（Layer4本体とBridgeで共用） ──
  // natTotals: 薬効分類name→全国qty合算（データは47県のみだが擬似県混入にisP47で防御）
  // classRatio(pref,name) = (qty/prefPop)/(natQty/natPop) — 人口当たり数量の対全国比。
  //   数量の単位(錠/g/mL)は分子分母で相殺されるため同一分類内の県間比較のみ有効。
  // domainAgg: 疾患領域→{pref→対全国比}。構成分類の qty/natQty を各々合算した比
  //   （=各分類比の全国数量加重平均と数学的に等価）。
  const rxShared = useMemo(() => {
    if (!rxAll || !rxAll.length) return null;
    let natPop = 0;
    Object.entries(prefPops).forEach(([p, v]) => { if (isP47(p)) natPop += v; });
    const natTotals = {}, byPref = {};
    rxAll.forEach(r => {
      if (!isP47(r.pref)) return;
      const qty = r.qty || 0;
      natTotals[r.name] = (natTotals[r.name] || 0) + qty;
      const m = byPref[r.pref] || (byPref[r.pref] = {});
      m[r.name] = (m[r.name] || 0) + qty;
    });
    const classRatio = (pref, name) => {
      const pop = prefPops[pref], qty = byPref[pref]?.[name], natQty = natTotals[name];
      if (!pop || !natPop || qty == null || !natQty) return null;
      return (qty / pop) / (natQty / natPop);
    };
    // 領域別合算（DRUG_DOMAIN構成分類のみ。マッピング外分類は領域集計対象外）
    const domSums = {};
    Object.entries(byPref).forEach(([pref, m]) => {
      Object.entries(m).forEach(([name, qty]) => {
        const dom = DRUG_DOMAIN[name];
        if (!dom) return;
        const d = domSums[dom] || (domSums[dom] = { nat: 0, byPref: {} });
        d.byPref[pref] = (d.byPref[pref] || 0) + qty;
      });
    });
    Object.entries(natTotals).forEach(([name, qty]) => {
      const dom = DRUG_DOMAIN[name];
      if (dom && domSums[dom]) domSums[dom].nat += qty;
    });
    const domainAgg = {};
    Object.entries(domSums).forEach(([dom, d]) => {
      const perPref = {};
      if (d.nat > 0 && natPop > 0) {
        Object.entries(d.byPref).forEach(([pref, qty]) => {
          const pop = prefPops[pref];
          if (pop > 0) perPref[pref] = (qty / pop) / (d.nat / natPop);
        });
      }
      domainAgg[dom] = perPref;
    });
    return { natPop, natTotals, byPref, classRatio, domainAgg };
  }, [rxAll, prefPops]);
  // 薬効分類の47県 対全国比ストリップ値（Layer4展開/Layer4b分類展開で共用・比×100=%）
  const rxClassStrip = (name) => {
    if (!rxShared) return [];
    return Object.keys(rxShared.byPref).filter(isP47).map(p => {
      const cr = rxShared.classRatio(p, name);
      return cr != null ? { pref: p, value: cr * 100 } : null;
    }).filter(Boolean);
  };


  const ndbCtx = {
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
  };

  return <>

  {/* Header */}
  <div style={{marginBottom:20}}>
    <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Healthcare Atlas</div>
    <h1 style={{fontSize:mob?20:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>{navTitle || '都道府県 医療プロファイル'}</h1>
    <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>NDB・人口動態統計・特定健診を統合し、地域の「根因→リスク→治療→結果」を俯瞰。</p>
  </div>
  <div style={{display:'flex',gap:8,marginBottom:20,alignItems:'center'}}>
    <select value={ndbPref} onChange={e=>setNdbPref(e.target.value)} style={{padding:'10px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:14,background:'#fff',fontWeight:600}}>
      {sortPrefs([...new Set(ndbDiag.map(d=>d.prefecture))]).map(p=><option key={p} value={p}>{p}</option>)}
    </select>
    {prefPop > 0 && <span style={{fontSize:12,color:'#94a3b8'}}>人口 {fmt(prefPop)}人</span>}
  </div>

  {/* rank2: ドメインレンズ 疾患chipバー（sticky・ヘッダー付近に同居） */}
  <div style={{position:'sticky',top:0,zIndex:20,background:'#fff',padding:'8px 0 6px',marginBottom:12,borderBottom:'1px solid #f1f5f9'}}>
    <div style={{display:'flex',alignItems:'center',gap:6,overflowX:'auto',paddingBottom:2}}>
      <span style={{fontSize:10,color:'#94a3b8',fontWeight:700,flexShrink:0,letterSpacing:'0.04em'}}>疾患縦串</span>
      {DOMAIN_ORDER.map(id=>{
        const d = DOMAIN_MAPPING[id]; const on = activeDomain===id;
        return <button key={id} onClick={()=>setActiveDomain(on?null:id)}
          title={`${d.label} 縦串でフィルタ`}
          style={{display:'inline-flex',alignItems:'center',gap:5,flexShrink:0,padding:'5px 11px',borderRadius:16,cursor:'pointer',
            border:'1px solid '+(on?d.color:'#e2e8f0'), background:on?d.color:'#fff', color:on?'#fff':'#475569',
            fontSize:12,fontWeight:600,transition:'all 200ms',whiteSpace:'nowrap'}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:on?'#fff':d.color,flexShrink:0}}/>
          <span>{d.icon} {d.label}</span>
          {d.isExperimental && <span style={{fontSize:8,padding:'0 4px',borderRadius:4,background:on?'rgba(255,255,255,0.25)':'#f1f5f9',color:on?'#fff':'#94a3b8',fontWeight:600}}>試験的</span>}
        </button>;
      })}
      {activeDomain && <button onClick={()=>setActiveDomain(null)} style={{marginLeft:'auto',flexShrink:0,padding:'5px 10px',borderRadius:16,border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>解除 ✕</button>}
    </div>
  </div>

  {/* rank2: ドメインレンズ 固定ガードバナー（選択中のみ・5断面の整備状況+年度併記） */}
  {dm && (()=>{
    const st = domainSectionStatus(activeDomain);
    const dims = [
      {k:'risks',       label:'リスク',            ok: st.risks>0,      badge:'checkupRisk',   extra: st.risks>0?`${st.risks}指標(質問票+健診)`:null, note:null},
      {k:'demand',      label:'疾病負荷(受療率)',  ok: st.demand,       badge:'patientSurvey', extra:null, note: st.demandNote},
      {k:'utilization', label:'医療利用(処方proxy)',ok: st.utilization,  badge:'ndbRx',         extra:null, note: st.utilizationNote},
      {k:'supply',      label:'供給proxy(病床)',   ok: st.supply,       badge:'bedFunc',       extra:null, note: st.supplyNote},
      {k:'outcome',     label:'結果(死亡率)',       ok: st.outcome,      badge:'vitalStats',    extra:null, note:null},
    ];
    return (
    <div style={{background:dm.bg,border:`1px solid ${dm.color}44`,borderLeft:`4px solid ${dm.color}`,borderRadius:10,padding:'12px 16px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:8}}>
        <span style={{fontSize:16}}>{dm.icon}</span>
        <span style={{fontSize:14,fontWeight:700,color:dm.color}}>{dm.label} 縦串フィルタ 適用中</span>
        {st.isExperimental && <span title={st.experimentalNote||''} style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:'#fff',color:'#b45309',border:'1px solid #fde68a',fontWeight:600,cursor:'help'}}>試験的マッピング</span>}
      </div>
      <div style={{fontSize:11,color:'#7f1d1d',background:'#fff',border:'1px solid #fecaca',borderRadius:6,padding:'7px 10px',marginBottom:10,lineHeight:1.55,fontWeight:600}}>
        ⚠ 縦串は薬効分類・ICD章の定義対応であり、因果連鎖の実証ではありません。各断面は異なる調査・年度に由来します（下のバッジで年度混在を明示）。
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {dims.map(di=>{
          const b = getSourceBadge(di.badge);
          return <div key={di.k} title={di.note||b.title} style={{flex:'1 1 150px',minWidth:130,background:'#fff',borderRadius:6,padding:'7px 10px',border:'1px solid #f1f5f9'}}>
            <div style={{fontSize:10,color:'#64748b',fontWeight:700,marginBottom:4}}>{di.label}</div>
            {di.ok
              ? <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
                  <span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:4,background:b.bg,color:b.color,border:`1px solid ${b.border}`}}>{b.year}</span>
                  {di.extra && <span style={{fontSize:9,color:'#94a3b8'}}>{di.extra}</span>}
                </div>
              : <div style={{fontSize:10,color:'#b45309',fontWeight:700}}>この断面は未整備</div>}
          </div>;
        })}
      </div>
    </div>);
  })()}

  {/* rank1: 比較県ピン チップ（分布ストリップのドットclickで設定・ここで解除/移動） */}
  {pinnedPref && pinnedPref !== ndbPref && (
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,padding:'7px 12px',background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,fontSize:12,flexWrap:'wrap'}}>
      <span style={{color:'#c2410c',fontWeight:700}}>◆ 比較県: {pinnedPref}</span>
      <span style={{color:'#9a3412',fontSize:11}}>全ストリップ上で橙◆に点灯中</span>
      <button onClick={()=>setNdbPref(pinnedPref)} style={{marginLeft:'auto',padding:'3px 10px',border:'1px solid #fdba74',background:'#fff',color:'#c2410c',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>この県へ移動 →</button>
      <button onClick={()=>setPinnedPref(null)} style={{padding:'3px 10px',border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>解除 ✕</button>
    </div>
  )}

  {/* ═══ DEMOGRAPHIC CONTEXT (人口KPI) ═══ */}
  <PopulationKpiSection {...ndbCtx} />

  {/* ═══ Layer 1: ROOT CAUSE (生活習慣リスク) ═══ */}
  <RootCauseSection {...ndbCtx} />

  {/* ═══ Layer 2: RISK (健診リスク) — 2セクション化 (Phase 2D-Layer2) ═══ */}
  <CheckupRiskSection {...ndbCtx} />

  {/* ═══ Layer 2.5: DEMAND-SIDE (受療率 — 患者調査) ═══ */}
  <DemandForestSection {...ndbCtx} />

  {/* ═══ Layer 3: DEMAND (医療利用) — ヒーロー=受診リズム・イヤートラック「県民の1年」 ═══ */}
  <YearTrackSection {...ndbCtx} />

  {/* ═══ Layer 4: TREATMENT (治療パターン — 処方個性ダイアグラム) ═══
       ★単位非統一問題の解決: 絶対数量の棒比較を廃し、同一薬効分類内の
       県vs全国の人口当たり数量比（単位は分子分母で相殺）を中央スパイン発散
       ロリポップ（受療率フォレストと同一の共有log2軸 domain[40,250]%）で描く。 */}
  <PrescriptionSection {...ndbCtx} />

  {/* ═══ Layer 4b: 処方薬 個別Top10 ═══ */}
  <PrescriptionTop10Section {...ndbCtx} />

  {/* ═══ Layer 5: OUTCOME (結果 — 死因構造) ═══ */}
  <OutcomeSection {...ndbCtx} />

  {/* ═══ GAP FINDER: リスク×結果の不一致検出（テンプレ切替）═══ */}
  <GapFinderSection {...ndbCtx} />

  {/* ═══ Layer 6: SUPPLY-DEMAND BRIDGE v0 (疾患別 需要・供給・結果サマリー) ═══ */}
  <DomainSupplyDemandBridge
    mob={mob}
    ndbPref={ndbPref}
    patientSurvey={patientSurvey}
    ndbQ={ndbQ}
    vitalStats={vitalStats}
    bedFunc={bedFunc}
    ndbRx={ndbRx}
    ndbRxAll={rxAll}
    pinnedPref={pinnedPref}
    agePyramid={agePyramid}
    ndbHc={ndbHc}
    ndbCheckupRiskRates={ndbCheckupRiskRates}
    ndbCheckupRiskRatesStd={ndbCheckupRiskRatesStd}
    mortalityOutcome2020={mortalityOutcome2020}
  />

  {/* ═══ Layer 7: REGIONAL MISMATCH EXPLORER (Phase 4-1 P1-4 MVP + 4-3f support evidence) ═══ */}
  <RegionalMismatchExplorer
    pref={ndbPref}
    ndbCheckupRiskRates={ndbCheckupRiskRates}
    ndbQuestionnaire={ndbQ}
    patientSurvey={patientSurvey}
    mortalityOutcome2020={mortalityOutcome2020}
    homecareCapability={homecareCapability}
    agePyramid={agePyramid}
  />

  <div style={{padding:'10px 0',fontSize:11,color:'#94a3b8',marginTop:8,lineHeight:1.8}}>
    出典: 厚生労働省 第10回NDBオープンデータ（令和5年度レセプト・令和4年度特定健診）<br/>
    厚労省 人口動態統計 2024年確定数 / 住民基本台帳 2025年1月1日<br/>
    ※処方薬の疾患領域マッピングは薬効分類に基づく推定であり、実際の処方目的とは異なる場合があります
  </div>
  </>;
}
