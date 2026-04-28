> ⚠️ **SUPERSEDED 2026-04-28**: 本仕様書はレビュー時点(3ビュー構成: 病院機能/施設基準/施設マップ)を記述しています。
> peer reviewのフィードバックを受けて **2ビュー構成 (地域医療構想・病床機能 / 施設エクスプローラ)** に再構成済み (commit 後続)。
> 新構成の仕様は別途 `SPEC_医療インフラ_v2.md` (作成予定) を参照。本ファイルは歴史的参照として保存。
>
> **新構成の概要**:
> - ⑤ 地域医療構想・病床機能 (RegionalBedFunctionView): 旧ScoringView Layer A + KPI5指標 + 地域類型5分類
> - ⑥ 施設エクスプローラ (FacilityExplorerView): 旧KijunView + ScoringView Layer C + GeoMap iframe を3タブ統合 (届出/DPC/スコア説明)

---

# 仕様書: 医療インフラ セクション (病院機能 / 施設基準 / 施設マップ) [SUPERSEDED]

**作成日**: 2026-04-28
**対象 commit**: `becd939` (HEAD)
**対象ビュー**: ⑤病院機能 (ScoringView v2) / ⑥施設基準 (KijunView) / ⑦施設マップ (GeoMapView)
**目的**: peer review (ChatGPT等による独立検証)
**スコープ外**: ①〜④ (社会構造・疾患診療セクション)

---

## 0. 全体構成と共通設計

### 0.1 セクション位置づけ

3層ナビ「医療インフラ」の3ビュー。**供給側 (provider supply)** の現状把握を担う。

| # | ビュー | コア質問 | 主データ |
|---|---|---|---|
| ⑤ | 病院機能 | 「地域の医療提供体制はどう配分されているか」 | R6病床機能報告 + Tier集計 + 高機能施設実績 |
| ⑥ | 施設基準 | 「どこに何ができる施設があるか」 | 全国8厚生局 届出受理名簿 |
| ⑦ | 施設マップ | 「高機能施設は地理的にどう分布しているか」 | facilities_geo (Tier S/A の lat/lng) |

需要側 (P6 患者調査受療率) は④NdbView Layer 2.5 にあり、本セクションでは扱わない。両者の接続(供給-需要マッピング)はPhase 2課題として明記。

### 0.2 globalPref連動 (047a28f由来の整合性原則)

| ビュー | 連動 | 経路 |
|---|---|---|
| ScoringView v2 | ✅ (今回回復) | `scoringPref={globalPref}` / `setScoringPref={setGlobalPref}` |
| KijunView | ✅ | `kijunPref={globalPref}` / `setKijunPref={setGlobalPref}` |
| GeoMapView | ✅ | `mapPref={globalPref}` / `setMapPref={setGlobalPref}` |

すべて `app/page.js` で globalPref state を共有。同一県を選んだ状態で3ビュー間を移動しても選択保持。

### 0.3 データ意味バッジ (NdbView パターンに統一)

| バッジ | 意味 | 該当箇所 |
|---|---|---|
| 機能配分・現況 | 自己申告ベースの構造データ (R6 col15) | ScoringView Layer A |
| 規模スコア | 規模・症例実績の総合評価 | ScoringView Layer B |
| 施設実績 | 施設レベルのDPC/G-MIS実績 | ScoringView Layer C |
| 届出ベース | 厚生局届出受理 = 法定基準達成 | KijunView (暗黙) |
| 地理座標 | lat/lng 確定 = 高信頼 | GeoMapView (暗黙) |

---

## 1. ⑤ 病院機能 (ScoringView v2)

### 1.1 目的

地域 (都道府県 or 全国) の医療提供体制を **3レイヤー** で俯瞰する。①機能配分(R6)、②規模分布(Tier)、③高機能施設実績(Tier S)。

地域医療構想の評価指標 (高度急性期/急性期/回復期/慢性期のシェア) を**地域医療政策の文脈**で読めるようにすることを主眼とする。priority_score の単一指標化(旧版)を脱却。

### 1.2 データソース

| Layer | データ | ファイル | 出典 | 公表日 | 件数 |
|---|---|---|---|---|---|
| A | 機能区分 | `data/static/bed_function_by_pref.json` | 厚労省 R6病床機能報告 様式1 col15 (2024/7/1時点) | 2025-09-30 | 47都道府県+全国 × 6機能区分 |
| B | Tier集計 | `data/static/tiers.json` | DPC/G-MIS 由来 priority_score | 2026 (内製) | 5 tier (S/A/B/C/D) |
| C | 施設一覧 | `data/static/top_facilities.json` (`data` key) | 厚労省 DPC公開データ + G-MIS | 2026 (内製) | 全2,802施設 (S=22 / A=280 / B=2,500) |

API:

- `GET /api/bed-function` → Layer A 全体JSON
- `GET /api/tiers` → Layer B JSON
- `GET /api/facilities?tier=S&limit=25` → Layer C 用 Tier S のみ最大25件

ETL: `scripts/etl_bed_function_r6_func.py` (R6 col15 を `pref_code × function_class` で集計)

### 1.3 データスキーマ

#### Layer A: bed_function_by_pref.json

```
{
  "source": "厚労省 令和6年度病床機能報告 (2024年7月1日時点)",
  "published": "2025-09-30",
  "categories": ["高度急性期","急性期","回復期","慢性期","休棟(再開)","休棟(廃止)"],
  "national": { "高度急性期": {"wards": 5717, "beds": 157575}, ..., "総床数": 1151401 },
  "prefectures": { "東京都": { "高度急性期": {...}, ..., "総床数": 104156 }, ... }
}
```

正規化マップ (ETL内):

- `'高度急性期' / '急性期' / '回復期' / '慢性期'` → そのまま
- `'休棟中（今後再開する予定）'` → `'休棟(再開)'`
- `'休棟中（今後廃止する予定）'` → `'休棟(廃止)'`
- 上記以外 → 集計対象外 (ログ出力)

検証: 全国総床数 1,151,401 が P5 ETL (`scripts/etl_bed_function_r6.py`) と完全一致 → 整合性OK。

#### Layer B: tiers.json (5要素のlist)

```
[ {"tier":"S","count":22,"avg_score":62.5,"min_score":60.1,"max_score":68.5,"avg_beds":1032.0,"avg_cases":21988.0}, ... ]
```

#### Layer C: top_facilities.json `data` key (2802要素)

| field | type | 例 | 備考 |
|---|---|---|---|
| facility_code_10 | string | "234800166" | 10桁医療機関コード |
| facility_name | string | "藤田医科大学病院" | |
| prefecture_name | string | "愛知県" | |
| priority_score | number | 68.5 | 9因子総合スコア |
| rank | number | 1 | 全国順位 |
| tier | "S"/"A"/"B"/"C"/"D" | "S" | priority_score閾値 |
| total_beds | number | 1376 | 許可病床 |
| annual_cases | number | 25651 | DPC年間症例 |
| avg_los | number | 13.5 | 平均在院日数 |
| dpc_type | string | "平成15年度DPC参加病院" | |
| is_dpc_participant | 0/1 | 1.0 | |
| case_growth_pct | number | 2.9 | 症例成長率 |
| address | string | "豊明市沓掛町..." | |
| confidence | "High"/"Medium"/"Low" | "High" | データ充足度 |
| reasons | string[] | ["1000床超","症例2万超","DPC参加","成長+2.9%"] | 表示用ラベル |
| missing | string[] | [] | 欠損項目 |
| cap | object | {oncology:25, surgery:34, ...} | capability scores (10種) |

> **9因子の内訳**: 仕様書外 (内製)。ScoringView UIには `priority_score` の合計値のみ表示。`reasons` 配列が代替的に内訳ヒントを提供。

### 1.4 UI仕様 (render順)

1. **Header** (`ScoringView.jsx:62-66`)
   - "Hospital Function Profile" + "病院機能プロファイル"
   - 説明: 「機能配分（R6病床機能報告）・規模分布（Tier）・高機能施設実績の3レイヤーで医療提供体制を俯瞰」
2. **都道府県selector** (line 69-76)
   - 「全国」 + 47都道府県 (`bedFunc.prefectures`のキー由来)
   - 全国時のみ `bfNat` の総床数を併記
3. **Layer A: 機能区分構成** (line 79-129)
   - 100% stacked bar (4 active funcs, FUNC_COLORS固定)
   - 4 funcボックス: シェア%, 床数, 全国Δpt
   - 解釈ヒント (条件発火, 後述1.5)
4. **Layer B: 規模分布 (Tier集計, 全国)** (line 131-150)
   - Tier S/A/B/C/D の5カード (count, avg_score)
   - **常に全国データ** (都道府県絞りはLayer Bには適用しない — 後述1.6 既知限界)
5. **Layer C: 高機能施設一覧 (Tier S)** (line 152-260)
   - 疾病フィルタ (4種, 後述1.5)
   - 検索input + 検索ボタン (NDB-style facility name search)
   - CSV / PDF エクスポート
   - 検索結果サブパネル (searchResults非null時)
   - 施設テーブル (mob時は3列, desktop時は8列)
   - 注記: 「全国上位25施設のキャッシュを表示。都道府県を絞ると該当0件のことがある」

### 1.5 ロジック・閾値

#### Layer A 解釈ヒント発火条件 (`ScoringView.jsx:108-119`)

```
prefShares['高度急性期'] - natShares['高度急性期'] > 2pt
  → "大都市型・高機能集中傾向"
prefShares['慢性期'] - natShares['慢性期'] > 5pt
  → "高齢化・長期療養需要の大きい構造"
prefShares['急性期'] > 50%
  → "急性期偏重・回復期不足の地域医療構想課題地域の可能性"
```

優先順位: 高度急性期 > 慢性期 > 急性期 (最初の発火で1メッセージのみ表示)

**閾値設定の根拠**: 経験則 (47県の標準偏差を上回るレンジ)。z-score化は未実装(Phase 2課題)。

#### Layer C 疾病フィルタ (`DISEASE_FILTERS`, line 14-19)

| id | label | 条件 |
|---|---|---|
| all | 全施設 | 無条件 |
| cancer | がん関連 | `f.cap.oncology > 0` |
| heart | 循環器 | `f.cap.acute > 0` AND `f.cap.surgery > 0` |
| stroke | 脳血管 | `f.cap.acute > 0` AND `f.cap.rehab > 0` |

`activeFilter.caps.every(c => (f.cap[c]||0) > 0)` (全条件AND)

> **限界**: capability の `oncology`等の中身は施設基準カウント (届出件数の積み上げ)。「がん診療連携拠点病院」など指定病院ステータスとは異なる。

#### CSV export logic (line 192-208)

reasons自動生成:

- `total_beds >= 1000` → '1000床超大規模' / `>= 500` → '500床超中規模'
- `annual_cases >= 20000` → '症例2万超' / `>= 10000` → '症例1万超'
- `is_dpc_participant` → 'DPC参加病院'
- `case_growth_pct > 0` → `症例増加+${...}%`
- `avg_los && < 12` → '短期在院(効率的)'

confidence (line 207):

```
coverage = [total_beds, annual_cases, avg_los, is_dpc_participant, case_growth_pct].filter(notZero).count
conf = coverage>=4 ? 'High' : coverage>=2 ? 'Medium' : 'Low'
```

### 1.6 既知の限界・peer review観点

| # | 項目 | 詳細 | 影響度 |
|---|---|---|---|
| L1 | **Layer B が都道府県非対応** | tiers.json は全国集計のみ。pref別Tier分布は別エンドポイントが必要 | 中 |
| L2 | **Layer C が Tier Sのみ・上位25キャッシュ** | `?tier=S&limit=25` で取得。都道府県絞り時に該当0件あり | 中 |
| L3 | **9因子の内訳UIなし** | priority_score は合計値のみ表示。`reasons`が代替 | 中 (Phase 2) |
| L4 | **解釈ヒントの閾値が経験則** | dHi>2pt / dCh>5pt / 急性期>50% は手動設定 | 低 |
| L5 | **疾病フィルタ4種は粗い** | 患者調査21大分類との対応マッピングなし | 中 (Phase 2) |
| L6 | **休棟病床は表示せず** | 休棟(再開)+休棟(廃止) は集計上は存在するが UIでは無視 | 低 |
| L7 | **R6機能区分は自己申告** | 施設の主観であり、実際の患者構成と乖離する可能性 | 中 (本質的限界) |
| L8 | **9因子の重み・式が文書化されていない** | priority_score の構成法は内製で、本仕様書外 | **高** (再現性) |

### 1.7 Peer review focal points

- **R6集計の正確性**: ETL(`etl_bed_function_r6_func.py`) の col index, header skip rows, pref_code正規化 → 検証済 (全国床数1,151,401一致)
- **解釈ヒントの妥当性**: 高知県41.4%慢性期 / 秋田51.4%急性期 / 東京21.7%高度急性期 は地域医療構想の既知シグナル
- **9因子の妥当性**: 本仕様書外。別途 `top_facilities.json` 生成ロジックの仕様書が必要

---

## 2. ⑥ 施設基準 (KijunView)

### 2.1 目的

全国8地方厚生局の **届出受理医療機関名簿(医科)** から、施設基準の届出件数を可視化。「どこに、何ができる施設があるか」を都道府県粒度で示す。

priority_score に依存しない**法定基準ベースのcapability**評価軸。施設基準を多数届け出ている = 多機能・高度な施設、という指標。

### 2.2 データソース

| データ | ファイル | 出典 | 件数 |
|---|---|---|---|
| 全体サマリ | `data/static/facility_standards_summary.json` | 厚生局届出受理名簿(医科) | 47都道府県の集計値 |
| 都道府県シャード | `data/static/kijun_shards/{pref}.json` | 同上 (前処理シャード化) | 47ファイル, 各 ~2,000施設 |

合計: **総届出 976,149件 / 対象施設 90,215** (令和8年2月〜4月公表分)

API:

- `GET /api/facility-standards?summary=true` → サマリ
- `GET /api/facility-standards?prefecture={pref}` → 都道府県シャード
- `GET /api/facility-standards?prefecture={pref}&capability={cap}` → 都道府県+capabilityフィルタ

### 2.3 データスキーマ

#### facility_standards_summary.json

```
{
  "total_facilities": 90215,
  "total_standards": 976149,
  "prefectures": ["北海道","青森県",...],
  "top_standards": [
    {"name": "医療ＤＸ推進体制整備加算", "count": 59292},
    ...上位15件
  ]
}
```

#### kijun_shards/{pref}.json (圧縮キー名)

API応答時に正規化される。raw → normalized:

| raw | normalized | 例 |
|---|---|---|
| `p` | `pref` | "京都府" |
| `c` | `code` | "9900042" (10桁) |
| `m` | `name` | "国立大学法人　京都大学医学部附属病院" |
| `n` | `std_count` | 385 (届出件数) |
| `a` | `addr` | "京都市左京区聖護院川原町..." |
| `z` | `zip` | "6068507" |
| `b` | `beds` | 1121 (病床数, null可) |
| `bt` | `beds_text` | "1121床" (代替文字列) |
| `cs` | `cases` | 20240 (症例数, null可) |
| `los` | `los` | 12.8 (平均在院日数) |
| `sc` | `score` | 54.5 (priority_score, null可) |
| `t` | `tier` | "A" ('' 可) |
| `cap` | `caps` | {oncology:26, surgery:34, ...} |

#### CAT_LABELS (10カテゴリ, KijunView line 5)

```
imaging:画像診断, surgery:手術, acute:急性期/救急, rehab:リハビリ,
homecare:在宅医療, oncology:がん, psychiatry:精神, pediatric:小児/周産期,
infection:感染対策, dx_it:DX/IT
```

> **対応する施設基準コードのマッピング表**は本仕様書外 (前処理ETL で実装)。

### 2.4 UI仕様

1. **Header** (line 27-30)
   - "Facility Standards" + "施設基準の届出状況"
2. **サマリ4枚カード** (line 32-39, summary取得時のみ)
   - 総届出件数 (976,149) / 対象施設数 (90,215) / 都道府県(47) / 出典(全8厚生局)
3. **届出件数の多い施設基準 上位15** (line 40-53)
   - 全国合算ランキング (top_standards)
4. **都道府県別 施設一覧 (本体)** (line 54-148)
   - capability filter (10カテゴリ + 全て)
   - 都道府県selector (`changePref` で `/api/facility-standards?prefecture=...` 再フェッチ)
   - フリーテキスト検索 (name + addr 部分一致)
   - sort selector: 届出数順 / 病床数順 / 症例数順 / スコア順
   - CSV / PDF export
   - 25件/ページ ページネーション (max 7ボタン表示)
   - **行クリックで展開** (詳細パネル)
     - 住所 + Google Map リンク (`https://www.google.com/maps/search/?api=1&query=...`)
     - 病床数, 届出数, スコア(任意), 症例数(任意), 平均在院日数(任意), Tier(任意)
     - 対応領域 (caps の各 capability count)
5. **出典ラベル** (line 149)
   - "出典: 全国8地方厚生局 届出受理医療機関名簿（医科）令和8年2月〜4月現在"

### 2.5 ロジック・閾値

#### フィルタチェーン (line 9-15)

```
filtered = kijunData
  .filter(name OR addr に kijunSearch を含む)
  .filter(capFilter なし OR caps[capFilter] > 0)
sorted = filtered.sort(by kijunSort)
paged = sorted.slice(pg * 25, (pg+1) * 25)
```

#### CSV reasons自動生成 (line 89-99)

- `std_count >= 100` → '届出100超(高機能)' / `>= 50` → '届出50超'
- `beds >= 500` → '500床超' / `>= 200` → '200床超'
- `score >= 45` → 'Tier A以上'
- `cases` → `症例${val.toLocaleString()}`

#### Confidence

```
cov = [addr, beds||beds_text, score, tier].filter(truthy).count
conf = cov>=3 ? 'High' : cov>=2 ? 'Medium' : 'Low'
```

### 2.6 既知の限界・peer review観点

| # | 項目 | 詳細 | 影響度 |
|---|---|---|---|
| L1 | **施設基準コード→capability のマッピングが本仕様書外** | 10カテゴリの定義は前処理ETLで決定 | **高** (再現性) |
| L2 | **2026/2〜4月という公表時期の差** | 各厚生局で公表日が異なり、データ齟齬の可能性 | 低-中 |
| L3 | **検索が部分一致のみ** | カナ/漢字違いに非対応 (例:「東京医科歯科」と「東京医歯」) | 低 |
| L4 | **score/tier は top_facilities由来** | 全90,215施設のうちスコア付きは約2,802 (Tier S+A+B) | 中 (UI上の混在) |
| L5 | **届出件数は施設の規模との相関大** | 大規模病院ほど高くなりがち。capability filter で部分緩和 | 本質的 |
| L6 | **shard cache は無期限** | プロセス再起動まで保持。データ更新時は明示的に reload 必要 | 低 |

### 2.7 Peer review focal points

- **施設基準→capability マッピングの妥当性**: 例えば「医療DX推進体制整備加算」が dx_it に分類されているか? 「がん化学療法加算」は oncology か?
- **届出件数=機能と見做す妥当性**: 「届出多い ≠ 高機能」のケースはあるか? (例: 単に診療所が多くの基本加算を取っているだけ)
- **3層モデルの整合**: ScoringView (priority_score) と KijunView (std_count) は独立指標か、相関するか?

---

## 3. ⑦ 施設マップ (GeoMapView)

### 3.1 目的

Tier S/A の **高機能施設の地理的分布** を一覧+地図で可視化。施設選択で Google Maps embed による位置確認。

ScoringView Layer C / KijunView の補完であり、「どこにあるか」の空間直感を提供。

### 3.2 データソース

| データ | ファイル | 件数 |
|---|---|---|
| 施設座標 | `data/static/facilities_geo.json` | **302施設** (Tier S 22 + Tier A 280 = 302) |

API: `GET /api/facilities-geo?prefecture={pref}` (任意, 都道府県絞り)

ETL: 内製 (top_facilities + 住所→緯度経度 ジオコーディング前処理)

### 3.3 データスキーマ

```
{
  "code": "234800166",
  "name": "藤田医科大学病院",
  "pref": "愛知県",
  "addr": "豊明市沓掛町田楽ケ窪１－９８",
  "score": 68.5,
  "tier": "S",
  "beds": 1376,
  "cases": 25651,
  "lat": 35.2221,
  "lng": 136.7641
}
```

### 3.4 UI仕様 (render順)

1. **Header + 都道府県selector** (line 6-19)
   - 「全国」+ geoFacilities由来の都道府県 (distinct)
   - 表示件数 = `geoFacilities.length` (302 or pref-filtered)
2. **2カラム layout** (line 21-)
   - 左: 施設リスト (mob時は下に回り込む)
   - 右: 詳細パネル (selectedFacility あり時のみ)
3. **施設リスト** (line 23-39)
   - クリックで `setSelectedFacility(f)`
   - 各行: 施設名(25文字truncate) + score badge (Tier S=赤 / A=橙)
   - サブ行: pref / beds / cases
4. **詳細パネル** (line 42-67)
   - 施設名 + pref/addr + Tier badge + score badge
   - 病床数 + 年間症例 (KPI 2枚)
   - **Google Maps iframe**: `https://maps.google.com/maps?q={pref+addr+name}&t=m&z=15&output=embed`
   - 高さ: minHeight 250px (flexで可変)

### 3.5 ロジック

#### Pref filter (line 28)

```
mapPref ? geoFacilities.filter(f => f.pref === mapPref) : geoFacilities
```

#### Tier color (line 31)

```
f.tier === 'S' ? 背景=#fef2f2/文字=#dc2626 : 背景=#fff7ed/文字=#f97316  (Tier A想定)
```

> Tier B/C/D は `facilities_geo.json` に含まれないため、色分岐は2分岐のみで足りる。

### 3.6 既知の限界・peer review観点

| # | 項目 | 詳細 | 影響度 |
|---|---|---|---|
| L1 | **Tier S/A 計302施設のみ** | Tier B (2,500) は地理データなし。網羅性は極めて限定的 | 高 (本質的) |
| L2 | **lat/lng の出典・精度が未文書化** | 内製ジオコーディング。住所表記揺れに脆弱 | 中 |
| L3 | **クリックでGoogle Maps iframeに依存** | 外部API呼び出し。CSPやネットワーク不安定で失敗あり | 低 |
| L4 | **マーカー型地図ではない** | 真の地図UI (Leaflet/Mapbox等) ではなく、選択した施設のみGoogle Maps埋め込み。複数施設の分布を一画面で見られない | **高** (UX根幹) |
| L5 | **検索・フィルタが弱い** | KijunView と異なり capability/std_count などの絞り込みなし | 中 |

### 3.7 Peer review focal points

- **「施設マップ」という名称の妥当性**: 真の choropleth/marker map ではなく、「リスト + 単一施設地図」。ネーミング齟齬
- **Tier B以下の地理情報がない理由**: 意図的か、データ未整備か
- **Google Maps embed の依存性**: GDPR/個人情報・CSP・APIキー有無の確認

---

## 4. 横断的 peer review チェックリスト

### 4.1 データソース整合性

- [ ] R6 病床機能 (Layer A) と top_facilities (Layer C) は**異なる時点**のデータ — Layer A=2024/7/1時点, top_facilities=2026 G-MIS。peer reviewer はこの時点差を許容するか?
- [ ] facility-standards (KijunView) は2026/2-4月現在、top_facilities は2026 公表分。整合期間か?
- [ ] facilities_geo (302件) と top_facilities Tier S+A (302件: 22+280) はキー code で完全マッピングしているか?

### 4.2 priority_score / 9因子の文書化

- [ ] **9因子の構成式・重み・データ源**は本仕様書外。別途 `priority_score_methodology.md` 等の文書化が peer reviewer から求められる可能性大。
- [ ] Tier境界 (S=60+? / A=45+? / B=...) の閾値根拠は?

### 4.3 capability マッピング

- [ ] 施設基準 → 10カテゴリ (imaging/surgery/.../dx_it) のマッピング表は前処理ETLにハードコード。文書化が必要。

### 4.4 UI 整合性

- [ ] 3ビューで「Tier」の意味が同じか? (top_facilities由来で統一されている想定)
- [ ] 都道府県selector のラベルが3ビュー間で一致しているか? (現状: ScoringView=「全国」+47都道府県, KijunView=47都道府県のみ(全国オプションなし), GeoMapView=「全国」+pref)
- [ ] **KijunView だけ「全国」オプションがない** ← 軽い不整合 (都道府県シャード前提なので「全国」は別エンドポイントが必要)

### 4.5 数値の最終確認 (sanity check目線)

| 数値 | 出典 | 値 |
|---|---|---|
| 全国総床数 (Layer A) | bed_function_by_pref.json | 1,151,401 |
| 全国総床数 (P5 ETL) | medical_areas_national.json | 1,151,401 (一致) |
| 全国 高度急性期 シェア | Layer A | 13.8% |
| 全国 急性期 シェア | Layer A | 41.7% |
| 全国 慢性期 シェア | Layer A | 25.3% |
| 総届出 | facility_standards_summary | 976,149 |
| 対象施設 | 同上 | 90,215 |
| Tier S 全国 | tiers.json | 22 |
| Tier A 全国 | tiers.json | 280 |
| Tier B 全国 | tiers.json | 2,500 |
| 全Tier 合計 | top_facilities.json | 2,802 (= 22+280+2,500) ✅ |
| facilities_geo | facilities_geo.json | 302 (= 22+280, Tier S+A) ✅ |

### 4.6 Phase 2 課題 (現状未実装、peer reviewerに明示)

1. **9因子内訳UI** — priority_score の構成要素を可視化
2. **供給-需要マッピング** — ScoringView Layer C と P6患者調査受療率を疾病領域ごとに対比
3. **疾病領域別 capability matching** — 患者調査21大分類 → KijunView 10カテゴリ の対応表
4. **Tier B/C/D の地理データ整備** — facilities_geo 拡張
5. **真の地図UI** — Leaflet等によるマーカー型分布表示
6. **z-score化された解釈ヒント** — Layer A の閾値経験則を統計的根拠に

---

## 5. ファイル一覧 (peer review時の参照先)

```
app/components/views/ScoringView.jsx     (275 行)
app/components/views/KijunView.jsx       (151 行)
app/components/views/GeoMapView.jsx      ( 71 行)
app/components/shared.js                 ( 26 行) — TC, sortPrefs, fmt, downloadCSV
app/components/pdfExport.js              — generateScoringPDF, generateKijunPDF (本仕様書外)
app/api/bed-function/route.js
app/api/facility-standards/route.js      — summary + shard対応
app/api/facilities/route.js              — tier/pref/q/min_beds/limit/offset
app/api/facilities-geo/route.js          — pref filter
app/api/tiers/route.js
lib/data.js                              — getTiers/getTopFacilities/getFacilitiesGeo (cache)
data/static/bed_function_by_pref.json
data/static/tiers.json
data/static/top_facilities.json
data/static/facilities_geo.json
data/static/facility_standards_summary.json
data/static/kijun_shards/*.json          (47 ファイル)
scripts/etl_bed_function_r6_func.py      — ETL (R6 col15)
```

---

**End of spec**
