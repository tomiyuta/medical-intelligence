'use client';

/**
 * InterpretationGuard
 *
 * 表示のすぐ近くに常時設置する解釈注意 component。
 * UI ユーザーが docs を読まずに表示だけを見ても、
 *   「この表示は地域医療構造の仮説生成用であり、
 *    医療の質・政策効果・施設の優劣を判定するものではない」
 * を直ちに認識できるようにする。
 *
 * 設置先 (Phase 4-1 P1-2):
 *   - Bridge (DomainSupplyDemandBridge): variant="outcome"
 *   - GAP_FINDER (NdbView): variant="mismatch"
 *   - 地域類型 (RegionalBedFunctionView): variant="mismatch"
 *   - 死亡率 (NdbView causes): variant="mortality"
 *   - Facility / Tier (FacilityExplorerView): variant="facility"
 *
 * Phase 4 Review Package v3 / peer review v2 採択。
 * docs/PHASE4_REVIEW_PACKAGE.md §6 (誤読防止ルール) を UI に反映。
 */

const PRESET = {
  outcome: {
    title: '解釈上の注意（Outcome 表示）',
    items: [
      'この表示は地域医療構造の仮説生成用です。診断・ランキングではありません。',
      '死亡率は医療の優劣を示す指標ではありません。',
      '供給 proxy と Outcome の並列表示は因果関係を示しません。',
      '2020年齢調整死亡率と2024粗死亡率を直接比較しないでください。',
    ],
    color: '#7c3aed',
    bg: '#faf5ff',
  },
  mismatch: {
    title: '解釈上の注意（不一致観察）',
    items: [
      '本表示は地域医療構造の仮説生成用であり、診断ツールではありません。',
      '「不一致パターン」は排他的分類ではなく、複数該当しうる観察ラベルです。',
      '地域類型・パターンは経験則に基づく暫定ラベルで、政策推奨ではありません。',
      '供給 proxy と Outcome の並列が「効果なし」を意味するわけではありません。',
    ],
    color: '#dc2626',
    bg: '#fef2f2',
  },
  mortality: {
    title: '解釈上の注意（死亡率指標）',
    items: [
      '粗死亡率は年齢構成の影響を強く受けます。年齢補正前です。',
      '年齢調整死亡率（5年ごと公表）は最新が令和2年(2020年)時点。',
      '異なる時点・補正有無の指標を直接比較しないでください。',
      '死亡率の高低だけで医療の優劣・施設評価・政策効果を判定できません。',
    ],
    color: '#0891b2',
    bg: '#ecfeff',
  },
  facility: {
    title: '解釈上の注意（施設 Tier 表示）',
    items: [
      'Tier は規模・実績の参考指標であり、地域医療評価ではありません。',
      'Tier C/D は機能が低いことを意味しません。地域での役割が異なります。',
      'priority_score / Tier は本サイト独自の内製複合指標です。公式分類ではありません。',
      '施設の優劣評価・診療の質の評価には使用できません。',
    ],
    color: '#92400e',
    bg: '#fef3c7',
  },
};

export default function InterpretationGuard({ variant = 'mismatch', title, items, compact = false }) {
  const preset = PRESET[variant] || PRESET.mismatch;
  const finalTitle = title || preset.title;
  const finalItems = items || preset.items;
  const padding = compact ? '8px 12px' : '12px 14px';
  const fontSize = compact ? 10 : 11;
  const titleSize = compact ? 11 : 12;

  return (
    <div
      role="note"
      aria-label="解釈上の注意"
      style={{
        background: preset.bg,
        borderLeft: `3px solid ${preset.color}`,
        borderRadius: 4,
        padding,
        margin: '8px 0',
        fontSize,
        lineHeight: 1.6,
        color: '#475569',
      }}
    >
      <div style={{ fontWeight: 700, color: preset.color, fontSize: titleSize, marginBottom: 4 }}>
        ⚠ {finalTitle}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {finalItems.map((item, i) => (
          <li key={i} style={{ paddingLeft: 12, position: 'relative', marginTop: 2 }}>
            <span style={{ position: 'absolute', left: 0, color: preset.color }}>・</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
