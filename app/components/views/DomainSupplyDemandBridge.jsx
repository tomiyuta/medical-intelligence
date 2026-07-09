'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { DOMAIN_MAPPING, DOMAIN_ORDER, describeDelta, DATA_BADGE, FP_TIERS, tierOf } from '../../../lib/domainMapping';
import { PREF_ORDER } from '../shared';
import { getSourceBadge } from '../../../lib/sourceRegistry';
import InterpretationGuard from '../ui/InterpretationGuard';

const MAX_RISKS_COLLAPSED = 3;

// 47都道府県ホワイトリスト（『都道府県判別不可』『全国』等の擬似県を分布から除外 — NdbView isP47 と同一規約）
const PREF47_SET = new Set(PREF_ORDER);
const isP47 = (p) => PREF47_SET.has(p);

// prefers-reduced-motion（NdbView L25 と同型を部品内定義 — アニメ/transition 全省略に使用）
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// percentileOf: 47県値配列内の percentile（昇順 rank−0.5 / N ×100・同値は平均 rank）
const percentileOf = (sortedAsc, v) => {
  if (v == null || !isFinite(v) || !sortedAsc || sortedAsc.length < 2) return null;
  let below = 0, equal = 0;
  for (const x of sortedAsc) { if (x < v) below++; else if (x === v) equal++; }
  const rank = below + (equal + 1) / 2; // 平均 rank（1始まり）
  return (rank - 0.5) / sortedAsc.length * 100;
};
// 降順順位（値が大きいほど1位）— ツールチップ『47県中N位相当』用
const rankDescOf = (sortedAsc, v) => {
  if (v == null || !sortedAsc || sortedAsc.length === 0) return null;
  let higher = 0;
  for (const x of sortedAsc) if (x > v) higher++;
  return higher + 1;
};
const median = (arr) => {
  if (!arr || arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
// 駅ノード色: 47県内 percentile → FP_TIERS 写像（rose/indigo 中立発散・良し悪しの色ではない）
// 上位10%=突出高 / 10-25%=やや高 / 中央50%=標準 / 下位25-10%=やや低 / 下位10%=突出低
const tierColorOfPct = (pct) => {
  if (pct == null) return '#94a3b8';
  if (pct >= 90) return FP_TIERS[0].color;
  if (pct >= 75) return FP_TIERS[1].color;
  if (pct > 25) return FP_TIERS[2].color;
  if (pct > 10) return FP_TIERS[3].color;
  return FP_TIERS[4].color;
};

// 5駅定義（DATA_BADGE 5キーと1対1・sourceKey は getSourceBadge 年度バッジ）
const STATIONS = [
  { key: 'risk',        title: 'リスク',     short: '危険', badge: DATA_BADGE.risk,        sourceKey: 'checkupRisk' },
  { key: 'demand',      title: '疾病負荷',   short: '負荷', badge: DATA_BADGE.demand,      sourceKey: 'patientSurvey' },
  { key: 'utilization', title: '医療利用',   short: '利用', badge: DATA_BADGE.utilization, sourceKey: 'ndbRx' },
  { key: 'supply',      title: '供給proxy',  short: '供給', badge: DATA_BADGE.supply,      sourceKey: 'bedFunc' },
  { key: 'outcome',     title: '結果',       short: '結果', badge: DATA_BADGE.outcome,     sourceKey: 'mortalityAdj' },
];

// 年度バッジ chip（yearBadge 必須規約 — 各駅ヘッダ+ツールチップに常設）
const YearChip = ({ k }) => {
  const b = getSourceBadge(k);
  return (
    <span title={b.title} style={{fontSize:8,padding:'1px 5px',borderRadius:3,background:b.bg,border:`1px solid ${b.border}`,color:b.color,fontWeight:700,whiteSpace:'nowrap'}}>
      {b.year}
    </span>
  );
};

// ndbRxAll: 全47県の処方rows（NdbViewのrxAll state・手順1共有基盤）。
//   compute47Avg はこれが無いと「選択県のみのndbRx」で自県以外全null→47県平均=自県値に
//   縮退し utilization delta が恒等+0.0%になる（既存バグ）。ndbRxAll で根治。
// pinnedPref: ◆比較ピン県（パイプラインの橙ノード重畳）。
export default function DomainSupplyDemandBridge({ ndbPref, patientSurvey, ndbQ, vitalStats, bedFunc, ndbRx, ndbRxAll, pinnedPref, agePyramid, mob, ndbHc, ndbCheckupRiskRates, ndbCheckupRiskRatesStd, mortalityOutcome2020 }) {
  // Phase 2A: risks[] が4件以上の領域は3件で折りたたみ表示（展開カード内）
  const [expandedRisks, setExpandedRisks] = useState({});
  // パイプライン v1: 行クリックで単一openアコーディオン（現行セル詳細を展開カードとして温存）
  const [expandedDomain, setExpandedDomain] = useState(null);
  // hover/タップ中の駅ノード {id, st(駅index)} — mobは1タップ=tooltip/再タップ=展開
  const [hoverNode, setHoverNode] = useState(null);
  // 駅click→展開カード内の該当断面を一瞬ハイライト
  const [flashStation, setFlashStation] = useState(null);
  const flashTimer = useRef(null);
  // 初回マウント演出（コネクタ点線ドロー+ノード浮上）— prefers-reduced-motion では発火させない
  const [anim, setAnim] = useState(false);
  useEffect(() => { if (!prefersReducedMotion()) setAnim(true); }, []);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const toggleExpand = (id) => setExpandedRisks(prev => ({ ...prev, [id]: !prev[id] }));

  // 都道府県人口の集計 (agePyramid 21年齢帯から男+女合計)
  const computePop = (prefName) => {
    if (!agePyramid?.prefectures) return null;
    const ap = agePyramid.prefectures[prefName];
    if (!ap?.male || !ap?.female) return null;
    let sum = 0;
    for (let i = 0; i < ap.male.length; i++) sum += (ap.male[i] || 0) + (ap.female[i] || 0);
    return sum;
  };

  // 処方rows: 全県版 ndbRxAll があればそれを使用（未着ロード中は選択県のみの ndbRx にフォールバック）。
  // ndbRx 単独では compute47Avg が自県以外 null → 47県平均=自県値に縮退する（恒等+0.0%バグ）。
  const rxRows = (ndbRxAll && ndbRxAll.length) ? ndbRxAll : ndbRx;
  const rxAllReady = !!(ndbRxAll && ndbRxAll.length);

  // 処方proxy: 都道府県別 対象code合計qty / 人口 × 100000
  const computeRxProxy = (prefName, codes) => {
    if (!rxRows || !prefName || !codes?.length) return null;
    const sum = rxRows
      .filter(d => d.pref === prefName && codes.includes(d.code))
      .reduce((s, d) => s + (d.qty || 0), 0);
    const pop = computePop(prefName);
    if (!pop || sum === 0) return null;
    return sum / pop * 100000;
  };

  // 47都道府県の単純平均 proxy (人口加重なし)
  const compute47Avg = (codes) => {
    if (!rxRows || !agePyramid?.prefectures) return null;
    const proxies = Object.keys(agePyramid.prefectures)
      .filter(isP47)
      .map(p => computeRxProxy(p, codes))
      .filter(v => v != null);
    if (proxies.length === 0) return null;
    return proxies.reduce((s, v) => s + v, 0) / proxies.length;
  };

  // bedFunc から機能区分シェアを計算
  const computeBfShare = (bf, keys) => {
    if (!bf) return null;
    const total = bf['総床数'] || 0;
    if (total === 0) return null;
    return keys.reduce((s, k) => s + ((bf[k]?.beds || 0) / total * 100), 0);
  };

  // ── 駅別・県別の生値（percentile 分布用の純アクセサ。全走査は isP47 で擬似県除外）──
  const riskValOf = (riskCfg, prefName) => {
    if (!riskCfg || !prefName) return null;
    if (riskCfg.source === 'ndbCheckupRiskRate') {
      return ndbCheckupRiskRates?.risk_rates?.[riskCfg.riskKey]?.by_pref?.[prefName]?.rate ?? null;
    }
    if (riskCfg.source === 'ndbHc') {
      const rec = Array.isArray(ndbHc) ? ndbHc.find(h => h.metric === riskCfg.ndbHcMetric && h.pref === prefName) : null;
      return (rec && rec.male != null && rec.female != null) ? (rec.male + rec.female) / 2 : null;
    }
    if (riskCfg.source === 'ndbQ') {
      const v = ndbQ?.prefectures?.[prefName]?.[riskCfg.ndbQKey];
      return typeof v === 'number' ? v : null;
    }
    return null;
  };
  const stationValOf = (domain, type, prefName) => {
    const cfg = domain[type];
    if (!cfg || !prefName) return null;
    if (type === 'demand') {
      const v = patientSurvey?.prefectures?.[prefName]?.categories?.[cfg.patientSurveyKey]?.outpatient;
      return typeof v === 'number' ? v : null;
    }
    if (type === 'utilization') return rxAllReady ? computeRxProxy(prefName, cfg.codes) : null;
    if (type === 'supply') return computeBfShare(bedFunc?.prefectures?.[prefName], cfg.bedFuncKeys);
    if (type === 'outcome') {
      const aam = mortalityOutcome2020?.prefectures?.[prefName]?.[cfg.aamCause]?.age_adjusted;
      const m = aam?.male?.rank, f = aam?.female?.rank;
      return (m != null && f != null) ? (m + f) / 2 : null; // 男女rankの単純平均（1位=全国最高値）
    }
    return null;
  };

  // ── computeStationDist: 6疾患×5駅の47県分布（percentile 算出の土台）────────────
  // outcome は「男女平均rank」なので値が小さいほど死亡率が高い → invert=true で
  // percentile を反転し「上=47県内で値(死亡率)が高い」の縦文法を全駅で統一する。
  const pipeline = useMemo(() => {
    const model = {};
    for (const id of DOMAIN_ORDER) {
      const domain = DOMAIN_MAPPING[id];
      if (!domain) continue;
      const st = {};
      for (const type of ['demand', 'utilization', 'supply', 'outcome']) {
        if (!domain[type]) { st[type] = null; continue; }
        const vals = {};
        for (const p of PREF_ORDER) {
          const v = stationValOf(domain, type, p);
          if (v != null && isFinite(v)) vals[p] = v;
        }
        st[type] = { vals, sorted: Object.values(vals).sort((a, b) => a - b), invert: type === 'outcome' };
      }
      st.risk = (domain.risks || []).map(rc => {
        const vals = {};
        for (const p of PREF_ORDER) {
          const v = riskValOf(rc, p);
          if (v != null && isFinite(v)) vals[p] = v;
        }
        return { cfg: rc, vals, sorted: Object.values(vals).sort((a, b) => a - b) };
      });
      model[id] = st;
    }
    return model;
  }, [rxRows, rxAllReady, agePyramid, patientSurvey, ndbQ, bedFunc, mortalityOutcome2020, ndbCheckupRiskRates, ndbHc]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ndbPref) return null;

  // 各データソースから pref/national を抽出
  const psNat = patientSurvey?.prefectures?.['全国'];
  const psPref = patientSurvey?.prefectures?.[ndbPref];
  // ndbQ には '全国' エントリがないため、47都道府県の単純平均を国の代理として計算
  const ndbQNat = (() => {
    const direct = ndbQ?.prefectures?.['全国'];
    if (direct) return direct;
    const prefs = ndbQ?.prefectures || {};
    const valid = Object.entries(prefs).filter(([k, v]) => isP47(k) && typeof v === 'object');
    if (valid.length === 0) return null;
    const keys = Object.keys(valid[0][1]);
    const result = {};
    for (const k of keys) {
      const vals = valid.map(([, v]) => v[k]).filter(v => typeof v === 'number');
      if (vals.length > 0) result[k] = vals.reduce((s, v) => s + v, 0) / vals.length;
    }
    return result;
  })();
  const ndbQPref = ndbQ?.prefectures?.[ndbPref];
  const vsNat = vitalStats?.national;
  const vsPref = vitalStats?.prefectures?.find(p => p.pref === ndbPref);
  // Phase 4-1 P1-1: 2020年 粗死亡率 + 年齢調整死亡率
  const moPref = mortalityOutcome2020?.prefectures?.[ndbPref];
  const moNat = mortalityOutcome2020?.national;
  // Outcome の3段データ取得ヘルパー
  const getOutcomeTriad = (cfg) => {
    if (!cfg) return null;
    const aamCause = cfg.aamCause;
    const aamPref = aamCause ? moPref?.[aamCause] : null;
    const aamNat = aamCause ? moNat?.[aamCause] : null;
    const c2024Pref = vsPref?.causes?.find(c => c.cause === cfg.vitalCause)?.rate;
    const c2024Nat = vsNat?.causes?.find(c => c.cause === cfg.vitalCause)?.rate;
    return {
      crude2020: aamPref?.crude || null,
      ageAdj2020: aamPref?.age_adjusted || null,
      crude2020Nat: aamNat?.crude || null,
      ageAdj2020Nat: aamNat?.age_adjusted || null,
      crude2024: c2024Pref,
      crude2024Nat: c2024Nat,
    };
  };
  const bfNat = bedFunc?.national;
  const bfPref = bedFunc?.prefectures?.[ndbPref];

  // ─────────────────────────────────────────────────────────────────
  // Bridge Risk Model v1: risks[] 配列の各要素を処理するヘルパー
  // ─────────────────────────────────────────────────────────────────
  const getRiskCell = (riskCfg) => {
    if (!riskCfg) return null;
    let prefVal = null, natVal = null;
    let refLabel = '47都道府県平均';
    if (riskCfg.source === 'ndbCheckupRiskRate') {
      const rates = ndbCheckupRiskRates?.risk_rates?.[riskCfg.riskKey];
      if (rates) {
        prefVal = rates.by_pref?.[ndbPref]?.rate;
        const all = Object.entries(rates.by_pref || {}).filter(([k]) => isP47(k)).map(([, v]) => v.rate).filter(v => typeof v === 'number');
        if (all.length > 0) natVal = all.reduce((s, v) => s + v, 0) / all.length;
      }
      // Phase 2C-1: 年齢標準化率も併記 (47県内標準人口で直接標準化)
      const stdRates = ndbCheckupRiskRatesStd?.risk_rates?.[riskCfg.riskKey];
      if (stdRates?.by_pref?.[ndbPref]) {
        const e = stdRates.by_pref[ndbPref];
        riskCfg._stdInfo = {
          stdRate: e.age_standardized_rate,
          deltaPp: e.delta_pp,
        };
      }
    } else if (riskCfg.source === 'ndbHc') {
      // NDB健診 平均値 (eGFR等)。男女平均を県値とする
      const hcRecs = Array.isArray(ndbHc) ? ndbHc.filter(h => h.metric === riskCfg.ndbHcMetric) : [];
      const prefRec = hcRecs.find(h => h.pref === ndbPref);
      if (prefRec) prefVal = (prefRec.male + prefRec.female) / 2;
      const valid = hcRecs.filter(h => isP47(h.pref));
      if (valid.length > 0) natVal = valid.reduce((s, h) => s + (h.male + h.female) / 2, 0) / valid.length;
    } else if (riskCfg.source === 'ndbQ') {
      prefVal = ndbQPref?.[riskCfg.ndbQKey];
      natVal = ndbQNat?.[riskCfg.ndbQKey];
    }
    if (prefVal == null) return { ...riskCfg, missing: true };
    const delta = describeDelta(prefVal, natVal, riskCfg.direction || 'higher_worse', undefined, undefined, refLabel);
    return { ...riskCfg, prefVal, natVal, delta };
  };

  // 各セルの値を取得するヘルパー (demand/utilization/supply/outcome)
  const getCell = (domain, type) => {
    const cfg = domain[type];
    if (!cfg) return null;
    let prefVal = null, natVal = null, label = cfg.label, unit = cfg.unit, note = cfg.note;

    let refLabel = '全国平均';
    if (type === 'demand') {
      const psKey = cfg.patientSurveyKey;
      prefVal = psPref?.categories?.[psKey]?.outpatient;
      natVal = psNat?.categories?.[psKey]?.outpatient;
    } else if (type === 'utilization') {
      prefVal = computeRxProxy(ndbPref, cfg.codes);
      natVal = compute47Avg(cfg.codes);
      refLabel = '47都道府県平均'; // 処方薬データに'全国'集計値がないため47県平均を使用
    } else if (type === 'supply') {
      prefVal = computeBfShare(bfPref, cfg.bedFuncKeys);
      natVal = computeBfShare(bfNat, cfg.bedFuncKeys);
    } else if (type === 'outcome') {
      prefVal = vsPref?.causes?.find(c => c.cause === cfg.vitalCause)?.rate;
      natVal = vsNat?.causes?.find(c => c.cause === cfg.vitalCause)?.rate;
    }

    if (prefVal == null) return { label, unit, note, missing: true, basis: cfg.basis };
    const delta = describeDelta(prefVal, natVal, cfg.direction || 'higher_worse', undefined, undefined, refLabel);
    return { label, unit, note, prefVal, natVal, delta, proxyLabel: cfg.proxyLabel, basis: cfg.basis };
  };

  const fmtVal = (v, unit) => {
    if (v == null) return '—';
    if (typeof v !== 'number') return String(v);
    if (v >= 1000) return Math.round(v).toLocaleString('ja-JP');
    if (v % 1 === 0) return v.toString();
    return v.toFixed(1);
  };

  // ── パイプライン幾何（HTMLノード+SVGコネクタのハイブリッド。行高固定=mob横スクロール廃止）──
  const ROW_H = mob ? 88 : 96;
  const LABEL_W = mob ? 84 : 120;
  const TRACK_TOP = mob ? 12 : 14;
  const TRACK_H = 56;
  const cyOf = (pct) => TRACK_TOP + (100 - Math.max(0, Math.min(100, pct))) / 100 * TRACK_H;
  const cxPct = (i) => (i + 0.5) * 20; // 駅中心の横位置（%）
  const hasPin = pinnedPref && pinnedPref !== ndbPref;

  // 駅 percentile（分布 + invert 対応）
  const pctOfDist = (dist, prefName) => {
    if (!dist) return null;
    const v = dist.vals[prefName];
    const p = percentileOf(dist.sorted, v);
    if (p == null) return null;
    return dist.invert ? 100 - p : p;
  };

  // 疾患行ごとの駅ノードモデル（選択県+◆ピン県）
  const buildRowNodes = (id) => {
    const m = pipeline[id];
    if (!m) return null;
    const nodes = STATIONS.map((s, i) => {
      if (s.key === 'risk') {
        const entries = (m.risk || []).map(r => ({
          cfg: r.cfg,
          pct: percentileOf(r.sorted, r.vals[ndbPref]),
          pinPct: hasPin ? percentileOf(r.sorted, r.vals[pinnedPref]) : null,
          val: r.vals[ndbPref] ?? null,
        }));
        const pcts = entries.map(e => e.pct).filter(p => p != null);
        const pinPcts = entries.map(e => e.pinPct).filter(p => p != null);
        return { st: s, i, kind: pcts.length ? 'node' : 'nodata', pct: median(pcts), pinPct: pinPcts.length ? median(pinPcts) : null, riskEntries: entries, riskCount: pcts.length };
      }
      const dist = m[s.key];
      if (!dist) return { st: s, i, kind: 'null' }; // 未整備（定義なし）
      const pct = pctOfDist(dist, ndbPref);
      if (pct == null) return { st: s, i, kind: 'nodata', loading: s.key === 'utilization' && !rxAllReady };
      return { st: s, i, kind: 'node', pct, pinPct: hasPin ? pctOfDist(dist, pinnedPref) : null, dist };
    });
    return nodes;
  };

  const stationFlash = (id, stKey) => {
    setExpandedDomain(id);
    setFlashStation(`${id}:${stKey}`);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashStation(null), 1200);
  };

  // 駅ノードのタップ/クリック（mob: 1タップ=tooltip・再タップ=展開 / PC: click=展開+該当断面フラッシュ）
  const onStationTap = (id, i, stKey) => {
    if (mob) {
      if (hoverNode && hoverNode.id === id && hoverNode.st === i) {
        setHoverNode(null);
        stationFlash(id, stKey);
      } else {
        setHoverNode({ id, st: i });
      }
    } else {
      stationFlash(id, stKey);
    }
  };

  // ── ツールチップ本文（実値+describeDelta+順位+年度バッジ+proxy/basis/note 必須併記）──
  const renderTooltip = (id, node) => {
    const domain = DOMAIN_MAPPING[id];
    const s = node.st;
    const wrap = {
      position: 'absolute', zIndex: 40, minWidth: 170, maxWidth: mob ? 220 : 260,
      background: '#1e293b', color: '#fff', borderRadius: 8, padding: '8px 10px',
      fontSize: 10, lineHeight: 1.55, boxShadow: '0 6px 20px rgba(15,23,42,0.35)', pointerEvents: 'none',
      left: `${cxPct(node.i)}%`,
      top: cyOf(node.pct ?? 50) - 12,
      transform: `translate(${node.i === 0 ? '-15%' : node.i >= 3 ? '-85%' : '-50%'}, -100%)`,
    };
    const badgeRow = (key) => {
      const b = getSourceBadge(key);
      return <span style={{fontSize:8,padding:'0 4px',borderRadius:3,background:'rgba(255,255,255,0.14)',color:'#e2e8f0',fontWeight:700,marginLeft:4}}>{b.label} {b.year}</span>;
    };
    if (node.kind === 'null') {
      const noteKey = s.key === 'demand' ? 'demandNote' : s.key === 'utilization' ? 'utilizationNote' : 'supplyNote';
      return (
        <div style={wrap}>
          <div style={{fontWeight:700,color:'#fbbf24'}}>{s.title} — 未整備</div>
          <div style={{color:'#cbd5e1',marginTop:2}}>{domain[noteKey] || 'この断面の proxy は v1 未整備です。位置は捏造せず破線ゴーストで示しています。'}</div>
        </div>
      );
    }
    if (node.kind === 'nodata') {
      return (
        <div style={wrap}>
          <div style={{fontWeight:700,color:'#fbbf24'}}>{s.title} — {node.loading ? '全県データ読込中…' : 'データなし'}</div>
          <div style={{color:'#cbd5e1',marginTop:2}}>{node.loading ? '47県分布の取得完了後にノードを表示します。' : `${ndbPref}の値が取得できないため位置を表示していません。`}</div>
        </div>
      );
    }
    const topPct = node.pct != null ? Math.round(100 - node.pct) : null;
    if (s.key === 'risk') {
      return (
        <div style={wrap}>
          <div style={{fontWeight:700}}>{ndbPref} リスク {node.riskCount}指標の中央位置{badgeRow('checkupRisk')}</div>
          <div style={{color:'#cbd5e1'}}>47県内 上位{topPct}%相当（中央値・方向は混在のため良し悪しラベルなし）</div>
          <div style={{marginTop:4,borderTop:'1px solid rgba(255,255,255,0.15)',paddingTop:4}}>
            {node.riskEntries.map((e, k) => (
              <div key={k} style={{display:'flex',justifyContent:'space-between',gap:8}}>
                <span style={{color:'#cbd5e1'}}>{e.cfg.label}</span>
                <span style={{whiteSpace:'nowrap'}}>{e.val == null ? '—' : `${fmtVal(e.val)}${e.cfg.unit === '%' ? '%' : ''}`}{e.pct != null && <span style={{color:'#94a3b8'}}>（上位{Math.round(100 - e.pct)}%）</span>}</span>
              </div>
            ))}
          </div>
          <div style={{color:'#94a3b8',marginTop:3}}>方向つきの解釈（describeDelta）は行を開いた展開カードで確認</div>
        </div>
      );
    }
    if (s.key === 'outcome') {
      const cfg = domain.outcome;
      const aam = moPref?.[cfg?.aamCause]?.age_adjusted;
      return (
        <div style={wrap}>
          <div style={{fontWeight:700}}>{cfg?.label}（2020 年齢調整）{badgeRow('mortalityAdj')}</div>
          <div style={{marginTop:2}}>
            男 {aam?.male?.rate != null ? aam.male.rate.toFixed(1) : '—'} <span style={{color:'#94a3b8'}}>({aam?.male?.rank}位)</span>
            {' / '}女 {aam?.female?.rate != null ? aam.female.rate.toFixed(1) : '—'} <span style={{color:'#94a3b8'}}>({aam?.female?.rank}位)</span>
          </div>
          <div style={{color:'#cbd5e1'}}>縦位置=男女rank単純平均のpercentile（1位=全国最高値・上=死亡率高い）</div>
          {hasPin && node.pinPct != null && <div style={{color:'#fdba74'}}>◆{pinnedPref} 上位{Math.round(100 - node.pinPct)}%相当</div>}
          <div style={{color:'#94a3b8',marginTop:3}}>2020粗・2024粗の3段詳細は展開カード（年齢調整と粗を直接比較しない）。死亡率は医療の優劣を示す指標ではない</div>
        </div>
      );
    }
    // demand / utilization / supply
    const cell = getCell(domain, s.key);
    const v = node.dist?.vals?.[ndbPref];
    const rank = rankDescOf(node.dist?.sorted, v);
    const tier = cell?.delta ? tierOf(cell.delta.deltaPct) : null;
    return (
      <div style={wrap}>
        <div style={{fontWeight:700}}>{cell?.label}{badgeRow(s.sourceKey)}</div>
        <div style={{marginTop:2,fontSize:12,fontWeight:700}}>
          {fmtVal(cell?.prefVal)}<span style={{fontSize:9,color:'#94a3b8',marginLeft:2}}>{cell?.unit}</span>
        </div>
        {cell?.delta && (
          <div style={{color:cell.delta.color === '#64748b' ? '#cbd5e1' : cell.delta.color,fontWeight:600}}>
            {cell.delta.label}（{cell.delta.deltaPct > 0 ? '+' : ''}{cell.delta.deltaPct.toFixed(1)}%）
            {tier && <span style={{marginLeft:4,fontSize:8,padding:'0 4px',borderRadius:3,background:'rgba(255,255,255,0.12)',color:'#e2e8f0'}}>{tier.label}</span>}
          </div>
        )}
        <div style={{color:'#cbd5e1'}}>47県中{rank}位相当・上位{topPct}%（高低は良し悪しではありません）</div>
        {hasPin && node.pinPct != null && <div style={{color:'#fdba74'}}>◆{pinnedPref} 上位{Math.round(100 - node.pinPct)}%相当</div>}
        {(cell?.proxyLabel || cell?.basis) && (
          <div style={{marginTop:3}}>
            {cell.proxyLabel && <span style={{fontSize:8,padding:'0 4px',background:'#fef3c7',color:'#92400e',borderRadius:3,fontWeight:700,marginRight:4}}>{cell.proxyLabel}</span>}
            {cell.basis && <span style={{fontSize:8,padding:'0 4px',background:'#cffafe',color:'#155e75',borderRadius:3,fontWeight:600}}>{cell.basis}</span>}
          </div>
        )}
        {cell?.note && <div style={{color:'#94a3b8',marginTop:3,fontStyle:'italic'}}>※{cell.note}</div>}
      </div>
    );
  };

  // ── 展開カード内の従来セル描画（現行v1セルJSXを温存移設）─────────────────────
  const renderCell = (cell, fallbackText) => {
    if (!cell) return <span style={{fontSize:11,color:'#cbd5e1'}}>{fallbackText || '—'}</span>;
    if (cell.missing) return <span style={{fontSize:11,color:'#cbd5e1'}}>データなし</span>;
    return (
      <div>
        <div style={{fontSize:13,fontWeight:600,color:'#1e293b'}}>
          {fmtVal(cell.prefVal, cell.unit === '%' ? '%' : '')}
          {cell.unit !== '%' && <span style={{fontSize:10,color:'#94a3b8',marginLeft:2}}>{cell.unit}</span>}
        </div>
        {cell.delta && (
          <div style={{fontSize:10,color:cell.delta.color,fontWeight:600,marginTop:2}}>
            {cell.delta.label} ({cell.delta.deltaPct > 0 ? '+' : ''}{cell.delta.deltaPct.toFixed(1)}%)
          </div>
        )}
        {cell.proxyLabel && (
          <div style={{fontSize:9,fontWeight:600,color:'#92400e',marginTop:2,padding:'1px 4px',background:'#fef3c7',borderRadius:3,display:'inline-block'}}>{cell.proxyLabel}</div>
        )}
        {cell.basis && (
          <div style={{fontSize:9,fontWeight:500,color:'#155e75',marginTop:2,padding:'1px 4px',background:'#cffafe',borderRadius:3,display:'inline-block'}}>{cell.basis}</div>
        )}
        <div style={{fontSize:9,color:'#cbd5e1',marginTop:3,lineHeight:1.4}}>{cell.label}</div>
        {cell.note && (
          <div style={{fontSize:9,color:'#94a3b8',marginTop:2,lineHeight:1.4,fontStyle:'italic'}}>※{cell.note}</div>
        )}
      </div>
    );
  };

  const missingChip = (title, note) => (
    <div style={{fontSize:11,color:'#92400e',fontWeight:500,padding:'4px 8px',background:'#fef3c7',borderRadius:4,display:'inline-block'}}>
      ⚠ {title}
      <div style={{fontSize:9,color:'#78350f',marginTop:3,lineHeight:1.5,fontWeight:400,maxWidth:180}}>{note || ''}</div>
    </div>
  );

  // 展開カードの断面セル共通ラッパ（駅click フラッシュの受け皿）
  const cardCell = (id, stKey, title, badge, children) => {
    const flashing = flashStation === `${id}:${stKey}`;
    return (
      <div key={stKey} style={{
        padding: '8px 10px', borderRadius: 8, background: flashing ? '#fff7ed' : '#fff',
        border: '1px solid #eef2f7',
        boxShadow: flashing ? '0 0 0 2px #f97316 inset' : 'none',
        transition: anim ? 'box-shadow 300ms, background 300ms' : 'none',
      }}>
        <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}>
          <span style={{fontSize:10,fontWeight:700,color:'#64748b'}}>{title}</span>
          <span style={{padding:'0 5px',borderRadius:4,background:badge.bg,color:badge.fg,fontSize:8,fontWeight:700}}>{badge.label}</span>
        </div>
        {children}
      </div>
    );
  };

  // 展開カード（現行テーブルの5列セル内容を grid 移設。mob=1カラム）
  const renderExpandedCard = (id) => {
    const domain = DOMAIN_MAPPING[id];
    const riskCells = (domain.risks || []).map(getRiskCell).filter(Boolean);
    const demand = domain.demand ? getCell(domain, 'demand') : null;
    const util = domain.utilization ? getCell(domain, 'utilization') : null;
    const supply = domain.supply ? getCell(domain, 'supply') : null;
    const triad = domain.outcome ? getOutcomeTriad(domain.outcome) : null;
    const causeLabel = domain.outcome?.label || '';
    const isExpandedR = !!expandedRisks[id];
    const visibleCells = isExpandedR ? riskCells : riskCells.slice(0, MAX_RISKS_COLLAPSED);
    const hiddenCount = riskCells.length - visibleCells.length;
    const fmt = (v) => v == null ? '—' : (typeof v === 'number' ? v.toFixed(1) : String(v));
    const deltaPct = (val, nat) => (val == null || nat == null || nat === 0) ? null : ((val / nat - 1) * 100);
    const deltaColor = (pct) => pct == null ? '#94a3b8' : (pct > 5 ? '#dc2626' : pct < -5 ? '#16a34a' : '#94a3b8');
    const deltaLabel = (pct) => pct == null ? '' : ((pct > 0 ? '+' : '') + pct.toFixed(1) + '%');
    const avg = (m, f) => (m == null || f == null) ? null : (m + f) / 2;
    const pAvgC = avg(triad?.crude2020?.male?.rate, triad?.crude2020?.female?.rate);
    const nAvgC = avg(triad?.crude2020Nat?.male?.rate, triad?.crude2020Nat?.female?.rate);
    const pAvgA = avg(triad?.ageAdj2020?.male?.rate, triad?.ageAdj2020?.female?.rate);
    const nAvgA = avg(triad?.ageAdj2020Nat?.male?.rate, triad?.ageAdj2020Nat?.female?.rate);

    return (
      <div style={{
        display: 'grid', gridTemplateColumns: mob ? '1fr' : 'repeat(5, 1fr)', gap: 10,
        padding: '12px 14px', margin: '2px 0 12px', background: '#fbfcfe',
        border: '1px solid #e2e8f0', borderRadius: 10,
      }}>
        {cardCell(id, 'risk', 'リスク', DATA_BADGE.risk, (
          riskCells.length === 0 ? <span style={{fontSize:11,color:'#cbd5e1'}}>—</span> : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {visibleCells.map((rc, ri) => (
                <div key={ri} style={{paddingBottom: ri < visibleCells.length - 1 ? 6 : 0, borderBottom: ri < visibleCells.length - 1 ? '1px dashed #e2e8f0' : 'none'}}>
                  {rc.missing ? (
                    <div>
                      <div style={{fontSize:11,color:'#cbd5e1'}}>データなし</div>
                      <div style={{fontSize:9,color:'#cbd5e1',marginTop:2}}>{rc.label}</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{display:'flex',alignItems:'baseline',gap:4,flexWrap:'wrap'}}>
                        <span style={{fontSize:13,fontWeight:600,color:'#1e293b'}}>
                          {fmtVal(rc.prefVal, rc.unit === '%' ? '%' : '')}
                          {rc.unit !== '%' && <span style={{fontSize:10,color:'#94a3b8',marginLeft:2}}>{rc.unit}</span>}
                        </span>
                        {rc.legacy && (
                          <span title="Bridge v0 から継承した旧risk proxy" style={{fontSize:8,padding:'0 4px',background:'transparent',color:'#cbd5e1',border:'1px solid #e2e8f0',borderRadius:3,fontWeight:500}}>v0</span>
                        )}
                      </div>
                      {rc.delta && (
                        <div style={{fontSize:10,color:rc.delta.color,fontWeight:600,marginTop:1}}>
                          {rc.delta.label} ({rc.delta.deltaPct > 0 ? '+' : ''}{rc.delta.deltaPct.toFixed(1)}%)
                        </div>
                      )}
                      <div style={{fontSize:9,color:'#94a3b8',marginTop:2,lineHeight:1.4}}>{rc.label}</div>
                      {rc._stdInfo && rc._stdInfo.stdRate != null && (
                        <div title="NDB内標準人口で直接標準化 (47県合算 sex × age_group)" style={{fontSize:9,color:'#7c3aed',marginTop:1,lineHeight:1.4,fontWeight:500}}>
                          年齢標準化: {rc._stdInfo.stdRate.toFixed(1)}% ({rc._stdInfo.deltaPp >= 0 ? '+' : ''}{rc._stdInfo.deltaPp.toFixed(1)}pp)
                        </div>
                      )}
                      {rc.note && (
                        <div style={{fontSize:8,color:'#cbd5e1',marginTop:1,lineHeight:1.4,fontStyle:'italic'}}>※{rc.note}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {(hiddenCount > 0 || isExpandedR) && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleExpand(id); }}
                  style={{marginTop:4,padding:'3px 8px',fontSize:10,fontWeight:600,color:'#475569',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:4,cursor:'pointer',alignSelf:'flex-start'}}
                >
                  {isExpandedR ? '▲ 折りたたむ' : `▼ +${hiddenCount}指標を表示`}
                </button>
              )}
            </div>
          )
        ))}
        {cardCell(id, 'demand', '疾病負荷', DATA_BADGE.demand, (
          domain.demand ? renderCell(demand) : missingChip('独立データなし', domain.demandNote)
        ))}
        {cardCell(id, 'utilization', '医療利用', DATA_BADGE.utilization, (
          domain.utilization ? (util ? renderCell(util) : <span style={{fontSize:11,color:'#cbd5e1'}}>データなし</span>) : missingChip('proxy未整備', domain.utilizationNote)
        ))}
        {cardCell(id, 'supply', '供給proxy', DATA_BADGE.supply, (
          domain.supply ? renderCell(supply) : missingChip('proxy未整備', domain.supplyNote)
        ))}
        {cardCell(id, 'outcome', '結果', DATA_BADGE.outcome, (
          (!triad || (!triad.crude2020 && !triad.ageAdj2020 && triad.crude2024 == null)) ? (
            <span style={{fontSize:11,color:'#cbd5e1'}}>データなし</span>
          ) : (
            <div>
              {triad.crude2020 && (
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:9,fontWeight:600,color:'#64748b',marginBottom:2}}>2020 粗死亡率</div>
                  <div style={{fontSize:11,color:'#475569'}}>
                    男 <b>{fmt(triad.crude2020.male?.rate)}</b>
                    <span style={{fontSize:9,color:'#94a3b8',marginLeft:4}}>({triad.crude2020.male?.rank}位)</span>
                    {' / '}
                    女 <b>{fmt(triad.crude2020.female?.rate)}</b>
                    <span style={{fontSize:9,color:'#94a3b8',marginLeft:4}}>({triad.crude2020.female?.rank}位)</span>
                  </div>
                  {pAvgC != null && nAvgC != null && (
                    <div style={{fontSize:9,color:deltaColor(deltaPct(pAvgC, nAvgC)),fontWeight:600,marginTop:1}}>
                      vs 全国平均 {deltaLabel(deltaPct(pAvgC, nAvgC))}
                    </div>
                  )}
                </div>
              )}
              {triad.ageAdj2020 && (
                <div style={{marginBottom:8,padding:'6px 8px',background:'#faf5ff',borderRadius:4,borderLeft:'3px solid #a855f7'}}>
                  <div style={{fontSize:9,fontWeight:700,color:'#7c3aed',marginBottom:2}}>2020 年齢調整死亡率（主指標）</div>
                  <div style={{fontSize:13,fontWeight:700,color:'#581c87'}}>
                    男 {fmt(triad.ageAdj2020.male?.rate)}
                    <span style={{fontSize:9,color:'#a855f7',marginLeft:4}}>({triad.ageAdj2020.male?.rank}位)</span>
                  </div>
                  <div style={{fontSize:13,fontWeight:700,color:'#581c87'}}>
                    女 {fmt(triad.ageAdj2020.female?.rate)}
                    <span style={{fontSize:9,color:'#a855f7',marginLeft:4}}>({triad.ageAdj2020.female?.rank}位)</span>
                  </div>
                  {pAvgA != null && nAvgA != null && (
                    <div style={{fontSize:9,color:deltaColor(deltaPct(pAvgA, nAvgA)),fontWeight:600,marginTop:2}}>
                      vs 全国平均 {deltaLabel(deltaPct(pAvgA, nAvgA))}
                    </div>
                  )}
                </div>
              )}
              {triad.crude2024 != null && (
                <div style={{marginTop:8,paddingTop:6,borderTop:'1px dashed #e2e8f0'}}>
                  <div style={{fontSize:9,fontWeight:600,color:'#64748b',marginBottom:2}}>2024 粗死亡率（最新参考）</div>
                  <div style={{fontSize:11,color:'#475569'}}>
                    総数 <b>{fmt(triad.crude2024)}</b>
                    <span style={{fontSize:9,color:'#94a3b8',marginLeft:4}}>/10万</span>
                  </div>
                  {triad.crude2024Nat != null && (
                    <div style={{fontSize:9,color:deltaColor(deltaPct(triad.crude2024, triad.crude2024Nat)),fontWeight:600,marginTop:1}}>
                      vs 全国 {deltaLabel(deltaPct(triad.crude2024, triad.crude2024Nat))}
                    </div>
                  )}
                </div>
              )}
              <div style={{fontSize:9,color:'#94a3b8',marginTop:6,lineHeight:1.5,fontStyle:'italic'}}>
                ※ 2020年齢調整値と2024粗死亡率を直接比較しない<br/>
                ※ 男女平均は単純平均（人口加重なし）<br/>
                ※ 死亡率は医療の優劣を示す指標ではない
              </div>
              <div style={{fontSize:9,color:'#cbd5e1',marginTop:3,lineHeight:1.4}}>{causeLabel}</div>
              {domain.outcome?.additionalCauses?.map((ac, ai) => {
                const acPref = vsPref?.causes?.find(c => c.cause === ac.vitalCause)?.rate;
                const acNat = vsNat?.causes?.find(c => c.cause === ac.vitalCause)?.rate;
                const acDelta = describeDelta(acPref, acNat, 'higher_worse');
                if (acPref == null) return null;
                return (
                  <div key={ai} style={{marginTop:10,paddingTop:8,borderTop:'1px dashed #e2e8f0'}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#1e293b'}}>
                      {fmtVal(acPref, '')}
                      <span style={{fontSize:10,color:'#94a3b8',marginLeft:2}}>{ac.unit}</span>
                    </div>
                    {acDelta && (
                      <div style={{fontSize:10,color:acDelta.color,fontWeight:600,marginTop:2}}>
                        {acDelta.label} ({acDelta.deltaPct > 0 ? '+' : ''}{acDelta.deltaPct.toFixed(1)}%)
                      </div>
                    )}
                    <div style={{fontSize:9,color:'#cbd5e1',marginTop:3,lineHeight:1.4}}>{ac.label}（2024粗）</div>
                  </div>
                );
              })}
            </div>
          )
        ))}
      </div>
    );
  };

  return (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:mob?'16px 14px':'20px 24px',marginBottom:16}}>
      {anim && (
        <style>{`
          @keyframes bpNodeIn { from { opacity:0; transform: translateY(8px);} to { opacity:1; transform: translateY(0);} }
          @keyframes bpConnIn { from { opacity:0; stroke-dashoffset: 60; } to { opacity:1; stroke-dashoffset: 0; } }
        `}</style>
      )}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <span style={{fontSize:18}}>🔗</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>
            疾患別 需要・供給・結果サマリー (v1)
            <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#e0e7ff',color:'#3730a3',fontWeight:500}}>6領域・複数riskモデル</span>
            <span style={{marginLeft:4,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fef3c7',color:'#92400e',fontWeight:500}}>🆙 疾患パイプライン</span>
          </div>
          <div style={{fontSize:11,color:'#94a3b8'}}>
            6領域を「リスク→疾病負荷→医療利用→供給proxy→結果」の5駅で{ndbPref}の47県内位置(percentile)として観察 (独立軸、因果連鎖は仮定しない)。行クリックで実値詳細
          </div>
        </div>
      </div>

      {/* P1-2: 解釈注意 (Bridge OUTCOME 周辺の誤読防止) */}
      <InterpretationGuard variant="outcome" />

      {/* ── 駅ヘッダ行 ── */}
      <div style={{display:'flex',alignItems:'flex-end',marginTop:4,marginBottom:2}}>
        <div style={{width:LABEL_W,flexShrink:0,fontSize:9,color:'#94a3b8',lineHeight:1.5,paddingRight:6}}>
          ↑47県内上位<br/>↓下位
        </div>
        <div style={{flex:1,display:'grid',gridTemplateColumns:'repeat(5,1fr)'}}>
          {STATIONS.map((s) => (
            <div key={s.key} style={{textAlign:'center',padding:'2px 0'}}>
              <div style={{fontSize:mob?10:11,fontWeight:700,color:'#64748b'}}>{mob ? s.short : s.title}</div>
              <div style={{display:'flex',justifyContent:'center',gap:3,marginTop:2,flexWrap:'wrap'}}>
                <span style={{display:'inline-block',padding:'1px 6px',borderRadius:4,background:s.badge.bg,color:s.badge.fg,fontSize:8,fontWeight:700}}>{s.badge.label}</span>
                <YearChip k={s.sourceKey} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* 凡例（常設ガード）*/}
      <div style={{fontSize:9,color:'#94a3b8',lineHeight:1.6,margin:'2px 0 8px',paddingLeft:mob?0:LABEL_W}}>
        ●=縦位置は<b>47県内順位(percentile)</b>であり水準・良し悪しではない ／ 駅の並びは<b>定義対応の観察順</b>であり因果連鎖ではない ／ <b>点線=接続</b>であって因果でない
        {hasPin && <span style={{color:'#c2410c'}}> ／ ◆={pinnedPref}(比較ピン)</span>}
      </div>

      {/* ── 6疾患×5駅 パイプライン（スモールマルチプル）── */}
      <div>
        {DOMAIN_ORDER.map((id) => {
          const domain = DOMAIN_MAPPING[id];
          if (!domain) return null;
          const nodes = buildRowNodes(id);
          if (!nodes) return null;
          const isOpen = expandedDomain === id;
          const hovered = hoverNode && hoverNode.id === id ? nodes[hoverNode.st] : null;
          // コネクタ: 隣接する実ノード間のみ（null/データなしは透過スキップ=線を引かない）
          const segs = [];
          for (let i = 0; i < nodes.length - 1; i++) {
            const a = nodes[i], b = nodes[i + 1];
            if (a.kind === 'node' && b.kind === 'node' && a.pct != null && b.pct != null) {
              segs.push({ x1: cxPct(i), y1: cyOf(a.pct), x2: cxPct(i + 1), y2: cyOf(b.pct) });
            }
          }
          const pinSegs = [];
          if (hasPin) {
            for (let i = 0; i < nodes.length - 1; i++) {
              const a = nodes[i], b = nodes[i + 1];
              if (a.kind === 'node' && b.kind === 'node' && a.pinPct != null && b.pinPct != null) {
                pinSegs.push({ x1: cxPct(i), y1: cyOf(a.pinPct), x2: cxPct(i + 1), y2: cyOf(b.pinPct) });
              }
            }
          }
          return (
            <div key={id}>
              <div
                onClick={() => setExpandedDomain(isOpen ? null : id)}
                onMouseLeave={() => { if (!mob) setHoverNode(null); }}
                style={{
                  display:'flex',alignItems:'stretch',cursor:'pointer',borderRadius:10,
                  background: isOpen ? '#f8fafc' : domain.bg, border:'1px solid #f1f5f9',
                  marginBottom: isOpen ? 0 : 6, position:'relative',
                }}
                title={mob ? undefined : `${domain.label} — クリックで実値詳細を展開`}
              >
                {/* 左: 領域ラベル */}
                <div style={{width:LABEL_W,flexShrink:0,padding:mob?'8px 4px 8px 8px':'10px 6px 10px 12px',display:'flex',flexDirection:'column',justifyContent:'center',gap:3}}>
                  <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
                    <span style={{fontSize:mob?14:17}}>{domain.icon}</span>
                    <span style={{fontSize:mob?11:13,fontWeight:700,color:domain.color}}>{domain.label}</span>
                  </div>
                  {domain.isExperimental && (
                    <span style={{fontSize:8,padding:'1px 4px',borderRadius:3,background:'#fef3c7',color:'#92400e',fontWeight:600,alignSelf:'flex-start'}}>🧪 v1 exp</span>
                  )}
                  <span style={{fontSize:9,color:'#94a3b8'}}>{isOpen ? '▲ 閉じる' : '▼ 詳細'}</span>
                </div>
                {/* 右: 5駅トラック+ノード+コネクタ */}
                <div style={{flex:1,position:'relative',height:ROW_H,minWidth:0}}>
                  {/* コネクタ層（点線・因果を示唆する実線は使わない）*/}
                  <svg width="100%" height={ROW_H} viewBox={`0 0 100 ${ROW_H}`} preserveAspectRatio="none" style={{position:'absolute',inset:0,display:'block'}} aria-hidden="true">
                    <g style={anim ? {animation:'bpConnIn 400ms 120ms ease-out both'} : undefined}>
                      {segs.map((sg, k) => (
                        <line key={k} x1={sg.x1} y1={sg.y1} x2={sg.x2} y2={sg.y2}
                          stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
                      ))}
                      {pinSegs.map((sg, k) => (
                        <line key={`p${k}`} x1={sg.x1} y1={sg.y1} x2={sg.x2} y2={sg.y2}
                          stroke="#f97316" strokeWidth={1.2} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" opacity={0.75} />
                      ))}
                    </g>
                  </svg>
                  {/* 駅スロット+ノード（HTML絶対配置=mob横スクロール不要）*/}
                  {nodes.map((node, i) => {
                    const left = `${cxPct(i)}%`;
                    return (
                      <div key={i} style={{position:'absolute',left,top:0,height:'100%',width:0}}>
                        {/* 縦スロットトラック */}
                        <div style={{position:'absolute',left:-5,top:TRACK_TOP,width:10,height:TRACK_H,borderRadius:5,background:'#f1f5f9'}} />
                        {/* 50%ile 中点tick */}
                        <div style={{position:'absolute',left:-8,top:cyOf(50)-0.5,width:16,height:1,background:'#e2e8f0'}} />
                        {node.kind === 'node' && node.pct != null && (
                          <div style={anim ? {animation:'bpNodeIn 400ms ease-out both'} : undefined}>
                            {/* リスク駅: per-risk 横tick併置 */}
                            {node.st.key === 'risk' && node.riskEntries.map((e, k) => e.pct != null && (
                              <div key={k} style={{position:'absolute',left:-13,top:cyOf(e.pct)-1,width:4,height:2,borderRadius:1,background:'#94a3b8',opacity:0.8,transition:anim?'top 300ms':'none'}} />
                            ))}
                            {/* ◆ピンノード（橙・中実ダイヤ）*/}
                            {node.pinPct != null && (
                              <div title={`◆${pinnedPref}`} style={{position:'absolute',left:-4.5,top:cyOf(node.pinPct)-4.5,width:9,height:9,background:'#f97316',border:'1px solid #c2410c',transform:'rotate(45deg)',transition:anim?'top 300ms':'none',zIndex:2}} />
                            )}
                            {/* 県ノード */}
                            <div style={{position:'absolute',left:-7,top:cyOf(node.pct)-7,width:14,height:14,borderRadius:'50%',background:tierColorOfPct(node.pct),border:'1.5px solid #fff',boxShadow:'0 1px 3px rgba(15,23,42,0.25)',transition:anim?'top 300ms':'none',zIndex:3}} />
                            {/* リスク駅: ×N件数バッジ */}
                            {node.st.key === 'risk' && (
                              <span style={{position:'absolute',left:9,top:cyOf(node.pct)-6,fontSize:8,fontWeight:700,color:'#64748b',whiteSpace:'nowrap',zIndex:3}}>×{node.riskCount}</span>
                            )}
                            {/* 結果駅: 右肩『調』バッジ（2020年齢調整rankのみ使用の明示）*/}
                            {node.st.key === 'outcome' && (
                              <span title="2020 年齢調整死亡率の47県rank(男女単純平均)のみ使用。粗死亡率とは別軸" style={{position:'absolute',left:8,top:cyOf(node.pct)-17,fontSize:8,fontWeight:700,color:'#fff',background:'#a855f7',borderRadius:3,padding:'0 3px',zIndex:3}}>調</span>
                            )}
                          </div>
                        )}
                        {(node.kind === 'null' || node.kind === 'nodata') && (
                          <>
                            {/* 未整備/データなし: 中点高さの破線ゴースト円（位置捏造なし）*/}
                            <div style={{position:'absolute',left:-7,top:cyOf(50)-7,width:14,height:14,borderRadius:'50%',border:'1.5px dashed #cbd5e1',background:'transparent'}} />
                            <span style={{position:'absolute',left:0,top:TRACK_TOP+TRACK_H+3,transform:'translateX(-50%)',fontSize:8,color:'#94a3b8',whiteSpace:'nowrap'}}>
                              {node.kind === 'null' ? '未整備' : (node.loading ? '読込中' : 'データなし')}
                            </span>
                          </>
                        )}
                        {/* hover/タップ ヒットエリア（◆タップ域含め拡大）*/}
                        <div
                          onMouseEnter={() => { if (!mob) setHoverNode({ id, st: i }); }}
                          onClick={(e) => { e.stopPropagation(); onStationTap(id, i, node.st.key); }}
                          style={{position:'absolute',left:mob?-22:-18,top:0,width:mob?44:36,height:'100%',cursor:'pointer',zIndex:5}}
                        />
                      </div>
                    );
                  })}
                  {/* ツールチップ */}
                  {hovered && renderTooltip(id, hovered)}
                </div>
              </div>
              {/* 展開カード（現行セル詳細の温存移設・単一openアコーディオン）*/}
              {isOpen && (
                <div onClick={(e) => e.stopPropagation()}>
                  {domain.isExperimental && domain.experimentalNote && (
                    <div style={{fontSize:9,color:'#78350f',margin:'6px 0 4px',lineHeight:1.4,fontStyle:'italic'}}>🧪 {domain.experimentalNote}</div>
                  )}
                  {renderExpandedCard(id)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* パイプライン注記（新設）*/}
      <div style={{fontSize:9,color:'#94a3b8',marginTop:8,lineHeight:1.7}}>
        ・ノード色は47県内percentileの<b>rose(上位)/indigo(下位)中立発散</b>（±良し悪しの色ではない）。リスク駅は方向(higher_worse/more)が混在するため中央値ノードに良し悪しラベルを付けない。<br/>
        ・結果駅ノードは<span style={{color:'#a855f7',fontWeight:700}}>『調』</span>=2020年齢調整死亡率rank(男女単純平均)のみ。2020粗・2024粗との3段比較は行展開カードで（直接比較しない）。<br/>
        ・未整備/データなし断面は破線ゴーストで明示し、コネクタは透過スキップ（位置の捏造なし）。47県分布の計算は都道府県判別不可・全国を除外。
      </div>

      {/* 注記 */}
      <div style={{fontSize:10,color:'#94a3b8',marginTop:14,lineHeight:1.7,padding:'10px 14px',background:'#f8fafc',borderRadius:6}}>
        <b style={{color:'#475569'}}>📌 Bridge Risk Model v1 の制約と注意点</b><br/>
        ・<b>v1 (2026-04-28 採択):</b> リスク列は単一proxyから <code>risks[]</code> 配列(複数指標)へ移行。NDB健診リスク率 (BMI/HbA1c/SBP/LDL/尿蛋白) と質問票 (服薬・既往) を統合。<br/>
        ・既存リスクは <span style={{padding:'0 4px',background:'transparent',color:'#cbd5e1',border:'1px solid #e2e8f0',borderRadius:3,fontSize:9}}>v0</span> ラベル(Bridge v0からの継承指標)で保持。新規追加リスクと並列表示。<br/>
        ・リスク4件以上の領域はデフォルト3件表示。「+N指標を表示」で展開できます。<br/>
        ・📖 解釈仕様: <a href="https://github.com/tomiyuta/medical-intelligence/blob/main/docs/BRIDGE_V1_INTERPRETATION.md" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb',textDecoration:'underline'}}>Bridge Risk Model v1 解釈仕様</a> (GitHub)<br/>
        ・<span style={{color:'#7c3aed',fontWeight:500}}>年齢標準化率</span>: NDB特定健診の5項目(BMI/HbA1c/SBP/LDL/尿蛋白)について、47県合算の性年齢階級構成を標準人口とした直接標準化率を併記。地域差が年齢構成由来かを判別可能 (Phase 2C-1)。<br/>
        ・脳血管/呼吸器/腎疾患は <b>v1 experimental</b> (5駅中の一部未整備あり)。<br/>
        ・本サマリーは <b>スコア化を行わず</b>、データ並べ表示のみ。Gap指標化はPhase 2で検討。<br/>
        ・「医療利用」駅は<b>NDB処方薬の薬効分類ベース proxy</b>(人口10万対補正)。<u>疾患患者数ではない</u>。比較基準は47都道府県平均(処方薬集計に全国値なし)。<br/>
        ・処方数量は薬効分類別数量の合算であり、薬剤単位・剤形・用量差を含みます。<u>治療人数や患者数ではありません</u>。<br/>
        ・「供給proxy」は<b>各疾患専用の供給体制ではない</b>(例: 急性期床は循環器も整形外科も含む)。proxyラベルを参照のこと。<br/>
        ・受療率は<b>標本推計</b>(令和5年患者調査・3年に1回)。「罹患率」とは異なる指標。<br/>
        ・<b>「リスク」駅の比較は47都道府県の単純平均</b>(NDB質問票に全国エントリがないため代理使用)。人口加重ではない。<br/>
        ・<b>「結果」は3段表示</b>: <span style={{color:'#7c3aed',fontWeight:500}}>2020年齢調整死亡率(主指標)</span> + 2020粗死亡率 + 2024粗死亡率。<u>2020年齢調整死亡率と2024粗死亡率を直接比較しないこと</u>(年次変化と年齢補正の混同を避ける)。<br/>
        ・年齢調整死亡率は<b>令和2年(2020年)時点</b>のデータ。NDB(令和4-5年)・患者調査(令和5年)・病床機能(令和6年)とは時点差あり。各駅の年度バッジで時点差を明示。<br/>
        ・男女平均は<b>単純平均</b>(男+女)/2 — 人口加重未対応(将来課題)。<br/>
        ・差は分母=参照値での自然言語ラベル化(±5%未満=同程度 / ±15%以上=顕著)。z-score化はPhase 2課題。
      </div>
    </div>
  );
}
