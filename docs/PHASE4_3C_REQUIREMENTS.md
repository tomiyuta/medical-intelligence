# Phase 4-3c: 二次医療圏化 (Secondary Medical Area) 要件定義書

**作成日**: 2026-04-30
**branch**: feature/phase4-3c-secondary-area-scoping
**目的**: 県単位集約バイアスの低減を目指す Phase 4-3c の要件定義 (実装ではなく scoping)
**前提**: Phase 4-3d/e/a/f 完了 (HEAD = 5a99e84)
**reviewer 採択方針**: audit-first、UI 変更なし、段階的アプローチ
**結論サマリ**: 県集約バイアスを定量実証 (広島 4.4倍、東京 18.2pt差)。実装は 4 段階に分割し、4-3c-1 (data 整合性 audit) を先行推奨。

---

## 0. Executive Summary

| 軸 | 結論 |
|---|---|
| 集約バイアスの実証 | 広島県内 4.4 倍 (集中度)、東京都 18.2pt (高齢化差) |
| 既存 Supply side data | **3 ファイル取得済** (339/330/320 圏域) |
| 既存 Risk/Outcome data | **県単位のみ** (NDB 健診・死亡率) |
| **真の制約** | NDB 公開仕様により Risk/Outcome は二次医療圏単位を取得不可 |
| 推奨アプローチ | 4 段階分割、4-3c-1 (data 整合性 audit) を先行 |
| 完全実装の総工数見積 | 60-90 時間 (大工数、reviewer 評価通り「後回し推奨」と整合) |

---

## 1. 背景: 県集約バイアスの定量実証

### 1.1 二次医療圏 standard

医療法第 30 条の 4 に基づき、**都道府県が二次医療圏を設定**:
- **一次医療圏**: 市区町村単位 (日常医療)
- **二次医療圏**: 一般病床・療養病床整備の単位 (本フェーズの対象)
- **三次医療圏**: 都道府県単位 (高度・特殊医療、北海道のみ 6 区域)

医療計画 (6年単位):
- 第 7 次 (2018-2023): 全国 335 圏域 (推定)
- **第 8 次 (2024-2029)**: 圏域統合により減少傾向 (推定 320-330)、地域医療構想区域と概ね一致
- → **最新数は厚労省「医療計画」を要確認** (training cutoff 2026-01 時点)

### 1.2 集約バイアスの実証 (本 audit で確認)

47 都道府県を二次医療圏で内訳した結果:

#### 集中度バイアス (1 施設あたり患者数の県内倍率)

| 県 | 圏域数 | min | median | max | **倍率** |
|---|---|---|---|---|---|
| **沖縄県** | 5 | 148.5 | 501.8 | 833.3 | **5.6 倍** |
| **広島県** | 7 | 134.4 | 326.4 | 588.7 | **4.4 倍** |
| 東京都 | 13 | 295.1 | 564.8 | 875.6 | 3.0 倍 |
| 宮崎県 | 7 | 231.4 | 441.8 | 666.1 | 2.9 倍 |
| 秋田県 | 8 | 306.7 | 458.7 | 816.0 | 2.7 倍 |
| 山口県 | 8 | 227.0 | 378.0 | 522.5 | 2.3 倍 |
| 岡山県 | 5 | 401.0 | 617.7 | 762.8 | 1.9 倍 |
| 神奈川県 | 9 | 425.5 | 558.2 | 754.4 | 1.8 倍 |

→ **県内格差は最大 5.6 倍**。Phase 4-3e で「広島は最分散型」と判断したが、県内で 4.4 倍の格差。

#### 高齢化バイアス (圏域間 75歳以上人口比率の差)

| 県 | min aging | max aging | **差 (pt)** |
|---|---|---|---|
| **東京都** | 17.7% | 35.9% | **18.2pt** (区部 vs 島嶼) |
| 山口県 | 30.8% | 45.7% | 15.0pt |
| 岡山県 | 30.0% | 43.7% | 13.7pt |
| 広島県 | 27.4% | 40.0% | 12.6pt |
| 沖縄県 | 22.8% | 28.7% | 5.9pt |

→ **東京都の高齢化は 18.2pt の県内差**。県平均は若年層 (区部) と過疎島嶼 (青ヶ島・小笠原) を混合している。

### 1.3 広島県内詳細 (focus 例)

| 圏域 | 施設数 | 患者数 | 集中度 |
|---|---|---|---|
| 福山・府中 | 37 | 21,781 | 588.7 |
| 尾三 | 20 | 9,554 | 477.7 |
| 広島 | 79 | 33,693 | 426.5 |
| 広島中央 | 16 | 5,223 | 326.4 |
| 呉 | 23 | 6,998 | 304.3 |
| 備北 | 8 | 1,376 | 172.0 |
| **広島西** | **12** | **1,613** | **134.4** |

→ Phase 4-3e で「広島は最分散型 (18.4 patients/facility)」と判断したが、これは **kijun_shards 由来の「cap.homecare > 0 の全施設」基準** (4,359 施設)。area_emergency_homecare 由来の「在宅医療実施施設」基準 (195 施設) では集中度 134-588 の範囲。

→ **重要な caveat**: data source 間で施設数定義が大きく異なる。要件定義に統一必要。

---

## 2. 必要な情報 (Data Inventory)

### 2.1 既存データ (Supply side、3 ファイル取得済)

| ファイル | 圏域数 | 主要フィールド | 用途 |
|---|---|---|---|
| `area_emergency_homecare.json` | **339** | hospitals, emerg, homecare, homecare_patients, acute_support | 在宅医療実績 (Phase 4-3d で使用) |
| `medical_areas_national.json` | **330** | pref_code, hosp, wards, beds | 病床・病棟 (一般病床) |
| `area_demographics.json` | **320** | munis (市区町村), pop, p65, aging | 人口・高齢化率 |

→ **圏域数の不一致**: 339 / 330 / 320。8 県で差分 (秋田 8/3、三重 8/4、神奈川 9/5 など)
→ **第 8 次医療計画 (2024-) で圏域統合された県** が原因と推定

### 2.2 不足データ (Risk/Outcome side)

| 領域 | 既存 | 二次医療圏単位の取得可能性 |
|---|---|---|
| **NDB 健診** (BMI/HbA1c/SBP/LDL 等 19 項目) | 県単位のみ | ❌ NDB OpenData は県単位までの公開、二次医療圏単位は研究者向け申請制 |
| **NDB 受療率** (薬剤・診療) | 県単位のみ | ❌ 同上 |
| **年齢調整死亡率** (人口動態統計) | 県単位 (2020) | △ e-Stat で市区町村別が部分公開、二次医療圏単位は集計必要 |
| **特定健診質問票** (14 項目) | 県単位 | ❌ NDB OpenData は県単位 |
| **介護給付実績** | 県単位 | △ 保険者単位 (市区町村) で公開、二次医療圏に集計可能 |

→ **核心制約**: Risk/Outcome side のうち NDB 由来データは二次医療圏単位での取得不可。
→ 取得可能: 死亡率・介護給付実績 (市区町村集計から)、人口・病床・施設 (取得済)

### 2.3 データ source の整合性課題

本 audit で発見:

| 課題 | 詳細 |
|---|---|
| 圏域数の差 (339/330/320) | 第8次医療計画の改定タイミング違い |
| 施設数定義の差 | kijun_shards 4,359 vs area_emergency_homecare 195 (広島県) |
| 圏域名の表記揺れ | 「広島中央」vs「広島県中央」など要確認 |
| 市区町村→圏域 mapping | area_demographics の munis フィールドで部分提供、最新版要確認 |

---

## 3. 取得方法 (Data Acquisition)

### 3.1 主要公式情報源

| 情報源 | URL ドメイン | 用途 |
|---|---|---|
| 厚生労働省 医療計画 | https://www.mhlw.go.jp/ | 第 8 次計画 (二次医療圏定義) |
| 厚生労働省 医療計画作成支援データブック | (有料、都道府県向け) | 圏域別の各種指標 |
| e-Stat (政府統計) | https://www.e-stat.go.jp/ | 人口・住民基本台帳・人口動態 (市区町村別) |
| 地域医療構想システム | (一般非公開、都道府県向け) | 圏域別病床機能 |
| 地域医療情報システム JMAP | https://jmap.jp/ | 二次医療圏別の医療資源・人口推計 (日医総研) |
| 地域包括ケア「見える化」システム | https://mieruka.mhlw.go.jp/ | 介護給付実績・市区町村別 |
| RESAS | https://resas.go.jp/ | 経産省・内閣府、地域経済・人口分析 |
| 厚生労働省 NDB OpenData | https://www.mhlw.go.jp/ | NDB (現状: 県単位、二次医療圏は研究者向け) |

⚠ **訓練データの cutoff 2026-01 時点での記載**。最新の URL・公開状況は要確認。

### 3.2 取得可能データの整理

| 取得元 | データ | 圏域単位 | 取得難易度 |
|---|---|---|---|
| e-Stat | 人口動態 (出生・死亡) 市区町村別 | △ (集計必要) | 中 (CSV) |
| e-Stat | 住民基本台帳 市区町村別 | △ | 中 |
| 国立社会保障・人口問題研究所 | 将来推計人口 (二次医療圏別) | ○ | 中 |
| JMAP | 圏域別医療資源・人口推計 | ○ | 中 (Web スクレイピング) |
| 介護「見える化」 | 介護給付実績 市区町村別 | △ | 中 |

---

## 4. 実装の工程 (4 段階分割)

reviewer 採択方針 (audit-first、段階的) に従い、4 段階で分割。

### Phase 4-3c-1: Data 整合性 Audit (推奨先行、低工数)

**工数**: 6-8 時間
**成果物**: `docs/PHASE4_3C_1_DATA_INTEGRITY_AUDIT.md`、`tests/area_data_integrity.test.js`

タスク:
- 339 / 330 / 320 圏域の差分検証
- 第 8 次医療計画 (2024-) との整合確認
- 圏域名の表記揺れチェック
- 施設数定義の統一 (kijun_shards vs area_emergency_homecare)
- 市区町村→圏域 mapping の検証

**ROI**: 高 (後続フェーズの基礎)、リスク低

### Phase 4-3c-2: 二次医療圏単位 ETL 拡張 (中工数)

**工数**: 20-30 時間
**成果物**: `data/static/regional_metrics_by_area.json`、ETL scripts

タスク:
- area-level の core metrics を統合
  - capability (cap.homecare 等) を圏域単位に再集計
  - actual (homecare_patients) を圏域単位に整理
  - 集中度 (1 施設あたり患者数) を恒久 metric 化
  - 高齢化率 (75+ 比率) を圏域単位
- 死亡率は市区町村別から圏域別に集計
- Risk side は **県値で fallback** + caveat 明記

**ROI**: 中 (集約バイアス低減の基礎)、リスク中 (data 整合性に依存)

### Phase 4-3c-3: detectArchetypes 圏域対応 (中工数)

**工数**: 10-15 時間
**成果物**: `lib/regionalMismatchLogic.js` 拡張、test

タスク:
- 圏域 vs 県の 2 階層判定
  - 県レベル: 既存 47 県判定を維持
  - 圏域レベル: 新規追加 (オプション機能)
- 集約バイアス caveat の自動生成
  - 県内倍率が 2x 以上なら「県内格差大」flag
- Pattern 1/3/5/6 の圏域単位判定 (Risk side は県値 fallback)

**ROI**: 中、リスク中 (P1-4 baseline との整合維持要)

### Phase 4-3c-4: UI 改造 (大工数)

**工数**: 20-30 時間
**成果物**: UI components 拡張

タスク:
- 県 → 圏域選択の 2 段階セレクター
- 県内圏域比較 view (ボックスプロット等)
- 集約バイアス警告の表示
- 既存 47 県 view との切替

**ROI**: 中、リスク高 (UI 複雑化、P4-1 guardrail 抵触リスク)

---

## 5. 得られる効果 (Pattern 別)

### 5.1 Pattern 3 (Supply-Outcome Mismatch) の精度向上

reviewer 採択 P3 再定義:
> Reported capability high × actual usage mid × Outcome poor

二次医療圏化で:
- 山口県 P3 → 山口県 8 圏域に分解 (集中度 227-522)
- 県内で「高 capability・中 actual」の構造を持つ圏域を特定可能
- 集約バイアスを取り除いた P3 判定精度向上

### 5.2 Pattern 5 (Aging-Outcome Burden) の精度向上

- 東京都の 18.2pt 高齢化差 → 区部 (若年) は P6、島嶼・多摩 (高齢) は P5 候補
- 県平均 P6 判定では多摩・島嶼の P5 信号が埋没
- 圏域化で都市部 P6 と過疎部 P5 を分離可能

### 5.3 Pattern 1 (Risk-Care Gap) は限定的改善

- Risk side (NDB 健診) が県単位のみ → 圏域単位の Risk-Care Gap は実装困難
- ただし「県平均では P1 だが圏域内で偏在」の構造を caveat 表示可能

### 5.4 Phase 4-3e の発見の恒久化

- 集中度 (1 施設あたり患者数) を 339 圏域で正式 metric 化
- 県平均 (Phase 4-3e で記録済) と圏域内分布を併記

---

## 6. リスクと制約

| リスク | 影響 | 対策 |
|---|---|---|
| **NDB Risk side が県単位のみ** | 圏域単位 P1 判定不可 | 県値 fallback + caveat 明示 |
| 圏域単位サンプル小 | 統計安定性低下 | 95% CI + 圏域 n を必ず併記 |
| 第 8 次医療計画の最新確認必要 | data 古い可能性 | Phase 4-3c-1 で必ず確認 |
| UI 複雑化 | 誤読リスク増 | Phase 4-3c-4 は最後、guardrail 強化 |
| 「圏域 = ランキング」誤読 | sample 小で順位は不安定 | percentile 表示禁止、distribution のみ |
| 圏域名表記揺れ | data 整合性破壊 | Phase 4-3c-1 で master 整備 |

---

## 7. 工数見積

| Phase | 工数 (h) | ROI | リスク | 推奨 |
|---|---|---|---|---|
| 4-3c-1 Data 整合性 audit | 6-8 | **高** | 低 | ✅ **先行推奨** |
| 4-3c-2 ETL 拡張 | 20-30 | 中 | 中 | 4-3c-1 完了後判断 |
| 4-3c-3 detectArchetypes | 10-15 | 中 | 中 | 4-3c-2 完了後判断 |
| 4-3c-4 UI 改造 | 20-30 | 中 | **高** | 4-3c-3 完了後、または永久保留 |
| **合計 (完全実装)** | **60-90** | - | - | - |

→ Phase 4-3c-1 は **8 時間以内の audit** として独立実施可能。
→ 完全実装 (60-90h) は他フェーズより大きく、reviewer 評価「後回し」と整合。

---

## 8. Done 条件案 (Phase 4-3c-1 のみ、先行実施推奨)

```markdown
[ ] 339 / 330 / 320 圏域の差分を県別に整理
[ ] 第 8 次医療計画 (2024-) の最新圏域数を確認
[ ] 8 県の圏域統合状況を文書化 (秋田 8→3 等)
[ ] 圏域名表記揺れの master 化 (canonical name)
[ ] 施設数定義の統一 (kijun_shards vs area_emergency_homecare)
[ ] 市区町村→圏域 mapping の検証 (320 圏域 area_demographics)
[ ] 不一致箇所のリスト化
[ ] UI / Pattern 判定変更なし
[ ] npm test PASS
```

---

## 9. 推奨次アクション

reviewer の Phase 4-3 interim review pack 提案 (Phase 4-3f レビュー判定) と整合する形で:

| 候補 | 推奨度 | 理由 |
|---|---|---|
| **Phase 4-3 interim review pack** | 高 | reviewer 推奨、4-3d/e/a/f の中間整理 |
| **Phase 4-3c-1 のみ実施** | 中 | 8h 工数、後続フェーズの基礎 |
| Phase 4-3c-2 以降の実装 | 低 | 60-90h 大工数、interim review 後判断 |
| 他候補 (P3/P5 support, 4-3b, 未取得 ETL) | 中 | reviewer 提示済 |

---

## 10. 関連 docs

- `docs/PHASE4_3D_HOMECARE_ACTUAL_AUDIT.md` (在宅実績 audit、Phase 4-3d)
- `docs/PHASE4_3E_CAPABILITY_MAPPING_AUDIT.md` (capability mapping、Phase 4-3e)
- `docs/PHASE4_3A_NDB_26_RISK_PROXY_AUDIT.md` (NDB risk proxy、Phase 4-3a)
- `docs/PHASE4_3F_RISK_SUPPORT_EVIDENCE.md` (support evidence、Phase 4-3f)
- `docs/PHASE3_2_NORMALIZATION_AUDIT.md` (Phase 3 で言及されていた二次医療圏課題)
- `docs/PHASE_2E_2_TOHOKU_HOMECARE.md` / `docs/PHASE_2E_3_WESTERN_JAPAN_HOMECARE.md` (Phase 2E で言及されていた偏在問題)
- `data/static/area_emergency_homecare.json` (339 圏域)
- `data/static/medical_areas_national.json` (330 圏域)
- `data/static/area_demographics.json` (320 圏域)

---

## 11. 注記

本 docs は **要件定義書** (実装前の scoping) です。実際の実装は Phase 4-3c-1 から段階的に開始することを推奨します。

訓練データの cutoff (2026-01) 時点の記述を含むため、最新の医療計画情報・data source URL は実装前に必ず確認してください。

