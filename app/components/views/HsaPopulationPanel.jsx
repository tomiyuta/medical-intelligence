'use client';
import { useMemo, useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { fmt } from '../shared';
import { useHsaPanel } from '../hsa/useHsaArea';
import HsaPanel from '../hsa/HsaPanel';
import { useCountUp, prefersReducedMotion } from '../ui/vizHooks';

// 年齢区分の配色
const SEG = [
  { key: 'y0_14', label: '年少(0-14)', color: '#93c5fd' },
  { key: 'y15_64', label: '生産年齢(15-64)', color: '#2563EB' },
  { key: 'y65_74', label: '前期高齢(65-74)', color: '#f97316' },
  { key: 'y75', label: '後期高齢(75+)', color: '#dc2626' },
];

// 5歳階級ラベル（社人研 bands の18階級・0-4 … 85+）
const AGE_LABELS = ['0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64', '65-69', '70-74', '75-79', '80-84', '85+'];
function bandColor(i) { return i <= 2 ? '#93c5fd' : i <= 12 ? '#2563EB' : i <= 14 ? '#f97316' : '#dc2626'; }

// スクラバー付き 18階級ピラミッド（性別なし片翼）。7時点をモーフし、2020輪郭をゴースト重畳。
// 65+(index13-)/75+(index15-)帯をゾーン着色。社人研 bands の実データのみ（疑似形状なし）。
function PopulationPyramid({ area, years, mob }) {
  const yrs = (years && years.length) ? years : [2020, 2025, 2030, 2035, 2040, 2045, 2050];
  const [yi, setYi] = useState(0);
  const [hb, setHb] = useState(null);
  const year = yrs[yi];
  const cur = area.years[String(year)] || {};
  const gbands = (area.years[String(yrs[0])] || {}).bands || [];
  const bands = cur.bands || [];
  const domainMax = useMemo(() => {
    let m = 1;
    for (const y of yrs) { const b = area.years[String(y)]?.bands || []; for (const v of b) if (v > m) m = v; }
    return m;
  }, [area, yrs]);
  const bandSum = bands.reduce((s, v) => s + (v || 0), 0) || 1;
  const aging = cur.total ? (cur.a65 || 0) / cur.total * 100 : 0;
  const agingCU = useCountUp(Math.round(aging * 10) / 10);
  const reduce = prefersReducedMotion();
  const rowH = mob ? 13 : 15;

  if (!bands.length) return null;

  const info = hb != null
    ? { lab: AGE_LABELS[hb], v: bands[hb] || 0, pct: (bands[hb] || 0) / bandSum * 100 }
    : null;

  return (
    <div style={{ background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 10, padding: mob ? '12px 12px' : '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>人口ピラミッド（5歳階級・{year}年）</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 10.5, color: '#94a3b8' }}>高齢化率</span>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#f97316', fontVariantNumeric: 'tabular-nums' }}>{(agingCU ?? aging).toFixed(1)}<span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>%</span></span>
        </div>
      </div>

      {/* スクラバー（7時点） */}
      <div style={{ marginBottom: 10 }}>
        <input type="range" min={0} max={yrs.length - 1} step={1} value={yi}
               onChange={(e) => setYi(Number(e.target.value))}
               aria-label="推計年の選択"
               style={{ width: '100%', accentColor: '#2563EB', cursor: 'pointer' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          {yrs.map((y, i) => (
            <button key={y} onClick={() => setYi(i)}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                             fontSize: mob ? 9 : 10, fontWeight: i === yi ? 700 : 500,
                             color: i === yi ? '#2563EB' : '#94a3b8' }}>{y}</button>
          ))}
        </div>
      </div>

      {/* ピラミッド本体（85+ を上に） */}
      <div onMouseLeave={() => setHb(null)}>
        {bands.map((_, k) => {
          const i = bands.length - 1 - k;   // 上=高齢
          const v = bands[i] || 0, g = gbands[i] || 0;
          const pct = v / domainMax * 100, gpct = g / domainMax * 100;
          const zoneBg = i >= 15 ? '#fef2f2' : i >= 13 ? '#fff7ed' : 'transparent';
          const showLab = i % 2 === 0 || i === 17;
          return (
            <div key={i} onMouseEnter={() => setHb(i)}
                 style={{ display: 'grid', gridTemplateColumns: mob ? '40px 1fr' : '48px 1fr', alignItems: 'center',
                          height: rowH, background: hb === i ? '#eef2ff' : zoneBg, borderRadius: 2 }}>
              <span style={{ fontSize: mob ? 8.5 : 9.5, color: hb === i ? '#334155' : '#94a3b8', textAlign: 'right', paddingRight: 6, whiteSpace: 'nowrap' }}>
                {showLab ? AGE_LABELS[i] : ''}
              </span>
              <div style={{ position: 'relative', height: rowH - 3 }}>
                {/* 2020ゴースト輪郭 */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(gpct, 0.2)}%`,
                              border: '1px dashed #94a3b8', borderLeft: 'none', borderRadius: '0 2px 2px 0', opacity: 0.5, pointerEvents: 'none' }} />
                {/* 当年バー */}
                <div style={{ height: '100%', width: `${Math.max(pct, 0.2)}%`, background: bandColor(i),
                              borderRadius: '0 2px 2px 0', opacity: hb == null || hb === i ? 1 : 0.55,
                              transition: reduce ? 'none' : 'width 0.5s cubic-bezier(0.22,1,0.36,1)' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* hover情報 + ゾーン凡例 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8, fontSize: 10.5 }}>
        <span style={{ color: '#475569' }}>
          {info
            ? <><b style={{ color: '#334155' }}>{info.lab}歳</b>　{fmt(info.v)}人（{info.pct.toFixed(1)}%）</>
            : <span style={{ color: '#94a3b8' }}>階級にhoverで人数・割合を表示　総人口 {fmt(cur.total)}人</span>}
        </span>
        <span style={{ display: 'flex', gap: 10, color: '#94a3b8' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 10, height: 8, background: '#fff7ed', border: '1px solid #fed7aa' }} />65+</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 10, height: 8, background: '#fef2f2', border: '1px solid #fecaca' }} />75+</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 10, height: 0, borderTop: '1px dashed #94a3b8' }} />2020輪郭</span>
        </span>
      </div>
    </div>
  );
}

export default function HsaPopulationPanel({ mob }) {
  const { code, data: d, loading } = useHsaPanel('population');

  const area = d?.area;
  const rows = useMemo(() => {
    if (!area) return [];
    return (d.years || []).map(y => {
      const v = area.years[String(y)] || {};
      const y65_74 = (v.a65 || 0) - (v.a75 || 0);
      return {
        year: `${y}`, total: v.total || 0,
        y0_14: v.a0_14 || 0, y15_64: v.a15_64 || 0, y65_74, y75: v.a75 || 0,
        agingRate: v.total ? Math.round((v.a65 || 0) / v.total * 1000) / 10 : 0,
        burden: (v.a65 ? (v.a15_64 || 0) / v.a65 : 0),  // 高齢者1人あたり生産年齢
      };
    });
  }, [area, d]);

  const base = rows[0], last = rows[rows.length - 1];
  const popChange = base && last ? Math.round((last.total / base.total - 1) * 1000) / 10 : null;

  if (!code) return null;

  return (
    <HsaPanel title="人口推計・高齢化（2020〜2050）"
              badges={[
                { label: '社人研 令和5年推計', kind: 'muted' },
              ]}
              defaultOpen={true}
              loading={loading}
              empty={!area || rows.length === 0}
              emptyText="この圏域の人口推計データは見つかりませんでした。">
      {() => (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 8, margin: '10px 0 14px' }}>
            {[
              { l: '総人口 2020', v: fmt(base.total), u: '人', c: '#0f172a' },
              { l: '総人口 2050', v: fmt(last.total), u: `人 (${popChange > 0 ? '+' : ''}${popChange}%)`, c: popChange < 0 ? '#dc2626' : '#0891b2' },
              { l: '高齢化率 2050', v: last.agingRate, u: '%', c: '#f97316' },
              { l: '後期高齢者 2050', v: fmt(last.y75), u: '人', c: '#dc2626' },
            ].map((k, i) => (
              <div key={i} style={{ background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
                <div style={{ fontSize: 19, fontWeight: 700, color: k.c }}>{k.v}<span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginLeft: 2 }}>{k.u}</span></div>
              </div>
            ))}
          </div>

          <PopulationPyramid area={area} years={d.years} mob={mob} />

          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>年齢区分別 人口と高齢化率の推移</div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={rows} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 10000 ? (v / 10000) + '万' : v} />
              <YAxis yAxisId="r" orientation="right" domain={[0, dm => Math.ceil(Math.max(dm, 40) / 10) * 10]} tick={{ fontSize: 10, fill: '#f97316' }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload || {};
                return <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 3 }}>{label}年 ・ 総人口 {fmt(p.total)}人</div>
                  {SEG.slice().reverse().map(s => <div key={s.key} style={{ color: s.color, display: 'flex', justifyContent: 'space-between', gap: 14 }}><span>{s.label}</span><span style={{ fontWeight: 600 }}>{fmt(p[s.key])}</span></div>)}
                  <div style={{ color: '#f97316', borderTop: '1px solid #f1f5f9', marginTop: 3, paddingTop: 3, display: 'flex', justifyContent: 'space-between', gap: 14 }}><span>高齢化率</span><span style={{ fontWeight: 700 }}>{p.agingRate}%</span></div>
                </div>;
              }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {SEG.map(s => <Bar key={s.key} yAxisId="l" dataKey={s.key} stackId="a" fill={s.color} name={s.label} barSize={mob ? 20 : 34} />)}
              <Line yAxisId="r" dataKey="agingRate" name="高齢化率(%)" stroke="#b45309" strokeWidth={2} dot={{ r: 3, fill: '#b45309' }} />
            </ComposedChart>
          </ResponsiveContainer>

          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11.5, color: '#475569', flexWrap: 'wrap' }}>
            <span>現役世代の負担（高齢者1人あたり生産年齢人口）: <b>{base.burden.toFixed(1)}</b>（2020）→ <b style={{ color: '#dc2626' }}>{last.burden.toFixed(1)}</b>（2050）</span>
          </div>
          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 8, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
            出典: {d.source}｜市区町村別推計を二次医療圏へ集約。<br />
            カルテ #28/#29 と<b style={{ color: '#0f6e5d' }}>数値一致</b>（2020総人口＝国勢調査・生産年齢の年次推移が一致検証済み）。
          </div>
        </>
      )}
    </HsaPanel>
  );
}
