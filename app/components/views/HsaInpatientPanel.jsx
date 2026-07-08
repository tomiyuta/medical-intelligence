'use client';
import { useState, useEffect } from 'react';
import { fmt } from '../shared';

// #17 入院患者数と平均在院日数の推移（都道府県内の二次医療圏比較・2013/2018/2023）
export default function HsaInpatientPanel({ code, mob }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [metric, setMetric] = useState('zaiin'); // zaiin | nissu

  useEffect(() => {
    if (!code || !open) return;
    if (d && d.code === code) return;
    setLoading(true); setD(null);
    fetch(`/api/hsa/inpatient?code=${code}`).then(r => r.json()).then(x => { setD({ ...x, code }); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code, open]);

  if (!code) return null;
  const self = d?.self;
  const years = d?.years || [2013, 2018, 2023];
  const unit = metric === 'zaiin' ? '人/日' : '日';

  const th = { padding: '7px 8px', fontSize: 10, fontWeight: 600, color: '#94a3b8', borderBottom: '1px solid #eef2f6', whiteSpace: 'nowrap' };
  const td = { padding: '7px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' };
  const chg = (row) => {
    const a = row[metric]?.[String(years[0])], b = row[metric]?.[String(years[years.length - 1])];
    if (a == null || b == null || !a) return null;
    return Math.round((b / a - 1) * 1000) / 10;
  };
  const fval = (v) => v == null ? <span style={{ color: '#e2e8f0' }}>–</span> : (metric === 'nissu' ? v.toFixed(1) : fmt(Math.round(v)));

  const Row = ({ row, label, cur, muted }) => {
    const c = chg(row);
    return (
      <tr style={{ background: cur ? '#eff6ff' : 'transparent', borderBottom: '1px solid #f8f9fa', color: muted ? '#94a3b8' : '#334155', fontWeight: cur ? 700 : (muted ? 500 : 400) }}>
        <td style={{ ...td, textAlign: 'left', color: cur ? '#2563EB' : (muted ? '#94a3b8' : '#334155'), fontWeight: cur || muted ? 700 : 500 }}>{label}</td>
        {years.map(y => <td key={y} style={td}>{fval(row[metric]?.[String(y)])}</td>)}
        <td style={{ ...td, fontWeight: 700, color: c == null ? '#cbd5e1' : (c >= 0 ? '#dc2626' : '#0891b2') }}>{c == null ? '–' : `${c > 0 ? '+' : ''}${c}%`}</td>
      </tr>
    );
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', border: 'none', background: 'linear-gradient(180deg,#f8fafc,#fff)', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0f6e5d', background: '#e3f0ed', padding: '2px 8px', borderRadius: 10 }}>ネイティブ再構築</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>入院患者数と平均在院日数の推移</span>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px' }}>
          {loading && <div style={{ padding: 24, color: '#cbd5e1', fontSize: 13 }}>読み込み中…</div>}
          {!loading && self && <>
            <div style={{ display: 'flex', gap: 6, margin: '8px 0 10px' }}>
              {[['zaiin', '1日平均在院患者数'], ['nissu', '平均在院日数']].map(([id, l]) => (
                <button key={id} onClick={() => setMetric(id)}
                        style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid ' + (metric === id ? '#2563EB' : '#e2e8f0'), background: metric === id ? '#eff6ff' : '#fff', color: metric === id ? '#2563EB' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 400 }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: 'left' }}>二次医療圏</th>
                  {years.map(y => <th key={y} style={{ ...th, textAlign: 'right' }}>{y}年<span style={{ fontSize: 8.5, color: '#cbd5e1' }}>({unit})</span></th>)}
                  <th style={{ ...th, textAlign: 'right' }}>{years[0]}比</th>
                </tr></thead>
                <tbody>
                  {(d.siblings || []).map(s => <Row key={s.code} row={s} label={s.area} cur={s.code === code} />)}
                  {d.prefRow && <Row row={d.prefRow} label={`${d.pref} 計`} muted />}
                  {d.national && <Row row={d.national} label="全国" muted />}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              出典: {d.source}｜1日平均在院患者数・平均在院日数（全病床）。カルテ #17 と<b style={{ color: '#0f6e5d' }}>数値一致</b>を検証済み（山城南 在院患者数394→441→458、在院日数19.8→21.0→21.7）。
            </div>
          </>}
          {!loading && !self && <div style={{ padding: 20, fontSize: 12.5, color: '#94a3b8' }}>この圏域の入院患者数データは見つかりませんでした。</div>}
        </div>
      )}
    </div>
  );
}
