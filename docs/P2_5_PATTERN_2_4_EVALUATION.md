# Phase 4-1 P2-5: Pattern 2 / Pattern 4 追加検討 評価レポート

**フェーズ**: Phase 4-1 P2-5 (Phase 4-1 P2 series 最終) **branch**: feature/p2-5-pattern-2-4-evaluation **reviewer 推奨方針**: まず実装しない。off-UI で評価レポートを作る。 **結論**: **両 Pattern とも docs-only**

---

## 1. 背景

`RegionalMismatchExplorer` MVP (Phase 4-1 P1-4) では 6 archetype のうち 4 つを実装した:

実装済みid種別Pattern 1 (Risk-Care Gap)P1Mismatch SignalPattern 3 (Supply-Outcome Mismatch)P3Mismatch SignalPattern 5 (Aging-Outcome Burden)P5Mismatch SignalPattern 6 (Urban Context)P6Context Archetype

**未実装**: Pattern 2 (Supply-Outcome 並列悪化) / Pattern 4 (Supply-Outcome 整合 = Alignment Context)

P2-5 では、これら2つを以下のいずれにすべきかを判断する:

1. **UI 追加** (新 archetype として独立)
2. **conditional UI** (P5 の sub-label など、既存内に統合)
3. **docs-only** (UI 表示せず、`docs/REGIONAL_MISMATCH_PATTERNS.md` 内に留める)
4. **no-go** (本フェーズでは検討しない)

---

## 2. 候補ロジックの設計

### 2.1 Pattern 2 試案 (P5 + 腎不全拡張)

`docs/REGIONAL_MISMATCH_PATTERNS.md §Pattern 2` の定義に基づく:

- 高齢化高 + 在宅 capability 低 + outcome (脳血管・腎不全 年齢調整死亡率) 悪化

```
Pattern 2 候補ロジック:
  - 75+ 割合 - 全国 > +1.0pt              (P5 と同じ)
  - hc / rh - 47県平均 < -15%              (P5 と同じ)
  - (cerebro OR 腎不全) - 全国 > +15%      ← P5 は cerebro のみ、ここで腎不全を OR で追加
```

P5 (現行) との **唯一の差異**: outcome 条件に腎不全を OR で追加。

### 2.2 Pattern 4 試案 (Alignment Context)

`docs/REGIONAL_MISMATCH_PATTERNS.md §Pattern 4` の定義に基づく:

- 高齢化中〜高 + 供給 proxy 厚 + outcome 安定/良好

```
Pattern 4 候補ロジック:
  - 75+ 割合 - 全国 in [-1.0, +2.0]pt              (中〜高齢化)
  - (hc - 47県平均 > +30%) OR (rh - 47県平均 > +30%) (供給厚)
  - 5死因 全て (cerebro / 肺炎 / 心疾患 / 腎不全 / 糖尿病) 年齢調整 全国比 in [-15%, +15%] (outcome 安定)
```

---

## 3. 評価結果 (47都道府県、`tests/pattern_2_4_evaluation.test.js`)

### 3.1 Pattern 2

集計値候補県数5県候補リスト青森県・岩手県・秋田県・山形県・新潟県docs 代表 (秋田・青森・岩手・山形) ヒット4/4 (logic 妥当性確認)**P5 (現行) との重複5/5 (100%**)P2 のみ (P5 ではない)0県P5 のみ (P2 ではない)0県

→ Pattern 2 試案は **P5 と完全に同じ県群を捉えている**。腎不全条件を追加しても、P5 の cerebro 条件が既にこれらの県を全てカバーしているため、独立した signal を生まない。

### 3.2 Pattern 4

集計値候補県数2県候補リスト岡山県・広島県docs 代表 (岡山・熊本・島根) ヒット1/3 (岡山のみ)

県75+差hc%rh%cerebro%肺炎%心疾患%腎不全%糖尿病%岡山県+0.33pt+72.2%+55.6%-5.5%+9.1%-2.1%-7.8%-1.0%広島県-0.21pt+171.0%+45.9%-10.1%-14.2%+4.3%+3.2%-10.1%

熊本・島根は試案ロジックの outcome 条件 (5死因すべて ±15%) を満たさず候補外となった。これは試案 logic の調整余地を示すが、**Pattern 4 の本質である「優良地域」誤読リスクは候補数に関わらず残る**。

---

## 4. 誤読リスク評価

### 4.1 Pattern 2 — 情報量不足

P5 重複率 **100%** のため、UI に Pattern 2 を独立 archetype として追加すると:

- 同じ5県 (青森・岩手・秋田・山形・新潟) に **二重ラベル** が付く
- ユーザーは「Pattern 2 と Pattern 5 の両方が出ている → 状況が二重に深刻」と誤読する可能性
- 実際は同じ structure を別の名前で呼んでいるだけ

→ **情報量を増やさないラベル追加は誤読リスクを上回る**。

### 4.2 Pattern 4 — 「優良地域」誤読の強烈さ

`docs/REGIONAL_MISMATCH_PATTERNS.md §Pattern 4` 自体に明記されている:

> ⚠️ **注**: これは Mismatch Signal ではなく **Context Archetype (背景構造)** である。 単独では「不一致」を示さない。

UI 表示すると以下のような誤読が極めて強い:

想定される誤読実態「岡山は良い県」構造の整合は観察されるが因果は不明「岡山の医療体制は優れている」供給 proxy が厚いことしか分からない (質ではない)「岡山に行けば長生きできる」個人レベルでの推論は不可能「岡山式医療を全国展開すべき」地域文脈・人口構成・社会経済要因は未調整

これは reviewer Conditional Go #1 (P0 docs alignment) で禁止された:

- 「優良施設」「医療の質を断定」「政策効果」

と直接相反する誤読を誘発する。

---

## 5. 結論

### 5.1 Pattern 2 — **docs-only**

**理由**:

- P5 重複率 100% (P5 と完全一致)
- 独立 archetype として UI 追加しても情報量が増えない
- 二重ラベル誤読リスクあり

**運用**:

- `docs/REGIONAL_MISMATCH_PATTERNS.md §Pattern 2` の記述を維持
- 将来、P5 内の sub-label (例: 「outcome 拡張型」など) として整理する余地は残す
- UI には追加しない

### 5.2 Pattern 4 — **docs-only (no UI)**

**理由**:

- Alignment Context は単独で「不一致」を示さない (docs §Pattern 4 注記)
- 「優良地域」誤読リスクが極めて強い
- reviewer 採択 (P0 docs alignment) と直接相反する

**運用**:

- `docs/REGIONAL_MISMATCH_PATTERNS.md §Pattern 4` の記述を維持
- 因果関係は推論しないため、好事例の参照は docs (Phase 2E-3) で行う
- UI には絶対に追加しない

### 5.3 RegionalMismatchExplorer MVP の最終仕様 (Phase 4-1 P2 終了時)

Pattern種別UI 表示確認 commit**P1** Risk-Care GapMismatch Signal✅02548cb (P1-4)P2 並列悪化(P5 と重複)❌ docs-only本フェーズ**P3** Supply-Outcome MismatchMismatch Signal✅02548cb (P1-4)P4 Alignment ContextContext Archetype❌ docs-only (誤読リスク)本フェーズ**P5** Aging-Outcome BurdenMismatch Signal✅02548cb (P1-4)**P6** Urban ContextContext Archetype✅02548cb (P1-4)

**4 archetype 体制で確定**: Phase 4-1 P2 series 完全クローズ。

---

## 6. 副次成果: 試案 logic の保存

候補ロジック (Pattern 2 / 4) は本フェーズで実装したが UI には追加しない。ただし将来の検討のため保持:

- `tests/pattern_2_4_evaluation.test.js` — 47県 off-UI 評価 (npm test に統合)
- `tests/snapshots/pattern_2_4_evaluation.json` — 評価結果スナップショット

将来 reviewer の方針が変わる場合、これらを起点に再検討可能。

---

## 7. 関連 commit

commit内容02548cbP1-4 Regional Mismatch Explorer MVP (4 archetype 実装)fca6602P1-2/3/4 main merge925821cP0-5 terminology guard CIc1588d0P2-1 47県全件 snapshot QAae71e18P2-2 threshold sensitivity 分析79fd960P2-3 percentile / z-score 併記9e33525P2-4 confidence grade A/B/C(本フェーズ)P2-5 Pattern 2/4 評価 → docs-only 確定

## 8. 次フェーズ候補 (Phase 4-2 以降)

- Pattern 2/4 が必要になる新規 use case が出れば再検討
- Pattern 2 を P5 sub-label として統合する設計 (UI 設計負債なし)
- 47県全件手動レビュー (新規出現県の正当性検証)
- 二次医療圏化 (P3 用、`docs/REGIONAL_MISMATCH_PATTERNS.md` で言及)
- NDB 396細分類取得 (P3 用)
- 男女合算の人口加重平均 (現状は単純平均)
