'use client';
import { useState, useEffect, useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { fmt } from '../shared';

// 年齢区分の配色
const SEG = [
  { key: 'y0_14', label: '年少(0-14)', color: '#93c5fd' },
  { key: 'y15_64', label: '生産年齢(15-64)', color: '#2563EB' },
  { key: 'y65_74', label: '前期高齢(65-74)', color: '#f97316' },
  { key: 'y75', label: '後期高齢(75+)', color: '#dc2626' },
];

export default function HsaPopulationPanel({ code, mob }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!code) return;
    setLoading(true); setD(null);
    fetch(`/api/hsa/population?code=${code}`).then(r => r.json()).then(x => { setD(x); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code]);

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
    <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', border: 'none', background: 'linear-gradient(180deg,#f8fafc,#fff)', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0f6e5d', background: '#e3f0ed', padding: '2px 8px', borderRadius: 10 }}>ネイティブ再構築</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>人口推計・高齢化（2020〜2050）</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>社人研 令和5年推計</span>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px' }}>
          {loading && <div style={{ padding: 24, color: '#cbd5e1', fontSize: 13 }}>読み込み中…</div>}
          {!loading && area && rows.length > 0 && <>
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
          </>}
          {!loading && !area && <div style={{ padding: 20, fontSize: 12.5, color: '#94a3b8' }}>この圏域の人口推計データは見つかりませんでした。</div>}
        </div>
      )}
    </div>
  );
}
