'use client';
import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { fmt } from '../shared';

// 要介護度の配色（軽度=薄 → 重度=濃赤）
const LV = [
  { key: '要支援1', color: '#bae6fd' }, { key: '要支援2', color: '#7dd3fc' },
  { key: '要介護1', color: '#fbbf24' }, { key: '要介護2', color: '#f59e0b' },
  { key: '要介護3', color: '#f97316' }, { key: '要介護4', color: '#ea580c' },
  { key: '要介護5', color: '#dc2626' },
];

export default function HsaCarePanel({ code, mob }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!code || !open) return;
    if (d && d.code === code) return;
    setLoading(true); setD(null);
    fetch(`/api/hsa/care?code=${code}`).then(r => r.json()).then(x => { setD({ ...x, code }); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code, open]);

  const area = d?.area;
  const years = d?.years || [];
  const levels = d?.levels || LV.map(l => l.key);

  const rows = useMemo(() => {
    if (!area) return [];
    return years.map(y => {
      const v = area.years[String(y)] || {};
      const o = { year: `${y}`, total: v.total || 0 };
      levels.forEach((lv, i) => { o[lv] = (v.levels || [])[i] || 0; });
      return o;
    });
  }, [area, years, levels]);

  const base = rows[0], last = rows[rows.length - 1];
  const change = base && last && base.total ? Math.round((last.total / base.total - 1) * 1000) / 10 : null;
  // 重度(要介護3-5)の推移
  const heavy = (r) => (r ? (r['要介護3'] || 0) + (r['要介護4'] || 0) + (r['要介護5'] || 0) : 0);

  if (!code) return null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', border: 'none', background: 'linear-gradient(180deg,#f8fafc,#fff)', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0f6e5d', background: '#e3f0ed', padding: '2px 8px', borderRadius: 10 }}>ネイティブ再構築</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>要介護認定者数の将来推計</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>介護保険事業状況報告 × 社人研推計</span>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px' }}>
          {loading && <div style={{ padding: 24, color: '#cbd5e1', fontSize: 13 }}>読み込み中…</div>}
          {!loading && area && rows.length > 0 && <>
            <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 8, margin: '10px 0 12px' }}>
              {[
                { l: '認定者数 2020', v: fmt(base.total), u: '人', c: '#0f172a' },
                { l: '認定者数 2050', v: fmt(last.total), u: `人 (${change > 0 ? '+' : ''}${change}%)`, c: change >= 0 ? '#dc2626' : '#0891b2' },
                { l: '重度(要介護3-5) 2050', v: fmt(heavy(last)), u: '人', c: '#ea580c' },
                { l: 'ピーク年', v: rows.reduce((a, b) => b.total > a.total ? b : a).year, u: '年', c: '#f97316' },
              ].map((k, i) => (
                <div key={i} style={{ background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 8, padding: '9px 13px' }}>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: k.c }}>{k.v}<span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500, marginLeft: 2 }}>{k.u}</span></div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>要介護度別 認定者数の推移（2020〜2050）</div>
            <ResponsiveContainer width="100%" height={290}>
              <BarChart data={rows} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 10000 ? (v / 10000) + '万' : v} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]?.payload || {};
                  return <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 3 }}>{label}年 ・ 計 {fmt(p.total)}人</div>
                    {LV.slice().reverse().map(l => <div key={l.key} style={{ color: l.color, display: 'flex', justifyContent: 'space-between', gap: 14 }}><span>{l.key}</span><span style={{ fontWeight: 600 }}>{fmt(p[l.key])}</span></div>)}
                  </div>;
                }} />
                <Legend wrapperStyle={{ fontSize: 10.5 }} />
                {LV.map(l => <Bar key={l.key} dataKey={l.key} stackId="a" fill={l.color} name={l.key} barSize={mob ? 20 : 34} />)}
              </BarChart>
            </ResponsiveContainer>

            <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              手法: {d.note}｜出典: {d.source}<br />
              全国合計が介護保険事業状況報告の第1号被保険者認定者数（令和5年度末 約690万人）と<b style={{ color: '#0f6e5d' }}>整合</b>。カルテ #52,53 と同じ受給者ベースの推計。
            </div>
          </>}
          {!loading && !area && <div style={{ padding: 20, fontSize: 12.5, color: '#94a3b8' }}>この圏域の介護推計データは見つかりませんでした。</div>}
        </div>
      )}
    </div>
  );
}
