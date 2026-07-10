'use client';
// ══════════════════════════════════════════════════════════════════
// ContextRail — 常設の階層文脈レール（ジャーニー: 深掘りチェーン）
//   main 上部に「全国 > {県} > {圏} > 施設」のパンくず＋深掘りチップを常設。
//   各ノード/チップの click = SelectionContext.navigate() でビュー横断遷移。
//   状態は context のみで完結（既存データ不要）。モバイルは横スクロール。
// ══════════════════════════════════════════════════════════════════
import { useSelection } from './SelectionContext';

// view → 地理階層レベル（0=全国 / 1=都道府県 / 2=医療圏 / 3=施設）
const LEVEL_OF_VIEW = { map: 0, ndb: 1, bedfunc: 1, muni: 1, area: 2, report: 2, explorer: 3 };

export default function ContextRail({ mob }) {
  const { view, pref, reportCode, navigate } = useSelection();
  const level = LEVEL_OF_VIEW[view] ?? 0;
  const isAreaLevel = view === 'area' || view === 'report';

  // ── パンくず: 現在の階層位置までのパス（各祖先ノード click = その階層へ昇降）──
  const crumbs = [
    { key: 'national', label: '全国', view: 'map', lvl: 0 },
    { key: 'pref', label: pref || '都道府県', view: 'ndb', lvl: 1 },
  ];
  if (isAreaLevel) crumbs.push({ key: 'area', label: view === 'report' ? '医療圏カルテ' : '医療圏', view: 'area', lvl: 2 });
  if (view === 'explorer') crumbs.push({ key: 'fac', label: '施設', view: 'explorer', lvl: 3 });

  // ── 深掘りチップ: 圏レベル閲覧中は県への昇降 2 本、それ以外は県からの掘り下げ 4 本 ──
  const chips = isAreaLevel
    ? [
        { label: 'この県の医療プロファイル', view: 'ndb' },
        { label: 'この県の施設', view: 'explorer' },
      ]
    : [
        { label: 'この県の圏一覧', view: 'area' },
        { label: '病床機能', view: 'bedfunc' },
        { label: '医療プロファイル', view: 'ndb' },
        { label: '施設', view: 'explorer' },
      ];

  const sep = <span style={{ color: '#cbd5e1', fontSize: 11, flexShrink: 0 }}>›</span>;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16,
      padding: '10px 12px', background: '#fff', border: '1px solid #f0f0f0', borderRadius: 10,
    }}>
      {/* パンくず */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {crumbs.map((c, i) => {
          const active = c.lvl === level;
          return (
            <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {i > 0 && sep}
              <button
                onClick={() => { if (!active) navigate(c.view, { pref }); }}
                disabled={active}
                style={{
                  border: 'none', background: 'transparent', padding: '2px 4px', borderRadius: 6,
                  fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: active ? 'default' : 'pointer',
                  color: active ? '#0f172a' : '#2563EB',
                }}>
                {c.label}
              </button>
            </span>
          );
        })}
      </div>

      {/* 深掘りチップ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 10.5, color: '#94a3b8', flexShrink: 0, marginRight: 2 }}>{pref || '選択県'}を</span>
        {chips.map(ch => {
          const cur = ch.view === view;
          return (
            <button
              key={ch.view}
              onClick={() => { if (!cur) navigate(ch.view, { pref }); }}
              disabled={cur}
              style={{
                flexShrink: 0, padding: '5px 11px', borderRadius: 999, cursor: cur ? 'default' : 'pointer',
                border: '1px solid ' + (cur ? '#e2e8f0' : '#bfdbfe'),
                background: cur ? '#f1f5f9' : '#f8faff',
                color: cur ? '#94a3b8' : '#2563EB', fontSize: 12, fontWeight: 600,
              }}>
              {cur ? '● ' : '→ '}{ch.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
