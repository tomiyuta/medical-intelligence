'use client';
// ══════════════════════════════════════════════════════════════════
// HomeView — 全国サマリー（問い駆動の入口 / 既定ランディング）
//   情報建築lens「ホーム/オーバービュー」＋ジャーニーlens「全国サマリー」統合。
//   (1) 全国ヘッドライン KPI カード（既取得 props から算出・ミニビジュアル付き）
//   (2) 各カードを「問い」形式にし click=navigate() で該当ビューへ初期状態プリセット遷移
//   (3) 地理階層の入口カード4枚（全国→県→医療圏→施設）
//   (4) 県/圏名検索ボックス（hit で navigate('ndb',{pref}) / カルテへ直行）
//   ★新 API・新 fetch 不要。データは page.js ロード済 props＋hsa manifest（検索用・cached）。
// ══════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react';
import { useSelection } from '../SelectionContext';
import { useData } from '../../../lib/dataClient';
import PrefStrip47 from '../ui/PrefStrip47';

// ── 数値フォーマッタ ──
const fmtOku = (n) => (n / 1e8).toFixed(2) + '億';
const fmtMan = (n) => Math.round(n / 1e4).toLocaleString() + '万';
const fmtInt = (n) => Math.round(n).toLocaleString();
const fmtPct = (n) => (n > 0 ? '+' : '') + n.toFixed(1) + '%';

const BLUE = '#2563EB';

// 死因カテゴリ色（DeathWaffle100 規約と整合）
const CAUSE_COLORS = {
  'がん(悪性新生物)': '#7c3aed', '心疾患': '#e05c7a', '老衰': '#0d9488',
  '脳血管疾患': '#4338ca', '肺炎': '#d97706', '誤嚥性肺炎': '#b45309', '不慮の事故': '#64748b',
};
// 病床機能色
const BED_COLORS = { '高度急性期': '#1e3a8a', '急性期': '#2563EB', '回復期': '#0d9488', '慢性期': '#d97706' };

// ── ミニ横棒（構成比の帯） ──
function MiniStack({ segs }) {
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 5, overflow: 'hidden', background: '#f1f5f9', margin: '2px 0' }}>
      {segs.map((x, i) => (
        <div key={i} title={`${x.label} ${(x.value / total * 100).toFixed(1)}%`}
          style={{ width: (x.value / total * 100) + '%', background: x.color }} />
      ))}
    </div>
  );
}

// ── 単一比率バー（part / total） ──
function MiniBar({ frac, color = BLUE }) {
  return (
    <div style={{ height: 8, borderRadius: 5, background: '#f1f5f9', overflow: 'hidden', margin: '2px 0' }}>
      <div style={{ width: Math.max(0, Math.min(100, frac * 100)) + '%', height: '100%', background: color }} />
    </div>
  );
}

// ── KPI カード ──
function KpiCard({ question, value, unit, sub, viz, onClick, mob }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        textAlign: 'left', border: '1px solid ' + (hov ? '#bfdbfe' : '#f0f0f0'), background: '#fff',
        borderRadius: 12, padding: mob ? '13px 14px' : '15px 17px', cursor: 'pointer', width: '100%',
        display: 'flex', flexDirection: 'column', gap: 7, transition: 'all 0.15s',
        boxShadow: hov ? '0 4px 14px rgba(37,99,235,0.10)' : '0 1px 2px rgba(0,0,0,0.03)',
      }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', lineHeight: 1.45, minHeight: mob ? undefined : 34 }}>{question}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{unit}</span>}
      </div>
      {viz}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4 }}>{sub}</span>
        <span style={{ fontSize: 11, color: hov ? BLUE : '#cbd5e1', fontWeight: 700, flexShrink: 0, transition: 'color 0.15s' }}>詳しく →</span>
      </div>
    </button>
  );
}

// ── 地理階層 入口カード ──
function HierCard({ icon, label, desc, onClick, mob }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        textAlign: 'left', border: '1px solid ' + (hov ? '#bfdbfe' : '#f0f0f0'), background: hov ? '#f8faff' : '#fff',
        borderRadius: 12, padding: mob ? '13px 14px' : '15px 16px', cursor: 'pointer', width: '100%',
        display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s',
      }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, background: hov ? '#eff6ff' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={hov ? BLUE : '#64748b'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{desc}</span>
      </span>
    </button>
  );
}

export default function HomeView({ mob, prefs, vitalStats, agePyramid, bedFunc, futureDemo }) {
  const { navigate, setFutureYear } = useSelection();
  const manifest = useData('/api/hsa/manifest'); // 検索用（cached・軽量一覧）
  const [q, setQ] = useState('');

  // 将来年プリセット付き遷移
  const goYear = (view, year) => { setFutureYear(String(year)); navigate(view); };

  // ── 全国ヘッドライン集計（既取得 props から算出・null ガード） ──
  const kpi = useMemo(() => {
    const out = {};
    // 現在人口・高齢化（age_pyramid 住基2025）
    if (agePyramid?.national) {
      const m = agePyramid.national.male || [], f = agePyramid.national.female || [];
      const sum = (arr, from = 0) => arr.slice(from).reduce((s, x) => s + (x || 0), 0);
      const total = sum(m) + sum(f);
      const p65 = sum(m, 13) + sum(f, 13);   // 65-69 以上
      const p75 = sum(m, 15) + sum(f, 15);   // 75-79 以上
      out.totalPop = total; out.p65 = p65; out.p75 = p75;
      out.aging65 = total ? p65 / total * 100 : 0;
      out.aging75 = total ? p75 / total * 100 : 0;
    }
    // 総病床・機能内訳（bed_function）
    if (bedFunc?.national) {
      const n = bedFunc.national;
      out.totalBeds = n['総床数'] || 0;
      out.bedSegs = ['高度急性期', '急性期', '回復期', '慢性期']
        .map((k) => ({ label: k, value: n[k]?.beds || 0, color: BED_COLORS[k] }))
        .filter((x) => x.value > 0);
    }
    // 施設数（prefectures-full の合算）
    if (prefs?.length) {
      out.totalFac = prefs.reduce((s, p) => s + (p.facilities || 0), 0);
      out.totalHosp = prefs.reduce((s, p) => s + (p.hospitals || 0), 0);
    }
    // 将来推計（future-demographics 全国合算 2025→2050）
    if (futureDemo?.prefectures?.length) {
      const P = futureDemo.prefectures;
      const natPop = (y) => P.reduce((s, x) => s + (x.total_pop?.[y] || 0), 0);
      const nat75 = (y) => P.reduce((s, x) => s + (x.total_pop?.[y] || 0) * (x.aging_rate_75?.[y] || 0) / 100, 0);
      const pop25 = natPop('2025'), pop50 = natPop('2050');
      const p75_25 = nat75('2025'), p75_50 = nat75('2050');
      if (pop25 && pop50) { out.futPop50 = pop50; out.futPopChg = (pop50 / pop25 - 1) * 100; }
      if (p75_25 && p75_50) { out.fut75_50 = p75_50; out.fut75Chg = (p75_50 / p75_25 - 1) * 100; }
      // 高齢化率(65+) 47県分布 2025
      out.aging65Dist = P.map((x) => ({ pref: x.pref, value: x.aging_rate_65?.['2025'] })).filter((x) => x.value != null);
    }
    // 死因構成 top（vital_statistics 全国・粗死亡率2024）
    if (vitalStats?.national?.causes?.length) {
      out.causes = vitalStats.national.causes.slice(0, 3).map((c) => ({ ...c, color: CAUSE_COLORS[c.cause] || '#94a3b8' }));
      out.deathTotal = vitalStats.national.total_death_rate;
    }
    return out;
  }, [prefs, vitalStats, agePyramid, bedFunc, futureDemo]);

  // ── 検索インデックス（県47 + 医療圏330） ──
  const results = useMemo(() => {
    const term = q.trim();
    if (!term) return [];
    const out = [];
    for (const p of (prefs || [])) {
      if (p.name?.includes(term)) out.push({ type: 'pref', label: p.name, pref: p.name });
    }
    const areas = manifest?.ready ? (manifest.areas || []) : [];
    for (const a of areas) {
      if (a.area?.includes(term) || a.pref?.includes(term)) {
        out.push({ type: 'area', label: a.area, sub: a.pref, pref: a.pref, code: a.code });
      }
    }
    return out.slice(0, 8);
  }, [q, prefs, manifest]);

  const onPick = (r) => {
    setQ('');
    if (r.type === 'pref') navigate('ndb', { pref: r.pref });
    else navigate('report', { pref: r.pref, code: r.code });
  };

  const grid = (min) => ({ display: 'grid', gridTemplateColumns: mob ? '1fr 1fr' : `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: mob ? 10 : 14 });

  return (
    <div>
      {/* ── ヒーロー + 検索 ── */}
      <div style={{ marginBottom: mob ? 18 : 24 }}>
        <h1 style={{ fontSize: mob ? 22 : 27, fontWeight: 700, letterSpacing: '-0.03em', margin: 0, color: '#0f172a' }}>日本の医療と高齢社会、全体像</h1>
        <p style={{ fontSize: mob ? 12.5 : 13.5, color: '#64748b', margin: '6px 0 0', lineHeight: 1.6 }}>
          全国 → 都道府県 → 医療圏 → 施設。公的統計を統合し、需給と将来推計を地理階層で掘り下げます。
        </p>
        <div style={{ position: 'relative', marginTop: 14, maxWidth: 460 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="都道府県・医療圏を検索（例: 東京都 / 区中央部）"
            style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13.5, outline: 'none', background: '#fff' }} />
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', zIndex: 30, overflow: 'hidden' }}>
              {results.map((r, i) => (
                <button key={i} onClick={() => onPick(r)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderBottom: i < results.length - 1 ? '1px solid #f1f5f9' : 'none', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: r.type === 'pref' ? BLUE : '#0d9488', background: r.type === 'pref' ? '#eff6ff' : '#f0fdfa', padding: '2px 7px', borderRadius: 6, flexShrink: 0 }}>{r.type === 'pref' ? '県' : '圏'}</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{r.label}</span>
                  {r.sub && <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.sub}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#cbd5e1' }}>{r.type === 'pref' ? '医療プロファイルへ' : 'カルテへ'} →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── (1)(2) 全国ヘッドライン KPI（問い形式・click で遷移） ── */}
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em', marginBottom: 10 }}>全国の「いま」と「2050年」</div>
      <div style={{ ...grid(232), marginBottom: mob ? 22 : 30 }}>
        {kpi.totalPop != null && (
          <KpiCard mob={mob} question="日本には何人が暮らしている？"
            value={fmtOku(kpi.totalPop)} unit="人"
            sub="住民基本台帳 2025"
            viz={<MiniBar frac={kpi.aging65 / 100} color="#0d9488" />}
            onClick={() => navigate('muni')} />
        )}
        {kpi.p75 != null && (
          <KpiCard mob={mob} question="75歳以上は何人？高齢化はどこまで？"
            value={fmtMan(kpi.p75)} unit={`人 (${kpi.aging75.toFixed(1)}%)`}
            sub={`65歳以上は ${kpi.aging65.toFixed(1)}%`}
            viz={<MiniBar frac={kpi.aging75 / 100} color="#d97706" />}
            onClick={() => navigate('map')} />
        )}
        {kpi.totalBeds != null && (
          <KpiCard mob={mob} question="病床は機能ごとにどう分かれている？"
            value={fmtInt(kpi.totalBeds)} unit="床"
            sub="高度急性期・急性期・回復期・慢性期"
            viz={kpi.bedSegs && <MiniStack segs={kpi.bedSegs} />}
            onClick={() => navigate('bedfunc')} />
        )}
        {kpi.totalFac != null && (
          <KpiCard mob={mob} question="医療施設はどこに、いくつある？"
            value={fmtInt(kpi.totalFac)} unit="施設"
            sub={kpi.totalHosp != null ? `うち病院 ${fmtInt(kpi.totalHosp)}` : ''}
            viz={kpi.totalHosp != null && <MiniBar frac={kpi.totalHosp / kpi.totalFac} />}
            onClick={() => navigate('explorer')} />
        )}
        {kpi.causes && (
          <KpiCard mob={mob} question="人は何で亡くなっている？"
            value={kpi.causes[0].cause.replace(/\(.+\)/, '')} unit=""
            sub={kpi.causes.map((c) => c.cause.replace(/\(.+\)/, '')).join(' · ')}
            viz={<MiniStack segs={kpi.causes.map((c) => ({ label: c.cause, value: c.rate, color: c.color }))} />}
            onClick={() => navigate('ndb')} />
        )}
        {kpi.futPop50 != null && (
          <KpiCard mob={mob} question="2050年、人口はどれだけ減る？"
            value={fmtOku(kpi.futPop50)} unit="人"
            sub={`2025年比 ${fmtPct(kpi.futPopChg)}（社人研推計）`}
            viz={<MiniBar frac={1 + kpi.futPopChg / 100} color="#64748b" />}
            onClick={() => goYear('muni', 2050)} />
        )}
        {kpi.fut75_50 != null && (
          <KpiCard mob={mob} question="2050年、病床は足りるか？（入院需要）"
            value={fmtPct(kpi.fut75Chg)} unit=""
            sub={`75歳以上人口 2050年 ${fmtMan(kpi.fut75_50)}人へ`}
            viz={<MiniBar frac={Math.min(1, (1 + kpi.fut75Chg / 100) / 1.3)} color="#dc2626" />}
            onClick={() => goYear('map', 2050)} />
        )}
        {kpi.aging65Dist?.length >= 40 && (
          <KpiCard mob={mob} question="高齢化率は地域でどれだけ違う？"
            value={`${Math.min(...kpi.aging65Dist.map((x) => x.value)).toFixed(0)}–${Math.max(...kpi.aging65Dist.map((x) => x.value)).toFixed(0)}`} unit="%"
            sub="47都道府県の分布（65歳以上・2025）"
            viz={<PrefStrip47 mode="micro" values={kpi.aging65Dist} yearBadge={{ label: '2025', color: '#0d9488' }} />}
            onClick={() => navigate('map')} />
        )}
      </div>

      {/* ── (3) 地理階層 入口 ── */}
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em', marginBottom: 10 }}>地理階層で掘り下げる</div>
      <div style={{ ...grid(232) }}>
        <HierCard mob={mob} icon="M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2a15 15 0 010 20 15 15 0 010-20z"
          label="全国・都道府県" desc="地図で高齢社会・需給を俯瞰" onClick={() => navigate('map')} />
        <HierCard mob={mob} icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          label="都道府県プロファイル" desc="受療・処方・健診・死因を横断" onClick={() => navigate('ndb')} />
        <HierCard mob={mob} icon="M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5"
          label="医療圏（330圏）" desc="一覧・比較とカルテで精査" onClick={() => navigate('area')} />
        <HierCard mob={mob} icon="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1"
          label="施設エクスプローラ" desc="施設・届出基準を検索" onClick={() => navigate('explorer')} />
      </div>
    </div>
  );
}
