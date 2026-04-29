# Phase 3-2: 47県分布の人口正規化 audit

**作成日**: 2026-04-29  
**ステータス**: ✅ audit 完了 — **既に主要指標は正規化済**、新規実装ほぼ不要

---

## 0. 結論

> Phase 1〜2 の実装過程で、47県横比較の主要指標は **既に人口正規化済**。  
> Phase 3-2 として新規 ETL/UI 実装は **不要** または **最小限**。  
> 追加課題は二次医療圏レベルの正規化 (別フェーズ)。

---

## 1. 既に人口正規化済の指標

| 指標 | 場所 | 正規化方式 | コード位置 |
|---|---|---|---|
| **NDB処方 utilization** | Bridge Layer 6 / NdbView Layer 4 | `qty / pop × 100000` | `DomainSupplyDemandBridge.jsx:57` |
| **NDB診療行為** | NdbView Layer 3 (医療利用) | `total_claims / pop × 100000` | `NdbView.jsx:169` |
| **NDB処方 47県平均** | Bridge utilization 比較分母 | `Σ(pref_rate) / N` | `DomainSupplyDemandBridge.jsx` |
| **病床/75+人口** | RegionalBedFunctionView | `beds / p75 × 100000` | `RegionalBedFunctionView.jsx:123` |
| **NDB在宅 (75+人口比)** | RegionalBedFunctionView | `claims / p75 × 100000` | `RegionalBedFunctionView.jsx:152` |
| **回復期/慢性期病床 (75+人口比)** | RegionalBedFunctionView | `beds / p75 × 100000` | `RegionalBedFunctionView.jsx:191-192` |
| **cap.homecare/rehab (75+人口比)** | homecare_capability.json | per75 補正 | `RegionalBedFunctionView.jsx:194-195` |
| **死亡率** (心疾患/脳血管/がん等) | vital_stats_pref.json | 元データ自体が10万対 | データソースで正規化済 |
| **患者調査受療率** | NdbView Layer 2.5 | 元データ自体が10万対 | データソースで正規化済 |
| **NDB健診リスク該当者率** | NdbView Layer 2 / Bridge | 元から比率 (%) | 正規化不要 |
| **NDB質問票 (服薬等)** | NdbView Layer 1 | 元から比率 (%) | 正規化不要 |
| **年齢調整死亡率 (Phase 3-1)** | age_adjusted_mortality_2020.json | 平成27年モデル人口 | データソースで正規化済 |

---

## 2. 未対応 (今フェーズでは扱わない)

| 指標 | 場所 | 評価 |
|---|---|---|
| AreaView の病院数/病床数/病棟数 | 二次医療圏内ランキング | 1県内の比較が目的、47県跨ぎではない。二次医療圏別人口データ取得は別フェーズ |
| FacilityExplorer の施設絶対数 | 施設探索 | 個別施設の検索・選別が目的、人口比は不要 |
| MapView のメトリクス絶対値 | 47県マップ | 既に「死亡率/施設数」など正規化済の指標を選択可能 |

---

## 3. 推奨 (将来候補)

### 3.1 二次医療圏別人口データ取得
- 厚労省の地域医療構想 sheet または住基市区町村別から二次医療圏単位で集計
- AreaView の医療圏比較を /10万人補正可能に
- 工数: 中 (新規 ETL + UI改修)

### 3.2 75歳以上人口あたり指標の拡大
- 現在は RegionalBedFunctionView でのみ実装
- Bridge Layer 6 の supply 列も `/75+10万対` に拡張可能
- 工数: 小 (既存ロジック流用)

### 3.3 高齢化補正の動的切替
- UI で「全人口あたり / 65+人口あたり / 75+人口あたり」を切替可能に
- 工数: 中 (UI設計判断)

---

## 4. 判定: Phase 3-2 ETL/UI 実装

### ✅ 主要指標は既に正規化済 → **新規実装不要**

Phase 1〜2 の累積で 47県横比較の信頼性は既に確保されている。  
本audit記録のみで Phase 3-2 を **クローズ** とする。

将来 (3.1〜3.3) に進む場合は、別フェーズで個別判断する。

---

## 5. 関連ドキュメント

- `docs/BRIDGE_V1_INTERPRETATION.md` — Bridge utilization の人口10万対補正記載
- `docs/PHASE2_RELEASE_NOTES.md` §3.1 — 「47都道府県平均は人口非加重」の制約記載
- `docs/PHASE_2D_DIALYSIS_AUDIT.md` — Case C 確定方式の踏襲
