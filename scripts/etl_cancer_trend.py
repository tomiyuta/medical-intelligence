#!/usr/bin/env python3
"""
Cancer Site 30-Year Trend ETL (1995-2024)
出典: 国立がん研究センター がん情報サービス
URL : https://ganjoho.jp/reg_stat/statistics/data/dl/index.html
基準: 1985年昭和60年モデル人口、75歳未満年齢調整死亡率 (ASR75, 人口10万対)

入力 (data/raw_cancer/):
  1. pref_CancerSite_mortalityASR75_1995-2024.xls
       sheet 'asr75': コード/部位/番号/都道府県/性別 + 1995..2024 (col5..34)
       → 部位別 (胃/大腸/肝/肺/乳房/前立腺) + 全部位 の ASR75 時系列(主ソース)
  2. pref_AllCancer_mortality_1995-2024.xls
       sheet 'asr75': 都道府県番号/都道府県/性別 + 1995..2024 (col3..32)
       → 全部位のみ。独立ソースとして CancerSite の 02100(全部位) 系列を全年で相互検証

出力: data/static/cancer_trend.json
  部位 × 性 × (47県 + 全国) × 年(1995-2024) の ASR75 時系列。
  値は years 配列に整列した配列で格納。欠損は null。

設計方針:
  - 出力7部位すべて CancerSite ファイルを主ソースとする
    → 既存 cancer_sites_mortality_2024.json (同ファイル由来) と 2024 値が
      丸め処理まで含めて厳密一致する。
  - AllCancer ファイルは 02100(全部位) 系列の独立検証に使用し、最大乖離を報告。
既存 scripts/etl_cancer_sites_2024.py のパース流儀 (xlrd, SITE_CODES, round2) を踏襲。
"""
import xlrd
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE_SRC = ROOT / 'data/raw_cancer/pref_CancerSite_mortalityASR75_1995-2024.xls'
ALL_SRC = ROOT / 'data/raw_cancer/pref_AllCancer_mortality_1995-2024.xls'
OUT_PATH = ROOT / 'data/static/cancer_trend.json'
CMP_PATH = ROOT / 'data/static/cancer_sites_mortality_2024.json'

# 既存 etl_cancer_sites_2024.py と同一の SITE_CODES 定義
SITE_CODES = {
    '02100': {'name': '全部位', 'icd': 'C00-C97', 'short': 'all'},
    '02103': {'name': '胃', 'icd': 'C16', 'short': 'stomach'},
    '02145': {'name': '大腸', 'icd': 'C18-C20', 'short': 'colorectal'},
    '02106': {'name': '肝・肝内胆管', 'icd': 'C22', 'short': 'liver'},
    '02110': {'name': '肺・気管', 'icd': 'C33-C34', 'short': 'lung'},
    '02112': {'name': '乳房', 'icd': 'C50', 'short': 'breast', 'sex_only': '女'},
    '02115': {'name': '前立腺', 'icd': 'C61', 'short': 'prostate', 'sex_only': '男'},
}
PREFS_47 = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県']


def round2(v):
    """数値なら 2 桁丸め、それ以外(空/文字/欠損)は None。"""
    if isinstance(v, (int, float)) and v != '':
        try:
            return round(float(v), 2)
        except (ValueError, TypeError):
            return None
    return None


def parse_site_file():
    """CancerSite ファイルを全年パースし、years と系列辞書を返す。"""
    wb = xlrd.open_workbook(str(SITE_SRC))
    ws = wb.sheet_by_name('asr75')

    header = [ws.cell(0, c).value for c in range(ws.ncols)]
    year_cols = {}
    for c in range(5, ws.ncols):
        v = header[c]
        if isinstance(v, (int, float)) and v >= 1995:
            year_cols[int(v)] = c
    years = sorted(year_cols.keys())

    # national[short][sex] = [値...] (years 整列)
    national = {}
    prefectures = {}

    for r in range(1, ws.nrows):
        code = str(ws.cell(r, 0).value).strip()
        if code not in SITE_CODES:
            continue
        pref = ws.cell(r, 3).value.strip()
        sex = ws.cell(r, 4).value.strip()
        if pref != '全国' and pref not in PREFS_47:
            continue

        short = SITE_CODES[code]['short']
        series = [round2(ws.cell(r, year_cols[y]).value) for y in years]

        if pref == '全国':
            national.setdefault(short, {})[sex] = series
        else:
            prefectures.setdefault(pref, {}).setdefault(short, {})[sex] = series

    return years, national, prefectures


def parse_allcancer_file():
    """AllCancer asr75 シートを全年パースし、検証用 all[pref_num][sex] = {year:値} を返す。"""
    wb = xlrd.open_workbook(str(ALL_SRC))
    ws = wb.sheet_by_name('asr75')
    header = [ws.cell(0, c).value for c in range(ws.ncols)]
    year_cols = {}
    for c in range(3, ws.ncols):
        v = header[c]
        if isinstance(v, (int, float)) and v >= 1995:
            year_cols[int(v)] = c

    data = {}  # pref_num(int) -> sex -> {year: rounded値}
    for r in range(1, ws.nrows):
        num = ws.cell(r, 0).value
        if not isinstance(num, (int, float)):
            continue
        num = int(num)
        sex = ws.cell(r, 2).value.strip()
        data.setdefault(num, {})[sex] = {y: round2(ws.cell(r, year_cols[y]).value) for y in year_cols}
    return data


def cross_validate(years, national, prefectures, all_data):
    """CancerSite 02100(全部位) と AllCancer(全部位) を全年・全県・全性で照合。"""
    # pref番号 -> CancerSite側の (national or pref) 系列
    def site_all(num):
        if num == 0:
            return national.get('all', {})
        return prefectures.get(PREFS_47[num - 1], {}).get('all', {})

    max_diff = 0.0
    max_loc = None
    compared = 0
    mismatches = 0
    for num, sex_map in all_data.items():
        site_series = site_all(num)
        for sex, ymap in sex_map.items():
            svals = site_series.get(sex)
            if svals is None:
                continue
            for i, y in enumerate(years):
                a = ymap.get(y)
                b = svals[i]
                if a is None or b is None:
                    continue
                compared += 1
                d = abs(a - b)
                if d > max_diff:
                    max_diff = d
                    max_loc = (num, PREFS_47[num - 1] if num else '全国', sex, y, a, b)
                if d > 0.01:  # 丸め後に 0.01 超の差 = 実質不一致
                    mismatches += 1
    return compared, mismatches, max_diff, max_loc


def main():
    years, national, prefectures = parse_site_file()
    print(f"検出年: {years[0]}~{years[-1]} ({len(years)} 年)")
    print(f"national sites: {sorted(national.keys())}")
    print(f"prefectures: {len(prefectures)} 県")

    all_data = parse_allcancer_file()
    compared, mismatches, max_diff, max_loc = cross_validate(years, national, prefectures, all_data)
    print("\n=== AllCancer 独立検証 (vs CancerSite 02100 全部位) ===")
    print(f"  照合セル数: {compared}  0.01超不一致: {mismatches}  最大乖離: {max_diff:.4f}")
    if max_loc:
        print(f"  最大乖離箇所: pref={max_loc[1]} sex={max_loc[2]} year={max_loc[3]} all={max_loc[4]} site02100={max_loc[5]}")

    output = {
        '_phase': 'Cancer Site 30-Year Trend ETL',
        '_source': '国立がん研究センター がん情報サービス',
        '_source_url': 'https://ganjoho.jp/reg_stat/statistics/data/dl/index.html',
        '_source_files': [
            'pref_CancerSite_mortalityASR75(1995-2024).xls',
            'pref_AllCancer_mortality(1995-2024).xls',
        ],
        '_basis': '1985年昭和60年モデル人口、75歳未満年齢調整死亡率',
        '_unit': '人口10万対',
        '_caveat': '75歳未満年齢調整死亡率(1985年モデル人口)。高齢者死亡を含まない。検診普及・診断精度・登録精度の変化を含むため医療の質の直接指標ではない。',
        '_generated_at': '2026-07-09',
        '_sites': SITE_CODES,
        'years': years,
        'national': national,
        'prefectures': prefectures,
    }

    OUT_PATH.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')))
    print(f"\n[OK] {OUT_PATH} ({OUT_PATH.stat().st_size:,} bytes)")

    # 2024 断面の整合テスト (vs 既存 cancer_sites_mortality_2024.json)
    if CMP_PATH.exists():
        cmp = json.loads(CMP_PATH.read_text())
        idx2024 = years.index(2024)
        checked = 0
        diffs = []

        def check(trend_node, ref_node, path):
            nonlocal checked
            for short, sexmap in ref_node.items():
                for sex, refv in sexmap.items():
                    tv = trend_node.get(short, {}).get(sex)
                    trend_val = tv[idx2024] if isinstance(tv, list) else None
                    checked += 1
                    if refv is None and trend_val is None:
                        continue
                    if refv != trend_val:
                        diffs.append((path, short, sex, trend_val, refv))

        check(national, cmp['national'], '全国')
        for pref, ref_node in cmp['prefectures'].items():
            check(prefectures.get(pref, {}), ref_node, pref)

        print("\n=== 2024 整合テスト (vs cancer_sites_mortality_2024.json) ===")
        print(f"  照合値数: {checked}  不一致: {len(diffs)}")
        if diffs:
            for d in diffs[:20]:
                print("   MISMATCH", d)
        else:
            print("  [PASS] 全 2024 値が既存 JSON と厳密一致")
    else:
        print(f"\n[WARN] 比較対象 {CMP_PATH} が無いため 2024 整合テストをスキップ")


if __name__ == '__main__':
    main()
