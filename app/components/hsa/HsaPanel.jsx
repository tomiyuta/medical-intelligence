'use client';
import { useState } from 'react';

// 信頼度バッジの正規化パレット
const BADGE = {
  reconstructed: { c: '#0f6e5d', bg: '#e3f0ed' },  // 一次データからの独自集計
  reference: { c: '#b45309', bg: '#fdf1e4' },       // 参考推計
  latest: { c: '#0369a1', bg: '#e0f2fe' },          // 最新公表版
  muted: { c: '#94a3b8', bg: 'transparent' },       // 出典年など補足
};

function Badge({ label, kind = 'reconstructed' }) {
  const s = BADGE[kind] || BADGE.reconstructed;
  return <span style={{ fontSize: 11, fontWeight: kind === 'muted' ? 400 : 700, color: s.c, background: s.bg, padding: kind === 'muted' ? 0 : '2px 8px', borderRadius: 10 }}>{label}</span>;
}

// 全カルテパネル共通のアコーディオン外殻。children は () => JSX の描画関数。
// headline: 開閉に依らずヘッダ右肩に常設する「結論1個」（バンドルは選択時に全取得済のため算出可）。
export default function HsaPanel({ title, badges = [], defaultOpen = false, loading, empty, emptyText = 'この圏域のデータは見つかりませんでした。', headline = null, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '13px 18px', border: 'none', background: 'linear-gradient(180deg,#f8fafc,#fff)', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', minWidth: 0 }}>
          {badges.map((b, i) => <Badge key={i} label={b.label} kind={b.kind} />)}
          <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          {headline && <div style={{ display: 'flex', alignItems: 'center' }}>{headline}</div>}
          <span style={{ fontSize: 12, color: '#94a3b8', flexShrink: 0 }}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
        </div>
      </button>
      {open && (
        <div style={{ padding: '4px 18px 18px' }}>
          {loading ? <div style={{ padding: 24, color: '#cbd5e1', fontSize: 13 }}>読み込み中…</div>
            : empty ? <div style={{ padding: 20, fontSize: 12.5, color: '#94a3b8' }}>{emptyText}</div>
              : children()}
        </div>
      )}
    </div>
  );
}
