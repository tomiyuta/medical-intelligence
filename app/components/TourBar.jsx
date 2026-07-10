'use client';
// ══════════════════════════════════════════════════════════════════
// TourBar — 「問い」で駆動するシナリオツアーの補助レール（ジャーニーlens）
//   下部固定バー。現 step の文脈文1行＋前/次/終了。各 step は navigate() と
//   初期状態プリセット（futureYear / mapMode / panelId）でビューを遷移させる。
//   ★純追加: tourId=null（＝通常時）は何も描画せず挙動完全不変。ツアー中も
//   通常操作は可能（TourBar は補助レールで、ユーザー操作を奪わない）。
//   URL 共有: ?tour=strain2050&step=2 で途中から再現（useUrlSync が同期）。
// ══════════════════════════════════════════════════════════════════
import { useEffect, useRef } from 'react';
import { useSelection } from './SelectionContext';

// ── ツアー定義レジストリ ──────────────────────────────────────────
// 各 step の apply(sel) は SelectionContext の navigate/setter で
// 「なぜこの画面か」に対応する初期状態をプリセットする（副作用は遷移のみ）。
export const TOURS = {
  strain2050: {
    title: '2050年、あなたの県の医療は？',
    steps: [
      {
        view: 'map',
        text: 'まず地図で「病床逼迫度」を2050年でスイープ。現在の病床数を将来の75歳以上人口で割ると、赤いほど逼迫。あなたの県はどの位置に？',
        apply: (a) => { a.setFutureYear('2050'); a.navigate('map', { mapMode: 'strain' }); },
      },
      {
        view: 'bedfunc',
        text: '同じ県の「病床機能」へ。高度急性期〜慢性期のどこで需要が供給を追い越す（クロスオーバーする）かを見ると、逼迫の中身が機能別に分かる。',
        apply: (a) => { a.navigate('bedfunc'); },
      },
      {
        view: 'report',
        text: '最後に県内の医療圏カルテで「医療需要の将来推計」を開く。ICD別の入院需要が2050年へ向けてどう動くかを圏域単位で確認できる。',
        apply: (a) => { a.navigate('report', { panelId: 'sec-demand' }); },
      },
    ],
  },
};

export default function TourBar({ mob }) {
  const sel = useSelection();
  const { tourId, tourStep, setTourStep, exitTour } = sel;
  const tour = tourId ? TOURS[tourId] : null;

  // step 変化（＝ツアー開始 / 前後移動）ごとに一度だけ apply を実行。
  // 通常操作（手動ナビ）では key が変わらないため再適用されない＝操作を奪わない。
  const applied = useRef(null);
  useEffect(() => {
    if (!tour) { applied.current = null; return; }
    const key = tourId + '|' + tourStep;
    if (applied.current === key) return;
    applied.current = key;
    const step = tour.steps[tourStep - 1];
    if (step) step.apply(sel);
  }, [tourId, tourStep]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tour) return null;
  const total = tour.steps.length;
  const step = tour.steps[Math.min(tourStep, total) - 1] || tour.steps[0];
  const isFirst = tourStep <= 1;
  const isLast = tourStep >= total;

  const btn = (disabled, primary) => ({
    padding: mob ? '7px 12px' : '8px 16px', borderRadius: 8, fontSize: mob ? 12 : 13, fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
    border: '1px solid ' + (primary ? '#b91c1c' : '#d1d5db'),
    background: disabled ? '#f1f5f9' : primary ? '#b91c1c' : '#fff',
    color: disabled ? '#cbd5e1' : primary ? '#fff' : '#475569',
    opacity: disabled ? 0.7 : 1,
  });

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: mob ? 56 : 0, zIndex: 60,
      background: '#0f172a', color: '#e2e8f0',
      boxShadow: '0 -4px 18px rgba(0,0,0,0.22)',
      padding: mob ? '10px 12px calc(10px + env(safe-area-inset-bottom))' : '12px 20px',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: mob ? 10 : 16, flexWrap: mob ? 'wrap' : 'nowrap' }}>
        {/* ラベル + 進捗 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, order: mob ? 1 : 0 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fca5a5', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>▶ ツアー</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {tour.steps.map((_, i) => (
              <span key={i} style={{ width: i + 1 === tourStep ? 18 : 7, height: 7, borderRadius: 4, background: i + 1 === tourStep ? '#f87171' : i + 1 < tourStep ? '#64748b' : '#334155', transition: 'all 0.2s' }} />
            ))}
          </div>
          <span style={{ fontSize: 11, color: '#94a3b8', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{tourStep}/{total}</span>
        </div>

        {/* 文脈文（なぜこの画面か） */}
        <div style={{ flex: 1, minWidth: mob ? '100%' : 0, order: mob ? 0 : 1, lineHeight: 1.5 }}>
          <span style={{ fontSize: mob ? 12 : 13, color: '#e2e8f0' }}>{step.text}</span>
        </div>

        {/* コントロール */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, order: 2, marginLeft: mob ? 'auto' : 0 }}>
          <button onClick={() => !isFirst && setTourStep(tourStep - 1)} disabled={isFirst} style={btn(isFirst, false)}>◀ 前</button>
          {isLast
            ? <button onClick={exitTour} style={btn(false, true)}>完了 ✓</button>
            : <button onClick={() => setTourStep(tourStep + 1)} style={btn(false, true)}>次 ▶</button>}
          <button onClick={exitTour} title="ツアーを終了" style={{ ...btn(false, false), padding: mob ? '7px 10px' : '8px 12px' }}>終了</button>
        </div>
      </div>
    </div>
  );
}
