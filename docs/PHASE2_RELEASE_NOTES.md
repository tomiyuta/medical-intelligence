# MedIntel Phase 2 Release Notes

**Phase 2 完了日**: 2026-04-29  
**Phase 2 期間**: 2026-04-28 〜 2026-04-29  
**Phase 2 commit範囲**: `41f0406` 〜 `be130ed` (13 commits)  
**ステータス**: ✅ **RELEASE FIXED** at `be130ed` (2026-04-29 確定)  
**次フェーズ**: Phase 3 (release固定後)

---

## 0. Phase 2 の目的

> **「見える化」から「誤読しにくい地域医療診断ツール」へ**

Phase 1 で Bridge Risk Model v1 までデータ拡張は到達済。Phase 2 は **新機能ではなく、信頼性・比較可能性・説明力の強化** に注力した。

---

## 1. 主な改善

### 1.1 Phase 2A: Bridge UI 安定化 (commits `41f0406`, `ca42340`)
- Layer 1 生活習慣リスク 6項目 (服薬3 + 既往3) に **💊🏥 アイコン + 灰色中立色**
- Bridge Layer 6 risks[] が **4件以上で折りたたみ** (デフォルト3件表示 + 「+N指標」展開)
- legacy バッジを `v0継承` (グレー塗) → `v0` (透明背景・細枠) に弱表示
- GitHub URL での **interpretation link** を Bridge 注記に追加

### 1.2 Phase 2B: capability_mapping 正式化 (commits `c407448`, `6202148`)
- skeleton (168行) → **正式仕様 v1 (402行)**
- Source of Truth: `data/static/facility_taxonomy.json`
- substring matching ロジック擬似コード化
- 全910ユニーク基準の分類結果文書化 (matched 338, unmatched 572, multi-match 64)
- False positive audit 実施 (acute/imaging/rehab で警告事項記載)
- 重要警告: `cap.oncology` ≠ がん診療連携拠点病院 等

### 1.3 Phase 2C: NDB健診risk 年齢標準化 (commits `d071fa3`, `d407613`)
- v1 ETL (男女合算) → **v2 ETL** (sex × age_group × bin_label 完全保持、19,973 records)
- NDB内標準人口テーブル (47県合算 sex × age_group の構成比、weight_sum=1.0)
- 直接標準化法で 5指標 × 47県の年齢標準化率算出
- Bridge UI に粗率/標準化率/delta_pp **紫色併記**

### 1.4 Layer 2 健診リスク再構成 (commits `8bd4710`, `5b97e79`)
- A. 検査値平均 (eGFR/Hb/Cr) + B. リスク該当者率 (BMI/HbA1c/SBP/LDL/尿蛋白) **2セクション化**
- リスクピラミッドが整った: 行動リスク → 生体リスク → 受療 → 利用 → 治療 → 結果
- 「47県」表記を「**47都道府県平均**」に統一 (分母明示)

### 1.5 Phase 2D: 腎疾患透析データ audit (commits `3d1d60f`, `62cb6e4`)
- 3データソース横断 audit (NDB診療行為/処方薬/施設基準/NDB index HTML)
- 確認結果: 6県サンプルで透析関連施設基準 9件
- **Case C 採択** (現状維持 + audit記録のみ)
- Case B (6県データを Bridge に混入) 不採用 — 47県完全前提に反する

### 1.6 Phase 2E-1: 沖縄糖尿病パラドックス検証 (commit `62cb6e4`)
- 6軸検証 (年齢構成/処方分類/受療構造/治療未導入/データ仕様/死亡率)
- 4重不一致を定量的に確認
- 7仮説 (A-G) を生成、反証には追加データ必要

---

## 2. 代表的な発見 (仮説生成段階)

### 2.1 沖縄: 肥満・糖代謝リスクが全国上位、しかし受療・死亡率は低位
- BMI≥25 は47県最高、HbA1c≥6.5 も高位 (47県中6位)
- 内分泌外来受療率は **47県最低** (-47.1%)
- 糖尿病死亡率は **47県40位 (低位)** (-11.3%)
- 治療カバー率 79.3% (47県中11位、低位)
- → 単一要因では説明できない複合パターン (詳細: `docs/OKINAWA_DIABETES_PARADOX.md`)

### 2.2 東北・北日本: 在宅移行ギャップ型の可能性
- 高齢化が高い + NDB在宅・回復期・慢性期病床・cap.homecare/rehab が低い傾向
- 腎不全死亡率・脳血管死亡率も全国上位
- 詳細検証は Phase 2E-2 候補

### 2.3 中四国・九州: 在宅移行支援型の可能性
- cap.homecare / cap.rehab が高い + NDB在宅医療も相対的に高い
- 詳細検証は Phase 2E-3 候補

---

## 3. 既知の限界 (誤読防止のため必読)

### 3.1 データの粒度・対象
- **健診データは40-74歳受診者ベース** — 後期高齢者75歳以上を含まない、未受診者の情報なし
- **死亡率は粗死亡率** — 年齢調整なし、年齢構成の影響を受ける
- **47都道府県平均は人口非加重** — 単純平均、人口規模差を反映しない

### 3.2 proxy指標の限界
- **capabilityはkeyword taxonomy proxy** — 厚労省公式の病院機能分類ではない (詳細: `docs/capability_mapping.md`)
- **受療率は罹患率ではない** — 患者調査は医療機関にかかった患者の集計
- **処方proxyは患者数ではない** — NDB処方は薬剤量、治療人数ではない
- **供給proxyは疾患専用ではない** — bedFunc/cap キーは疾患非特異的

### 3.3 標準化の限界
- **年齢標準化率は NDB内標準人口** — 地域住民全体の年齢調整率ではない
- **健診受診者選択バイアス** — 受診率の地域差を補正していない

### 3.4 Bridge の役割
- Bridge は **異常検出システムではなく、仮説生成装置** である
- 政策判断や個別評価ツールとしての使用は想定外

---

## 4. データソース

| データ | 出典 | 期間 |
|---|---|---|
| 健診検査値階層別分布 | NDB第10回オープンデータ | 令和4年度 (2022) |
| 健診質問票 22項目 (うち14項目利用) | NDB第10回オープンデータ | 令和4年度 |
| 患者調査 受療率 | 令和5年患者調査 | 2023 |
| NDB処方薬・診療行為 | NDB第10回オープンデータ | 令和5年度レセプト |
| 人口動態 死亡率 | 厚労省人口動態統計 | 2024年確定数 |
| 病床機能報告 | 病床機能報告 R6 | 2024 |
| 施設基準 (kijun_shards) | 厚生局届出受理名簿 | 2024 |
| 住民基本台帳 | 総務省 | 2025年1月1日 |

---

## 5. 文書一覧 (Phase 2 で整備)

| 文書 | 目的 |
|---|---|
| `docs/BRIDGE_V1_INTERPRETATION.md` | Bridge Risk Model v1 解釈仕様 (FROZEN解除と移行記録) |
| `docs/capability_mapping.md` | keyword taxonomy v1 仕様 (10カテゴリ・false positive記載) |
| `docs/PHASE_2D_DIALYSIS_AUDIT.md` | 透析データ availability audit (Case C 確定) |
| `docs/OKINAWA_DIABETES_PARADOX.md` | 沖縄糖尿病パラドックス検証 (7仮説) |
| `docs/PHASE2_RELEASE_NOTES.md` | 本書 |

---

## 6. v3 候補 (Phase 3 以降)

| 優先度 | 候補 | 必要データ |
|---|---|---|
| **高** | 死亡率の年齢調整 | 都道府県別年齢調整死亡率 (厚労省特殊報告) |
| **高** | 47県分布の人口正規化 | 既存データ + 人口10万対計算 |
| 中 | Phase 2E-2 東北在宅移行ギャップ検証 | 既存データのみ |
| 中 | Phase 2E-3 中四国・九州在宅移行支援型検証 | 既存データのみ |
| 中 | 沖縄パラドックス深掘り | NDB処方396細分類、患者調査糖尿病単独 |
| 中 | 内視鏡 false positive 修正 | facility_taxonomy.json の修正 |
| 低 | 真の地図UI (Leaflet/Mapbox) | フロントエンド実装 |
| 低 | 二次医療圏別リスク率 | NDB二次医療圏別データ |
| 低 | 26検査項目フル取得 | NDB追加Excel (BMI/HbA1c等以外) |

---

## 7. Phase 2 commit履歴

```
62cb6e4 docs: confirm Phase 2D Case C + Phase 2E-1 Okinawa diabetes paradox
5b97e79 fix: unify reference label '47県' → '47都道府県平均' (micro-fix)
8bd4710 feat: expand NDB health checkup risk layer (Layer 2 2セクション化)
3d1d60f chore: audit dialysis data availability for renal bridge (Phase 2D Step 1)
d407613 feat: integrate age-standardized rates into Bridge UI (Phase 2C-1)
d071fa3 feat: add age-standardized NDB checkup risk rates (Phase 2C-1)
6202148 chore: revert unintended app/page.js changes
c407448 docs: formalize capability_mapping.md (Phase 2B v1)
bf7b8ac docs: HANDOFF HEAD ref ca42340 確定
ca42340 fix: compact bridge risk display and add interpretation link (Phase 2A)
41f0406 fix: 生活習慣リスクパネルの新規6項目に日本語ラベル+アイコン+方向中立色
```

---

## 8. 利用上の注意 (再掲)

> MedIntel は **仮説生成装置** です。  
> 表示される指標は厳密な医療統計ではなく、医療機能の俯瞰と地域差の可視化を目的としています。  
> 政策判断・個別医療機関評価・診断には使用しないでください。
