# Phase 4-3d: 在宅医療 capability vs 実績 proxy audit

**フェーズ**: Phase 4-3d (Data Expansion 第 1 弾)
**branch**: feature/phase4-3-data-expansion-scoping
**reviewer 採択**: capability proxy が actual usage と整合するかを 47都道府県粒度で検証する。**UI 拡張ではなく audit のみ**。
**結論サマリ**: P3 (Supply-Outcome Mismatch) の代表 2県 (山口・広島) で **capability_high × actual_mid** が観察された → P3 の **proxy caveat が実データで補強された**。

---

## 1. 背景

`docs/REGIONAL_MISMATCH_PATTERNS.md` の Pattern 3 (山口・徳島・鹿児島) は、以下の組合せで定義される:

```
高 cap.homecare (届出ベース) × 高 outcome (年齢調整死亡率)
```

ここで懸念は `cap.homecare` が **施設基準届出** に基づく proxy であり、実際の在宅医療実績ではない点。

> reviewer 採択 P2-4 confidence grade で `proxy caveat = -1` を付与した理由

本 audit では、`area_emergency_homecare.json` に既存していた **339二次医療圏 × 在宅医療患者数** を 47県集計し、capability rank と actual rank を比較する。

---

## 2. データ仕様

### 2.1 入力

| ソース | 内容 | 粒度 | データ品質 |
|---|---|---|---|
| `area_emergency_homecare.json` | 在宅医療施設数・患者数 ほか | 339 二次医療圏 | hospitals/homecare/homecare_patients = 100% |
| `age_pyramid.json` | 5歳階級 人口 (47県) | 47県 | 100% |
| `homecare_capability_by_pref.json` | 在宅医療施設届出 (capability proxy) | 47県 | 既存 P3/P5 で使用 |

### 2.2 集計仕様 (`scripts/audit_homecare_actual_by_pref.py`)

- aggregation: 都道府県名で **SUM** (二次医療圏単位の値を都道府県単位に合算)
- normalization (per_75plus_100k): `集計値 / 75歳以上人口 × 100000` (capability proxy と同単位)
- normalization (per_100k): `集計値 / 全人口 × 100000` (補助)
- rank: `high = top 10`、`low = bottom 10 (rank ≥ 38)`、`mid = それ以外`

### 2.3 出力

`data/static/homecare_actual_by_pref.json` (39.7 KB)

scope 外:
- `emerg / emerg_claims`: 92.9% null/0 → 使用しない
- `acute_support`: 27.7% null/0 → 参考値として保持

---

## 3. 47県の gap_type 分類

| gap_type | 県数 | 解釈 |
|---|---|---|
| capability_mid_actual_mid | 11県 | 中位整合 |
| **capability_high_actual_mid** | **9県** | **★ P3 proxy caveat 強化** (cap 上位だが actual 中位) |
| capability_mid_actual_high | 8県 | actual がやや上回る |
| capability_mid_actual_low | 8県 | cap 中位だが actual 低い |
| capability_low_actual_mid | 7県 | cap 低位だが actual 中位 |
| capability_low_actual_low | 2県 | 低位整合 (秋田・新潟) |
| capability_high_actual_high | 1県 | 高位整合 (岡山) |
| capability_low_actual_high | 1県 | capability mapping 再検討対象 (宮崎) |

→ **9/47 (19%) が `capability_high × actual_mid`** = **届出ベース proxy が実績を過大評価する傾向**。

---

## 4. 4 軸別の重要県

### 4.1 軸 A: capability_high_actual_high (整合) — 1県

| 県 | cap_rank | actual_rank | rank_gap |
|---|---|---|---|
| 岡山県 | 4 | 9 | +5 |

→ P4 docs 候補 (`docs/REGIONAL_MISMATCH_PATTERNS.md §Pattern 4`) と一致。**capability と actual が整合する珍しい県** (Alignment Context が両軸で確認できる)。

### 4.2 軸 B: capability_high × actual_mid/low (proxy caveat 強) — 9県

| 県 | cap_rank | actual_rank | rank_gap | 備考 |
|---|---|---|---|---|
| 大阪府 | 6 | 28 | +22 | P6 候補 (Urban Context)、actual で乖離 |
| 島根県 | 5 | 27 | +22 | docs 上の P4 特例だが actual で外れる |
| 京都府 | 8 | 26 | +18 | |
| **広島県** | **1** | **19** | **+18** | **★ cap rank 1位だが actual 19位** |
| **山口県** | **3** | **21** | **+18** | **★ P3 代表、cap 高 × outcome 悪 → actual 中位** |
| 鳥取県 | 2 | 12 | +10 | |
| 東京都 | 7 | 16 | +9 | P6 (Urban Context) |
| 兵庫県 | 10 | 15 | +5 | |
| 福岡県 | 9 | 14 | +5 | |

→ **P3 代表 (山口・広島) で proxy caveat が実証された**。reviewer 採択 P2-4 で `P3/P6 = proxy caveat -1` を付与した理由が、実データで裏付けられた。

### 4.3 軸 C: capability_low × actual_high (capability mapping 再検討) — 1県

| 県 | cap_rank | actual_rank | rank_gap |
|---|---|---|---|
| 宮崎県 | 38 | 2 | -36 |

→ 届出データが実態を捕捉できていない可能性。`homecare_capability_by_pref.json` の集計ロジック (施設基準) が宮崎県の在宅医療実態を反映していない可能性あり。**capability mapping (`docs/capability_mapping.md`) の再検討対象**。

### 4.4 軸 D: capability_low × actual_low (整合) — 2県

| 県 | cap_rank | actual_rank | 備考 |
|---|---|---|---|
| 秋田県 | 45 | 45 | P5 代表、両軸で integral に低い → P5 判定の信頼性が上がる |
| 新潟県 | 41 | 40 | P5 候補 (boundary)、両軸で低い → P5 整合 |

---

## 5. P3 / P4 / P5 / P6 への示唆

### 5.1 P3 (Supply-Outcome Mismatch)

**示唆**: `cap.homecare` が actual usage を必ずしも反映しないことが実証された。

| 県 | cap_rank | actual_rank | P3 判定への影響 |
|---|---|---|---|
| 山口県 | 3 | 21 | **P3 判定** (現行: cap_homecare +104%) は届出ベース。actual で見ると国内 21位 = 中位水準 |
| 広島県 | 1 | 19 | actual 中位 |

**取扱い**: P3 判定そのものを変更しない (Phase 4-1 P2 で確定した baseline を維持)。ただし `confidence grade = B (proxy caveat)` の妥当性が裏付けられた。

### 5.2 P4 (Alignment Context)

**示唆**: 岡山県は `cap_high × actual_high × outcome stable` で 3 軸整合。docs §Pattern 4 の代表例として頑健。

ただし `docs-only` の判断は維持: 「優良地域」誤読リスクは依然として強い。

### 5.3 P5 (Aging-Outcome Burden)

**示唆**: 秋田県は cap/actual ともに最低位 (45/45) → P5 判定の信頼性が上がる。

新潟県も整合的。boundary 例の青森・岩手・山形は cap_low_actual_mid 系で、低位寄りの mid。

### 5.4 P6 (Urban Context)

東京都は `cap_high × actual_mid` で +9 ランクの乖離。proxy caveat に該当。

---

## 6. capability mapping 課題 (発見事項)

宮崎県 (cap_rank 38 → actual_rank 2、gap -36) は本 audit の **唯一の異常値**。

考えられる要因 (推測、個別の因果は不明):
- `homecare_capability_by_pref.json` の集計対象 (施設基準コード) が宮崎県の在宅実態を捕捉していない
- 二次医療圏 → 都道府県集計時の人口当たり計算で 75+人口分母の差異
- ある特定の施設タイプ (例: 在宅療養支援病院) が capability から漏れている可能性

→ Phase 4-3d 範囲外。`docs/capability_mapping.md` の再検討タスクとして提起 (将来フェーズ)。

---

## 7. Phase 4-1 guardrail との整合

本 audit は以下を遵守:

✅ 「actual が高い = 医療の質が高い」と書かない (= rank の意味は記載のみ)
✅ 「actual が低い = 悪い」と書かない (秋田 D 整合は「P5 判定の信頼性向上」の文脈のみ)
✅ capability と actual の不一致を政策失敗と断定しない (gap_type は分類ラベルのみ)
✅ P3/P4 の UI 判定を即変更しない (本フェーズは audit のみ、変更は将来判断)
✅ terminology guard CI 通過維持

---

## 8. Done 条件チェック

reviewer 採択 Done 条件:

| # | 条件 | 状態 |
|---|---|---|
| 1 | 339圏域データを47県へ集計 | ✅ areas 合計 = 339 |
| 2 | 欠損県がない | ✅ 47県すべて充足 |
| 3 | 県別 actual を per 100k で正規化 | ✅ per_75plus_100k + per_100k |
| 4 | capability proxy との rank gap 算出 | ✅ rank_gap field |
| 5 | 山口の cap 高値が actual 側でも確認できるか | ✅ cap rank 3 → actual rank 21 (proxy caveat 検出) |
| 6 | P3候補県の actual/capability 整合性を分類 | ✅ 9 類型に分類 |
| 7 | docs report 作成 | ✅ 本 docs |
| 8 | npm test 通過 | ✅ 5 test 連続 PASS |

---

## 9. 次フェーズ候補

本 audit の結果、以下が次フェーズ候補として浮上:

| 優先 | 候補 | 工数 | 価値 |
|---|---|---|---|
| 1 | 4-3a NDB 26項目フル取得 | 中 | 高 (BRIDGE_V1 §7 #3) |
| 2 | capability mapping 再検討 (宮崎県の異常値起因) | 小〜中 | 中 |
| 3 | UI に actual rank を補助情報として併記 | 小 | 低 (誤読リスク要評価) |
| 4 | 4-3b NDB 396 薬効分類 | 中 | 中 |
| 5 | 4-3c 二次医療圏化 (UI) | 大 | 中 |

ただし、UI 反映 (#3) は誤読リスク (「actual が高い = 良い」誤読) があるため、reviewer 判断を仰いでから実施する。

---

## 10. 関連 commit / 関連 docs

### Phase 4-3 commit chain
```
b80ba02  docs: add phase4-3 data expansion scoping plan
(本 commit) chore(data): aggregate homecare actual metrics by prefecture
0160c22  test: add homecare actual audit checks
(本 commit) docs: add phase4-3d homecare actual audit report
```

### 関連 docs
- `docs/PHASE4_3_DATA_EXPANSION_PLAN.md` (Phase 4-3 全体 scoping)
- `docs/REGIONAL_MISMATCH_PATTERNS.md` §Pattern 3, §Pattern 4
- `docs/PHASE_2E_3_WESTERN_JAPAN_HOMECARE.md` (Pattern 3 詳細、山口・徳島・鹿児島)
- `docs/capability_mapping.md` (capability proxy 定義、宮崎課題で再検討候補)
- `tests/snapshots/regional_mismatch_47pref.json` (P2-4 confidence grade snapshot)

