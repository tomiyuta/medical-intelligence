# MedIntel 引継書 — 2026-04-28

## プロジェクト基本情報

- **本番URL**: <https://medical-intelligence-two.vercel.app>
- **GitHub**: <https://github.com/tomiyuta/medical-intelligence> (public)
- **ローカル**: `~/Projects/medical-intelligence/`
- **HEAD**: ca42340 (Phase 2A: Bridge v1 UI圧縮 + interpretation link)
- **フレームワーク**: Next.js 14 App Router + Vercel + SQLite (25テーブル/1,227,835行) + Static JSON (27ファイル/\~52MB)

---

## 本セッションで完了した作業

#作業コミット1Phase A: サイト目的変更(タイトル/ナビ/ScoringViewリブランド)b5ec5ad2Phase C: 3層ナビ構造 + 年齢ピラミッド239c7113fix: がん死亡率0表示(VITAL_MAP名称不一致)e1374eb4fix: AreaView死因構造非表示(c.short/c.deaths→c.cause/c.rate)72ad5cb5NDB 2.0: 5レイヤー都道府県医療プロファイル全面再構築a58215f6処方薬初期フェッチ + DRUG_DOMAIN 16→28薬効分類拡充72efa677特定健診質問票ETL(喫煙/体重/運動/歩行/夕食 5問)a82f7bc8全国平均Δ比較 + Gap Finder(喫煙率×がん死亡率scatter)7dff10a9診療行為データクリーンアップ(D/E/K不整合72件削除)eb1e7fa10全ビュー都道府県連動(globalPrefグローバル化)047a28f

---
## 現在のサイト構成(7ビュー)

```
MedIntel — 日本の医療と高齢社会
── 社会構造 ──
  ① 高齢社会 概況 (MapView) — choropleth 7指標
  ② 人口動態・将来推計 (MuniView) — 住基2025+社人研2050+年齢ピラミッド
── 疾患・診療 ──
  ③ 医療圏・疾病構造 (AreaView) — 330医療圏(R6)+死因BarChart
  ④ 医療プロファイル (NdbView) — 5レイヤー都道府県医療健康診断書+Gap Finder
── 医療インフラ (2ビュー再構成 後述) ──
  ⑤ 地域医療構想・病床機能 (RegionalBedFunctionView) — R6機能区分 + 75+人口あたり供給 + 地域類型5分類
  ⑥ 施設エクスプローラ (FacilityExplorerView) — 届出/DPC/スコア説明 3タブ + capability主軸 + Google Maps iframe統合

```

## NdbView 5レイヤー構造

#レイヤーデータソース① 根因生活習慣リスク(5指標+全国Δ)NDB質問票② リスク健診リスク(3指標男女別)NDB特定健診③ 需要医療利用(3区分+per capita)NDB診療行為④ 治療疾患領域別+処方薬Top10NDB処方薬⑤ 結果死因構造(14死因)人口動態統計⑥ Gap喫煙率×がん死亡率scatter複合

---

## 次に実装すべきタスク(優先順)

### ✅ Priority 2: Gap Finder テンプレート化 — 完了 (6ba98cb)

**8テンプレ実装** (HANDOFF原案の6→8に拡充。既存データのみで完結):

| # | テンプレ | X軸 | Y軸 | xInverse |
|---|---|---|---|---|
| T1 | 喫煙×がん死亡 | ndbQ.smoking | causes.がん | false |
| T2 | 高齢化×在宅医療 | aging率 | C_在宅医療/10万 | false |
| T3 | 運動不足×心疾患死亡 | ndbQ.exercise | causes.心疾患 | **true** |
| T4 | 体重増加×糖尿病死亡 | ndbQ.weight_gain | causes.糖尿病 | false |
| T5 | 歩行不足×老衰 | ndbQ.walking | causes.老衰 | **true** |
| T6 | 夕食遅×高血圧死亡 | ndbQ.late_dinner | causes.高血圧性疾患 | false |
| T7 | 高齢化×外来受診 | aging率 | A_初再診料/10万 | false |
| T8 | eGFR×腎不全死亡 | ndbHc.eGFR平均 | causes.腎不全 | **true** |

**実装ポイント**:

- `GAP_TEMPLATES` 配列で軸定義を完全外部化、`xInverse` フラグで色判定/象限矩形/象限ラベル位置を反転
- `prefMaps` で全47都道府県の aging/diag/egfr を事前計算（O(n)→O(1) lookup）
- ピアソン相関係数 r をヘッダ表示
- 相関≠因果の注釈を強化（個人因果との混同警告）

**未対応の旧Priority 2項目**: HbA1c×糖尿病薬, 血圧/LDL×心疾患, 脳血管×リハ供給, がん死亡×がん治療供給 → NDB検査値ETL実装後の課題に再分類

### Priority 3: NDB質問票 追加 — 完了 (fd32f31)

**3問追加** (5問/22問 → 8問/22問):

- Q18 飲酒頻度 → `drinking_daily` (毎日% / 全回答)
- Q19 飲酒量 → `heavy_drinker` (2合以上% / 飲酒者中)
- Q20 睡眠 → `sleep_ok` (はい% / 全回答, xInverse対象)

**実装ポイント**:

- ETL: `scripts/etl_questionnaire_q18_q20.py` (再現可能・冪等)
- 男中計+女中計で全年齢層集計
- Layer 1 inverse対応: 運動/歩行/睡眠充足は色判定反転（既存バグ同時修正）
- GAP_TEMPLATES 8→11拡充: 毎日飲酒×心疾患 / 高量飲酒×肝疾患 / 睡眠充足×心疾患

### Priority 4: NdbView内に人口KPI追加 — 完了 (8e09221)

**5KPI実装** (人口・高齢化に限定 — 医師数/病床数/受診率は意図的に除外):

- 総人口 (住基2025年1月実測)
- 65歳以上割合 + 全国Δ
- 75歳以上割合 + 全国Δ + 47都道府県中順位
- 85歳以上割合 + 全国Δ
- 2050年人口変化率 (2020比) + 2050年75+割合

**実装ポイント**:

- データ: `agePyramid` (住基2025) + `futureDemo` (社人研, 2020-2050)
- 21階級の年齢帯から 65+ (idx 13+)/75+ (idx 15+)/85+ (idx 17+) を集計
- 全国基準: 47都道府県の人口加重平均
- 自動解釈文: 75+ Δ全国 (&gt;1.5pt / &lt;-1.5pt / 中間) で3分岐
- データ意味バッジ: 各レイヤーに分類タグ (生活習慣/検査値/医療利用量/治療代理/結果)

**サニティチェック例** (2025年実測):

- 秋田県 75+=22.0% (#1, +5.4pt) / 2050年-41.6%
- 沖縄県 75+=11.6% (#47, -5.0pt) / 2050年-5.2%
- 東京都 75+=13.1% (#46, -3.5pt) / 2050年+2.5%（唯一の増加見込み）

### Priority 5: 病床機能報告 令和6年度更新 — 完了 (52cbcef + UI注記追加)

**データ更新**: 令和元年度 (R1=2019) → 令和6年度 (R6=2024) — 5年分の刷新

**実装ポイント**:

- ETL: `scripts/etl_bed_function_r6.py` (再現可能)
- R6スキーマ変更対応: 様式1\_病棟票×7地域ファイル統合
  - col 2=都道府県 / col 3=医療圏コード / col 4=医療圏名
- col 18=一般病床許可 / col 22=療養病床許可
- 集計: hosp(医療機関ユニーク数) / wards(病棟行数) / beds(一般+療養許可床)
- 339医療圏 → 330医療圏 (秋田県等の地域医療構想による圏域統合反映)
- 出典ラベル: AreaView を「令和6年度 2025/9/30公表」に更新
- バックアップ: `medical_areas_national_R1_backup.json` 保存

**全国合計 R1 → R6**:

指標R1 (2019)R6 (2024)備考医療機関数7,1376,926-211 (集約進行)病棟数28,68827,723-965許可病床数883,5251,151,401+267,876 (※)

(※) R1総床数883k は 一般+療養 として明らかに過少 (実際は \~1.1-1.2M レンジ)。R6の1,151kが標準値域。これはR1旧ETLの集計漏れの可能性が高く、実際の床数減少を意味するものではない。

**圏域統合の影響範囲 (sanity check 実施済み)**:

- 秋田県 (05): 8圏域 → 3圏域 (県北/県央/県南)
- 三重県 (24): 7圏域 → 4圏域 (北勢/中勢伊賀/南勢志摩/東紀州) ※東紀州は単独で残存
- その他45都道府県は無変更。既存ハードコード参照 `demoArea='区中央部'` も R6 で存続確認済

---

### ⚠️ R6 病床機能データ運用ルール（重要・継承事項）

1. **R6は「現況把握用」として表示** — UIに注記済み（AreaView 出典ラベル下）
2. **R1→R6 床数差はETL差分疑い** — 時系列比較・推移グラフには絶対に使わない
3. **過去データとの集計処理差**: R1旧ETLは過少集計の可能性。現時点でR1再集計は未実施
4. **新規UIで時系列を出す場合**: R6以降の単年データのみ、または再集計済みR1のみを使用
### 🔍 次セッション冒頭 sanity check（Priority 6 着手前に必須・1ステップで完了）

R6データの品質を再確認するため、Priority 6 開始前に以下5項目を実施:

1. 都道府県別総床数ランキングが常識的か（北海道・東京・大阪が上位、鳥取・福井・島根が下位の想定）
2. 病床機能区分の合計が許可病床数と乖離していないか ※高度急性期/急性期/回復期/慢性期は様式1の他カラムに存在、現在は未集計のため要確認
3. 医療圏数330が都道府県別に妥当か（47都道府県全部で1+圏域あるか）
4. 秋田・三重のUIで圏域選択が破綻しないか（旧圏域名がデフォルト値・ハードコードされていないか）— 主要箇所はチェック済み
5. R1由来の古い医療圏名を参照しているコンポーネントが残っていないか — `demoArea='区中央部'` は問題なし、その他要監査

検証スクリプト: `scripts/sanity_check_r6.py` (基本5項目) + `scripts/sanity_check2_func_full.py` (機能区分整合確認)

#### ✅ Sanity Check 実施結果（2026-04-28）

| # | 項目 | 結果 | 備考 |
|---|---|---|---|
| 1 | 都道府県別総床数ランキング | ✅ PASS | TOP5: 東京/大阪/北海道/福岡/神奈川 / BOTTOM5: 鳥取/島根/福井/山梨/徳島 |
| 2 | 機能区分合計と圏域合計の整合 | ✅ PASS | 全国 27,723病棟 / 1,151,401床 完全一致(Δ=0) |
| 3 | 医療圏数の都道府県別妥当性 | ✅ PASS | 47/47県カバー、合計330一致、最少3(秋田) / 最多21(北海道) |
| 4 | 秋田・三重UI整合 | ✅ PASS | 三重は7→**4**圏域(東紀州が残存) — HANDOFF修正済 |
| 5 | 古いキー参照スキャン | ✅ PASS | 削除された15圏域名のJS/JSXハードコード参照なし |

#### 機能区分内訳（R6 全国, 2024年7月1日時点）

| 機能区分 | 病棟数 | 床数 | シェア |
|---|---|---|---|
| 高度急性期 | 5,717 | 157,575 | 13.7% |
| 急性期 | 10,770 | 478,204 | 41.5% |
| 回復期 | 4,312 | 197,364 | 17.1% |
| 慢性期 | 6,100 | 290,364 | 25.2% |
| 4機能合計 | 26,899 | 1,123,507 | 97.6% |
| 休棟中(再開予定) | 648 | 22,365 | 1.9% |
| 休棟中(廃止予定) | 176 | 5,529 | 0.5% |

→ 機能区分は様式1 col 15 から取得可能。AreaView または別レイヤーへの追加は将来タスクとして候補。

検証スクリプト雛形:

```bash
cd ~/Projects/medical-intelligence
python3 -c "
import json
from collections import defaultdict
r6 = json.load(open('data/static/medical_areas_national.json'))
by_pref = defaultdict(lambda: {'h':0,'w':0,'b':0})
for d in r6:
    by_pref[d['pref']]['h'] += d['hosp']
    by_pref[d['pref']]['w'] += d['wards']
```
by_pref[d['pref']]['b'] += d['beds']
```

ranked = sorted(by_pref.items(), key=lambda x: -x\[1\]\['b'\]) print('全47都道府県:', len(by_pref)) for p, v in ranked\[:5\] + \[('---',{'h':0,'w':0,'b':0})\] + ranked\[-5:\]: print(f'{p}: h={v\["h"\]} w={v\["w"\]} b={v\["b"\]:,}') "

```

---

### Priority 6: 患者調査（令和5年・受療率・大分類限定）— 完了 (phase6)

**実装内容**:

- ETL: `scripts/etl_patient_survey_r5.py` (再現可能・冪等)
  - 出典: 厚労省 令和5年患者調査 都道府県編 第39表（2024-12-20公表）
  - 対象: 都道府県 × 傷病大分類(21) × 入院/外来 の受療率（人口10万対）
  - 留意点修正: e-Stat T39 はpref名suffix省略 (`京都`/`東京`等) → `_strip_suffix()`で対応
- API: `app/api/patient-survey/route.js` 新設
- データ: `data/static/patient_survey_r5.json` (213KB, 48エントリ=47都道府県+全国 × 21 大分類)
- UI統合: NdbView の **Layer 2.5「需要 — 受療率」**（健診リスクと医療利用の間）
  - 入院/外来 トグル（デフォルト外来）
  - 都道府県全体総数 + 全国比 % 表示
  - 大分類 Top 7 を横棒グラフで可視化（全国比 % delta 付き）
  - データ意味バッジ「需要・標本推計」(rose色)
  - 注釈: 「NDB（供給）とは異なり、患者住所地ベースの標本推計」を明記

**スコープ厳守確認**:

- ✅ 受療率（人口10万対）のみ採用 — 推計患者数の絶対値は前面表示せず
- ✅ 大分類のみ（21項目）— 中・小分類は不採用
- ✅ 「疾患別罹患率」という表現は使用せず「受療率」で統一
- ✅ 都道府県粒度のみ — 二次医療圏推定は行わず

**サニティチェック結果**:

- 全国 入院=945 / 外来=5850 (人口10万対) — 公表値と完全一致
- 高知県 入院=1785 (全国の1.89倍) — 高齢化率が高く慢性期需要が大きい既知パターン
- 東京都 入院=671 / 外来=5569 — 入院は全国より少ないが外来はほぼ全国並 (大都市の通院アクセス性)
- 京都府 入院=917 / 外来=4867 — 全国並

### ScoringView v2: 病院機能プロファイル再設計 — 完了 (out-of-band)

**経緯**: ユーザ指示「病院機能プロファイルに関しても現状に即した再設計行え」により実施。Priority番号外の臨時タスク。

**問題分析（再設計の根拠）**:

- 旧版は priority_score 1値のみ表示で、9因子の謳い文句に対しUIが追いついていない
- 都道府県連動なし（globalPref孤立）— 047a28f の整合性破綻
- R6 col15 の機能区分（高度急性期/急性期/回復期/慢性期）未活用
- P6（患者調査受療率）との接続なし

**新3レイヤー構造**:

- **Layer A: 機能区分構成** — R6病床機能報告 col15 から都道府県別の床数シェア + 全国Δ + 100% stacked bar + 解釈ヒント自動生成
- **Layer B: 規模分布(Tier)** — 既存Tier集計（全国2,802施設）をデータ意味バッジ付きで再配置
- **Layer C: 高機能施設一覧(Tier S)** — 都道府県絞り対応、疾病フィルタ＋検索＋CSV/PDF保持

**ETL拡張**: `scripts/etl_bed_function_r6_func.py` 新設

- col15 の機能区分を都道府県別×4機能で集計
- 出力: `data/static/bed_function_by_pref.json` (国・47都道府県の機能配分)
- バリデーション: 全国総床数 1,151,401 (P5 ETLと完全一致)

**API**: `app/api/bed-function/route.js` 新設

**サニティ抜粋（Layer A 動作確認）**:

| 都道府県 | 高度急性期 | 急性期 | 回復期 | 慢性期 | 解釈 |
|---|---|---|---|---|---|
| 全国 | 13.8% | 41.7% | 17.2% | 25.3% | 基準 |
| 東京都 | 21.7% | 41.6% | 14.4% | 20.0% | 大都市型・高機能集中 |
| 高知県 | 8.1% | 34.9% | 14.6% | **41.4%** | 高齢化・慢性期偏重 |
| 秋田県 | 6.4% | **51.4%** | 15.9% | 22.4% | 急性期偏重・回復期不足懸念 |

**スコープ外（Phase 2課題）**:

- 9因子の内訳UI（priority_score の構成要素分解）
- 患者調査P6との供給-需要マッピング
- 疾病領域別 capability マッピング（がん/循環器など）

---

### 医療インフラ 2ビュー再構成 — 完了 (out-of-band, peer review feedback反映)

**経緯**: 仕様書(`docs/SPEC_医療インフラ.md`)のpeer review (ChatGPT) で「3ビューの政策評価/施設探索の混在」「Tier主役問題」「GeoMap機能薄」が指摘され、Option A 改 (2ビュー構成) を採択。

**構造変更**:

旧 → 新:
- ⑤病院機能 (ScoringView v2) → ⑤地域医療構想・病床機能 (RegionalBedFunctionView)
- ⑥施設基準 (KijunView) → ⑥施設エクスプローラ (FacilityExplorerView)
- ⑦施設マップ (GeoMapView) → ⑥詳細パネル内 Google Maps iframe に吸収

**新 ⑤ RegionalBedFunctionView**:

- KPI 5指標: 総床数 / 病棟数 / 75歳以上人口 / 75+あたり病床数 / 全国シェア
- Layer A: 機能区分構成 (旧ScoringView Layer Aを継承)
- 地域類型 5分類 (供給薄型/大都市・高機能集中型/急性期偏重型/高齢化・慢性期型/回復期補完型)
  - 優先順位評価で1パターン採択。供給薄型(75+あたり病床<0.85倍全国)を最優先で警告
- 需要との接続 placeholder (Phase 2)

**新 ⑥ FacilityExplorerView**:

- タブ構成: 届出ベース / DPC・高機能 / スコア説明
- capability主軸 (10カテゴリ) + Tier補助列の方針
- 詳細パネルに Google Maps iframe 統合 (geo座標優先, 住所fallback)
- スコア説明タブ: priority_score の透明性ノート + 9因子未文書化を Phase 2 課題として明記
- topFac fetch 上限 25 → 500 (Tier S+A 全部 + Tier B 一部カバー)

**設計原則の変更**:

- Tier主役 → capability主軸 ("Tier S施設一覧"ではなく"がん/循環器/急性期...から探す")
- 9因子内製スコアは「内製複合指標」バッジ付与し、公式ランキング誤解を防止
- ナビ7→6ビュー (sole developer のため学習コスト無視)

**削除されたファイル** (git履歴で参照可能):

- `app/components/views/ScoringView.jsx` (107→275行 → 削除)
- `app/components/views/KijunView.jsx` (151行 → 削除)
- `app/components/views/GeoMapView.jsx` (71行 → 削除)

**Phase 2 課題** (peer reviewから明確化):

1. priority_score 9因子の構成式・重み開示 (`priority_score_methodology.md` 別途作成)
2. 患者調査21大分類との接続 (supply-demand mapping)
3. 真の地図UI (Leaflet等) — 現状はGoogle Maps iframe
4. 地域医療構想レーダー / 高齢化×病床機能マトリクス / Acute-to-Home Ladder 等の可視化

---

### 医療インフラ Phase 1 改善 — 完了 (peer review feedback反映)

**経緯**: 2ビュー再構成 commit `90c7a11` 後の peer review (ChatGPT) で以下3点が次の最優先課題として指摘:
1. FacilityExplorer Tab 2 (DPC・高機能) の100件slice問題 → 地方Tier B施設の取りこぼしリスク
2. priority_score/Tier の透明性が暫定 → 早期文書化が必要
3. RegionalBedFunctionView の地域類型・時点差注記が断定調

**Priority 1: FacilityExplorer pagination化**:
- API limit上限 200 → 3,000 (`app/api/facilities/route.js`)
- page.js fetch limit 500 → 3,000 (全2,802施設フルカバー)
- Tab 2 に25件/ページpagination追加 (Tab 1と同パターン)
- 0件時の文言改善: "該当する施設がありません ({n}施設のキャッシュから絞り込み中)"
- filter変更時に dpcPage を 0 リセット
- フッタ注記: "全{n}施設(Tier S=22 / A=280 / B=2,500)から絞込み {filtered} 件"

**Priority 2: priority_score_methodology.md 文書化** (240行):
- 経路: `docs/priority_score_methodology.md`
- 内容:
  - Tier境界の実測逆算 (S≥60.0 / A:45.0-59.9 / B:30.0-44.9 / C/D範囲外)
  - 構成因子の相関分析 (Pearson r):
    - annual_cases r=0.877 (最大)
    - total_beds r=0.804
    - cap_sum r=0.547
    - is_dpc_participant r=0.511
    - avg_los r=0.155
    - case_growth_pct r=0.023 (ほぼ無)
  - **重要発見**: priority_score は実質的に「規模スコア」(annual_cases + total_beds で大半説明)
  - 偏向リスク明記: 専門特化型小病院・在宅慢性期型病院が過小評価される傾向
  - 9因子と謳うが実 signal は 4-5因子のみ
  - 加点ロジック推測 (reasons配列頻度より): DPC参加55%/200床超40%/短期在院36%等
  - 欠損 imputation policy 推測
- FacilityExplorer Tab 3 (スコア説明) からリンク

**Priority 3: RegionalBedFunctionView 注記強化**:
- 地域類型ラベル: 断定調 → 推定表現 ("供給薄型" → "供給薄型の可能性")
  - "急性期偏重型" → "急性期偏重型の傾向"
  - "高齢化・慢性期型" → "高齢化・慢性期型の傾向"
  - "回復期補完型" → "回復期補完型の傾向"
- 「データの取扱いについて」黄色注記カード追加 (3点):
  1. 自己申告ベース (機能区分は施設の主観で実患者構成と乖離可能性)
  2. 時点差 (病床機能=2024/7/1 vs 人口=住基2025/1)
  3. 地域類型は暫定ルール (z-score化はPhase 2)
- KPI「75+あたり病床数」のサブラベルに "※年次差あり" 追記

**QA Checklist (peer reviewerの10項目)**:
- ✅ #1 ナビ6ビューで破綻なし (Nav icon=6 hits)
- ✅ #2 globalPref連動 (regPref/kijunPref → globalPref経由)
- ✅ #3 旧Scoring/Kijun/GeoMapのimport残骸なし (コメント内記述のみ=履歴記録)
- ⚠️ #4 mobile幅 — code review上はOK (物理確認は要 user)
- ✅ #5 Geo座標あり時 lat/lng iframe表示
- ✅ #6 Geoなし時 住所文字列でGoogle Maps検索 fallback
- ✅ #7 capability + tier filter 同時適用ロジック (Tab1/2両方確認)
- ✅ #8 pagination化で「該当なし」誤表示解消
- ✅ #9 内製複合指標バッジ3箇所 + Tab3警告
- ✅ #10 HANDOFF/SPEC/UI 名称整合 (本commitで完了)

**Phase 2 残課題** (peer reviewから):
1. priority_score の式・重みを内部実装からエクスポート (現在は逆算のみ)
2. Tier境界の統計的根拠 (z-score / percentile化)
3. priority_score < 30 施設 (Tier C/D相当) の取り込み — 現状は範囲外
4. アウトカム指標 (死亡率・再入院率) の追加
5. 真の地図UI (Leaflet/Mapbox)
6. 地域医療構想レーダー / Acute-to-Home Ladder 可視化
7. 患者調査21大分類との供給-需要 mapping

---

### Supply-Demand Bridge v0 — 完了 (peer review feedback反映)

**経緯**: 2ビュー再構成 + Phase 1 改善後の peer review で「次の本命は supply-demand mapping v0」と指示。

**配置**: NdbView **Layer 6** (最下部, 既存5レイヤー + Gap Finder の後)

**対象3領域**:

| 領域 | リスク | 疾病負荷 | 医療利用 | 供給proxy | 結果 |
|---|---|---|---|---|---|
| 循環器 ❤️ | 喫煙率 (NDB質問票) | 循環器系受療率(外来) | Phase 2 | 高度急性期+急性期 床シェア | 心疾患 死亡率 |
| 糖尿病・代謝 🍰 | 体重増加 (NDB質問票) | 内分泌・栄養・代謝 受療率 | Phase 2 | **proxy未整備** | 糖尿病 死亡率 |
| がん 🎗️ | 喫煙率 | 新生物 受療率 | Phase 2 | 高度急性期 床シェア | 悪性新生物 死亡率 |

**実装ファイル**:
- `lib/domainMapping.js` (142行): DOMAIN_MAPPING + describeDelta + DATA_BADGE
- `app/components/views/DomainSupplyDemandBridge.jsx` (164行): 3領域横並びテーブル
- `app/components/views/NdbView.jsx`: Layer 6 として統合 (props経由でデータ受領)
- `app/page.js`: bedFunc を NdbView に伝達 (既存agePyramid/patientSurvey等と並列)

**v0 の制約 (peer review固定仕様)**:
- ❌ Gap Score 化なし (横並び表示のみ)
- ❌ 「罹患率」表現なし (受療率で統一)
- ❌ 「供給不足」断定なし (「全国平均より低い」「proxy未整備」で表現)
- ❌ 糖尿病の supply は無理に capability化せず、正直に「未整備」表示
- ❌ 4領域以降は v0 範囲外 (がん/循環器/糖尿病・代謝のみ)
- ❌ z-score未実装 (自然言語化のみ: ±5%未満=同程度 / ±15%以上=顕著)

**データ意味バッジ** (NdbViewパターンに統合):
- 生活習慣リスク (青) / 受療率 (rose) / 医療利用量 (cyan) / 供給proxy (amber) / 結果指標 (red)

**設計上の重要決定**:
1. **医療利用列は Phase 2 で詳細化**: NDB処方薬の薬効分類対応辞書整備が前提。v0 では「Phase 2 で詳細化」と表示
2. **ndbQ の全国値計算**: ndb_questionnaire.json には '全国' エントリがない (都道府県判別不可のみ) → 47都道府県の単純平均を全国代理として実装
3. **供給proxy明示**: 「※循環器専用ではない急性期供給proxy」「※がん専用ではない高機能急性期proxy」等の注記でmisreadingを防止

**サニティ抜粋 (東京都での動作確認)**:
- 循環器: 供給=63.3% (全国55.2%, +14.7% **顕著に高い**), 結果=153.3 (全国188.2, **顕著に低い**) — 大都市・若年人口の整合
- がん: 供給=21.7% (全国13.7%, +58% **顕著に高い**), 結果=257.1 (全国319.3, **顕著に低い**) — 高機能集積パターン
- 糖尿病・代謝: 結果=9.7 (全国12.4, -22% **顕著に低い**) — 大都市健康指標

**Phase 2 残課題** (v1 候補):
1. ~~「医療利用」列の精緻化 (NDB処方薬 → 領域別薬効集計)~~ ← **完了 (後続commit)**
2. 4領域以降への拡張 (脳血管, 呼吸器, 精神, 整形・リハ等)
3. 疾患別 capability 対応辞書化 (例: cap.oncology→がん, cap.acute+cap.rehab→脳血管)
4. Gap Score 化 (リスク高×受療低 などのアラート)
5. 二次医療圏粒度 (現在は都道府県のみ)

### NDB処方薬ドメイン辞書 v0 — 完了 (peer review feedback反映)

**経緯**: Supply-Demand Bridge v0 (commit 1c015a4) の「医療利用」列が Phase 2 placeholder のままだったため、レビューで次の最優先課題として指定。レビューによる重要修正: **raw qty ではなく人口10万対補正必須**。

**薬効分類マッピング (v0)**:
| 領域 | NDB薬効分類codes | 内訳 |
|---|---|---|
| 循環器 | 214 / 218 / 333 | 血圧降下剤 + 高脂血症用剤 + 血液凝固阻止剤 |
| 糖尿病・代謝 | 396 | 糖尿病用剤 (インスリン等別分類は v1) |
| がん | 421 / 422 / 423 / 424 / 429 | アルキル化剤 + 代謝拮抗剤 + 抗腫瘍性抗生物質(データ無) + 抗腫瘍性植物成分製剤 + その他腫瘍用薬 |

**人口10万対補正**: `proxy = 都道府県別qty合計 / agePyramid人口合計 × 100000`
- 人口データは `age_pyramid.json` の `prefectures` から男+女 21年齢帯合計
- 47都道府県の proxy値の単純平均を「47都道府県平均」として比較基準に使用 (ndbRxに全国集計値なし)

**実装ファイル変更**:
- `lib/domainMapping.js`: 各領域の `utilization: null` → `utilization: { codes, codeLabels, label, basis, note, direction }` 追加
- `app/components/views/DomainSupplyDemandBridge.jsx`:
  - props追加: `ndbRx`, `agePyramid`
  - ヘルパー: `computePop` / `computeRxProxy` / `compute47Avg`
  - getCell `utilization` 分岐追加 (refLabel='47都道府県平均')
  - 数値フォーマット強化 (1000以上カンマ区切り)
  - basisバッジ表示 ([薬効分類ベース], cyan)
  - 「医療利用」列を Phase 2 placeholder から実値表示に切替
- `app/components/views/NdbView.jsx`: Bridge へ ndbRx + agePyramid 伝達

**Sanity検証 (人口10万対 / 47都道府県平均比)**:

| 領域 | 47県平均 | 東京都 | 大阪府 | 高知県 | 沖縄県 | 北海道 |
|---|---|---|---|---|---|---|
| 循環器 (214/218/333) | 974,797 | -23.4% | -17.9% | **+50.8%** | **-35.2%** | +16.2% |
| 糖尿病 (396) | 455,950 | -3.5% | -14.2% | **+86.7%** | **-71.5%** | +19.8% |
| がん (421-429) | 28,610 | +3.1% | -0.0% | +15.6% | -15.6% | -7.0% |

**興味深い発見**:
1. **沖縄県の糖尿病薬-71.5%** — 沖縄は糖尿病有病率高いはずだが処方量が極端に少ない。受療率/治療パターン地域差を示唆 (要追加検証)
2. **高知県の循環器薬+50.8% / 糖尿病薬+86.7%** — 高齢化県の処方パターン顕著
3. **がんの地域差は最小** (±15.6% 範囲) — 腫瘍用薬は地域差が小さい

**v0 の制約**:
- ❌ raw qty 比較禁止 → ✅ 人口10万対補正で対応
- ❌ 薬剤名部分一致禁止 → ✅ 薬効分類codeベース
- ❌ 制吐薬・鎮痛薬・G-CSF をがん治療proxy に含めない (支持療法ノイズ除外)
- ❌ 「処方薬proxy = 疾患患者数」表現禁止 → ✅ note明示「疾患患者数ではない」
- 423 (抗腫瘍性抗生物質) は NDB公開データ未収載 → coddeLabelで「データ無」明記
- 424 (抗腫瘍性植物成分製剤) は 24県分のみ → 該当県のみ加算
- 比較基準: 47都道府県平均(人口非加重) — UI上で明示

**UI表示** (各セル):
- 値: `746,860 /人口10万対`
- 比較: `47都道府県平均より顕著に低い (-23.4%)`
- バッジ1: 治療proxy (cyan from DATA_BADGE)
- バッジ2: 薬効分類ベース (cyan small)
- 注記: 「降圧薬・脂質異常症薬・抗血栓薬の処方量proxy。循環器疾患患者数そのものではありません。」

**Phase 2 残課題**:
1. 4領域以降への拡張 (脳血管 → cap.acute+cap.rehab+vitalStats脳血管疾患, 等)
2. 疾患別 capability 対応辞書化
3. Gap Score 化
4. 二次医療圏粒度
5. インスリン等の薬剤名ベース補正 (糖尿病・代謝)

---

### Bridge v0 FROZEN — 完了 (peer review feedback反映)

**経緯**: 処方薬proxy追加 (commit 475a174) 後の peer review で「次は機能追加ではなく3領域レビュー固定」と指示。Bridge v0 を仮説生成装置として位置づけ、構造を frozen 化。

**実施事項**:

1. **5県体系比較** (東京/大阪/高知/沖縄/北海道) を完了:
   - リスク × 受療率 × 処方proxy × 供給 × 結果 を各領域 × 5県でクロス集計
   - 結果は `docs/BRIDGE_V0_INTERPRETATION.md` (219行) に記録

2. **4つの主要仮説抽出**:
   - 仮説1: **沖縄県の糖尿病パラドックス** — リスク+23%(最高)/受療率-47%/処方-72%/結果-11%。Phase 2で5要因(受療構造/分類漏れ/年齢構成/アクセス/データ仕様)の検証要
   - 仮説2: **北海道の喫煙率と結果** — 喫煙+27%突出 → 循環器+16% / がん死亡+28%
   - 仮説3: **高知県の高齢化パターン** — 循環器処方+51% / 糖尿病処方+87% / 結果上昇は粗死亡率の年齢構成影響
   - 仮説4: **東京の大都市・高機能・若年型** — 高機能集積は事実だが死亡率低は若年人口主因

3. **lib/domainMapping.js 冒頭に FROZEN 宣言** (commit 475a174時点で固定):
   - 3領域の risk/demand/utilization/supply/outcome キー構造変更不可
   - codes/keys の追加・削除・差し替え不可
   - 変更には FROZEN 解除 commit + interpretation notes 更新が必須
   - 許可: note/proxyLabel/label 文言調整, describeDelta閾値調整

4. **薬効分類数量proxy 注記追加** (peer review推奨):
   - "処方数量は薬効分類別数量の合算であり、薬剤単位・剤形・用量差を含みます。治療人数や患者数ではありません。"
   - Bridge UI の v0 制約パネルに1行追加

5. **UI バッジ追加**:
   - Bridge ヘッダに `🔒 v0 FROZEN` (緑色) バッジを追加
   - 既存 `3領域・横並び` バッジの隣

**Bridge v0 の位置づけ (peer review固定)**:
- ✅ 仮説生成装置 (hypothesis generator)
- ❌ 異常検出システム (anomaly detector)
- 単純な「整合」「不整合」断定はしない
- 「リスク高×受療低」「受療低×処方高」等は仮説候補として扱う

**v0 構造的限界 (interpretation notesに記録)**:
1. 数量合算の限界 (薬剤単位・剤形・用量差を含む)
2. 比較基準の人口非加重性 (47県単純平均)
3. 結果指標は粗死亡率 (年齢調整前)
4. 供給proxyの非疾患専用性 (cap.surgery は循環器/整形外科混在)
5. 「医療利用」=外来処方薬中心 (入院・処置・手術・放射線未含)

**v1 拡張ロードマップ** (FROZEN期間中の禁止事項あり):
1. 4領域目: **脳血管** (cap.acute+cap.rehab + vitalStats脳血管疾患)
2. 5領域目: **呼吸器** (Ⅹ_呼吸器系 + 肺炎+誤嚥性肺炎 + 喫煙)
3. 6領域目: **腎疾患** (eGFR + 腎不全 + 糖尿病合併)
4. 後回し: 精神・神経 / 整形・リハ (proxy困難)

**FROZEN期間中の禁止事項**:
- ❌ Gap Score 化
- ❌ 二次医療圏粒度化
- ❌ 薬剤名ベース全自動分類
- ❌ 21大分類への一気拡張
- ❌ インスリン・GLP-1の部分一致追加 (糖尿病・代謝供給未整備の維持)

---

### Bridge 脳血管 v1 拡張 — 完了 (peer review feedback反映)

**経緯**: v0 FROZEN後 (commit d5e1cff)、レビューで「次は A. 脳血管 v1 拡張」と指示。
合わせて FROZEN 文言補正(医学的正解の確定ではなく現行解釈仕様の固定)も実施。

**FROZEN 文言補正**:
- `lib/domainMapping.js` 冒頭コメント
- `docs/BRIDGE_V0_INTERPRETATION.md` 4章
- `DomainSupplyDemandBridge.jsx` 末尾注記
3箇所すべてで「医学的に正しい構成の確定ではなく現時点の解釈仕様の固定」を明示。

**脳血管領域 v1 仕様 (peer review固定)**:

| 列 | 採用 | 採用しない (理由) |
|---|---|---|
| リスク | 喫煙率 (smoking) | 血圧 (NDB公開未収載), 運動不足はv2 |
| 疾病負荷 | **null + Note** (独立データなし) | Ⅸ_循環器系の流用は誤読リスク |
| 医療利用 | **null + Note** | 抗血栓薬(333) は循環器と重複大 |
| 供給proxy | 高度急性期+急性期+回復期 床シェア | 「脳卒中対応施設」断定 |
| 結果 | 脳血管疾患死亡率 | 医療品質との直接結びつけ |

**重要発見** (実装中):
- 患者調査21分類に「脳血管疾患」**独立カテゴリなし** (Ⅸ_循環器系に統合)
  - レビュー仕様「受療率は患者調査の脳血管疾患を使用」は現データで不可能
  - 誠実な対応: demand=null + demandNote「患者調査では循環器系に統合され独立データなし。Phase 2で詳細表データ調査要」

**5県 Sanity (脳血管 v1)**:
| 県 | 喫煙率 | 供給(高+急+回) | 結果(脳血管死亡率) |
|---|---|---|---|
| 47県/全国 | 22.0% | 72.4% | 85.5 |
| 東京 | -10% | +7% | -27% |
| 大阪 | ±0% | -3% | -22% |
| 高知 | +3% | -20% | **+37%** |
| 沖縄 | -11% | ±0% | -18% |
| 北海道 | **+27%** | -12% | +16% |

**追加3仮説**:
- 仮説5: 高知の脳血管死亡率高+供給薄 (高齢化県の典型)
- 仮説6: 北海道の喫煙×供給薄+結果高 (寒冷気候・食生活交絡注意)
- 仮説7: 大都市(東京/大阪/沖縄)の死亡率低 (若年人口構成主因)

**v1 構造的限界** (interpretation notes 5.4章):
- 5列中 demand/utilization の2列が null表示 (情報量限定)
- 抗血栓薬を採用しないため脳血管特有の治療データなし
- 供給は機能区分床ベースで cap.* 含まない (Bridge UI現実装の制約)
- 脳血管死亡率は心疾患の半分以下 → スケール差を考慮要

**Bridge UI 改善**:
- demand=null 時の表示対応 (黄色 ⚠ 独立データなし + note)
- utilization=null 時も同様 (⚠ proxy未整備 + utilizationNote)
- 末尾注記に脳血管がv1拡張領域(FROZEN範囲外)である旨明示

**4領域目以降の続編 (Phase 2)**:
1. 呼吸器 (Ⅹ_呼吸器系 + 肺炎+誤嚥性肺炎 + 喫煙)
2. 腎疾患 (eGFR + 腎不全 + 糖尿病合併)
3. 沖縄パラドックス検証 (糖尿病 396+249 再集計)
4. 後回し: 精神・神経 / 整形・リハ

---

### Bridge 呼吸器 v1 拡張 — 完了 (peer review feedback反映)

**経緯**: 脳血管 v1 (commit a2e1a60) 後の peer review で「脳血管にv1 experimentalバッジ」+「次は呼吸器」と指示。

**実施事項**:

1. **脳血管・呼吸器に v1 experimental バッジ**:
   - `isExperimental: true` フラグ
   - `experimentalNote` で領域固有の制約説明
   - UI上で領域名隣に「🧪 v1 exp」黄色バッジ表示
   - ユーザーが3領域 (FROZEN) と同等に読まないようにする視覚的区別

2. **呼吸器領域 v1 拡張** (5領域目, FROZEN範囲外):

| 列 | 採用 | 採用しない (理由) |
|---|---|---|
| リスク | 喫煙率 | 「喫煙=COPD多い」断定 |
| 疾病負荷 | Ⅹ_呼吸器系の疾患 受療率(外来) | — |
| 医療利用 | **225 気管支拡張剤のみ** | 222鎮咳/223去たん/224鎮咳去たん (風邪軽症処方支配的) |
| 供給proxy | **null + Note** | 在宅医療(=在宅酸素 と断定リスク) / 病床機能(呼吸器専用ではない) |
| 結果 | **肺炎 + 誤嚥性肺炎** (2行縦並び) | 慢性下気道疾患 (vital_stats未収載) |

3. **outcome 構造拡張**: `additionalCauses` 配列で複数死因を縦並び表示する仕組み追加

**重要発見**:
- 慢性下気道疾患 (COPD等) 死亡率が公開vital_statisticsに**未収載**
- レビュー仕様の3指標のうち2指標 (肺炎・誤嚥性肺炎) のみ取得可能
- 誠実な対応: 2指標をadditionalCausesで個別表示、合算しない

**5県 Sanity (呼吸器 v1)**:

| 県 | 喫煙率 | 受療率 | 処方225 | 肺炎 | 誤嚥性肺炎 |
|---|---|---|---|---|---|
| 47県/全国 | 22.0% | 503 | 46,911 | 66.6 | 52.9 |
| 東京 | -10% | +28% | +10% | -29% | -28% |
| 大阪 | ±0% | +15% | -22% | +19% | +28% |
| 高知 | +3% | -9% | **+68%** | **+65%** | +23% |
| 沖縄 | -11% | -17% | -57% | -35% | -31% |
| 北海道 | **+27%** | **-39%** | **+100%** | +19% | -20% |

**追加4仮説** (interpretation notes §6.3):
- 仮説8: **北海道の処方+100% × 受療率-39% 不整合** — アクセス困難 or COPD多発 or 集計差
- 仮説9: 高知 — 高齢化×呼吸器 (誤嚥性肺炎の整合)
- 仮説10: 東京 — 受療率高×死亡率低 (大都市・若年構成)
- 仮説11: 大阪の処方低×死亡率高 (適切治療の地域差?)

**v1 構造的限界**:
- 慢性下気道疾患データ未収載 → 呼吸器の最重要結果指標が欠落
- 供給proxy空白 (在宅酸素・呼吸器内科は v2 検討)
- 薬剤proxyが225単独 → 軽症呼吸器疾患のシグナルは捕えない
- 肺炎+誤嚥性肺炎の合算解釈リスク (縦並び表示で個別値強調)

**Bridge UI 改善**:
- experimentalNote を領域名セル下部に小さく表示
- additionalCauses は破線(dashed top border)で primaryから分離

**Phase 2 次拡張候補**:
1. 腎疾患 (eGFR + 腎不全 + 糖尿病合併)
2. 沖縄パラドックス検証 (糖尿病396+249再集計)
3. 北海道呼吸器パラドックス検証 (受療×処方の不整合)

---

### FacilityExplorer Phase A 改善 — 完了 (peer review feedback反映)

**経緯**: Bridge呼吸器 v1 (commit a7d8ca2) 後の peer review で、FacilityExplorer 仕様書 (本chat内出力) を評価。
4タスクに絞った Phase A を採択 (B1/B2/B3/B4等は既存ビューと重複のため不採用)。

**実施事項 (4 commit)**:

#### Commit 1 (12ea3d2): Tab 2 非対称性解消
- 検索 input (施設名・住所部分一致)
- sort selector 6軸 (score/rank/beds/cases/los/growth)
- CSV export (13列、sortedデータ全件)
- 行クリック詳細パネル (dpcExpanded state)
- 詳細パネル: 6指標 + capability proxy バッジ + reasons + missing警告 + Google Maps iframe (200px)
- geoByCode lookup 優先, 住所fallback

#### Commit 2 (1d0bf71): priority_score → 規模・実績参考スコア
- 理由: annual_cases (r=0.877) + total_beds (r=0.804) で大半説明される実態に合わせUI寄せ
- Tab 2 列ヘッダ: 'Score' → '規模・実績'
- Tab 1/2 sort: 'スコア順' → '規模・実績スコア順'
- 詳細パネル: 'スコア' → '規模・実績'
- Tab 3 見出し: '規模・実績参考スコア (priority_score / Tier) の透明性ノート'
- Tab 3 警告: '総合的な病院機能評価ではなく、規模(病床数)・実績(DPC症例数)を主成分とした参考指標'
- methodology.md にUI表記対応表追加 (内部変数名 priority_score / UI label '規模・実績参考スコア')
- 内部変数名・JSONキーは変更なし (UI label のみ変更)

#### Commit 3 (2abae89): Tier C/D → 未評価ラベル整理
- Tab 1 Tier filter: 6選択(全て/S/A/B/C/D) → 5選択(全て/S/A/B/未評価)
- C/D 選択肢削除 (top_facilities対象外で誤読リスク)
- '未評価' = f.tier 空 or null の施設にマッチ
- Tab 1 テーブル: 空tier → '—' から '未評価' バッジ表示
- 注記: '未評価=スコア未付与施設(機能が低いことを意味しません)'
- Tab 2 は変更なし (top_facilities は全件 tier付与済)

#### Commit 4 (6104cdc): docs/capability_mapping.md skeleton (167行)
- 10カテゴリ定義 (構成施設基準は '未抽出' と明記)
- proxy 解釈の注意 9項目 (oncology≠拠点病院, etc.)
- 統計値 (top_facilities n=2,802 観測ベース median/mean/max)
- UI上の取扱い (FacilityExplorer / Bridge)
- Phase 2 課題:
  1. ETL からの構成施設基準コード一覧 export
  2. 公式指定 (がん拠点・救命救急 等) との対応表
  3. capability の重み付け検討

**Phase A Done条件 (全項目pass)**:

| Priority | 項目 | 結果 |
|---|---|---|
| 1 | Tab 2 検索/sort/CSV/詳細/Maps | ✅ 5機能すべて実装 |
| 2 | priority_score UI label変更 | ✅ 9箇所変更 |
| 3 | Tier C/D → 未評価 | ✅ 5選択化 + 注記 |
| 4 | capability_mapping.md skeleton | ✅ 167行作成 |

**Tab 1 / Tab 2 対称性** (改善後):
| 機能 | Tab 1 | Tab 2 |
|---|---|---|
| 検索 | ✅ | ✅ NEW |
| sort | ✅ | ✅ NEW |
| CSV | ✅ | ✅ NEW |
| 行展開詳細 | ✅ | ✅ NEW |
| Maps iframe | ✅ | ✅ NEW |
| pagination | ✅ | ✅ |
| capability filter | ✅ | ✅ |
| Tier filter | ✅ S/A/B/未評価 | ✅ S/A/B |
| PDF export | ✅ | ❌ (kijun-format非対応, Phase 2) |

**保留 (peer review判定でB1/B2/B3/B4は既存ビューと重複のため不採用)**:
- ❌ Disease-Supply Matrix (NdbView Bridge と完全重複)
- ❌ Disease-Supply Compass (Bridge と完全重複)
- △ Acute-to-Home Ladder → ⑤ RegionalBedFunctionView 配置で再検討
- △ 在宅移行支援型 → ⑤ の地域類型に1分類追加で十分
- △ 県別供給サマリー → ⑤と非重複の指標のみで縮小版実装する場合のみ

**Phase 2 候補**:
1. ETL から capability_mapping 抽出 → 正式仕様書化
2. Tab 2 PDF export
3. ⑤ RegionalBedFunctionView に Acute-to-Home Ladder 追加
4. ⑤ 地域類型に '在宅移行支援型' 追加

---

### 未評価施設の実態確認 (audit) — 完了 (peer review feedback反映)

**経緯**: Phase A Commit 3 (2abae89) で Tab 1 Tier filter から C/D を削除したが、
peer review で「未評価施設の実態確認が次の最優先」と指示。
audit 実行の結果 **kijun_shards にはTier C/D が大量に存在することが判明**。

**audit 実行結果** (`scripts/audit_unrated_facilities.py`):

```
集計対象施設: 90,215
Tier 付与あり: 77,572 (85.99%)
Tier なし(未評価): 12,643 (14.01%)
```

**Tier 分布 (実データ)**:
| Tier | 件数 | 比率 |
|---|---|---|
| S | 20 | 0.02% |
| A | 249 | 0.28% |
| B | 2,201 | 2.44% |
| **C** | **70,806** | **78.49%** ← 大半 |
| **D** | **4,296** | 4.76% |
| 未評価 | 12,643 | 14.01% |

**重要発見**:
- **kijun_shards の Tier 付与方針は top_facilities.json と異なる**
  - top_facilities (2,802施設): S/A/B のみ収載 (priority_score >= 30)
  - kijun_shards (90,215施設): S/A/B + C (中小診療所等) + D + 未評価
- Phase A Commit 3 の「C/D 削除」は kijun実データを歪曲していた
- **本commitで C/D 復活 + 実データ分布注記**

**都道府県別 未評価率の異常**:
| 県 | 全施設 | 未評価 | 未評価率 |
|---|---|---|---|
| 沖縄県 | 587 | 553 | **94.2%** |
| 富山県 | 659 | 555 | 84.2% |
| 三重県 | 1,223 | 930 | 76.0% |
| 石川県 | 739 | 517 | 70.0% |
| 島根県 | 848 | 582 | 68.6% |
| ... | | | |
| 高知県 | 474 | 4 | 0.8% |
| 香川県 | 716 | 2 | 0.3% |

→ 都道府県によって scoring適用率に大差。沖縄県は94%が未評価という極端値。
データ集計時期・地域別データ取得状況の差を示唆。

**Capability別 未評価率**:
- pediatric: 22.2% (最高)
- homecare: 15.5%
- 他は 5-14%

**修正内容**:

1. **scripts/audit_unrated_facilities.py 新規作成** (115行):
   - 47都道府県シャード走査
   - tier/score 有無集計
   - capability別・都道府県別未評価率
   - 結果を `data/static/audit_unrated.json` 保存

2. **app/components/views/FacilityExplorerView.jsx 修正**:
   - Tab 1 Tier filter: 5選択(全て/S/A/B/未評価) → **7選択**(全て/S/A/B/C/D/未評価)
   - 注記強化: 実データ分布をUI上に表示
     - 「※実データ分布(audit結果): S=0.02% / A=0.28% / B=2.44% / **C=78.49%** / D=4.76% / **未評価=14.01%**」
     - 「Tier C/D は score 30 未満の施設群(中小診療所等)を含み、S-Bと同列の機能評価ではありません」

**学び (peer review framework的価値)**:
- 「未評価」の定義検証は重要 — 実データを見ずに UI を作ると歪曲リスク
- top_facilities と kijun_shards はTier付与方針が異なるため、両者統合UIで扱う際は注意
- 14% が未評価という事実 → 「kijun_shards の scoring カバレッジ」 が今後の指標

**追加修正 (commit 後続)**: peer review feedbackで以下を追加:
- Tab 1 注記文言を peer review版に強化:
  「Tier S-D は施設基準シャード(kijun_shards, 全90,215施設)内の内製参考分類です。未評価はscore/tier未付与の施設(14.01%)であり、医療機能が低いことを意味しません」
- Tab 2 に C/D 不在の理由注記追加 (📌 アイコン box):
  「DPC・高機能タブは上位2,802施設のみ(top_facilities, score≥30)を対象とするため、Tier S/A/B のみ表示。C/D は届出ベースタブで確認可能」
- `docs/priority_score_methodology.md` に **Tier coverage** セクション新設:
  | データセット | 件数 | Tier範囲 |
  |---|---|---|
  | top_facilities | 2,802 | S/A/B のみ |
  | kijun_shards | 90,215 | S/A/B/C/D/未評価 |
  同じ Tier S/A/B でもデータセットで意味が違う点を明示
- `docs/capability_mapping.md` に Tier coverage 参照リンク追加

**Phase 2 残課題**:
1. **沖縄県94%未評価の原因調査**: データ集計時期・地域別取得状況の差、それともscoring未適用?
2. capability_mapping.md の正式化 (ETLからの抽出可否)
3. ⑤ Acute-to-Home Ladder
4. ⑤ 在宅移行支援型 追加
5. Tab 2 PDF export

---

### ⑤ RegionalBedFunctionView: 在宅移行 補助分類 v0 — 完了

**経緯**: peer review で「次は在宅移行支援型を ⑤ に追加」と指示。
配置は ⑥ FacilityExplorer ではなく ⑤ (県全体の医療提供構造の分類だから)。

**実施事項**:

1. **データ実在 audit (5項目すべて pass)**:
   - ✅ NDB C_在宅医療: 47都道府県完全カバー (47件)
   - ✅ 75歳以上人口あたり計算可能 (age_pyramid male[15:]+female[15:])
   - ✅ bedFunc 回復期・慢性期シェア (R6病床機能報告)
   - ⚠️ cap.homecare/cap.rehab は kijun_shards走査が必要 (v1で追加予定)
   - ❌ NDB '全国' エントリなし → 47県平均で代理

2. **classifyHomecareType v0 関数追加** (RegionalBedFunctionView.jsx):
   - Gate: 75歳以上割合が47県平均以上 (なければ「該当なし: gate_not_aging」)
   - 3指標 (NDB在宅/75+10万対 / 回復期シェア / 慢性期シェア) の高低を47県平均比で判定
   - **支援型可能性**: high≥2/3
   - **ギャップ型可能性**: low≥2/3
   - それ以外: 「該当なし: mixed」

3. **UI追加**:
   - 既存 region (5パターン) の下に **並列の在宅補助分類カード** を配置
   - 既存5分類は維持 (上書きせず追加)
   - 判定根拠を 3指標すべて明示 (47県平均比のpct/pt差)
   - v0 バッジ表示 (黄色)
   - 注記強化: 「実際の訪問診療件数、看取り件数、在宅酸素実施数を直接示すものではない」「cap proxyはv1で追加予定」

4. **page.js**: ⑤呼び出しに ndbDiag prop追加

**5県+高齢化県 sanity (47県平均: 75+割合=17.93% / NDB在宅=327,296 / 回復期=18.30% / 慢性期=25.28%)**:

| 県 | 75+割合 | NDB在宅/75+10万 | 回復期 | 慢性期 | 判定 |
|---|---|---|---|---|---|
| 東京 | 13.1% | 585,951 | 14.4% | 20.0% | 該当なし (若年) |
| 大阪 | 16.2% | 550,936 | 15.7% | 28.2% | 該当なし (若年) |
| 沖縄 | 11.6% | 354,297 | 19.2% | 26.9% | 該当なし (若年) |
| 高知 | 21.5% | 221,243 | 14.6% | 41.4% | **ギャップ型可能性** (low=2/3) |
| 北海道 | 18.7% | 326,606 | 13.2% | 33.0% | **ギャップ型可能性** (low=2/3) |
| 島根 | 20.6% | 314,353 | 22.9% | 25.2% | **ギャップ型可能性** (low=2/3) |
| 秋田 | 22.0% | 173,533 | 15.9% | 22.4% | **ギャップ型可能性** (low=3/3) |
| 山形 | 19.6% | 242,223 | 20.4% | 21.8% | **ギャップ型可能性** (low=2/3) |

→ 高齢化県は概ねギャップ型に分類される傾向。秋田が low=3/3 で最も顕著。
   支援型 (high≥2) は 5県+α では検出されず — 47県全体の分布検証は別途要。

**Devil's Advocate / 構造的限界**:
- cap.homecare/cap.rehab未組込 → 3指標のみで判定 (peer review仕様の5指標から短縮)
- 「ギャップ型可能性」は厳しめに見えるが、高齢化県の真の特徴を反映している可能性
- NDB '全国' エントリなしのため47県単純平均使用 (人口加重なし)
- 表現は「可能性」に統一、断定なし

**peer review遵守事項**:
✅ 配置: ⑤ RegionalBedFunctionView
✅ 名称: 「在宅移行支援型の可能性」「在宅移行ギャップ型の可能性」
✅ 既存5分類は維持
✅ 3指標を判定根拠としてUI表示
✅ 「在宅医療が十分」「在宅酸素が多い」「看取り体制が強い」断定なし
✅ 注記: 「実際の訪問診療件数等を直接示すものではない」
✅ v0 バッジでexperimental明示

**47県 audit 結果 (本commit)**: peer review指示の v0ロジック検証 (`scripts/audit_home_transition.py`):

```
分類分布 (47県):
  支援型可能性: 10県
  ギャップ型可能性: 15県
  mixed: 0県 (拮抗ケースなし)
  若年gate対象外: 22県
```

| 分類 | 県 (n=10/15/22) |
|---|---|
| **支援型可能性** | 徳島(3/3) 鹿児島(3/3) 山口 和歌山 愛媛 大分 長崎 鳥取 山梨 熊本 |
| **ギャップ型可能性** | 秋田(3/3) 青森(3/3) 宮崎(3/3) 高知 島根 山形 岩手 富山 長野 奈良 新潟 香川 北海道 岡山 岐阜 |
| 若年gate対象外 | 東京/大阪/沖縄/愛知/神奈川/埼玉/千葉/福岡/兵庫/茨城 等 |

**重要発見** (peer review #2 補正反映):
1. **支援型10県は実存** — 5県sanity (5県+高齢化3県) で偶然不検出だっただけ。47県全体では支援型/ギャップ型の振り分けが起こっている
2. **mixed 0件** — ⚠️ これは v0判別力の証拠ではない。3指標を high/low に二値化して多数決する設計では、各指標が必ず high or low のどちらかに分類されるため、`high≥2 or low≥2` のどちらかが原理的に必ず成立 → mixed は数学的にほぼ発生しない自然な結果
3. **慢性期シェア vs NDB在宅医療の Pearson r = -0.090** (ほぼ無相関) — 単純な「慢性期=療養依存=在宅薄」構造は支持されない。ただし慢性期の意味は依然あいまい (v1で'療養依存型'として再分類検討の余地)

**地理的偏り**:
- **支援型** = 中四国・九州 (徳島/鹿児島/愛媛/大分/長崎/熊本) — 「在宅医療提供量高い県」パターン
- **ギャップ型** = 東北・北日本 (秋田/青森/岩手/山形/富山/北海道) — 「高齢化×在宅薄」パターン
- **若年gate対象外** = 大都市圏 (東京/大阪/愛知/神奈川等)

**指標分布 (47県)**:
| 指標 | min | p25 | median | mean | p75 | max |
|---|---|---|---|---|---|---|
| 75+割合(%) | 11.6 | 16.8 | 18.0 | 17.9 | 19.4 | 22.0 |
| NDB在宅/75+10万対 | 173,533 | 275,253 | 326,606 | 327,295 | 371,670 | 585,951 |
| 回復期シェア(%) | 11.5 | 15.9 | 18.3 | 18.3 | 20.4 | 25.3 |
| 慢性期シェア(%) | 17.9 | 22.2 | 24.1 | 25.3 | 27.1 | 41.4 |
| 回復期病床/75+10万対 | 546 | 814 | 1,031 | 1,077 | 1,299 | 1,798 |
| 慢性期病床/75+10万対 | 798 | 1,084 | 1,387 | 1,511 | 1,741 | 3,560 |

mean ≈ median のため外れ値の影響は限定的。47県平均使用は妥当。

**v0結論** (peer review固定):
- v0分類は3指標多数決であり、**mixedが発生しにくい設計**である点を理解した上で利用
- 分類は **地域構造の仮説生成** であり、在宅医療体制の充足・不足を断定しない
- 5県sanityでの偽懸念は解消 (47県全体では支援型10件存在)
- v0は概念実証として固定可。v1で neutral zone + cap追加 + per75+床数化

**Phase 2 (v1) 拡張候補** (peer review #2 整理):

| 優先 | 項目 | 理由 |
|---|---|---|
| **1** | **neutral zone 導入** | 現在は平均±0.001でも high/low 二値化される。±5%以内 or p40-p60 を neutral にすれば mixed/borderline が自然に出る |
| **2** | **cap.homecare/cap.rehab 追加 (5指標版)** | peer review原仕様。kijun_shards 走査でJSON事前生成 |
| **3** | **回復期/慢性期 → per75plus 床数** | シェアでは絶対供給量を見ていない。「シェア高くても総床数少→絶対量薄」の罠を回避 |
| 4 | gate を緩める検討 | 47%が判定対象外 |
| 5 | z-score / percentile化 | 統計的根拠 |
| 6 | 「療養依存型」3分類目 | 慢性期 high × NDB在宅 low が独立に意味を持つか要検証 (現状 r=-0.09) |

**v1 ロジック案 → 実装完了 (本commit)**:
```
各指標を3値化:
  > 平均 +5%   → high
  < 平均 -5%   → low
  ±5%以内      → neutral

5指標 (NDB在宅 / 回復期床/75+ / 慢性期床/75+ / cap.homecare/75+ / cap.rehab/75+):
  high≥3 → 在宅移行支援型の可能性
  low≥3  → 在宅移行ギャップ型の可能性
  それ以外 → 中間型/判定保留 (mixed)
```

---

### 在宅移行 補助分類 v1 — 完了 (本commit)

**経緯**: peer review #2 補正後、v1 拡張 (Step 1 audit → Step 2 実装) を採択。

**実装事項**:

1. **scripts/audit_homecare_rehab_capability.py** (Step 1, commit 5ac55b1):
   - kijun_shards 47県走査で cap.homecare / cap.rehab 集計
   - 集計成功: 47/47県
   - 結果を data/static/homecare_capability_by_pref.json として保存

2. **classifyHomecareType を v1 に置換** (RegionalBedFunctionView.jsx):
   - 3指標 → **5指標** (NDB在宅 / 回復期床/75+ / 慢性期床/75+ / cap.homecare/75+ / cap.rehab/75+)
   - 二値high/low → **三値 high/neutral/low** (±5% neutral zone)
   - 病床シェア → **75歳以上人口あたり病床数** (絶対供給量) へ変更
   - mixed/中間型が自然に発生 (peer review #2 補正反映)

3. **compute47Avg を v1 5指標版へ拡張**

4. **API: /api/homecare-capability 新規** (cap データを配信)

5. **page.js**: homecareCapability state + fetch + prop追加

**v1 47県分類分布** (Python事前検証):
- 支援型可能性: **10県** (高知/山口/島根/和歌山/徳島/愛媛/長崎/岡山/鹿児島/熊本)
- ギャップ型可能性: **9県** (秋田/山形/岩手/富山/青森/長野/新潟/宮崎/岐阜)
- **中間型/判定保留: 6県** (大分/奈良/鳥取/香川/北海道/山梨) ← v1で新規発生
- gate_not_aging: 22県

**v0 vs v1 比較** (重要insight):
- v0支援型 → v1 維持: 7/10 (和歌山/山口/徳島/愛媛/熊本/長崎/鹿児島)
- **v0支援型 → v1 中間型: 3** (大分/山梨/鳥取) — cap指標で再評価
- **v0ギャップ型 → v1 支援型: 3** (岡山/島根/高知) — cap.homecare/rehab高で再分類
- v0ギャップ型 → v1 維持: 9/15
- v0ギャップ型 → v1 中間型: 3 (北海道/奈良/香川)

**重要観察**:
- **東北ギャップ型はより明確化** (秋田/青森/岩手/山形/富山が low=4-5/5)
- **岡山/島根/高知** は cap指標で支援型へ再分類 (慢性期重視のv0ロジックでギャップ判定だったが、cap指標で揺り戻し)
- **真の中間型6県** が出現 → レビュー期待通り

**Phase 2 (v2) 残候補**:
1. neutral zone を ±5% から ±10% へ調整検討
2. gate閾値の検討 (47%が判定対象外)
3. z-score / percentile化
4. 「療養依存型」3分類目 (慢性期 high × cap.homecare low + 他low) の有意性検証

---

### Priority 7: NdbView内 Disease領域タブ ← 次の最優先タスク

ChatGPTレビュー条件付き採択。独立ビューではなくNdbView内タブで実装。

### Priority 8: per capita切替（NdbView限定）

---

## globalPref連動の仕組み(047a28f)

```javascript
// page.js — 5つの独立prefStateを1つに統合
const [globalPref, setGlobalPref] = useState('東京都');
```
useEffect(() => {
```
```
```
```
```
  if (!globalPref) return;
  fetch('/api/medical-areas?prefecture='+encodeURIComponent(globalPref))
    .then(r=>r.json()).then(d => setAreaData(d.data||[]));
  fetch('/api/ndb/prescriptions?prefecture='+encodeURIComponent(globalPref))
    .then(r=>r.json()).then(d => setNdbRx(d));
  fetch('/api/facility-standards?prefecture='+encodeURIComponent(globalPref))
    .then(r=>r.json()).then(d => setKijunData(d.data||[]));
}, [globalPref]);
```

子コンポーネントのprop名は変更なし(areaPref/ndbPref等)。全てglobalPrefの値を受け取る。 NdbViewのselect onChangeからインラインフェッチ削除済み(globalPref useEffectが担当)。

---

## ChatGPTレビュー合意事項

### 採択

- ✅ 全ビュー都道府県連動 → 完了
- ✅ Gap Finderテンプレート化 → 次タスク
- ✅ NDB質問票の飲酒・睡眠追加
- ✅ 病床機能報告の最新化
- ✅ per capita / 75+表示モード(NdbView限定)
- ✅ データ意味ラベル(実測/推計/代理/結果)

### 条件付き採択

- △ 患者調査 → 受療率・大分類のみ
- △ Disease Atlas → 独立ビューではなくNdbView内タブ
- △ z-score → UIには出さず内部ランキング用

### 不採択

- ❌ 7→5ビュー全面統合
- ❌ 上部固定バー4要素グローバル化
- ❌ displayMode全ビュー共通化
- ❌ ナビイ連携

---

## ファイル構成

```
app/page.js (187行) — globalPref管理
app/components/views/NdbView.jsx (306行) — 5レイヤー医療プロファイル ★中核
app/components/views/MapView.jsx (84行)
app/components/views/MuniView.jsx (232行)
app/components/views/AreaView.jsx (85行)
app/components/views/ScoringView.jsx (107行)
app/components/views/KijunView.jsx (151行)
app/components/views/GeoMapView.jsx (71行)
app/components/shared.js (26行) — fmt/sortPrefs/downloadCSV/METRICS
app/api/ (20エンドポイント)
data/static/ (27 JSON, ~52MB)
data/medical_intelligence.db (SQLite, 25テーブル)
```

## 次チャットの開始コマンド

```
cd ~/Projects/medical-intelligence && git log --oneline -3
# Gap Finderセクション確認
grep -n "GAP FINDER" app/components/views/NdbView.jsx
```


## Bridge v0 FROZEN 解除 → v1 移行 (2026-04-28)

### 判断
Bridge v0 (commit 475a174) の FROZEN を解除し、Bridge Risk Model v1 へ移行。

### 理由
Phase 1 NDB ETL拡張により Bridge の risk列が単一proxyから複数risk指標へ変更。
表示追加ではなく解釈仕様の中核変更のため、FROZEN維持ではなく解除として扱う。

### 新方針
- `risk` (単一) → `risks[]` (配列) へ
- 既存riskは `legacy: true` で保持
- 新規riskは source/note/direction を明示
- v0の受療率・処方proxy・供給proxy・死亡率原則は完全継承

### 対象6領域 (全領域に適用)
循環器: SBP≥140 / LDL≥140 / 高血圧薬 / 脂質薬 / 喫煙(legacy)
糖尿病: HbA1c≥6.5 / BMI≥25 / 糖尿病薬 / 体重増加(legacy)
がん: 喫煙(legacy) / 多量飲酒
脳血管: SBP≥140 / 脳卒中既往 / 喫煙(legacy)
呼吸器: 喫煙(legacy)
腎疾患: 尿蛋白1+ / eGFR(legacy) / CKD既往

詳細: docs/BRIDGE_V1_INTERPRETATION.md


## Phase 2B 完了 (2026-04-28)

### 達成
1. capability_mapping.md を skeleton (168行) → **正式仕様 v1 (402行)** に格上げ
2. Source of Truth: data/static/facility_taxonomy.json (substring matching)
3. False positive audit 実施 (acute/imaging/rehab で警告事項を Known Limitations に明記)
4. 47県集計値・全カテゴリのキーワード/サンプル基準を全文書化

### 主要発見
- 全910ユニーク基準のうち matched 338 (37.1%) / unmatched 572 (62.9%) / multi-match 64件
- unmatched は意図的 (薬剤治療・特殊検査・指導料を除外する設計)
- multi-match は許容 (医療機能は排他的でないため自然)
- audit で false positive 候補確認: 内視鏡下手術が imaging+surgery 両方にカウントされる等

### 重要警告 (docs §9 に記載)
- cap.oncology ≠ がん診療連携拠点病院
- cap.homecare ≠ 訪問診療件数
- cap.rehab ≠ リハビリ実施件数・アウトカム
- cap.acute ≠ 救急搬送受入件数 (病床機能報告とも別概念)

### v2 改訂候補 (Top 3)
1. 47県分布の人口正規化 (高)
2. 内視鏡 false positive 修正 (中)
3. 薬剤治療カテゴリ追加 (中)

詳細: docs/capability_mapping.md


## Phase 2C-1 完了 (2026-04-28)

### 達成
1. NDB健診 5項目 (BMI/HbA1c/SBP/LDL/尿蛋白) の年齢標準化実装
2. v2 ETL: sex × age_group × bin_label を完全保持 (19,973 records)
3. NDB内標準人口テーブル: 47県合算 sex × age_group の構成比 (total 29.1M, weight_sum=1.0)
4. 直接標準化法で 47県の年齢標準化率を計算
5. Bridge UI に粗率/標準化率/delta_pp 併記 (紫色強調)

### 主要発見
- 年齢構成の影響は ±0.5pp 程度に留まる (BMI/LDL/尿蛋白はほぼ無影響)
- HbA1c/SBP で最大1.2pp の補正
- 沖縄 BMI 39.8 → 40.3 (若年補正で上昇) — メタボ大国は年齢構成では説明できない
- 高知 SBP 21.7 → 21.2 / HbA1c 8.1 → 7.6 (高齢化補正で若干低下、依然全国最高水準)
- 結論: Bridge v1 で観察した地域差は **本物の地域特性**

### 範囲外 (Phase 2C-2 以降)
- 死亡率の年齢調整 (別データソース必要)
- 処方proxy/受療率の標準化
- 二次医療圏別標準化


## Phase 2D Step 1 完了 (2026-04-28) — 透析・人工腎臓データ audit

### 達成
3データソース横断で透析・人工腎臓関連を検索し、renal Bridge への追加可能性を判定。

### audit結果
| データソース | 透析関連 | 評価 |
|---|---|---|
| ndb_diagnostics (A/B/C カテゴリのみ) | 0件 | ❌ Case A 不成立 |
| ndb_prescriptions (薬効分類) | 0件 | 期待通り (薬剤分類非該当) |
| **facility_standards (6県サンプル)** | **9件** | ✅ **Case B 成立** |
| NDB index HTML (408 xlsx) | 0件 | 専用xlsx非公開 |

### 透析関連施設基準 (9件)
- 人工腎臓
- 在宅血液透析指導管理料
- 導入期加算１/２/３
- 慢性腎臓病透析予防指導管理料
- 糖尿病透析予防指導管理料
- 胎児胸腔・羊水腔シャント術
- 透析液水質確保加算及び慢性維持透析濾過加算

### 6県サンプル カバレッジ
- 透析届出施設: 6県合計 672 / 総 11,164 (6.0%)
- 県別: 5.3% (愛知) ～ 7.0% (富山)

### 実装上の制約
- ⚠️ facility_standards.json は 6県サンプル (47県不完全)
- ⚠️ kijun_shards/*.json は cap値集計済 (raw standards 保持なし)
- ⚠️ kijun_shards 再生成のための元ETLはレポジトリ外
- → cap.renal 直接追加には ETL再生成必要 (user介入要)

### 次の判断 (user判断要)
- Case A: cap.renal 追加 (kijun_shards 再ETL、user介入)
- Case B: 6県 renal_supply_by_pref.json 新規生成 (部分カバレッジ)
- **Case C: 現状維持** (Bridge未整備表示維持、最も安全)


## Phase 2D-Layer2 完了 (2026-04-29)

### 達成
NdbView Layer 2「健診リスク」を 2セクション化。Phase 1/2C-1 で取得・標準化した
最重要リスク指標が Bridge (Layer 6) に閉じ込められていた問題を解消。

### 構造変更
| Before (3項目のみ) | After (2セクション) |
|---|---|
| eGFR/Hb/Cr の平均値カード3つ | A. 検査値平均 (3項目) + B. リスク該当者率 (5項目) |
| 単一grid | サブセクション分離 + 性質別注記 |

### B. リスク該当者率カード (5項目, Phase 2C-1 標準化率併記)
- ⚖️ BMI ≥25 (沖縄39.8% / 標準化40.3% / 47県+35.2%)
- 🍰 HbA1c ≥6.5 (沖縄8.7% / 標準化8.4% / 47県+14.5%)
- ❤️ SBP ≥140 (沖縄20.7% / 標準化20.8% / 47県+7.3%)
- 🩸 LDL ≥140 (沖縄28.0% / 標準化28.2% / 47県-0.7%)
- 🫘 尿蛋白 1+以上 (沖縄3.8% / 標準化3.8% / 47県+11.8%)

### 設計思想の整合性
- Layer 2 は生体リスクの中核 → Phase 1 取得5項目の本来の置き場所
- Bridge (Layer 6) は領域別サマリーとして併存 (役割が違う)
- 検査値平均 (eGFR等) と リスク該当者率 (BMI≥25等) はデータの性質が違う
  → 視認性のためサブセクション分離

### 表示仕様
- 粗率を主表示 (大きく目立つ)
- 年齢標準化率は紫色で控えめに併記
- 47県平均との差を自然言語化 (顕著に高い/同程度/低い)
- 健診受診者ベース注記


## Phase 2D Case C 確定 + Phase 2E-1 完了 (2026-04-29)

### Phase 2D — 透析データ Case C 確定
- audit (commit 3d1d60f) 結果: 6県サンプルで透析関連施設基準9件確認
- 採択: Case C (現状維持 + audit記録のみ)
- 不採択: Case B (6県データを Bridge に混ぜると47県完全前提が崩れる)
- 保留: Case A (kijun_shards 再ETL、user介入要)
- docs: docs/PHASE_2D_DIALYSIS_AUDIT.md (97行)

### Phase 2E-1 — 沖縄糖尿病パラドックス検証
6軸検証で四重不一致を定量的に確認:
- BMI≥25: 沖縄 47県中1位 (+35.2%)
- 内分泌外来受療率: 沖縄 47県中47位 (-47.1%) ← 最低
- 糖尿病死亡率: 沖縄 47県中40位 (低位、-11.3%) ← 謎
- 治療カバー率: 沖縄 47県中11位 (低位、79.3%)
- 年齢標準化後も BMI/HbA1c リスク高は健在
- 7仮説 (A-G) を生成、反証には追加データ必要
- docs: docs/OKINAWA_DIABETES_PARADOX.md (177行)
- audit script: scripts/audit_okinawa_diabetes_paradox.py


## Phase 2 Release Closure (2026-04-29)

### 達成
1. PHASE2_RELEASE_NOTES.md (165行) - Phase 2 全体サマリ
2. PHASE2_QA_CHECKLIST.md (128行) - QA項目一覧
3. OKINAWA_DIABETES_PARADOX.md 表現の弱化 (最重度→上位/最高水準)

### Phase 2 commit範囲
41f0406 〜 62cb6e4 (12 commits) + Closure (3 docs)

### 次の判断 (user)
- Phase 2 release fixed として固定
- 次候補 (PHASE2_RELEASE_NOTES.md §6):
  * 高: 死亡率の年齢調整, 47県分布の人口正規化
  * 中: Phase 2E-2 東北検証, Phase 2E-3 中四国・九州検証
  * 中: 沖縄パラドックス深掘り, 内視鏡 false positive 修正


## Phase 3-1 audit (2026-04-29) — 年齢調整死亡率データソース調査

### 達成
1. 厚労省「令和5年度人口動態統計特殊報告 令和2年都道府県別年齢調整死亡率」xlsx取得 (4.8MB)
2. 37シート構造解析、参考1/参考2 で死因×県×男女 を完全保持
3. Bridge直結6死因 (悪性新生物/心疾患/脳血管/糖尿病/腎不全/肺炎) のうち5死因取得可能
4. 糖尿病はxlsxに集約データなし → e-Stat DB API で別途取得が必要

### 主要発見
- 公表頻度: 5年ごと (最新令和2年=2020年、次回令和7年=2025年は2027年頃公表)
- 基準人口: 平成27年(2015年)モデル人口
- 既存vital_stats(2024年)との時点ズレ (4年差) → UI で明示必要
- 47県完全カバレッジ (Bridge前提と整合)

### 判定
✅ ETL実装可能 (技術的に)
⚠️ user判断要 (Option A: フル実装/B: 部分/C: docs固定のみ)

### docs
- docs/AGE_ADJUSTED_MORTALITY_AUDIT.md (224行)


## Phase 3-1b 完了 (2026-04-29) — 糖尿病年齢調整死亡率の取得可否確認

### 達成
xlsx 再走査により、糖尿病の年齢調整死亡率も同 xlsx 内 (参考2(1) col 22-25) に存在することを確認。
Phase 3-1 の audit で「e-Stat DB API 別取得必要」とした判断を撤回し、Option A の障壁解消。

### Done条件 (5項目すべて達成)
1. ✅ 糖尿病の都道府県別年齢調整死亡率が **存在** (xlsx 内、e-Stat不要)
2. ✅ 2020年・男女別で取得可能
3. ✅ 47都道府県完全カバレッジ (欠損ゼロ)
4. ✅ Excelで再現可能 (xlsx download 済)
5. ✅ 既存5死因と同じ統合スキーマで整形可能

### 主要発見 (沖縄パラドックスへの強い手がかり)
- 沖縄県 糖尿病年齢調整死亡率: **男 20.8 (2位)、女 9.7 (2位)**
- 既知の粗死亡率: 11.0/10万 (47県40位、低位)
- → **粗死亡率では低位、年齢調整後は高位** という完全逆転
- Phase 2E-1 の仮説F「糖尿病以外の死因が早期発生」を強く支持

### Phase 3-1 ETL 実装可否
✅ 6死因すべて xlsx 内取得可、Option A (フル実装、当初3 commits → 2 commits 簡略化) 可能。


## Phase 3-1 Option B 完了 (2026-04-29) — 年齢調整死亡率 ETL

commit: 2cb0845 に同梱 (MapView fix と一緒に push されたため履歴整理)

### 達成 (10 Done条件 全達成)
1. data/static/age_adjusted_mortality_2020.json 生成 (47県 × 6死因 × 男女別、282エントリ)
2. scripts/etl_age_adjusted_mortality_2020.py 新規 (270行)
3. 全国値が厚労省公表値と完全一致 (悪性394.7/糖尿病13.9/心疾患190.1/脳血管93.8/肺炎90.1/腎不全27.3)
4. OKINAWA_DIABETES_PARADOX.md §10b 追記 (Phase 3-1b 確認結果反映)

### 主要発見
沖縄糖尿病死亡率の逆転:
- 粗死亡率 11.0/10万 (47県40位、低位、-11.3%)
- 年齢調整男 20.8/10万 (47県2位、高位、+49.6%)
- 年齢調整女 9.7/10万 (47県2位、高位、+40.6%)
→ 仮説Fを支持する補足証拠

### UI反映: 未実施 (peer review遵守、Phase 3-2以降で別判断)

## MapView 強制遷移 fix (2026-04-29)

commit: 2cb0845

### 問題
iPhone (mobile)で概況タブの県別表示クリック → 人口統計タブへ強制遷移

### 原因 (MECE探索)
A1: onClick で setView('muni') がハードコード (地図path L56 + ランキングリストL72)

### 修正
- setView('muni') を削除 → setGlobalPref のみ
- 選択県を黄色ハイライト (#fef3c7)
- globalPref prop を MapView に追加

### UX改善
概況タブ内で複数メトリクスを切り替えながら県別比較可能に


## Phase 3-2 audit + Phase 2E-2 (2026-04-29) — B/C/D 順次実施

### B. Phase 3-2 (47県分布の人口正規化) audit 結果
- 既に主要指標は人口正規化済 (NDB処方/診療行為/病床/cap.* /死亡率)
- 新規実装不要、現状維持で確定 (docs記録のみ)
- 残課題: 二次医療圏別人口データ取得 (別フェーズ)
- docs: docs/PHASE3_2_NORMALIZATION_AUDIT.md (78行)

### D. micro-fix audit (setView 強制遷移の他箇所)
- audit結果: ゼロ件 (修正不要)
- MapView 以外の view は setView を渡していない
- commit 2cb0845 で MapView fix 済、他に潜在バグなし

### C. Phase 2E-2 東北・北日本 在宅移行ギャップ型検証
- 7県中 6県がギャップ型 (青森/岩手/宮城/秋田/山形/福島)
- 北海道のみ中間型 (慢性期病床+61% 突出)
- 秋田県が最顕著 (5指標すべて-28%以上、cap.homecare/rehab とも全国-44%水準)
- Phase 3-1 年齢調整死亡率: 脳血管7県すべて全国比+20%以上
- 仮説強く支持
- docs: docs/PHASE_2E_2_TOHOKU_HOMECARE.md (140行)
- script: scripts/audit_tohoku_homecare_gap.py


## Phase 2E-3 (2026-04-29) — 中四国・九州 在宅移行支援型検証 (E-2 対照)

### 達成
1. 中四国・九州10県すべて(10/10)が支援型と判定 (high≥3)
2. E-2 東北7県(86%ギャップ型) との完全対照群が完成
3. Phase 3-1 年齢調整死亡率による結果指標の併用検証
4. 重大発見: '供給+ ≠ 結果+'

### 重大発見
山口/徳島/鹿児島で 供給proxy 厚い & 結果指標悪い:
- 山口: cap.homecare+104%、肺炎+31%、心疾患+14%、腎不全+17%
- 徳島: 回復期+51%、肺炎+32%、腎不全+19%
- 鹿児島: 回復期+64%、肺炎+26%

唯一供給+ × 結果+ の県:
- 熊本: 慢性期+65% × 脳血管-9%、悪性-9%
- 岡山: cap.homecare+72% × 全死因が全国平均近く

→ '支援型 = 良い医療' という単純解釈は誤り

### E-2 vs E-3 対照
| | E-2 東北7県 | E-3 中四国・九州10県 |
|---|---|---|
| ギャップ型 | 86% | 0% |
| 支援型 | 0% | 100% |
| 結果指標(脳血管) | 全県+20-54% | -9% 〜 +7% (混在) |

### docs
- docs/PHASE_2E_3_WESTERN_JAPAN_HOMECARE.md (185行)
- scripts/audit_western_japan_homecare_support.py


## Phase 4-0 (2026-04-29) — 地域医療の不一致パターン統合

### 達成
E-1/E-2/E-3 の発見を統合し、MedIntel が発見できる '6つの不一致パターン' を明文化:

| # | パターン | 代表県 | 統合元 |
|---|---|---|---|
| 1 | Risk-Care 乖離 | 沖縄 | E-1 |
| 2 | Supply-Outcome 並列悪化 | 秋田/青森/岩手/山形 | E-2 |
| 3 | Supply-Outcome 不一致 | 山口/徳島/鹿児島 | E-3 |
| 4 | Supply-Outcome 整合 | 岡山/熊本/島根 | E-3 |
| 5 | 高齢化-在宅移行ギャップ | 秋田/青森/岩手/北海道(特殊) | E-2 |
| 6 | 都市低リスク・高機能集積 | 東京/大阪 | Phase 1〜2 全体 |

### MedIntel の発見能力 (集約)
- 47都道府県スケールで6つの不一致パターンを識別可能
- 現行データ (NDB/患者調査/病床/cap/死亡率/年齢調整死亡率) のみで仮説生成完結
- 因果推論不要、追加データ取得の動機付けに留める

### docs
- docs/REGIONAL_MISMATCH_PATTERNS.md (286行)


## Phase 4 Review Package + STOP (2026-04-29)

### 達成
docs/PHASE4_REVIEW_PACKAGE.md 作成 (329行)
外部レビュー受付状態として現状を固定:
- 0. パッケージの目的
- 1. MedIntel の目的 (発見できる/しないこと)
- 2. 使用データ (12種、時点ズレ問題明示)
- 3. 6軸モデル (Bridge Risk Model v1)
- 4. 6不一致パターン (Phase 4-0 統合済)
- 5. 代表例 (沖縄/秋田/山口/東京)
- 6. 誤読防止ルール (禁止表現6 + 推奨表現6)
- 7. peer reviewer に聞きたい質問 (Q1-Q7)
- 8. 制約と未対応 (データ/機能/解釈)
- 9. 参照ドキュメント順序 (11種)
- 10. レビュー観点チェックリスト (4分野 × 多項目)
- 11. 公開先・本リポジトリ
- 12. レビュアーへのお願い

### STOP 判断
Phase 4-0 で MedIntel の設計思想が明確になった。
今後は外部レビュー後に判断:
- Phase 4-1 UI実装 (Regional Mismatch Explorer)
- Phase 3-1 UI反映 (Bridge OUTCOME 列に年齢調整死亡率併記)
- 沖縄パラドックス追加データ取得 (NDB396細分類)
- 別フェーズ

外部レビュー観点 (peer reviewer Q1-Q7):
Q1. '不一致パターン発見' 設計思想の妥当性
Q2. 6パターンの MECE 性
Q3. '仮説生成装置' 注記の十分性
Q4. UIに出す場合の表現
Q5. 年齢調整死亡率の Bridge 反映
Q6. 供給+結果の並列表示の危険な誤読
Q7. 想定ユーザー (行政/医療機関/企業/医師/市民)

### 現在地
- HEAD: c63... (本commit予定)
- Phase 2 release tag: medintel-phase2-release (d597192)
- 本番URL: https://medical-intelligence-two.vercel.app/
- GitHub: https://github.com/tomiyuta/medical-intelligence


## Phase 4 Review Package v2 micro-fix (2026-04-29)

### peer review v1 採択 修正6項目反映

| # | 修正 | 反映箇所 |
|---|---|---|
| 1 | 沖縄テーブル 実値 vs 全国比 分離 | BMI 39.8% (1位) / HbA1c 8.7% (6位) / 内分泌外来 184/10万 / 糖尿病薬 6.9% (12位) |
| 2 | '6不一致パターン' → '6つの地域医療プロファイル / mismatch archetypes' | docs全体 |
| 3 | multi-label archetype 性を明記 | §4.1, §6.1, §8.3 |
| 4 | 6軸モデル矢印削除、'独立軸' に | §3 因果連鎖風表現を解消 |
| 5 | 年齢調整死亡率2020年の時点差を代表例ごとに再掲 | §5.1〜5.4 各セクション末 |
| 6 | Q2: MECE性 → multi-label archetype 妥当性 | §7 Q2 |

### 重大な誤り修正
v1 では沖縄の代表例テーブルで実値と全国平均比%が混在していた:
- 'BMI≥25 35.2%' → 実値は **39.8%** (35.2% は全国平均比)
- 'HbA1c≥6.5 14.5%' → 実値は **8.7%** (14.5% は全国平均比)
- '内分泌外来受療率 110/10万' → 実値は **184/10万** (110 は誤値)
- '糖尿病薬服用率 5.8%' → 実値は **6.9%** (12位)

これらはreviewerの再audit指摘で発見。v2で完全修正。

### 文書ステータス
- v1: f6f2801 (peer review 提出)
- v2: 本commit (peer review v1 採択 micro-fix 反映、外部レビュー再提出可)


## Phase 4 Review Package v3 P0 alignment (2026-04-29)

### 外部レビュアー判定 (Conditional Go) の P0 修正4項目 反映

| # | 修正 | 対象 docs |
|---|---|---|
| P0-1 | '診断ツール' 表現の全廃 | PHASE2_RELEASE_NOTES.md, PHASE_2E_3, PHASE4_REVIEW_PACKAGE.md |
| P0-2 | REGIONAL_MISMATCH_PATTERNS.md §1 矢印 (↓) 削除 | REGIONAL_MISMATCH_PATTERNS.md |
| P0-3 | 糖尿病取得経路矛盾の統一 (Phase 3-1b で撤回明示) | AGE_ADJUSTED_MORTALITY_AUDIT.md |
| P0-4 | Pattern 4/6 を Context Archetype 別層分離 | REGIONAL_MISMATCH_PATTERNS.md, PHASE4_REVIEW_PACKAGE.md |

### Archetype の二層構造 (P0-4 反映後)

A. Mismatch Signal Tags (不一致シグナル):
- Pattern 1: Risk-Care Gap (沖縄)
- Pattern 2: Supply-Outcome Gap 並列悪化 (秋田・青森・岩手・山形)
- Pattern 3: Supply-Outcome Mismatch 不一致 (山口・徳島・鹿児島)
- Pattern 5: Aging-Outcome Burden 高齢化-在宅 (秋田・青森・北海道)

B. Context Archetypes (背景構造プロファイル):
- Pattern 4: Supply-Outcome Alignment Context (岡山・熊本・島根)
- Pattern 6: Urban Low-risk / High-capability Context (東京・大阪)

### Done 条件 (4項目すべて達成)
- ✅ '診断ツール' 残存は自己言及のみ (修正記録/否定文/Done条件)
- ✅ Risk → Demand → Use → Supply → Outcome の因果矢印を削除
- ✅ AGE_ADJUSTED_MORTALITY_AUDIT.md の糖尿病取得経路が一貫
- ✅ Pattern 4/6 が Context Archetype として分離
- ✅ Phase 4 Review Package 側に二層構造反映

### 次のアクション
1. 外部 reviewer に **delta review** 依頼 (P0 修正点のみ確認)
2. Conditional Go 5条件のうち #2-5 (UI実装) は P1 で実施
3. P0-5 (terminology_guard CI test) は別タスクとして残置
