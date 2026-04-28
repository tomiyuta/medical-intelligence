# Phase 3-1: 都道府県別年齢調整死亡率 データソース audit

**作成日**: 2026-04-29  
**ステータス**: ✅ audit 完了 (ETL実装可、user判断待ち)  
**audit script**: 本docsの調査記録 (raw download `data/raw_age_adjusted_mortality/r2_age_adjusted_mortality.xlsx`)

---

## 0. 結論

> 厚労省「**令和5年度人口動態統計特殊報告 令和2年都道府県別年齢調整死亡率の概況**」が **xlsx 形式で公開済**。  
> 6死因 (悪性新生物/心疾患/脳血管/糖尿病/腎不全/肺炎) **すべて取得可能**。  
> ただし対象年は **2020年 (令和2年)**、5年ごとの公表で **NDB/患者調査と年次が一致しない**。  
> 既存 `vital_stats_pref.json` (2024年確定数粗死亡率) との **直接比較は不可**、**併記表示** が現実的。  
>
> ETL実装は技術的に可能。**user 判断後に Phase 3-1 ETL に着手** する。

---

## 1. データソース

### 1.1 主要ソース: 厚労省 人口動態統計特殊報告

| 項目 | 詳細 |
|---|---|
| 名称 | 令和5年度人口動態統計特殊報告 令和2年都道府県別年齢調整死亡率の概況 |
| 公表年 | 2024年 (令和5年度) |
| 対象年 | **令和2年 (2020年)** |
| 公表頻度 | **5年ごと** (前回: 平成27年 (2015年) - 平成29年度公表) |
| 形式 | **xlsx 4.8MB** (37シート) + PDF |
| URL (index) | https://www.mhlw.go.jp/toukei/saikin/hw/jinkou/other/20sibou/index.html |
| URL (data) | https://www.mhlw.go.jp/toukei/saikin/hw/jinkou/other/20sibou/xls/13.xlsx |
| 基準人口 | 平成27年 (2015年) モデル人口 |

### 1.2 対象死因 (取得可能)

| シート | 死因 | Bridge 領域 | 取得可否 |
|---|---|---|---|
| 参考2(1) | 全死因/悪性新生物/胃/大腸/肺がん | がん | ✅ 男女別年齢調整死亡率 |
| 参考2(1) | 悪性新生物 | がん | ✅ |
| **参考2(2)** | **心疾患** | **循環器** | ✅ |
| 参考2(2) | 急性心筋梗塞 | 循環器 (詳細) | ✅ |
| **参考2(2)** | **脳血管疾患** | **脳血管** | ✅ |
| 参考2(2) | 脳梗塞 | 脳血管 (詳細) | ✅ |
| **参考2(2)** | **肺炎** | **呼吸器** | ✅ |
| 参考2(3) | 肝疾患 | (Bridge未対応) | ✅ |
| **参考2(3)** | **腎不全** | **腎疾患** | ✅ |
| 参考2(3) | 老衰/不慮事故/自殺 | (Bridge未対応) | ✅ |
| **図11 (タイトルのみ)** | **糖尿病** | **糖尿病** | **⚠️ 統計表からのデータ抽出が必要** |

**重要警告**: 糖尿病は「図11」シートにタイトルのみで実数が無く、別途 e-Stat の DB API またはより詳細な統計表から取得が必要。

### 1.3 補完ソース: e-Stat DB API

| URL | https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&iroha=17&cycle=7&toukei=00450013&tstat=000001226087 |
|---|---|
| 形式 | API (JSON) + ファイル (xlsx) |
| 粒度 | 死因別・年齢階級別・性別 |
| 利点 | 糖尿病など細分類が取れる可能性 |

### 1.4 補完ソース: 国立がん研究センター (がん専用)

| URL | https://ganjoho.jp/reg_stat/statistics/stat/age-adjusted.html |
|---|---|
| 内容 | 75歳未満年齢調整死亡率 (がん部位別) |
| 利点 | がん詳細部位 (胃/大腸/肺/乳房等) と長期推移 |

---

## 2. 既存データとの結合可能性

### 2.1 結合キー

| 項目 | 既存 (vital_stats_pref.json) | 新規 (年齢調整死亡率) |
|---|---|---|
| 都道府県名 | 47県 (例: 沖縄県) | 47県 (例: 沖縄県) ✅ 結合可能 |
| 死因 | 心疾患/がん/脳血管/糖尿病/肺炎/腎不全 | 同等 ✅ 結合可能 |
| 性別 | 集計済 (男女別なし) | **男女別あり** ⚠️ 集計補正必要 |
| 年次 | **2024年** | **2020年** ❌ 4年差 |
| 指標 | 粗死亡率 (人口10万対) | 年齢調整死亡率 (人口10万対、平成27年モデル人口基準) |

### 2.2 含意 (重要)

- **時点が違う**: 既存は2024年、新規は2020年。「2024年の粗死亡率と2020年の年齢調整死亡率を直接比較すると、4年間の改善/悪化を年齢補正と混同するリスク**」
- **対策**: UI上で **2020年粗死亡率と2020年年齢調整死亡率を併記** が望ましい。2024年データは別軸。
- **2020年粗死亡率も同 xlsx に格納されている** (参考1) ため、両者を併用可能。

---

## 3. ETL 実装案 (推奨スコープ)

### 3.1 Commit 1: 取得済み Excel から ETL

```
scripts/etl_age_adjusted_mortality.py:
  - input:  data/raw_age_adjusted_mortality/r2_age_adjusted_mortality.xlsx
  - シート: 参考1(粗死亡率) + 参考2(年齢調整死亡率)
  - 構造: pref × cause × sex の階層化
  - 抽出死因 (Bridge直結6つ + 全死因):
    - 全死因
    - 悪性新生物 (がん)
    - 心疾患 (循環器)
    - 脳血管疾患 (脳血管)
    - 肺炎 (呼吸器)
    - 腎不全 (腎疾患)
    - 糖尿病 (糖尿病) — e-Stat DB API 経由で別途取得
  - output: data/static/mortality_age_adjusted_r2.json
```

### 3.2 Commit 2: 糖尿病補完 (e-Stat DB API)

```
scripts/etl_diabetes_mortality_estat.py:
  - 糖尿病の年齢調整死亡率を e-Stat DB API から取得
  - 既存 mortality_age_adjusted_r2.json にマージ
```

### 3.3 Commit 3: UI反映 (Bridge / GAP_FINDER / 死因ビュー)

> **peer review 指示**: 最初から UI に入れない。docs 固定 → 実装可否判断 → 別 commit

UI反映方針 (将来):
- Bridge Layer 6 の OUTCOME 列に年齢調整死亡率を併記 (粗死亡率と並列)
- GAP_FINDER の死亡率も年齢調整版を選択可能に
- 「2020年 年齢調整死亡率 (vs 2020年粗死亡率)」表記で時点を明示

---

## 4. 既知の制約 (UI実装時に明記必要)

### 4.1 時点ズレ
- 既存粗死亡率: **2024年確定数**
- 新規年齢調整死亡率: **2020年** (5年ごと公表のため2025年版は早くて2027年頃)
- **4年間の改善/悪化を年齢補正と混同しないこと**

### 4.2 男女集計
- 厚労省データは **男女別**
- Bridge の vital_stats は **集計済 (男女合算)**
- 集計時は男女合算が必要 (人口加重平均を推奨、ただしセル内集計済の数字を使う方法もあり)

### 4.3 基準人口
- **平成27年 (2015年) モデル人口** が基準
- 国際比較や他国データとの混同に注意 (WHO世界標準人口とは別)

### 4.4 5年ごとの低頻度
- 次回公表は **令和7年 (2025年) 都道府県別年齢調整死亡率**、おそらく **令和9年 (2027年) 頃**
- リアルタイム性は粗死亡率に比べて劣る

### 4.5 糖尿病の取得粒度
- 主シートには糖尿病の年齢調整死亡率が **集約データのみ** (詳細は別シート/DB API要)
- 6死因のうち糖尿病だけ別経路の取得が必要

---

## 5. peer review 遵守事項 (再掲)

UI実装時に必須:

> ❌ 「年齢調整後の死亡率が低い = 医療の質が高い」と断定しない  
> ❌ 「年齢調整死亡率 = 真の死亡水準」と表現しない  
> ✅ 「粗死亡率と年齢調整死亡率の比較で、年齢構成の影響を識別」と表現  
> ✅ Bridge は仮説生成装置、政策判断ツールではない

---

## 6. 判定: ETL 実装可否

### ✅ 実装可能 (技術的に)

| 観点 | 判定 |
|---|---|
| データ取得 | ✅ xlsx ダウンロード済 (4.8MB) |
| シート構造 | ✅ 参考1/参考2 で死因 × 県 × 男女 を完全保持 |
| 47県カバレッジ | ✅ 47県完全 (Bridge前提と整合) |
| 6死因対応 | ✅ 5死因は xlsx 内、糖尿病のみ補完取得が必要 |
| 既存データとの結合 | ✅ 都道府県・死因キーで結合可能 |
| Bridge前提 (47県完全) | ✅ 整合的 |

### ⚠️ 注意事項 (user 判断必要)

| 観点 | 判定 |
|---|---|
| 時点ズレ (2020 vs 2024) | ⚠️ UIで明示要 |
| 糖尿病の補完取得 | ⚠️ e-Stat DB API での別ETL要 |
| 既存粗死亡率の置換 vs 併記 | **併記推奨** (時点ズレを誤読させないため) |

---

## 7. 推奨次ステップ (user 判断要)

### Option A: フル実装 (3 commits)
1. 既存xlsxから 6死因 ETL (糖尿病以外)
2. e-Stat DB API で糖尿病補完
3. UI反映 (Bridge / GAP_FINDER に年齢調整版併記)

### Option B: 部分実装 (1 commit)
1. 既存xlsxから 5死因 ETL のみ (糖尿病は v2 に保留)
2. UI反映は次回判断

### **Option C 推奨**: docs固定のみ (Phase 2 release fixed と整合)
- 本audit結果を固定 (`d597192` 直後の commit)
- ETL実装は user 判断後の次フェーズ
- 既存 Phase 2 release の安定性を維持

---

## 8. データソース URL 一覧

| データ | URL |
|---|---|
| 厚労省 令和2年 概況 (HTML) | https://www.mhlw.go.jp/toukei/saikin/hw/jinkou/other/20sibou/index.html |
| 厚労省 令和2年 図表データ (xlsx) | https://www.mhlw.go.jp/toukei/saikin/hw/jinkou/other/20sibou/xls/13.xlsx |
| 厚労省 平成27年 (前回) | https://www.mhlw.go.jp/toukei/saikin/hw/jinkou/other/15sibou/index.html |
| 厚労省 都道府県別ランディング | https://www.mhlw.go.jp/toukei/list/nenchou.html |
| e-Stat 人口動態統計特殊報告 | https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&iroha=17&cycle=7&toukei=00450013&tstat=000001226087 |
| 国立がんセンター (がん部位別) | https://ganjoho.jp/reg_stat/statistics/stat/age-adjusted.html |

---

## 9. 関連ドキュメント

- `docs/PHASE2_RELEASE_NOTES.md` §6 — Phase 3 候補リスト (本audit対応)
- `docs/BRIDGE_V1_INTERPRETATION.md` — Bridge Risk Model v1
- `data/static/vital_stats_pref.json` — 既存粗死亡率 (2024年)
