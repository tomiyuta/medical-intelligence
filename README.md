# Medical Intelligence Platform — 設計仕様書

**Version**: 3.18  
**URL**: https://medical-intelligence-two.vercel.app  
**Repository**: https://github.com/tomiyuta/medical-intelligence  
**Last Updated**: 2026-04-15  

---

## 1. プロジェクト概要

全国の医療機関・人口動態・DPC実績・NDBオープンデータ・施設基準届出を統合した医療市場インテリジェンスダッシュボード。厚生労働省・総務省・社人研等の公的オープンデータをETLパイプラインで統合し、9因子スコアリングエンジンによる施設評価・SVG日本地図choropleth・インタラクティブ分析UIを提供する。

### 1.1 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 14 (App Router), React 18, Recharts, SVG choropleth, 7コンポーネント分割 |
| バックエンド | Next.js API Routes (16エンドポイント) |
| データベース | SQLite (開発・ETL用, 1.2M+ rows) |
| データ配信 | Static JSON (Vercel Edge, 19ファイル) |
| デプロイ | Vercel (45.9MB / 100MB制限) |
| ETL | Python 3 (pandas, openpyxl, sqlite3) |
| スコアリング | Python (9因子加重スコアリングエンジン v4) |


---

## 2. データソース一覧（7カテゴリ / 25テーブル / 1.2M+ rows）

| # | カテゴリ | ソース | 行数 | 入手先 |
|---|---|---|---|---|
| 1 | 医療機関マスタ | 厚労省 G-MIS | 97,024 | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/open_data.html |
| 2 | DPC病院 | 厚労省 DPC評価 | 5,933 | https://www.mhlw.go.jp/stf/shingi2/0000196043_00010.html |
| 3 | DPC年次推移 | 厚労省 退院患者調査 | 5,925 | 同上 |
| 4 | 人口動態 | 総務省 e-Stat | 1,741 | https://www.e-stat.go.jp/ |
| 5 | 将来推計人口 | 社人研 | 1,952 | https://www.ipss.go.jp/ |
| 6 | 二次医療圏 | 厚労省 医療計画 | 339圏域 | https://www.mhlw.go.jp/ |
| 7 | 病床機能報告 | 厚労省 | 28,693 | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/open_data_00006.html |
| 8 | NDB診療行為 | 厚労省 第10回NDB | 141 | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177221_00016.html |
| 9 | NDB処方薬 | 同上 | 4,786 | 同上 |
| 10 | NDB特定健診 | 同上 | 147 | 同上 |
| 11 | 施設基準 | 全国8地方厚生局 | 976,149 | 各厚生局HP (Excel/ZIP) |
| 12 | 救急/在宅統計 | 病床機能報告から集約 | 339 | 上記7から派生 |

### 施設基準ETL（全国8厚生局 / 47都道府県）

| 厚生局 | 管轄県 | 行数 |
|---|---|---|
| 北海道 | 北海道 | 37,588 |
| 東北 | 青森/岩手/宮城/秋田/山形/福島 | 50,635 |
| 関東信越 | 茨城/栃木/群馬/埼玉/千葉/東京/神奈川/新潟/山梨/長野 | 276,278 |
| 東海北陸 | 富山/石川/岐阜/静岡/愛知/三重 | 169,858 |
| 近畿 | 福井/滋賀/京都/大阪/兵庫/奈良/和歌山 | 171,291 |
| 中国四国 | 鳥取/島根/岡山/広島/山口 | 123,551 |
| 四国 | 徳島/香川/愛媛/高知 | 53,655 |
| 九州 | 福岡/佐賀/長崎/熊本/大分/宮崎/鹿児島/沖縄 | 193,535 |


---

## 3. スコアリングエンジン v4

Score = 0.20×CaseVolume + 0.18×BedScale + 0.12×Market + 0.10×CaseGrowth + 0.10×DPCClass + 0.08×Complexity + 0.08×BaseScale + 0.08×Demand + 0.06×Competition

| Tier | Score | 施設数 | 定義 |
|---|---|---|---|
| S | 60+ | 22 | 最重要ターゲット |
| A | 45-60 | 280 | 重要ターゲット |
| B | 25-45 | 2,500 | 標準ターゲット |
| C | 15-25 | 88,204 | 一般施設 |
| D | <15 | 5,482 | 小規模施設 |

**検索・スコアリングの対象**: Tier S/A/B の**上位2,802施設**（top_facilities.json）。全97,024施設のフルマスタ検索は未実装。

---

## 4. UIビュー（7画面 + モバイル対応）

| # | ビュー | 主要機能 |
|---|---|---|
| 1 | 都道府県別 分布 | SVG choropleth(4指標切替), hover tooltip, click drill-down |
| 2 | 市区町村 人口動態 | 高齢化率choropleth(フルビューポート), 二次医療圏セレクタ, 7KPI, 年齢構成バー |
| 3 | 医療圏分析 | 339圏域, 水平BarChart, テーブル |
| 4 | 施設マップ | Google Maps iframe, Tier S/A 302施設, 詳細パネル |
| 5 | スコアリング | 5段階Tier KPI, 施設検索, Tier S一覧, **📥CSV出力** |
| 6 | NDB分析 | 診療行為6分類, 特定健診(男/女), 処方薬Top15 |
| 7 | 施設基準 | 全施設ページネーション(100件/p), 検索/ソート, 展開パネル(Google Maps📍), **📥CSV出力** |


---

## 5. API（16エンドポイント）

`/api/tiers` `/api/prefectures` `/api/prefectures-full` `/api/facilities` `/api/facilities/[code]` `/api/facilities-geo` `/api/pref-coords` `/api/japan-map` `/api/municipalities` `/api/area-demographics` `/api/medical-areas` `/api/ndb/diagnostics` `/api/ndb/prescriptions` `/api/ndb/health-checkup` `/api/facility-standards` `/api/crm/accounts`

**アーキテクチャ**: SQLite → ETL Python → Static JSON → Next.js API Route (readFileSync+cache) → React SPA

---

## 6. 競合比較（Pottech Medical CRM）

| Pottech機能 | MedIntel | 差異 |
|---|---|---|
| 医療機関マスタ 97K | ✅ | 同等 |
| 3階層医療圏分析 | ✅ | 同等 |
| 人口動態・将来推計 | ✅ + 高齢化率choropleth | **当方優位** |
| 施設基準 | ✅ 976K件/47県 | 同等 |
| Google Map | ✅ iframe | Pottech: API markers（優位） |
| CRM | 🔶 スキーマのみ | **Pottech優位** |
| **9因子スコアリング** | ✅ 独自 | **当方独自** |
| **NDB分析** | ✅ 独自 | **当方独自** |
| **CSV出力** | ✅ | **当方独自** |


---

## 7. ChatGPT戦略レビュー統合結論（4ラウンド / 2モデル）

### 7.1 合意事項（高確信度）

- プロダクトは「優秀な分析PoC」であり「SaaS」ではない
- 最大リスクは機能不足ではなく**参入障壁の弱さ**（オープンデータ＝誰でも取得可能）
- DPC非参加94%問題は構造的欠陥（単一スコアで不公平）
- 収益化最短パス: **レポート受託→paid pilot→SaaS**
- ターゲット: **医療機器/医薬品メーカーの営業部門**に絞れ
- 次に実装すべき: CRMではなく**PDF/CSV出力+保存条件**
- プロダクトのポジション: 医療機器営業向け**ターゲティング・インテリジェンス**（CRMではない）

### 7.2 スコア出力形式の改善方針（4項目）

| 項目 | 役割 |
|---|---|
| Fit Score | 用途別適合度 |
| Confidence | 情報被覆率（DPCあり=高/なし=低） |
| Reason Codes | なぜ上位か（3-5項目） |
| Missing Signals | 何が不明か（症例数非開示/DPC実績なし等） |

### 7.3 pilot仮説文

> 医療機器メーカーの営業推進部門が、四半期計画時に、指定領域の重点病院top50を根拠付きで抽出したリストを受け取り、営業責任者がそのまま会議に持ち込める水準だと判断し、四半期30万円で継続更新を発注する。


### 7.4 確定版90日アクションプラン

| Phase | 期間 | 作業 | 判定指標 |
|---|---|---|---|
| 0 | Week 0 | truth in labeling修正(✅済) / 出典表示(✅済) / CSV出力(✅済) / page.js分割(✅済) | 法務・信用・保守性の土台 |
| 1 | Week 1-2 | 10社ヒアリング / 3社デモ | 同じ課題3回再出 |
| 2 | Week 2-4 | 施設基準taxonomy化(1カテゴリ) / 4項目スコア出力 | 1社design partner |
| 3 | Week 4-6 | paid pilot納品(手作業込み) / ラベル回収権確保 | 初回入金≥30万円 |
| 4 | Week 6-8 | JSON shard化 / page.js分割 / 出典表示 | デモ安定化 |
| 5 | Week 8-10 | scoring v5: 類型別+confidence+missing signals | 評価改善 |
| 6 | Week 10-12 | 保存条件 / 簡易認証 / 2社目再現性検証 | SaaS化Go/No-Go |

**Go条件**: 手修正率<30%、「次回も同じ形式で欲しい」  
**No-Go条件**: 順位よりraw list要求、理由コードよりCRM流し込み重視

---

## 8. バージョン履歴

| Version | Commit | Description |
|---|---|---|
| v3.18 | 8609d67 | page.js 7ビュー分割完了 (758→178行, -76.5%) |
| v3.17 | b7f9cfa | CSV 4項目出力(Confidence/Reason/Missing) + README統合更新 |
| v3.16 | b546a53 | CSV出力機能 + 出典表示統一化 |
| v3.15 | 444e8b6 | 高齢化率マップ最大化+viewBox最適化 |
| v3.13 | 4c90687 | 人口動態ビューに高齢化率choroplethマップ追加 |
| v3.12 | 2a0a3f8 | 施設基準ビュー刷新（全施設+展開型+ページネーション） |
| v3.11 | 32ead7a | 施設基準 全国47都道府県完全カバー (976K件) |
| v3.8 | c2907b9 | NDB分析+施設基準 2ビュー追加（全7ビュー） |

---

*本データは厚生労働省・総務省・国立社会保障人口問題研究所・全国8地方厚生局のオープンデータを加工して作成しています。政府が作成したものではありません。*
