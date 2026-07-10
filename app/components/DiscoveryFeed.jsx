'use client';
// ══════════════════════════════════════════════════════════════════
// DiscoveryFeed — 発見フィード「この県の突出指標 Top5」(ジャーニーlens)
//   既取得データ(useData・全て page.js で既ロード=新 fetch 不要)から
//   県別指標レジストリを構築し、47県内で分位化。選択県の |z偏差| 上位5件を
//   クライアント側で自動抽出して「カルテの headline 文法 + PrefStrip47(micro)」で提示。
//   各行 click = navigate(該当view,{pref,panelId?}) で該当断面へ deep link。
//
//   ★正確性ガードレール:
//    - 健診リスクは年齢標準化率を優先表示(std バッジ)。死因は粗率のため「粗率」注記。
//    - ことば(突出高/低)は tierOf の "位置" 記述のみ。値の高低=良し悪しと断定しない。
//    - 各行に出典年度バッジ(getSourceBadge)。相関を因果と示さない旨を InterpretationGuard で常設。
//
//   props:
//     mob         : boolean               レイアウト調整
//     pref        : string|undefined      対象県(未指定なら useSelection().pref)
//     showSelector: boolean=false         県選択ドロップダウンを内蔵表示(home 用)
//     compact     : boolean=false         見出し/余白を圧縮(ヘッダ埋込用)
//     title       : string|undefined      見出し文言の上書き
//     limit       : number=5              表示件数(|z| 上位)
// ══════════════════════════════════════════════════════════════════
import { useMemo } from 'react';
import { useSelection } from './SelectionContext';
import { useData } from '../../lib/dataClient';
import PrefStrip47 from './ui/PrefStrip47';
import InterpretationGuard from './ui/InterpretationGuard';
import { tierOf } from '../../lib/domainMapping';
import { getSourceBadge } from '../../lib/sourceRegistry';
import { sortPrefs } from './shared';

// ── フォーマッタ ──
const f1 = (v) => (v == null || !isFinite(v)) ? '—' : (Math.abs(v) < 100 ? v.toFixed(1) : Math.round(v).toLocaleString());
const fPct = (v) => (v == null || !isFinite(v)) ? '—' : (v > 0 ? '+' : '') + v.toFixed(1);

// age_pyramid: index 15 = 75-79 以上(HomeView と同一規約)
const sumFrom = (arr, from = 0) => (arr || []).slice(from).reduce((s, x) => s + (x || 0), 0);

// ── 県別指標レジストリを既取得データから構築(純関数) ──
// 返り値: [{ key,label,group,view,panelId?,unit,fmt,note?,srcKey, values:[{pref,value}] }]
function buildRegistry({ agePyramid, bedFunc, vitalStats, checkupStd, futureDemo }) {
  const reg = [];
  // 県人口 / 75歳以上人口(供給の分母)
  const pop = {}, p75 = {};
  const apPref = agePyramid?.prefectures;
  if (apPref) {
    for (const name of Object.keys(apPref)) {
      const e = apPref[name];
      pop[name] = sumFrom(e.male) + sumFrom(e.female);
      p75[name] = sumFrom(e.male, 15) + sumFrom(e.female, 15);
    }
  }

  // ── 供給(病床)10万対 / 75歳以上千人対 — 分母は住基2025・分子は病床機能報告R6 ──
  const bfP = bedFunc?.prefectures;
  if (bfP && Object.keys(pop).length) {
    const bedsPer100k = [], bedsPer75 = [];
    const shareK = { '高度急性期': [], '急性期': [], '回復期': [], '慢性期': [] };
    for (const name of Object.keys(bfP)) {
      const bf = bfP[name]; const total = bf['総床数'] || 0;
      if (pop[name]) bedsPer100k.push({ pref: name, value: total / pop[name] * 1e5 });
      if (p75[name]) bedsPer75.push({ pref: name, value: total / p75[name] * 1000 });
      for (const k of Object.keys(shareK)) {
        if (total > 0 && bf[k]?.beds != null) shareK[k].push({ pref: name, value: bf[k].beds / total * 100 });
      }
    }
    reg.push({ key: 'beds_100k', label: '人口10万対 病床数', group: '供給', view: 'bedfunc', unit: '床', fmt: f1, srcKey: 'bedFunc', note: '分子=病床機能報告R6 / 分母=住基2025', values: bedsPer100k });
    reg.push({ key: 'beds_75', label: '75歳以上 千人対 病床数', group: '供給', view: 'bedfunc', unit: '床', fmt: f1, srcKey: 'bedFunc', note: '高齢人口あたり供給', values: bedsPer75 });
    reg.push({ key: 'bf_kdo', label: '高度急性期 病床シェア', group: '病床機能', view: 'bedfunc', unit: '%', fmt: f1, srcKey: 'bedFunc', values: shareK['高度急性期'] });
    reg.push({ key: 'bf_kyu', label: '急性期 病床シェア', group: '病床機能', view: 'bedfunc', unit: '%', fmt: f1, srcKey: 'bedFunc', values: shareK['急性期'] });
    reg.push({ key: 'bf_kai', label: '回復期 病床シェア', group: '病床機能', view: 'bedfunc', unit: '%', fmt: f1, srcKey: 'bedFunc', values: shareK['回復期'] });
    reg.push({ key: 'bf_man', label: '慢性期 病床シェア', group: '病床機能', view: 'bedfunc', unit: '%', fmt: f1, srcKey: 'bedFunc', values: shareK['慢性期'] });
  }

  // ── 死因 粗死亡率(人口10万対・年齢調整前=粗率注記必須) ──
  const vsP = vitalStats?.prefectures;
  if (Array.isArray(vsP) && vsP.length) {
    const causeVals = (label) => vsP.map((r) => {
      const c = (r.causes || []).find((x) => x.cause === label);
      return c ? { pref: r.pref, value: c.rate } : null;
    }).filter(Boolean);
    reg.push({ key: 'mort_cancer', label: 'がん 死亡率', group: '死因', view: 'ndb', panelId: 'sec-outcome', unit: '/10万', fmt: f1, srcKey: 'vitalStats', crude: true, values: causeVals('がん(悪性新生物)') });
    reg.push({ key: 'mort_heart', label: '心疾患 死亡率', group: '死因', view: 'ndb', panelId: 'sec-outcome', unit: '/10万', fmt: f1, srcKey: 'vitalStats', crude: true, values: causeVals('心疾患') });
    reg.push({ key: 'mort_stroke', label: '脳血管疾患 死亡率', group: '死因', view: 'ndb', panelId: 'sec-outcome', unit: '/10万', fmt: f1, srcKey: 'vitalStats', crude: true, values: causeVals('脳血管疾患') });
  }

  // ── 年齢標準化 健診リスク該当率(標準化系=優先) ──
  const rr = checkupStd?.risk_rates;
  if (rr) {
    for (const k of Object.keys(rr)) {
      const e = rr[k]; const bp = e.by_pref || {};
      const vals = Object.keys(bp).map((name) => {
        const std = bp[name]?.age_standardized_rate;
        return (std != null && isFinite(std)) ? { pref: name, value: std } : null;
      }).filter(Boolean);
      if (vals.length) reg.push({ key: 'ck_' + k, label: (e.risk_label || k), group: '健診リスク', view: 'ndb', panelId: 'sec-checkup', unit: '%', fmt: f1, srcKey: 'checkupRisk', std: true, values: vals });
    }
  }

  // ── 2050 将来推計(人口増減率・75歳以上割合) ──
  const fdP = futureDemo?.prefectures;
  if (Array.isArray(fdP) && fdP.length) {
    const prefRows = fdP.filter((x) => x.pref && !x.city);
    const popChg = prefRows.map((x) => {
      const a = x.total_pop?.['2025'], b = x.total_pop?.['2050'];
      return (a && b) ? { pref: x.pref, value: (b / a - 1) * 100 } : null;
    }).filter(Boolean);
    const aging = prefRows.map((x) => {
      const v = x.aging_rate_75?.['2050'];
      return (v != null) ? { pref: x.pref, value: v } : null;
    }).filter(Boolean);
    if (popChg.length) reg.push({ key: 'pop_2050', label: '2050年 人口増減率(対2025)', group: '将来推計', view: 'muni', unit: '%', fmt: fPct, srcKey: 'futureDemo', values: popChg });
    if (aging.length) reg.push({ key: 'aging75_2050', label: '2050年 75歳以上人口割合', group: '将来推計', view: 'muni', unit: '%', fmt: f1, srcKey: 'futureDemo', values: aging });
  }

  return reg;
}

// ── 統計: 平均・標準偏差・選択県のz/順位 ──
function scoreForPref(indicator, pref) {
  const vals = indicator.values;
  const self = vals.find((d) => d.pref === pref);
  if (!self) return null;
  const nums = vals.map((d) => d.value);
  const n = nums.length;
  const mean = nums.reduce((s, x) => s + x, 0) / n;
  const variance = nums.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const z = std > 0 ? (self.value - mean) / std : 0;
  // 符号安全な相対偏差: (値−平均)/|平均|。負値指標(例: 人口増減率)で mean<0 でも
  // 「高い値=正の偏差」を保ち、ことば(tierOf)と順位(高い順)の向きを一致させる。
  const deltaPct = mean !== 0 ? (self.value - mean) / Math.abs(mean) * 100 : 0;
  // 順位: 降順(1=最も高い)
  const rank = nums.filter((x) => x > self.value).length + 1;
  return { value: self.value, mean, std, z, deltaPct, rank, n };
}

export default function DiscoveryFeed({ mob, pref: propPref, showSelector = false, compact = false, title, limit = 5 }) {
  const { pref: ctxPref, setPref, navigate } = useSelection();
  const pref = propPref || ctxPref;

  // 全て page.js で既ロード済 = useData のモジュールキャッシュ共有(新規 fetch なし)
  const agePyramid = useData('/api/age-pyramid');
  const bedFunc = useData('/api/bed-function');
  const vitalStats = useData('/api/vital-statistics');
  const checkupStd = useData('/api/ndb/checkup-risk-rates-standardized');
  const futureDemo = useData('/api/future-demographics');

  const registry = useMemo(
    () => buildRegistry({ agePyramid, bedFunc, vitalStats, checkupStd, futureDemo }),
    [agePyramid, bedFunc, vitalStats, checkupStd, futureDemo]
  );

  // 選択県 47県一覧(セレクタ用)
  const prefList = useMemo(() => {
    const set = new Set();
    for (const ind of registry) for (const d of ind.values) set.add(d.pref);
    return sortPrefs([...set]);
  }, [registry]);

  // 選択県の |z| 上位 limit 件
  const top = useMemo(() => {
    const scored = [];
    for (const ind of registry) {
      const s = scoreForPref(ind, pref);
      if (s && s.n >= 10) scored.push({ ind, ...s }); // 分位化に十分な母数のみ
    }
    scored.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    return scored.slice(0, limit);
  }, [registry, pref, limit]);

  const heading = title || 'この県の突出指標';

  // データ未ロード or 該当なし
  if (!top.length) {
    if (registry.length === 0) return null; // ロード前は静かに非表示
    return null;
  }

  const dirWord = (deltaPct) => {
    const t = tierOf(deltaPct);
    return t ? t.label : '標準域';
  };
  const dirColor = (deltaPct) => {
    const t = tierOf(deltaPct);
    return t ? t.color : '#64748b';
  };

  return (
    <div style={{
      background: '#fff', border: '1px solid #f0f0f0', borderRadius: compact ? 10 : 12,
      padding: mob ? '13px 14px' : (compact ? '14px 16px' : '16px 18px'), marginBottom: 16,
    }}>
      {/* 見出し + 県セレクタ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#7c3aed', letterSpacing: '0.06em' }}>DISCOVERY</div>
        <div style={{ fontSize: compact ? 14 : 15.5, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
          {showSelector ? '' : (pref + 'の')}{heading}
        </div>
        {showSelector && (
          <select value={pref} onChange={(e) => setPref(e.target.value)}
            style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#fff', color: '#0f172a' }}>
            {prefList.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <span style={{ fontSize: 11, color: '#94a3b8' }}>47県内でとくに偏りの大きい{top.length}指標</span>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
        全国平均からの偏差(z)が大きい順。行をタップで該当ビューの断面へ移動します。
      </div>

      {/* 指標行 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {top.map(({ ind, value, deltaPct, rank, n }) => {
          const badge = getSourceBadge(ind.srcKey);
          const word = dirWord(deltaPct);
          const wColor = dirColor(deltaPct);
          const values = ind.values;
          const natMean = values.reduce((s, d) => s + d.value, 0) / values.length;
          return (
            <button key={ind.key}
              onClick={() => navigate(ind.view, { pref, panelId: ind.panelId })}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                border: '1px solid #f1f5f9', borderRadius: 10, background: '#fbfcfe',
                padding: mob ? '10px 11px' : '11px 13px', transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ddd6fe'; e.currentTarget.style.background = '#faf9ff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#f1f5f9'; e.currentTarget.style.background = '#fbfcfe'; }}>
              {/* 上段: ラベル + ことば + 値 + 順位 */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.04em', flexShrink: 0 }}>{ind.group}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{ind.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: wColor, padding: '1px 7px', borderRadius: 6, background: wColor + '14', border: '1px solid ' + wColor + '33', flexShrink: 0 }}>{word}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{ind.fmt(value)}</span>
                  <span style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600 }}>{ind.unit}</span>
                </span>
              </div>
              {/* ミニストリップ(PrefStrip47 micro) */}
              <PrefStrip47 mode="micro" values={values} selected={pref} natAvg={natMean}
                yearBadge={{ label: badge.year, color: badge.color }} />
              {/* 下段: 順位 + 出典年度 + 補足(粗率/標準化) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 5 }}>
                <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>高い順で {n}県中 <span style={{ color: wColor }}>{rank}位</span></span>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>全国平均比 {fPct(deltaPct)}%</span>
                <span title={badge.title} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: badge.bg, color: badge.color, border: '1px solid ' + badge.border, flexShrink: 0 }}>{badge.year}</span>
                {ind.crude && <span style={{ fontSize: 9, color: '#0891b2', fontWeight: 600 }}>粗率(年齢調整前)</span>}
                {ind.std && <span style={{ fontSize: 9, color: '#059669', fontWeight: 600 }}>年齢標準化</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#7c3aed', fontWeight: 700, flexShrink: 0 }}>詳しく →</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 正確性ガードレール(常設) */}
      <InterpretationGuard compact variant="mortality"
        title="解釈上の注意（発見フィード）"
        items={[
          '順位・偏差は地域差の記述です。値の高低が医療の良し悪し・優劣を意味するわけではありません。',
          '死因は粗死亡率（年齢調整前）を含み、年齢構成の影響を強く受けます。健診リスクは年齢標準化率を表示。',
          '指標どうしの並列は相関であり、因果関係を示しません。',
          '各行の年度バッジのとおり、指標ごとに調査年度は異なります。',
        ]} />
    </div>
  );
}
