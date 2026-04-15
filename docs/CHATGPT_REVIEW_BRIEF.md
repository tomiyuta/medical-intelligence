# Medical Intelligence Platform — ChatGPT Review用ブリーフィング

## 依頼事項
以下のプラットフォームについて、実装品質・データ戦略・収益化可能性・改善点をdevil's advocateの観点で評価してください。

---

## 1. プロダクト概要

**URL**: https://medical-intelligence-two.vercel.app
**GitHub**: https://github.com/tomiyuta/medical-intelligence (public)
**開発期間**: 2日間（2026-04-14〜15）
**開発体制**: solo developer + Claude (AI pair programming)
**競合**: Pottech Medical CRM (https://hospital-crm.pottech.jp/lp)

### 1.1 What it does
全国97,024医療施設のオープンデータを統合し、9因子スコアリングエンジンで施設評価・地域分析を行うダッシュボード。医療機器メーカーの営業ターゲティング、病院の経営企画、薬局チェーンの出店戦略を想定。

### 1.2 技術スタック
- Frontend: Next.js 14 (App Router) + React 18 + Recharts + inline SVG choropleth
- Backend: Next.js API Routes (16 endpoints)
- Data: SQLite (ETL用) → Static JSON (配信用) → Vercel Edge
- ETL: Python 3 (pandas/openpyxl)
- Deploy: Vercel (45.9MB, 100MB制限内)


---

## 2. データアセット（7カテゴリ / 25テーブル / 1.2M+ rows）

### 2.1 データソースマトリクス

| # | カテゴリ | ソース | 行数 | 入手先 | 更新頻度 |
|---|---|---|---|---|---|
| 1 | 医療機関マスタ | 厚労省 G-MIS | 97,024 | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/open_data.html | 月次 |
| 2 | DPC病院 | 厚労省 DPC評価 | 5,933 | https://www.mhlw.go.jp/stf/shingi2/0000196043_00010.html | 年次 |
| 3 | DPC年次推移 | 同上（退院患者調査） | 5,925 | 同上 | 年次 |
| 4 | 人口動態 | 総務省 e-Stat | 1,741 | https://www.e-stat.go.jp/ | 年次 |
| 5 | 将来推計人口 | 社人研 | 1,952 | https://www.ipss.go.jp/ | 5年毎 |
| 6 | 二次医療圏 | 厚労省 医療計画 | 339圏域 | https://www.mhlw.go.jp/ | 6年毎 |
| 7 | 病床機能報告 | 厚労省 | 28,693 | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/open_data_00006.html | 年次 |
| 8 | NDB診療行為 | 厚労省 第10回NDB | 141 | https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177221_00016.html | 年次 |
| 9 | NDB処方薬 | 同上 | 4,786 | 同上 | 年次 |
| 10 | NDB特定健診 | 同上 | 147 | 同上 | 年次 |
| 11 | 施設基準 | 全国8地方厚生局 | 976,149 | 各厚生局HP（Excel/ZIP） | 月次〜四半期 |
| 12 | 救急/在宅統計 | 病床機能報告から集約 | 339 | 上記7から派生 | 年次 |

### 2.2 データ品質

| 指標 | 値 | 備考 |
|---|---|---|
| 施設コードJOIN率 | 85% | facility_standards ↔ facility_scores |
| 住所充足率 | 85% | facility_scores経由 |
| 病床数充足率 | 89% | テキスト形式(施設基準)+数値(DPC) |
| 症例数充足率 | 3% | DPC参加病院のみ |
| 都道府県カバー率 | 100% | 47/47 |


---

## 3. スコアリングエンジン v4

### 3.1 9因子加重モデル
```
Score = 0.20×CaseVolume + 0.18×BedScale + 0.12×Market + 0.10×CaseGrowth
      + 0.10×DPCClass + 0.08×Complexity + 0.08×BaseScale + 0.08×Demand + 0.06×Competition
```
Range: 13.8 — 68.5pt (Top: 藤田医科大学病院 68.5pt)

### 3.2 ティア分類
| Tier | Score | 施設数 | 割合 |
|---|---|---|---|
| S | 60+ | 22 | 0.02% |
| A | 45-60 | 280 | 0.29% |
| B | 25-45 | 2,500 | 2.59% |
| C | 15-25 | 88,204 | 91.4% |
| D | <15 | 5,482 | 5.68% |

### 3.3 課題
- 9因子の重みは経験的設定（統計的最適化なし）
- DPC非参加施設（全体の94%）はCase Volume/Growth/Complexityが欠損→スコアがC/Dに集中
- 競合密度(F4)は都道府県レベルで粗い（二次医療圏レベルが望ましい）


---

## 4. UI/UX（7ビュー）

| # | ビュー | 主要機能 | デスクトップ | モバイル |
|---|---|---|---|---|
| 1 | 都道府県別 分布 | SVG choropleth, 4指標切替, hover/click | フルビューポート地図 | 同左 |
| 2 | 市区町村 人口動態 | 高齢化率choropleth, 二次医療圏セレクタ, 7KPI, 年齢構成バー | フルビューポート地図+詳細 | 同左 |
| 3 | 医療圏分析 | 水平BarChart, 339圏域テーブル | BarChart+テーブル | 同左 |
| 4 | 施設マップ | Google Maps iframe, Tier S/A 302施設, 詳細パネル | 地図+パネル | column-reverse |
| 5 | スコアリング | 5段階Tier KPI, 施設検索, Top25ランキング | カード+テーブル | 同左 |
| 6 | NDB分析 | 診療行為6分類KPI, 特定健診(男/女), 処方薬Top15 | 3セクション | 同左 |
| 7 | 施設基準 | 4KPI, Top15基準, 全施設ページネーション(100件/p), 検索/ソート, 展開パネル(Google Maps📍) | 5列テーブル | 2列 |

### 4.1 デザイン特徴
- Single Page Application (page.js 705行に全7ビュー統合)
- DM Sans フォント, 暖色系choropleth (#fef3c7→#b91c1c)
- モバイル: useIsMobile() hook (768px breakpoint), ボトムナビ7タブ横スクロール

### 4.2 課題
- page.js 705行の単一ファイル → コンポーネント分割が必要
- 施設マップのGoogle Maps iframe → Maps API (markers/clustering)に移行すべき
- CRM機能がスキーマのみ → 顧客管理の本格実装が未着手


---

## 5. 競合比較（Pottech Medical CRM）

| # | Pottech機能 | MedIntel | 差異 |
|---|---|---|---|
| 1 | 医療機関マスタ 97K | ✅ 97,024施設 | 同等 |
| 2 | 3階層医療圏分析 | ✅ 339圏域 | 同等 |
| 3 | 人口動態・将来推計 | ✅ + 高齢化率choropleth地図 | **当方優位（地図なし→あり）** |
| 4 | 救急・在宅統計 | ✅ 二次医療圏レベル | 同等 |
| 5 | Google Map | ✅ iframe | Pottech: API markers（優位） |
| 6 | 施設詳細プロファイル | ✅ 展開パネル | Pottech: 専用ページ（優位） |
| 7 | DPC病院データ | ✅ 5,933施設+年次推移 | 同等 |
| 8 | 施設基準 | ✅ 976K件/47都道府県 | 同等 |
| 9 | CRM | 🔶 スキーマのみ | **Pottech優位** |
| — | 9因子スコアリング | ✅ 独自 | **当方独自** |
| — | NDB分析 | ✅ 独自 | **当方独自** |

### 5.1 Pottechの推定ビジネスモデル
- SaaS月額課金（推定¥30,000〜¥100,000/月）
- ターゲット: 医療機器メーカー営業部門、医療コンサル
- LP: https://hospital-crm.pottech.jp/lp


---

## 6. 収益化分析

### 6.1 ターゲット顧客セグメント
| セグメント | 支払意欲 | 市場規模 |
|---|---|---|
| 医療機器/医薬品メーカー営業部門 | 高（営業効率直結） | 大（数千社） |
| 医療コンサルティング会社 | 高（コンサルFee原資） | 小（数百社） |
| 病院経営企画部 | 中（予算制約） | 中（8,000病院） |
| 薬局/介護チェーン | 中 | 中 |
| M&A仲介 | 高（ディール単価大） | 小 |

### 6.2 収益モデル候補（実現可能性順）

| 優先度 | モデル | 初期投資 | 収益開始 | 月額ポテンシャル |
|---|---|---|---|---|
| 1 | レポート受託（分析レポートPDF納品） | ¥0 | 即日 | 30-100万円 |
| 2 | SaaS月額課金（Free/¥9,800/¥29,800/¥98,000） | 認証+CRM実装2-4週 | 1-3ヶ月 | 50-300万円 |
| 3 | データAPI課金 | API key認証2-3日 | 1-2ヶ月 | 10-50万円 |
| 4 | ホワイトラベルOEM | 契約・カスタマイズ | 3-6ヶ月 | 30-150万円 |

### 6.3 参入障壁の自己評価
| 要素 | 障壁の高さ | 備考 |
|---|---|---|
| データそのもの | 低 | 全て公的オープンデータ、誰でも取得可能 |
| ETLパイプライン構築 | 中 | 8厚生局×県別Excel手動DL+パース=数日の工数 |
| スコアリングエンジン | 中〜高 | 9因子の設計・重み調整は独自ノウハウ |
| UI/UX | 中 | 2日で構築→模倣も容易だが7ビュー統合は工数大 |
| データ鮮度の維持 | 中 | 年1-2回の更新サイクル、GitHub Actions半自動化可能 |


---

## 7. アーキテクチャ上の意思決定と自覚しているトレードオフ

| 決定 | 理由 | トレードオフ |
|---|---|---|
| SQLite → Static JSON配信 | Vercel Serverless制約（DB接続不安定）+ Edge配信速度 | データ更新にETL再実行+再デプロイが必要 |
| 単一page.js（705行） | 開発速度優先（2日で7ビュー構築） | 保守性・テスタビリティの犠牲 |
| Google Maps iframe | APIキー不要で即実装 | マーカー/クラスタリング不可 |
| 施設基準の手動DL | 厚生局サーバーがcurlをブロック | 自動更新パイプライン構築不可（現時点） |
| 9因子の経験的重み設定 | ドメイン知識ベース | 統計的バリデーション未実施 |
| compact JSON (15MB) | 全施設データをクライアント配信 | 初回ロード重い、ページネーション制御はクライアント側 |

---

## 8. ChatGPTへの評価依頼事項

以下の観点でMECEに評価・提言してほしい:

### A. 実装品質
1. アーキテクチャ選択（Static JSON配信 vs DB接続 vs BaaS）の妥当性
2. 単一page.js 705行のリファクタリング戦略
3. パフォーマンス（15MB JSON配信、クライアントサイドフィルタリング）
4. セキュリティ（API認証なし、オープンデータ配信のリスク）

### B. データ戦略
1. オープンデータだけで構築した参入障壁の持続可能性
2. スコアリングエンジンの重み設定に対する統計的アプローチの提案
3. DPC非参加施設（94%）のスコア精度改善策
4. データ鮮度維持の自動化戦略

### C. プロダクト戦略
1. Pottech対比での差別化ポイントの評価
2. 収益化モデルの優先順位と妥当性
3. ターゲット顧客セグメントの絞り込み
4. MVP→PMF到達への最短パス

### D. 技術的改善の優先順位
1. 次に実装すべき機能（CRM? レポート出力? API認証?）
2. 技術的負債の返済順序（コンポーネント分割? DB移行? テスト?）
3. スケーラビリティへの準備（ユーザー数増加時の対応）

---

## 参考リンク
- **本番サイト**: https://medical-intelligence-two.vercel.app
- **GitHub**: https://github.com/tomiyuta/medical-intelligence
- **設計仕様書**: https://github.com/tomiyuta/medical-intelligence/blob/main/docs/DESIGN_SPEC.md
- **競合LP**: https://hospital-crm.pottech.jp/lp
