# Medical Intelligence Platform — 設計仕様書

**Version**: 3.15  
**URL**: https://medical-intelligence-two.vercel.app  
**Repository**: https://github.com/tomiyuta/medical-intelligence  
**Last Updated**: 2026-04-15  

---

## 1. プロジェクト概要

全国の医療機関・人口動態・DPC実績・NDBオープンデータ・施設基準届出を統合した医療市場インテリジェンスダッシュボード。厚生労働省・総務省・社人研等の公的オープンデータをETLパイプラインで統合し、9因子スコアリングエンジンによる施設評価・SVG日本地図choropleth・インタラクティブ分析UIを提供する。

### 1.1 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 14 (App Router), React 18, Recharts, SVG choropleth |
| バックエンド | Next.js API Routes (16エンドポイント) |
| データベース | SQLite (開発・ETL用, 976K+ rows) |
| データ配信 | Static JSON (Vercel Edge) |
| デプロイ | Vercel (vercel --prod) |
| ETL | Python 3 (pandas, openpyxl, sqlite3) |
| スコアリング | Python (9因子加重スコアリングエンジン v4) |


---

## 2. データソース一覧（MECE分類）

### 2.1 医療機関マスタ

| データ | ソース | URL | 行数 | 更新頻度 |
|---|---|---|---|---|
| 医療機関基本情報 | 厚労省 医療機関等情報支援システム（G-MIS） | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/open_data.html | 97,024 | 月次 |
| DPC対象病院一覧 | 厚労省 DPC導入の影響評価 | https://www.mhlw.go.jp/stf/shingi2/0000196043_00010.html | 5,933 | 年次 |
| DPC退院患者数（年次推移） | 同上（退院患者調査） | 同上 | 5,925 | 年次 |

### 2.2 人口動態・将来推計

| データ | ソース | URL | 行数 | 更新頻度 |
|---|---|---|---|---|
| 市区町村別人口・出生・死亡 | 総務省 e-Stat 社会・人口統計体系 | https://www.e-stat.go.jp/ | 1,741 | 年次(国勢調査ベース) |
| 将来推計人口 | 国立社会保障・人口問題研究所 | https://www.ipss.go.jp/pp-shicyoson/j/shicyoson18/t-page.asp | 1,952 | 5年毎 |

### 2.3 医療圏

| データ | ソース | URL | 行数 | 更新頻度 |
|---|---|---|---|---|
| 二次医療圏マスタ | 厚労省 医療計画 | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryou/iryou_keikaku/index.html | 339圏域 | 6年毎(医療計画改定時) |
| 病床機能報告 | 厚労省 病床機能報告制度 | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/open_data_00006.html | 28,693 | 年次 |


### 2.4 NDBオープンデータ

| データ | ソース | URL | 行数 | 集計期間 |
|---|---|---|---|---|
| 診療行為（算定回数） | 厚労省 第10回NDBオープンデータ | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177221_00016.html | 141 | R5年度レセプト |
| 処方薬（薬効分類別数量） | 同上 | 同上 | 4,786 | R5年度レセプト |
| 特定健診（検査値平均） | 同上 | 同上 | 147 | R4年度特定健診 |

**数値定義**:
- `算定回数`: 診療報酬点数表に定められた一行為の回数（延べ）。入院基本料は1日=1回
- `処方数量`: 薬剤固有単位（錠・mL等）での数量。薬効分類間の直接比較は不適切
- `検査値平均`: 40〜74歳の特定健診受診者の検査結果算術平均値

### 2.5 施設基準

| データ | ソース | URL | 行数 | 管轄県 |
|---|---|---|---|---|
| 北海道厚生局 | 届出受理医療機関名簿（医科） | https://kouseikyoku.mhlw.go.jp/hokkaido/ | 37,588 | 北海道 |
| 東北厚生局 | 同上 | https://kouseikyoku.mhlw.go.jp/tohoku/ | 50,635 | 青森/岩手/宮城/秋田/山形/福島 |
| 関東信越厚生局 | 同上 | https://kouseikyoku.mhlw.go.jp/kantoshinetsu/ | 276,278 | 茨城/栃木/群馬/埼玉/千葉/東京/神奈川/新潟/山梨/長野 |
| 東海北陸厚生局 | 同上 | https://kouseikyoku.mhlw.go.jp/tokaihokuriku/ | 169,858 | 富山/石川/岐阜/静岡/愛知/三重 |
| 近畿厚生局 | 同上 | https://kouseikyoku.mhlw.go.jp/kinki/ | 171,291 | 福井/滋賀/京都/大阪/兵庫/奈良/和歌山 |
| 中国四国厚生局 | 同上 | https://kouseikyoku.mhlw.go.jp/chugokushikoku/ | 123,551 | 鳥取/島根/岡山/広島/山口 |
| 四国厚生支局 | 同上 | https://kouseikyoku.mhlw.go.jp/shikoku/ | 53,655 | 徳島/香川/愛媛/高知 |
| 九州厚生局 | 同上 | https://kouseikyoku.mhlw.go.jp/kyushu/ | 193,535 | 福岡/佐賀/長崎/熊本/大分/宮崎/鹿児島/沖縄 |
| **合計** | **全8地方厚生局** | — | **976,149** | **47都道府県** |

### 2.6 救急・在宅医療

| データ | ソース | URL | 行数 | 備考 |
|---|---|---|---|---|
| 救急医療実施状況 | 厚労省 病床機能報告 | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/open_data_00006.html | 339 | bed_functionから二次医療圏集約 |
| 在宅医療支援状況 | 同上 | 同上 | 339 | 同上 |

### 2.7 地理情報

| データ | ソース | URL | 用途 |
|---|---|---|---|
| SVG日本地図パス | @svg-maps/japan (OSS) | https://github.com/VictorCazanave/svg-maps | choroplethマップ描画 |
| 都道府県座標 | 手動定義 | — | Google Maps iframe配置 |


---

## 3. データベーススキーマ

### 3.1 テーブル一覧（25テーブル / 1,222,000+ rows）

| テーブル | 行数 | 主キー | 用途 |
|---|---|---|---|
| `facilities` | 97,024 | facility_code_7 | 医療機関マスタ（名称/住所/類型） |
| `facility_scores` | 96,488 | facility_code_7 | スコアリング結果（36カラム） |
| `facility_standards` | 976,149 | facility_code+standard_name | 施設基準届出（全国47都道府県） |
| `dpc_hospitals` | 5,933 | 告示番号 | DPC対象病院（病床数/類型） |
| `dpc_enrichment_v2` | 5,925 | dpc_id | DPC年次推移（H30-R4/5年分） |
| `demographics` | 1,741 | region_code | 市区町村別人口統計 |
| `future_population` | 1,952 | コード | 将来推計人口 |
| `medical_areas_v2` | 1,912 | col_0 | 二次医療圏マスタ |
| `area_emergency_homecare` | 339 | pref_code+area_name | 二次医療圏別救急/在宅 |
| `bed_function` | 28,693 | 医療機関コード | 病床機能報告 |
| `ndb_diagnostic_claims` | 141 | category+prefecture | NDB診療行為算定回数 |
| `ndb_prescriptions` | 4,786 | drug_class_code+prefecture | NDB処方薬数量 |
| `ndb_health_checkup` | 147 | prefecture+metric | NDB特定健診検査値 |
| `pref_emergency` | 47 | prefecture | 都道府県別救急統計 |
| `pref_home_care` | 47 | prefecture | 都道府県別在宅統計 |
| `pref_medical_equipment` | 47 | prefecture | 都道府県別医療機器 |
| `prefecture_summary` | 46 | prefecture_code | 都道府県サマリー |
| `crm_members` | 3 | member_id | CRM（スキーマのみ） |
| `crm_tags` | 3 | tag_id | CRMタグ（スキーマのみ） |


### 3.2 主要JOIN関係

```
facilities (97K)
  ├── facility_scores (96K) ... ON facility_code_7
  ├── facility_standards (976K) ... ON facility_code_7 = facility_code (85% JOIN率)
  └── dpc_hospitals (5.9K) ... ON 告示番号 = dpc_id
       └── dpc_enrichment_v2 (5.9K) ... ON dpc_id

demographics (1.7K)
  └── medical_areas_v2 (1.9K) ... ON 都道府県+市区町村
       └── area_emergency_homecare (339) ... ON pref+area
```

---

## 4. スコアリングエンジン v4

### 4.1 9因子加重モデル

| Factor | Weight | Description | Range |
|---|---|---|---|
| F7 Case Volume | 0.20 | 年間症例数 | 0-100 |
| F5 Bed Scale | 0.18 | 病床規模 | 0-100 |
| F1 Market | 0.12 | 市場性（診療圏人口） | 0-100 |
| F8 Case Growth | 0.10 | 症例増減率 | 0-100 |
| F6 DPC Class | 0.10 | DPC病院分類 | 0/20/40/60/80/100 |
| F9 Complexity | 0.08 | 症例複雑性 | 0-100 |
| F2 Base Scale | 0.08 | 基本規模 | 0-100 |
| F3 Demand | 0.08 | 医療需要（高齢化率） | 0-100 |
| F4 Competition | 0.06 | 競合密度（逆数） | 0-100 |

### 4.2 ティア分類

| Tier | Score Range | 施設数 | 定義 |
|---|---|---|---|
| S | 60+ | 22 | 最重要ターゲット |
| A | 45-60 | 280 | 重要ターゲット |
| B | 25-45 | 2,500 | 標準ターゲット |
| C | 15-25 | 88,204 | 一般施設 |
| D | <15 | 5,482 | 小規模施設 |

Score = Σ(Factor_i × Weight_i)  
Range: 13.8 — 68.5pt  
Top: 藤田医科大学病院 (68.5pt)


---

## 5. API設計

### 5.1 エンドポイント一覧（16 routes）

| Endpoint | Method | Response | 用途 |
|---|---|---|---|
| `/api/tiers` | GET | Tier別施設数 | スコアリングKPI |
| `/api/prefectures` | GET | 47都道府県サマリー | 地図データ |
| `/api/prefectures-full` | GET | 都道府県詳細 | 地図ビュー |
| `/api/facilities` | GET | 施設検索（?q=） | 施設検索 |
| `/api/facilities/[code]` | GET | 施設詳細 | 施設プロファイル |
| `/api/facilities-geo` | GET | Tier S/A施設+座標 | 施設マップ |
| `/api/pref-coords` | GET | 都道府県中心座標 | Google Maps |
| `/api/japan-map` | GET | SVGパスデータ | choroplethマップ |
| `/api/municipalities` | GET | 市区町村人口 | 人口動態 |
| `/api/area-demographics` | GET | 二次医療圏別人口 | 人口動態 |
| `/api/medical-areas` | GET | 医療圏マスタ | 医療圏分析 |
| `/api/ndb/diagnostics` | GET | 診療行為算定回数 | NDB分析 |
| `/api/ndb/prescriptions` | GET | 処方薬数量（?prefecture=） | NDB分析 |
| `/api/ndb/health-checkup` | GET | 特定健診検査値 | NDB分析 |
| `/api/facility-standards` | GET | 施設基準（?prefecture=&summary=） | 施設基準 |
| `/api/crm/accounts` | GET | CRMアカウント | CRM（未実装） |

### 5.2 データ配信アーキテクチャ

```
[SQLite DB] → [ETL Python] → [Static JSON] → [Next.js API Route] → [Client]
  976K rows      pandas/openpyxl     16 files       readFileSync+cache     React SPA
```

- DBはVercelにデプロイしない（112MB, .vercelignore）
- Static JSONをEdge配信（合計45.9MB）
- API RouteはJSON読み込み+キャッシュ（初回のみファイルI/O）


---

## 6. UIビュー設計（7ビュー）

### 6.1 ビュー一覧

| # | ビュー名 | デスクトップ | モバイル | 主要コンポーネント |
|---|---|---|---|---|
| 1 | 都道府県別 分布 | SVG choropleth全面 | 同左 | 4指標切替(施設数/病院数/DPC/病床), hover tooltip, click drill-down |
| 2 | 市区町村 人口動態 | 高齢化率choropleth + 詳細 | 同左 | SVG日本地図(暖色系), 都道府県/二次医療圏セレクタ, 7KPIカード, 年齢構成バー, 8列テーブル |
| 3 | 医療圏分析 | 水平BarChart + テーブル | 同左 | 都道府県セレクタ, 339圏域対応 |
| 4 | 施設マップ | Google Maps + 詳細パネル | column-reverse | Tier S/A 302施設, iframe地図, 施設詳細 |
| 5 | スコアリング | KPIカード + Top25テーブル | 同左 | 5段階Tier, 施設名検索, ランキング |
| 6 | NDB分析 | 3セクション縦配置 | 同左 | 診療行為KPI, 特定健診(男/女), 処方薬Top15 |
| 7 | 施設基準 | Top15 + ページネーション | 2列化 | 4KPI, 全施設表示(100件/p), 検索/ソート/展開パネル(Google Maps📍) |

### 6.2 共通UIパターン

- **フォント**: DM Sans (Google Fonts)
- **カラー**: Primary=#2563EB, Success=#059669, Warning=#f59e0b, Danger=#b91c1c
- **Choropleth**: 暖色系5段階 (#fef3c7→#f59e0b→#ea580c→#dc2626→#b91c1c)
- **レスポンシブ**: useIsMobile() hook, breakpoint=768px
- **ボトムナビ**: 7タブ横スクロール, safe-area-inset対応
- **サイドバー**: デスクトップ240px固定, 7項目ナビゲーション


---

## 7. プロジェクト構造

```
~/Projects/medical-intelligence/
├── app/
│   ├── layout.js                    # Next.js root layout
│   ├── page.js                      # 7ビュー統合SPA (705行)
│   └── api/                         # 16 API routes
│       ├── tiers/route.js
│       ├── prefectures/route.js
│       ├── prefectures-full/route.js
│       ├── facilities/route.js
│       ├── facilities/[code]/route.js
│       ├── facilities-geo/route.js
│       ├── pref-coords/route.js
│       ├── japan-map/route.js
│       ├── municipalities/route.js
│       ├── area-demographics/route.js
│       ├── medical-areas/route.js
│       ├── ndb/diagnostics/route.js
│       ├── ndb/prescriptions/route.js
│       ├── ndb/health-checkup/route.js
│       ├── facility-standards/route.js
│       └── crm/accounts/route.js
├── lib/data.js                      # 16 JSON loader functions
├── data/
│   ├── medical_intelligence.db      # SQLite (976K+ rows, git除外)
│   ├── processed/                   # ETL中間CSV (git除外)
│   └── static/                      # 19 JSON files (API配信用)
├── src/etl/
│   ├── pipeline.py                  # メインETLパイプライン
│   ├── scoring_engine.py            # スコアリングv1
│   └── scoring_engine_v2.py         # スコアリングv4 (9因子)
├── scripts/
│   └── replace_kijun.py             # 施設基準ビュー差し替えスクリプト
├── docs/
│   └── DESIGN_SPEC.md               # 本仕様書
├── .gitignore
├── .vercelignore
├── next.config.mjs
└── package.json
```


---

## 8. ETLパイプライン

### 8.1 処理フロー

```
[公的オープンデータ]
    │
    ├── 厚労省CSV/Excel ─→ pandas.read_csv/read_excel
    ├── e-Stat API ─────→ requests + JSON parse
    ├── NDB Excel ──────→ pandas (都道府県別集計)
    └── 施設基準 ZIP/Excel → zipfile + openpyxl (8厚生局×県別)
    │
    ▼
[SQLite DB] ← pipeline.py (INSERT/UPDATE)
    │
    ├── scoring_engine_v2.py ─→ 9因子スコア計算 → facility_scores
    │
    ▼
[Static JSON Export] ← json.dump (16ファイル)
    │
    ▼
[Vercel Deploy] ← vercel --prod
```

### 8.2 施設基準ETL詳細

- **入力**: 8厚生局のExcel/ZIP（ブラウザ手動DL必須 — curlブロック）
- **解凍**: Python zipfile + cp437→cp932エンコーディング変換
- **パース**: 汎用ヘッダー自動検出（「医療機関名」含む行）
- **フィルタ**: 医科のみ（歯科/薬局は除外）
- **重複排除**: facility_code + standard_name でDEDUP
- **東北例外処理**: 6シート構成（県別シート）→全シート読み込み

---

## 9. デプロイ構成

### 9.1 Vercel設定

- **プロジェクト**: tomiyutaka-gmailcoms-projects/medical-intelligence
- **ドメイン**: medical-intelligence-two.vercel.app
- **ビルド**: `npx next build`
- **容量制限**: 100MB → 現在45.9MB

### 9.2 除外ファイル (.vercelignore / .gitignore)

| ファイル | サイズ | 理由 |
|---|---|---|
| data/medical_intelligence.db | 112MB | SQLite開発用DB |
| data/processed/*.csv | 40MB | ETL中間ファイル |
| data/static/facility_standards.json | 14MB | 完全版JSON（compact版で代替） |
| data/static/facilities_compact.json | 14MB | 旧compact版 |


---

## 10. 競合比較（Pottech hospital-crm.pottech.jp）

| # | Pottech機能 | MedIntelビュー | カバー状態 |
|---|---|---|---|
| 1 | 医療機関マスタ (97K施設) | 施設マップ + スコアリング | ✅ |
| 2 | 3階層医療圏分析 | 医療圏分析 | ✅ |
| 3 | 人口動態・将来推計 | 市区町村 人口動態 | ✅ |
| 4 | 救急・在宅・機器統計 | 医療圏分析（内包） | ✅ |
| 5 | Google Mapマッピング | 施設マップ | ✅ |
| 6 | 施設詳細プロファイル | 施設マップ詳細パネル + 施設基準展開パネル | ✅ |
| 7 | DPC病院データ | スコアリング（DPC連携） | ✅ |
| 8 | 施設基準分析 | 施設基準ビュー（47都道府県/976K件） | ✅ |
| 9 | 顧客管理（CRM） | スキーマのみ実装 | 🔶 |
| — | **独自: 9因子スコアリング** | スコアリングビュー | ✅ |
| — | **独自: NDBオープンデータ分析** | NDB分析ビュー | ✅ |
| — | **独自: 高齢化率choropleth** | 人口動態マップ | ✅ |

**カバー率: 9/9 (CRMスキーマ含む) + 独自3機能**

---

## 11. バージョン履歴

| Version | Date | Description |
|---|---|---|
| v3.15 | 2026-04-15 | 高齢化率マップ最大化+viewBox最適化 |
| v3.14 | 2026-04-15 | 高齢化率マップフルビューポート化 |
| v3.13 | 2026-04-15 | 人口動態ビューに高齢化率choroplethマップ追加 |
| v3.12 | 2026-04-15 | 施設基準ビュー刷新（全施設表示+展開型+ページネーション） |
| v3.11 | 2026-04-15 | 施設基準 全国47都道府県完全カバー (976K件) |
| v3.10 | 2026-04-14 | NDB分析ビューに単位ラベル・注釈追加 |
| v3.9 | 2026-04-14 | 都道府県ソート順修正+NDBカテゴリラベル整理 |
| v3.8 | 2026-04-14 | NDB分析+施設基準 2ビュー追加（全7ビュー） |
| v3.7 | 2026-04-14 | Vercel 100MB制限解消 |
| v3.4 | 2026-04-14 | NDB 3テーブル + 救急在宅の二次医療圏拡張 |
| v3.3 | 2026-04-14 | 人口動態を二次医療圏別に再構築 |
| v3.0 | 2026-04-14 | SVG日本地図choroplethマップ（暖色系） |
| v2.5 | 2026-04-14 | モバイル対応（iPhone完全対応） |
| v1.0 | 2026-04-14 | 初期リリース（5ビュー） |

