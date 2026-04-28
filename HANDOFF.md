# MedIntel 引継書 — 2026-04-28

## プロジェクト基本情報

- **本番URL**: <https://medical-intelligence-two.vercel.app>
- **GitHub**: <https://github.com/tomiyuta/medical-intelligence> (public)
- **ローカル**: `~/Projects/medical-intelligence/`
- **HEAD**: (next commit) — Bridge: FROZEN文言補正 + 脳血管 v1 拡張
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
