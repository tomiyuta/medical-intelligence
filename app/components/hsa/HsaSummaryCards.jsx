'use client';
import { useState, useMemo } from 'react';
import { useHsaBundle } from './useHsaArea';
import { fmt } from '../shared';
import PrefStrip47 from '../ui/PrefStrip47';

// 圏の一目サマリー: 総人口増減・高齢化率・医師偏在順位・病床過不足。
// 各カードの下に「全国330圏分布ストリップ（AreaStrip330）」を敷き、自圏を青リングで定位。
// hover=最近傍圏の同期点灯 / click=ピン(◆橙) / ピン再click=その圏へ移動(setCode)。
export default function HsaSummaryCards({ mob, setCode, onJumpPanel }) {
  const { code, bundle, loading } = useHsaBundle();
  // hover/pin は全ストリップ横断で同期（ラベルは「圏名·県」で全指標共通）
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);

  const codeByLabel = useMemo(() => {
    const m = {};
    const lbc = bundle?.norms?.labelByCode;
    if (lbc) for (const [c, l] of Object.entries(lbc)) m[l] = c;
    return m;
  }, [bundle]);

  if (loading || !bundle) {
    return <div style={{ height: 78, marginBottom: 20, borderRadius: 12, background: '#f1f5f9' }} />;
  }
  const norms = bundle.norms?.ready ? bundle.norms : null;
  const selfLabel = norms?.labelByCode?.[code] || null;

  const cards = [];
  const py = bundle.population?.area?.years;
  if (py?.['2020'] && py?.['2050']) {
    const chg = Math.round((py['2050'].total / py['2020'].total - 1) * 1000) / 10;
    cards.push({ l: '総人口 2050', v: fmt(py['2050'].total), u: `人 (${chg > 0 ? '+' : ''}${chg}%)`, c: chg >= 0 ? '#dc2626' : '#0891b2', metric: 'pop2050chg', cap: '330圏・2050増減率', sec: 'sec-population' });
    const aging = Math.round(py['2050'].a65 / py['2050'].total * 1000) / 10;
    cards.push({ l: '高齢化率 2050', v: aging, u: '%', c: '#b45309', metric: 'aging2050', cap: '330圏・高齢化率', sec: 'sec-population' });
  }
  const ph = bundle.physician?.area;
  if (ph?.rank) cards.push({ l: '医師偏在 全国順位', v: ph.rank, u: `位 / ${bundle.physician.areaCount || 330}`, c: '#2563EB', metric: 'physicianIdx', cap: '330圏・偏在指標', sec: 'sec-physician' });

  const nec = bundle.bed?.necessity?.series?.['合計'];
  if (nec && nec['2024'] != null && nec['必要'] != null) {
    const diff = nec['2024'] - nec['必要'];
    cards.push({ l: '病床 過不足', v: `${diff > 0 ? '+' : ''}${fmt(diff)}`, u: `床 (2024実績−必要)`, c: diff > 0 ? '#dc2626' : '#0891b2', metric: 'bedBalance', cap: '326圏・過不足率', sec: 'sec-bed' });
  }
  if (!cards.length) return null;

  const jumpTo = (label) => { const c = codeByLabel[label]; if (c && setCode) setCode(c); };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : `repeat(${cards.length},1fr)`, gap: 8, marginBottom: 20 }}>
      {cards.map((k, i) => {
        const m = norms?.metrics?.[k.metric];
        return (
          <div key={i} style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, padding: '11px 15px' }}>
            <div onClick={k.sec && onJumpPanel ? () => onJumpPanel(k.sec) : undefined}
                 role={k.sec && onJumpPanel ? 'button' : undefined}
                 title={k.sec && onJumpPanel ? '該当パネルへ移動' : undefined}
                 style={{ cursor: k.sec && onJumpPanel ? 'pointer' : 'default' }}>
              <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.c, letterSpacing: '-0.02em' }}>{k.v}<span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500, marginLeft: 3 }}>{k.u}</span></div>
            </div>
            {m && m.items?.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f4f6f9' }}>
                <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2, letterSpacing: '0.01em' }}>{k.cap}</div>
                <PrefStrip47
                  mode="micro"
                  values={m.items.map((it) => ({ pref: it.label, value: it.value }))}
                  selected={selfLabel}
                  pinned={pinned}
                  hoverPref={hover}
                  yearBadge={m.badge}
                  natAvg={m.natAvg}
                  inverse={!!m.inverse}
                  onHover={setHover}
                  onPin={setPinned}
                  onJump={jumpTo}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
