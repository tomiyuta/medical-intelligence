'use client';
import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ScatterChart, Scatter, ZAxis } from 'recharts';
import { fmt } from '../shared';

const MDC_KEYS = Array.from({ length: 18 }, (_, i) => String(i + 1).padStart(2, '0'));
// 施設スタック用の配色（先頭施設ほど濃色）
const FAC_COLORS = ['#2563EB', '#0891b2', '#7c3aed', '#059669', '#f97316', '#eab308', '#dc2626', '#64748b'];

export default function HsaDpcPanel({ code, mob }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('mdc');

  useEffect(() => {
    if (!code || !open) return;
    if (d && d.code === code) return;
    setLoading(true); setD(null);
    fetch(`/api/hsa/dpc?code=${code}`).then(r => r.json()).then(x => { setD({ ...x, code }); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code, open]);

  const area = d?.area;
  const labels = d?.mdcLabels || {};

  // MDC別 圏内退院患者数（降順）
  const mdcRows = useMemo(() => {
    if (!area) return [];
    return MDC_KEYS.map(k => ({ k, name: `${k} ${labels[k] || ''}`, count: area.totals.mdc[k]?.count || 0 }))
      .filter(r => r.count > 0).sort((a, b) => b.count - a.count);
  }, [area, labels]);

  // 流出入: 需要(住所地) vs 供給(所在地) MDC別
  const flowRows = useMemo(() => {
    if (!area?.flow) return [];
    return MDC_KEYS.map(k => ({
      name: `${k} ${labels[k] || ''}`,
      需要: area.flow.demandMdc[k] || 0,
      供給: area.totals.mdc[k]?.count || 0,
    })).filter(r => r.需要 > 0 || r.供給 > 0);
  }, [area, labels]);
  const demand = area?.flow?.demand || 0;
  const supply = area?.totals?.total || 0;
  const kanketsu = demand ? Math.round(supply / demand * 100) : null;

  // 退院患者数の年度推移（#25・DPC対象病院・真の総数）
  const trendRows = useMemo(() => (area?.trend || []).map(t => ({ year: `${t.year}`, 退院患者数: t.count })), [area]);

  // 散布図: #69 手術シェア×救急シェア / #71 手術割合×患者シェア / 救急割合×患者シェア
  const [scMode, setScMode] = useState('share');
  const scatter = useMemo(() => {
    if (!area) return [];
    const sT = area.facilities.reduce((s, f) => s + (f.surgery || 0), 0);
    const aT = area.facilities.reduce((s, f) => s + (f.ambulance || 0), 0);
    const tT = area.totals.total || 1;
    return area.facilities.filter(f => f.total > 0).map(f => {
      if (scMode === 'surgRate') return { name: f.name, x: Math.round(f.surgery / f.total * 1000) / 10, y: Math.round(f.total / tT * 1000) / 10, z: f.total };
      if (scMode === 'emrgRate') return { name: f.name, x: Math.round((f.ambulance || 0) / f.total * 1000) / 10, y: Math.round(f.total / tT * 1000) / 10, z: f.total };
      return { name: f.name, x: sT ? Math.round(f.surgery / sT * 1000) / 10 : 0, y: aT ? Math.round((f.ambulance || 0) / aT * 1000) / 10 : 0, z: f.total };
    });
  }, [area, scMode]);
  const SC_AXES = {
    share: { xl: '手術シェア（%）', yl: '救急搬送シェア（%）', note: '右上ほど圏内で手術・救急を集中的に担う急性期の中核病院。カルテ #69。' },
    surgRate: { xl: '手術実施割合（%）', yl: '患者シェア（%）', note: '横=各病院の手術実施割合、縦=圏内患者シェア。カルテ #71。' },
    emrgRate: { xl: '救急患者割合（%）', yl: '患者シェア（%）', note: '横=各病院の救急患者割合、縦=圏内患者シェア。カルテ #71。' },
  };

  // 医療機関シェア（MDC別・施設スタック, 上位施設）
  const topFacs = useMemo(() => (area?.facilities || []).slice(0, 7), [area]);
  const shareRows = useMemo(() => {
    if (!area) return [];
    return MDC_KEYS.map(k => {
      const total = area.totals.mdc[k]?.count || 0;
      if (!total) return null;
      const row = { name: `${k} ${labels[k] || ''}`, total };
      let acc = 0;
      topFacs.forEach((f, i) => { const v = f.mdc[k] || 0; row['f' + i] = v / total * 100; acc += v; });
      row.other = Math.max(0, (total - acc) / total * 100);
      return row;
    }).filter(Boolean);
  }, [area, topFacs, labels]);

  if (!code) return null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', border: 'none', background: 'linear-gradient(180deg,#f8fafc,#fff)', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0f6e5d', background: '#e3f0ed', padding: '2px 8px', borderRadius: 10 }}>ネイティブ再構築</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>DPC退院患者数・MDC別／医療機関シェア</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>令和5年度DPC退院患者調査</span>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px' }}>
          {loading && <div style={{ padding: 24, color: '#cbd5e1', fontSize: 13 }}>読み込み中…</div>}
          {!loading && area && <>
            <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 8, margin: '10px 0 14px' }}>
              {[
                { l: 'DPC退院患者数 圏計', v: fmt(area.totals.total), u: '件', c: '#2563EB' },
                { l: 'うちDPC対象病院', v: fmt(area.totals.dpcOnlyTotal), u: '件', c: '#0891b2' },
                { l: '集計病院数', v: area.facilities.length, u: '施設', c: '#059669' },
                { l: '最大MDC', v: mdcRows[0]?.name.split(' ')[1] || '–', u: '', c: '#7c3aed', small: true },
              ].map((k, i) => (
                <div key={i} style={{ background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
                  <div style={{ fontSize: k.small ? 15 : 20, fontWeight: 700, color: k.c }}>{k.v}<span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginLeft: 2 }}>{k.u}</span></div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {[['mdc', 'MDC別退院患者数'], ['trend', '退院患者数推移'], ['share', '医療機関シェア'], ['flow', '流出入・完結率'], ['scatter', '手術×救急ポジション'], ['fac', '施設別']].map(([id, l]) => (
                <button key={id} onClick={() => setTab(id)}
                        style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid ' + (tab === id ? '#2563EB' : '#e2e8f0'), background: tab === id ? '#eff6ff' : '#fff', color: tab === id ? '#2563EB' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
              ))}
            </div>

            {tab === 'mdc' && (
              <ResponsiveContainer width="100%" height={Math.max(200, mdcRows.length * 26 + 20)}>
                <BarChart data={mdcRows} layout="vertical" margin={{ left: 8, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10.5, fill: '#475569' }} axisLine={false} tickLine={false} width={mob ? 96 : 132} />
                  <Tooltip formatter={(v) => [`${fmt(v)}件`, 'DPC退院患者数']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#2563EB" barSize={15} radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 9.5, fill: '#64748b', formatter: (v) => v.toLocaleString() }} />
                </BarChart>
              </ResponsiveContainer>
            )}

            {tab === 'trend' && (trendRows.length ? (
              <>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>DPC対象病院の退院患者数 年度推移（2018〜2023年度）</div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={trendRows} margin={{ left: 8, right: 16, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} unit="年度" />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => [`${fmt(v)}件`, 'DPC退院患者数']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="退院患者数" fill="#2563EB" barSize={34} radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 10, fill: '#64748b', formatter: (v) => v.toLocaleString() }} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 6 }}>カルテ #25 と<b style={{ color: '#0f6e5d' }}>数値一致</b>（退院患者数は在院日数調査・年次推移の真の総数を使用、秘匿処理の影響を受けません）。</div>
              </>
            ) : <div style={{ padding: 16, fontSize: 12, color: '#94a3b8' }}>推移データがありません。</div>)}

            {tab === 'share' && (
              <>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>MDC別・医療機関シェア（圏内退院患者数に占める各病院の割合）</div>
                <ResponsiveContainer width="100%" height={Math.max(200, shareRows.length * 26 + 20)}>
                  <BarChart data={shareRows} layout="vertical" margin={{ left: 8, right: 16 }} stackOffset="expand">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={v => v + '%'} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10.5, fill: '#475569' }} axisLine={false} tickLine={false} width={mob ? 96 : 132} />
                    <Tooltip formatter={(v, n, p) => [`${Math.round(v)}%`, p?.payload && n]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    {topFacs.map((f, i) => (
                      <Bar key={i} dataKey={'f' + i} stackId="s" fill={FAC_COLORS[i % FAC_COLORS.length]} name={f.name.length > 14 ? f.name.slice(0, 13) + '…' : f.name} barSize={15} />
                    ))}
                    <Bar dataKey="other" stackId="s" fill="#e2e8f0" name="その他" barSize={15} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, fontSize: 10.5 }}>
                  {topFacs.map((f, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569' }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: FAC_COLORS[i % FAC_COLORS.length] }} />{f.name.length > 16 ? f.name.slice(0, 15) + '…' : f.name}
                    </span>
                  ))}
                </div>
              </>
            )}

            {tab === 'flow' && (area?.flow ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
                  {[
                    { l: '患者住所地（需要）', v: fmt(demand), u: '件', c: '#7c3aed', sub: '圏住民が発生させるDPC件数' },
                    { l: '医療機関所在地（供給）', v: fmt(supply), u: '件', c: '#2563EB', sub: '圏内病院が扱うDPC件数' },
                    { l: '完結率（供給/需要）', v: kanketsu, u: '%', c: kanketsu >= 100 ? '#0891b2' : '#dc2626', sub: kanketsu >= 100 ? '流入超（他圏から受入）' : '流出超（他圏へ流出）' },
                  ].map((k, i) => (
                    <div key={i} style={{ background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: k.c }}>{k.v}<span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginLeft: 2 }}>{k.u}</span></div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{k.sub}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>MDC別 需要（住所地）と供給（所在地）の比較</div>
                <ResponsiveContainer width="100%" height={Math.max(200, flowRows.length * 30 + 24)}>
                  <BarChart data={flowRows} layout="vertical" margin={{ left: 8, right: 16 }} barGap={0}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10.5, fill: '#475569' }} axisLine={false} tickLine={false} width={mob ? 96 : 132} />
                    <Tooltip formatter={(v, n) => [`${fmt(v)}件`, n]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="需要" fill="#7c3aed" barSize={9} radius={[0, 2, 2, 0]} />
                    <Bar dataKey="供給" fill="#2563EB" barSize={9} radius={[0, 2, 2, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569' }}><span style={{ width: 9, height: 9, borderRadius: 2, background: '#7c3aed' }} />需要（住所地・圏住民）</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569' }}><span style={{ width: 9, height: 9, borderRadius: 2, background: '#2563EB' }} />供給（所在地・圏内病院）</span>
                </div>
                <div style={{ fontSize: 10.5, color: '#b45309', lineHeight: 1.7, marginTop: 8 }}>※需要（住所地）はカルテ #23 と一致検証済み。供給（所在地）は施設集計のため秘匿処理により数%過小の場合があり、完結率も同程度の下振れ余地あり。</div>
              </>
            ) : <div style={{ padding: 16, fontSize: 12, color: '#94a3b8' }}>流出入データがありません。</div>)}

            {tab === 'scatter' && (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  {[['share', 'シェア×シェア (#69)'], ['surgRate', '手術割合×患者シェア (#71)'], ['emrgRate', '救急割合×患者シェア (#71)']].map(([id, l]) => (
                    <button key={id} onClick={() => setScMode(id)}
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + (scMode === id ? '#2563EB' : '#e2e8f0'), background: scMode === id ? '#eff6ff' : '#fff', color: scMode === id ? '#2563EB' : '#64748b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>各病院のポジション（横={SC_AXES[scMode].xl}、縦={SC_AXES[scMode].yl}、バブル=退院患者数）</div>
                <ResponsiveContainer width="100%" height={340}>
                  <ScatterChart margin={{ top: 12, right: 24, bottom: 30, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" dataKey="x" name={SC_AXES[scMode].xl} unit="%" domain={[0, dm => Math.max(100, Math.ceil(dm / 20) * 20)]} tick={{ fontSize: 10, fill: '#94a3b8' }} label={{ value: SC_AXES[scMode].xl, position: 'insideBottom', offset: -14, fontSize: 11, fill: '#64748b' }} />
                    <YAxis type="number" dataKey="y" name={SC_AXES[scMode].yl} unit="%" domain={[0, dm => Math.max(100, Math.ceil(dm / 20) * 20)]} tick={{ fontSize: 10, fill: '#94a3b8' }} label={{ value: SC_AXES[scMode].yl, angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }} />
                    <ZAxis type="number" dataKey="z" range={[60, 900]} name="退院患者数" />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload;
                      return <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.name}</div>
                        <div>手術シェア {p.x}%・救急搬送シェア {p.y}%</div>
                        <div style={{ color: '#94a3b8', fontSize: 11 }}>退院患者数 {fmt(p.z)}件</div>
                      </div>;
                    }} />
                    <Scatter data={scatter} fill="#2563EB" fillOpacity={0.55} stroke="#2563EB">
                      {scatter.map((p, i) => <Cell key={i} fill={FAC_COLORS[i % FAC_COLORS.length]} fillOpacity={0.55} stroke={FAC_COLORS[i % FAC_COLORS.length]} />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4, fontSize: 10.5 }}>
                  {scatter.map((p, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569' }}>
                      <span style={{ width: 9, height: 9, borderRadius: 5, background: FAC_COLORS[i % FAC_COLORS.length] }} />{p.name.length > 18 ? p.name.slice(0, 17) + '…' : p.name}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 6 }}>{SC_AXES[scMode].note}</div>
              </>
            )}

            {tab === 'fac' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 480 }}>
                  <thead><tr style={{ background: '#fafbfc' }}>
                    {['医療機関名', '病院類型', 'DPC退院患者数', '圏内シェア', '平均在院日数'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: '#94a3b8', textAlign: i >= 2 ? 'right' : 'left', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{area.facilities.map((f, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f8f9fa' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 500 }}>{f.name}</td>
                      <td style={{ padding: '7px 10px', color: '#64748b', fontSize: 11.5 }}>{f.isDpc ? <span style={{ color: '#0891b2', fontWeight: 600 }}>DPC対象</span> : f.ruikei.replace(/病院$/, '')}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(f.total)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{Math.round(f.total / area.totals.total * 100)}%</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f.los != null ? `${f.los}日` : '–'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              出典: {d.source}｜{d.note}<br />
              医療機関シェアはカルテ #68 と<b style={{ color: '#0f6e5d' }}>整合を検証</b>（MDC別シェアが一致）。<span style={{ color: '#b45309' }}>※厚労省の秘匿処理（小値非公開）により退院患者数の実数は数%過小の場合あり。構成比・シェアは信頼可能。</span>
            </div>
          </>}
          {!loading && !area && <div style={{ padding: 20, fontSize: 12.5, color: '#94a3b8' }}>この圏域のDPCデータは見つかりませんでした。</div>}
        </div>
      )}
    </div>
  );
}
