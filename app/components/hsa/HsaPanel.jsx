'use client';
import { useState } from 'react';

// 信頼度バッジの正規化パレット
const BADGE = {
  reconstructed: { c: '#0f6e5d', bg: '#e3f0ed' },  // ネイティブ再構築 / 独自集計（一次データ）
  reference: { c: '#b45309', bg: '#fdf1e4' },       // 参考推計
  latest: { c: '#0369a1', bg: '#e0f2fe' },          // 最新公表版
  muted: { c: '#94a3b8', bg: 'transparent' },       // 出典年など補足
};

function Badge({ label, kind = 'reconstructed' }) {
  const s = BADGE[kind] || BADGE.reconstructed;
  return <span style={{ fontSize: 11, fontWeight: kind === 'muted' ? 400 : 700, color: s.c, background: s.bg, padding: kind === 'muted' ? 0 : '2px 8px', borderRadius: 10 }}>{label}</span>;
}

// 全カルテパネル共通のアコーディオン外殻。children は () => JSX の描画関数。
export default function HsaPanel({ title, badges = [], defaultOpen = false, loading, empty, emptyText = 'この圏域のデータは見つかりませんでした。', children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', border: 'none', background: 'linear-gradient(180deg,#f8fafc,#fff)', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          {badges.map((b, i) => <Badge key={i} label={b.label} kind={b.kind} />)}
          <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
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
