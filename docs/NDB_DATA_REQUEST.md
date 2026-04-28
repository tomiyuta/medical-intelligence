# NDB第10回オープンデータ 追加取得依頼 (Phase 1 完遂用)

**作成日**: 2026-04-28  
**目的**: peer review (2026-04-28 採択) Phase 1 — Bridge リスクproxyを「喫煙率一辺倒」から脱却し、各疾患領域の直接的リスク指標を追加  
**取得対象**: 8ファイル (質問票3 + 検査値5)

---

## 取得元 (公式URL)

| ページ | URL |
|---|---|
| **第10回NDBオープンデータ トップ** | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177182.html |
| **特定健診 検査値階層別分布** | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177221_00016.html |
| **特定健診 質問票** | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177221_00017.html (推定、トップから辿れる) |
| **公開元データ年次** | 令和4年度 (2022年度) 特定健診 |

---

## A. 質問票 — 3ファイル取得 (data/raw_ndb_questionnaire/ に配置)

第10回NDBオープンデータ → 「特定健診（質問票） 性年齢・都道府県別 回答分布」(22項目中の3項目)

| Q# | 内容 | Bridge領域 | 推定ファイル名/容量 |
|---|---|---|---|
| **Q2** | 現在、血糖を下げる薬又はインスリン注射を使用している | 糖尿病 (最重要) | `q2_pref.xlsx` または番号xlsx (~30KB目安) |
| **Q3** | 現在、コレステロールや中性脂肪を下げる薬を使用している | 循環器 | `q3_pref.xlsx` または番号xlsx (~30KB目安) |
| **Q4** | 医師から、脳卒中(脳出血、脳梗塞等)にかかっているといわれた、または治療を受けたことがあるか | 脳血管 | `q4_pref.xlsx` または番号xlsx (~30KB目安) |

**ヒント**: 既存の `q1_pref.xlsx` (Q1高血圧薬) と同じ命名規則で公開されている可能性が高い。番号方式の場合は連番 (Q1の前後 ≈ 780-790番台) を試す。

---

## B. 健診検査値 — 5ファイル取得 (data/raw_ndb_checkup/ 新規ディレクトリに配置)

第10回NDBオープンデータ → 「特定健診 性年齢・都道府県別 各項目の検査値階層別分布」

| 項目 | リスク閾値 | Bridge領域 | 公式ファイル名 (容量) |
|---|---|---|---|
| **BMI** | ≥25 (肥満) | 糖尿病・代謝・循環器 | `BMI 都道府県別性年齢階級別分布.xlsx` (45KB) |
| **HbA1c** | ≥6.5% | 糖尿病 (最重要) | `HbA1c 都道府県別性年齢階級別分布.xlsx` (41KB) |
| **収縮期血圧** | ≥140 mmHg | 循環器・脳血管 | `収縮期血圧 都道府県別性年齢階級別分布.xlsx` (~41KB目安) |
| **LDLコレステロール** | ≥140 mg/dL | 循環器 | `LDLコレステロール 都道府県別性年齢階級別分布.xlsx` (42KB) |
| **CGA分類 (eGFR/尿蛋白)** | 尿蛋白 1+以上 | 腎疾患 | `CGA分類 都道府県別性年齢階級別分布.xlsx` または `尿蛋白 都道府県別性年齢階級別分布.xlsx` |

**重要**: 厚労省公式は「**検査値階層別分布**」(階級分布) として公開しており、これは **リスク率算出 (例: HbA1c≥6.5% の比率)** のために必要な形式。**「平均値」ファイルではなく「階層別分布」ファイル** を取得してください。

**特殊**: 尿蛋白単独ファイルは無く、**CGA分類 (eGFR×尿蛋白 クロス集計)** として公開。これは腎疾患リスク評価としてはむしろ理想的 (CKD重症度分類)。

---

## 取得手順 (推奨)

1. 厚労省 [第10回NDBオープンデータ](https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177182.html) を開く
2. 「特定健診 性年齢・都道府県別 各項目の検査値階層別分布」セクションへ
3. 上記B5項目の Excel をダウンロード → `data/raw_ndb_checkup/` に配置
4. 「特定健診（質問票） 性年齢・都道府県別 回答分布」セクションへ
5. 上記A3項目の Excel をダウンロード → `data/raw_ndb_questionnaire/` に配置
6. ファイル配置完了後、Claude に再開を指示

---

## 取得後の Claude 側作業 (4 commits)

| Commit | 内容 |
|---|---|
| **1** | `feat: add NDB checkup bin ETL for priority metrics` — 5項目の階級分布を `data/static/ndb_checkup_bins.json` として保存 |
| **2** | `feat: derive checkup risk rates` — リスク該当者率派生 (`bmi_ge_25`, `hba1c_ge_6_5`, `sbp_ge_140`, `ldl_ge_140`, `urine_protein_ge_1plus`) を `data/static/ndb_checkup_risk_rates.json` として保存 |
| **3** | `feat: add questionnaire Q2 Q3 Q4 indicators` — 3項目を `ndb_questionnaire.json` に追加 (`diabetes_medication`, `lipid_medication`, `stroke_history`) |
| **4** | `feat: enrich disease bridge risk proxies with checkup rates` — domainMapping を risk配列化、Bridge UI を複数リスク表示対応 |

---

## やらないこと (Phase 1 範囲外)

- ❌ 全26検査項目の一括ETL (Phase 2 で必要時に追加)
- ❌ 二次医療圏別取り込み (重い、Bridge は県単位)
- ❌ 年齢標準化の即実装 (年齢階級別を保持しておけば後で標準化可能)
- ❌ 平均値だけで Bridge 反映 (中途半端、リスク率が出せない)

---

## 補助情報源 (取得困難時)

- **NDB OpenData Hub** (third-party viewer): https://ndbopendata-hub.com/ — 第10回データを viewer 表示 + ChatGPT/Claude エージェント API 提供
- **解説編 PDF** (公式): https://www.mhlw.go.jp/content/12400000/001492909.pdf
