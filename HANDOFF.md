# MedIntel 引継書 — 2026-04-28

## プロジェクト基本情報

- **本番URL**: <https://medical-intelligence-two.vercel.app>
- **GitHub**: <https://github.com/tomiyuta/medical-intelligence> (public)
- **ローカル**: `~/Projects/medical-intelligence/`
- **HEAD**: 52cbcef (phase5: 病床機能報告 令和6年度更新)
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
── 医療インフラ ──
  ⑤ 病院機能 (ScoringView) — 9因子評価+疾病フィルタ
⑥ 施設基準 (KijunView) — 976,149届出+10カテゴリcapability ⑦ 施設マップ (GeoMapView) — Google Maps

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
- 三重県 (24): 7圏域 → 3圏域 (北勢/中勢伊賀/南勢志摩)
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
    by_pref[d['pref']]['b'] += d['beds']
ranked = sorted(by_pref.items(), key=lambda x: -x[1]['b'])
print('全47都道府県:', len(by_pref))
for p, v in ranked[:5] + [('---',{'h':0,'w':0,'b':0})] + ranked[-5:]:
    print(f'{p}: h={v[\"h\"]} w={v[\"w\"]} b={v[\"b\"]:,}')
"
```

---

### Priority 6: 患者調査（令和5年・受療率・大分類限定）← 次の最優先タスク

**スコープ厳格化**（ChatGPTレビュー条件付き採択）:

- 採用: 令和5年患者調査 / 都道府県別 / 傷病大分類または中分類 / 受療率 / 入院・外来別
- 不採用: 推計患者数の絶対値前面表示 / 小分類フル投入 / 「疾患別罹患率」という表現 / 二次医療圏推定

**開始時タスク**:

1. 厚労省 患者調査 公式ページで R5 公表データのURL確認
2. 受療率（人口10万対）を 都道府県 × 大分類 × 入院/外来 で抽出
3. NdbView または AreaView に「需要側」レイヤーとして統合
4. 「これはNDB（供給）とは異なり、受療側の標本推計である」旨を明記

### Priority 7-8: Disease領域タブ(NdbView内)/per capita切替

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
