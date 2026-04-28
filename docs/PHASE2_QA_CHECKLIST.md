# Phase 2 Closure QA チェックリスト

**作成日**: 2026-04-29  
**目的**: Phase 2 完了後の検証項目を明示。Vercel deploy 反映後に user 実機確認用。

---

## 1. NdbView (医療プロファイルタブ)

### 1.1 Layer 1: 生活習慣・服薬・既往歴
- [ ] パネル見出し「生活習慣・服薬・既往歴」「質問票14項目」バッジ
- [ ] 14項目すべて表示 (生活習慣8 + 服薬3 + 既往3)
- [ ] 服薬3項目に 💊 アイコン + 灰色 (中立)
- [ ] 既往3項目に 🏥 アイコン + 灰色 (中立)
- [ ] 注記に「灰=方向中立(服薬💊・既往🏥)」記載

### 1.2 Layer 2: 健診リスク (2セクション化)
- [ ] パネル見出し「健診リスク」「検査値+該当者率」バッジ
- [ ] **A. 検査値平均** サブセクション (eGFR/Hb/Cr 3項目、男女別カード)
- [ ] **B. リスク該当者率** サブセクション (BMI/HbA1c/SBP/LDL/尿蛋白 5項目)
- [ ] 各 B カードに **粗率 (24pt) + 年齢標準化率 (紫色9pt)**
- [ ] 47都道府県平均との差を自然言語化 (顕著に高い/同程度/低い)
- [ ] 注記2行 (健診受診者ベース + 標準化率説明)

### 1.3 Layer 6: Bridge Risk Model v1
- [ ] 6領域すべて表示 (循環器/糖尿病/がん/脳血管/呼吸器/腎疾患)
- [ ] 循環器 (5 risks) で **「+2指標を表示」** 折りたたみボタン
- [ ] 糖尿病 (4 risks) で **「+1指標を表示」** 折りたたみボタン
- [ ] legacy `v0` バッジ (透明背景・細枠) 表示
- [ ] 各リスクに **年齢標準化率併記** (紫色)
- [ ] 注記下部の **GitHub interpretation link** クリック可

---

## 2. RegionalBedFunctionView (病床機能タブ)

### 2.1 在宅移行補助分類 v1
- [ ] 5指標の表示 (NDB在宅 / 回復期床/75+ / 慢性期床/75+ / cap.homecare/75+ / cap.rehab/75+)
- [ ] ±5% neutral zone 表示
- [ ] 47県分類: 支援10/ギャップ9/中間6/対象外22 が反映
- [ ] 既存「地域分類」(MapView基準) との併存

---

## 3. FacilityExplorer (施設エクスプローラタブ)

### 3.1 capability_mapping 関連
- [ ] Tab 1 (kijun_shards): Tier S/A/B/C/D/未評価 フィルタ
- [ ] Tab 2 (top_facilities): Tier S/A/B フィルタ
- [ ] cap.* 数値の表示
- [ ] 「規模・実績参考スコア」UI label
- [ ] methodology.md の Tier coverage 注記 (Phase 1 から維持)

---

## 4. 主要県での sanity 確認

### 4.1 沖縄県
- [ ] BMI≥25 = 39.8% / 47都道府県平均より顕著に高い (+35.2%)
- [ ] HbA1c≥6.5 = 8.7% / 47都道府県平均より高い (+14.5%)
- [ ] 高血圧薬 = 27.1% / 灰色中立
- [ ] 糖尿病死亡率 = 11.0/10万 / 全国比 -11.3%

### 4.2 高知県
- [ ] SBP≥140 = 21.7% / 47都道府県平均より高い (47県最高)
- [ ] HbA1c≥6.5 = 8.2% (年齢標準化 7.6%)

### 4.3 東京都
- [ ] BMI≥25 = 27.9% (47都道府県平均と同程度)
- [ ] HbA1c≥6.5 = 6.0% (47県最低)
- [ ] 腎不全死亡率 = 16.8/10万 (47県最低)

### 4.4 北海道
- [ ] BMI≥25 = 33.9% (高水準)
- [ ] 喫煙率 = 28.0% (47県最高)
- [ ] 糖尿病死亡率 (確認)

---

## 5. ドキュメント整合性

### 5.1 Phase 2 で整備された docs
- [ ] `docs/BRIDGE_V1_INTERPRETATION.md` (97行) リンク機能
- [ ] `docs/capability_mapping.md` (402行) 構造確認
- [ ] `docs/PHASE_2D_DIALYSIS_AUDIT.md` (97行) Case C 確定記載
- [ ] `docs/OKINAWA_DIABETES_PARADOX.md` (177行) 7仮説記載
- [ ] `docs/PHASE2_RELEASE_NOTES.md` (本書と一緒に作成)

### 5.2 既存 docs との整合
- [ ] `docs/SPEC_医療インフラ.md` SUPERSEDED マーク維持
- [ ] `docs/priority_score_methodology.md` Phase 1 記述維持
- [ ] `HANDOFF.md` HEAD ref が最新 commit を指している

---

## 6. 既知の制約 (PHASE2_RELEASE_NOTES.md §3 と整合)

- [ ] 健診40-74歳ベース (75歳以上含まず) 注記
- [ ] 死亡率は粗死亡率 (年齢調整なし) 注記
- [ ] 47都道府県平均は人口非加重 注記
- [ ] capability ≠ 公式病院機能分類 注記
- [ ] 受療率 ≠ 罹患率 注記
- [ ] 処方proxy ≠ 患者数 注記

---

## 7. mobile (375px) 表示

- [ ] Layer 2 B のリスクカード5項目が 1列折返し
- [ ] Layer 6 Bridge の risks[] 折りたたみが mobile でも動作
- [ ] 注記文の読みやすさ (font-size, line-height)

---

## 8. Vercel deploy 確認

- [ ] medical-intelligence-two.vercel.app に最新 HEAD 反映済
- [ ] /api/ndb/checkup-risk-rates HTTP 200
- [ ] /api/ndb/checkup-risk-rates-standardized HTTP 200
- [ ] 既存 API すべて HTTP 200 維持

---

## 完了条件

すべてチェック後、Phase 2 を **release fixed** とみなす。

次の Phase 候補は `PHASE2_RELEASE_NOTES.md §6` を参照。
