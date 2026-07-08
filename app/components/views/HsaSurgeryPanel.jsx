'use client';
import { useState, useEffect, useMemo } from 'react';
import { ComposedChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from 'recharts';
import { fmt } from '../shared';

// #44/#45 手術件数の将来推計（発生率法）
const AGE_COLORS = { '年少人口': '#cbd5e1', '生産年齢人口': '#38bdf8', '前期高齢者': '#f97316', '後期高齢者': '#dc2626' };
const AGE_KEYS = ['後期高齢者', '前期高齢者', '生産年齢人口', '年少人口'];

export default function HsaSurgeryPanel({ code, mob }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('inpatient');

  useEffect(() => {
    if (!code || !open) return;
    if (d && d.code === code) return;
    setLoading(true); setD(null);
    fetch(`/api/hsa/surgery?code=${code}`).then(r => r.json()).then(x => { setD({ ...x, code }); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code, open]);

  const series = d?.series || [];
  const trendRows = useMemo(() => series.map(s => ({ year: `${s.year}`, 入院: s.nyuin, 外来: s.gairai, ...s.byAge })), [series]);
  const parts = d?.parts2020 || [];

  if (!code) return null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', border: 'none', background: 'linear-gradient(180deg,#f8fafc,#fff)', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0f6e5d', background: '#e3f0ed', padding: '2px 8px', borderRadius: 10 }}>ネイティブ再構築</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>手術件数の将来推計</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fdf1e4', padding: '2px 8px', borderRadius: 10 }}>参考推計</span>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px' }}>
          {loading && <div style={{ padding: 24, color: '#cbd5e1', fontSize: 13 }}>読み込み中…</div>}
          {!loading && series.length > 0 && <>
            <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 8, margin: '10px 0 12px' }}>
              {[
                { l: '入院手術 2020', v: series[0]?.nyuin, u: '件/年', c: '#2563EB' },
                { l: '入院手術 2050', v: series[series.length - 1]?.nyuin, u: '件/年', c: d.growthNyuin >= 0 ? '#dc2626' : '#0891b2' },
                { l: '2020→2050 増減', v: `${d.growthNyuin > 0 ? '+' : ''}${d.growthNyuin}`, u: '%', c: d.growthNyuin >= 0 ? '#dc2626' : '#0891b2' },
              ].map((k, i) => (
                <div key={i} style={{ background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 8, padding: '9px 12px' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: k.c }}>{typeof k.v === 'number' ? fmt(k.v) : k.v}<span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginLeft: 2 }}>{k.u}</span></div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {[['inpatient', '入院手術(年齢別)'], ['flow', '入院・外来'], ['part', '部位別 (#45)']].map(([id, l]) => (
                <button key={id} onClick={() => setTab(id)}
                        style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid ' + (tab === id ? '#2563EB' : '#e2e8f0'), background: tab === id ? '#eff6ff' : '#fff', color: tab === id ? '#2563EB' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
              ))}
            </div>

            {tab === 'inpatient' && (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={trendRows} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="件" width={52} />
                  <Tooltip formatter={(v, n) => [`${fmt(Math.round(v))}件/年`, n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {AGE_KEYS.map(k => <Area key={k} dataKey={k} stackId="a" stroke={AGE_COLORS[k]} fill={AGE_COLORS[k]} fillOpacity={0.55} name={k} />)}
                </ComposedChart>
              </ResponsiveContainer>
            )}

            {tab === 'flow' && (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={trendRows} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="件" width={52} />
                  <Tooltip formatter={(v, n) => [`${fmt(Math.round(v))}件/年`, n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area dataKey="入院" stroke="#2563EB" fill="#bfdbfe" name="入院手術" />
                  <Area dataKey="外来" stroke="#0891b2" fill="#cffafe" name="外来手術" />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            {tab === 'part' && (
              <>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>部位別 手術件数（2020年・入院＋外来）</div>
                <ResponsiveContainer width="100%" height={Math.max(180, parts.length * 26 + 20)}>
                  <BarChart data={parts} layout="vertical" margin={{ left: 8, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10.5, fill: '#475569' }} axisLine={false} tickLine={false} width={mob ? 96 : 120} interval={0} />
                    <Tooltip formatter={(v) => [`${fmt(Math.round(v))}件/年`, '手術件数']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#7c3aed" barSize={14} radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 9.5, fill: '#64748b', formatter: (v) => fmt(Math.round(v)) }} />
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}

            <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              出典: {d.source}｜全国の年齢別発生率×圏将来人口による年間手術件数。
              <span style={{ color: '#b45309' }}>※参考推計。ただし手術は年齢分散が大きく、<b>絶対水準もカルテ #44 とほぼ一致（±3%程度）</b>します。NDB秘匿処理で希少術式は一部欠測。</span>
            </div>
          </>}
          {!loading && series.length === 0 && <div style={{ padding: 20, fontSize: 12.5, color: '#94a3b8' }}>この圏域の手術推計データは見つかりませんでした。</div>}
        </div>
      )}
    </div>
  );
}
