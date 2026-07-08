'use client';
import { useState, useEffect, useMemo } from 'react';
import { ComposedChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend } from 'recharts';
import { fmt } from '../shared';

export default function HsaDemandPanel({ code, mob }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('trend');

  useEffect(() => {
    if (!code || !open) return;
    if (d && d.code === code) return;
    setLoading(true); setD(null);
    fetch(`/api/hsa/demand?code=${code}`).then(r => r.json()).then(x => { setD({ ...x, code }); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code, open]);

  const area = d?.area;
  const years = d?.years || [];

  // 入院・外来 総数の推移（都道府県受療率）＋全国受療率ベース（#31 受療率の比較）
  const trendRows = useMemo(() => {
    if (!area) return [];
    return years.map(y => ({
      year: `${y}`,
      入院: area.inpatient?.['総数']?.[String(y)] || 0,
      外来: area.outpatient?.['総数']?.[String(y)] || 0,
      入院_全国: area.national?.inpatient?.[String(y)] ?? null,
      外来_全国: area.national?.outpatient?.[String(y)] ?? null,
    }));
  }, [area, years]);
  const hasNational = !!area?.national?.inpatient?.[String(years[0])];
  // #31: 都道府県受療率が全国を下回る→入院需要縮小リスク
  const inpBelowNat = hasNational && trendRows[0] && trendRows[0].入院 < trendRows[0].入院_全国;

  // ICD別 入院需要 増減率(2050 vs 2020)
  const icdRows = useMemo(() => {
    if (!area) return [];
    const y0 = String(years[0]), y1 = String(years[years.length - 1]);
    return Object.entries(area.inpatient || {})
      .filter(([k]) => k !== '総数')
      .map(([k, ys]) => {
        const v0 = ys[y0] || 0, v1 = ys[y1] || 0;
        return { name: k.replace(/^([Ⅰ-Ⅻ]+|Ⅹ[ⅠⅩ]*Ⅰ?Ⅰ?)\s*/, '').slice(0, 12), full: k, v2020: v0, v2050: v1, change: v0 ? Math.round((v1 / v0 - 1) * 1000) / 10 : 0 };
      })
      .filter(r => r.v2020 >= 1)
      .sort((a, b) => b.v2050 - a.v2050).slice(0, 12);
  }, [area, years]);

  // 疾患別(#46-49) 入院1日平均の推移
  const DISEASE_COLORS = { 'がん': '#dc2626', '脳卒中': '#7c3aed', '虚血性心疾患': '#f97316', '糖尿病': '#0891b2' };
  const diseaseRows = useMemo(() => {
    if (!area?.diseases) return [];
    return years.map(y => {
      const o = { year: `${y}` };
      Object.entries(area.diseases).forEach(([dn, v]) => { o[dn] = v.inpatient?.[String(y)] || 0; });
      return o;
    });
  }, [area, years]);
  const diseaseKeys = area?.diseases ? Object.keys(area.diseases) : [];

  const base = trendRows[0], last = trendRows[trendRows.length - 1];
  const inpChange = base && last && base.入院 ? Math.round((last.入院 / base.入院 - 1) * 1000) / 10 : null;
  const outChange = base && last && base.外来 ? Math.round((last.外来 / base.外来 - 1) * 1000) / 10 : null;

  if (!code) return null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', border: 'none', background: 'linear-gradient(180deg,#f8fafc,#fff)', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0f6e5d', background: '#e3f0ed', padding: '2px 8px', borderRadius: 10 }}>ネイティブ再構築</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>将来医療需要の推計（受療率法）</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fdf1e4', padding: '2px 8px', borderRadius: 10 }}>参考推計</span>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px' }}>
          {loading && <div style={{ padding: 24, color: '#cbd5e1', fontSize: 13 }}>読み込み中…</div>}
          {!loading && area && trendRows.length > 0 && <>
            <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 8, margin: '10px 0 12px' }}>
              {[
                { l: '入院需要 2020', v: fmt(Math.round(base.入院)), u: '人/日', c: '#2563EB' },
                { l: '入院需要 2050', v: fmt(Math.round(last.入院)), u: `人/日 (${inpChange > 0 ? '+' : ''}${inpChange}%)`, c: inpChange >= 0 ? '#dc2626' : '#0891b2' },
                { l: '外来需要 2020', v: fmt(Math.round(base.外来)), u: '人/日', c: '#0891b2' },
                { l: '外来需要 2050', v: fmt(Math.round(last.外来)), u: `人/日 (${outChange > 0 ? '+' : ''}${outChange}%)`, c: outChange >= 0 ? '#dc2626' : '#0891b2' },
              ].map((k, i) => (
                <div key={i} style={{ background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 8, padding: '9px 13px' }}>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: k.c }}>{k.v}<span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500, marginLeft: 2 }}>{k.u}</span></div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {[['trend', '入院・外来需要の推移'], ['icd', 'ICD別 入院需要の増減'], ['disease', '疾患別推計']].map(([id, l]) => (
                <button key={id} onClick={() => setTab(id)}
                        style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid ' + (tab === id ? '#2563EB' : '#e2e8f0'), background: tab === id ? '#eff6ff' : '#fff', color: tab === id ? '#2563EB' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
              ))}
            </div>

            {tab === 'trend' && (
              <>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={trendRows} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v, n) => [`${fmt(Math.round(v))}人/日`, n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line dataKey="入院" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} name="入院(都道府県受療率)" />
                  <Line dataKey="外来" stroke="#0891b2" strokeWidth={2.5} dot={{ r: 3 }} name="外来(都道府県受療率)" />
                  {hasNational && <Line dataKey="入院_全国" stroke="#2563EB" strokeWidth={1.6} strokeDasharray="5 4" dot={false} name="入院(全国受療率)" />}
                  {hasNational && <Line dataKey="外来_全国" stroke="#0891b2" strokeWidth={1.6} strokeDasharray="5 4" dot={false} name="外来(全国受療率)" />}
                </ComposedChart>
              </ResponsiveContainer>
              {hasNational && (
                <div style={{ fontSize: 11, color: inpBelowNat ? '#b45309' : '#0f6e5d', background: inpBelowNat ? '#fdf7ee' : '#eefaf4', border: '1px solid ' + (inpBelowNat ? '#f3e2c4' : '#cdeee0'), borderRadius: 8, padding: '8px 12px', marginTop: 8, lineHeight: 1.6 }}>
                  <b>受療率の比較（カルテ #31）</b>：当圏の入院需要は、都道府県受療率ベースが全国受療率ベースを{inpBelowNat ? '下回ります' : '上回ります'}。
                  {inpBelowNat
                    ? '全国水準まで受療率が収れんすると入院需要が縮小するリスクがあります（点線＝全国受療率での推計）。'
                    : '全国より受療率が高く、入院需要は相対的に大きい水準です（点線＝全国受療率での推計）。'}
                </div>
              )}
              </>
            )}

            {tab === 'icd' && (
              <>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>疾患大分類別 入院需要の増減率（2020→2050）</div>
                <ResponsiveContainer width="100%" height={Math.max(200, icdRows.length * 26 + 20)}>
                  <BarChart data={icdRows} layout="vertical" margin={{ left: 8, right: 36 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10.5, fill: '#475569' }} axisLine={false} tickLine={false} width={mob ? 90 : 120} />
                    <Tooltip formatter={(v, n, p) => [`${v > 0 ? '+' : ''}${v}%（${fmt(Math.round(p.payload.v2020))}→${fmt(Math.round(p.payload.v2050))}人/日）`, '増減率']} labelFormatter={(l, p) => p?.[0]?.payload?.full || l} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="change" barSize={15} radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 9.5, fill: '#64748b', formatter: (v) => (v > 0 ? '+' : '') + v + '%' }}>
                      {icdRows.map((r, i) => <Cell key={i} fill={r.change >= 0 ? '#dc2626' : '#0891b2'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}

            {tab === 'disease' && (diseaseRows.length ? (
              <>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>主要疾患別 入院需要（1日平均患者数）の推移</div>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={diseaseRows} margin={{ left: 8, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v, n) => [`${Math.round(v)}人/日`, n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {diseaseKeys.map(dn => <Line key={dn} dataKey={dn} stroke={DISEASE_COLORS[dn] || '#64748b'} strokeWidth={2.2} dot={{ r: 2.5 }} name={dn} />)}
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 6 }}>がん=悪性新生物、脳卒中=脳血管疾患。カルテ #46-49 の1日平均患者数に相当（DPC・手術件数の推計は別データ）。</div>
              </>
            ) : <div style={{ padding: 16, fontSize: 12, color: '#94a3b8' }}>疾患別データがありません。</div>)}

            <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              手法: {d.note}<br />
              <span style={{ color: '#b45309' }}>※参考推計。受療率は都道府県値、人口は社人研推計。患者調査総数に含まれる年齢不詳分や医療機関所在地への流出入調整は本推計に含めないため、カルテ #30-36 の絶対値とは差が生じます。人口構成の変化に伴う<b>需要トレンド（増減）</b>を把握する目的でご利用ください。</span>
            </div>
          </>}
          {!loading && !area && <div style={{ padding: 20, fontSize: 12.5, color: '#94a3b8' }}>この圏域の需要推計データは見つかりませんでした。</div>}
        </div>
      )}
    </div>
  );
}
