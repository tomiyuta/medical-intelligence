#!/usr/bin/env python3
"""
phase6 ETL: 令和5年患者調査 表39 (受療率×傷病大分類×都道府県) → patient_survey_r5.json

データ出典: 厚労省 令和5年患者調査 都道府県編 第39表 (2024-12-20公表)
URL: https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040234483&fileKind=1
- 受療率（人口10万対）
- 都道府県別 × 傷病大分類 × 入院/外来

採用カラム:
- 入院 総数 (col 1)
- 外来 総数 (col 4)

非採用 (HANDOFF不採用方針):
- 病院/一般診療所/歯科 別の細分化
- 初診/再来 細分化
- 中分類/小分類

大分類抽出パターン: ローマ数字 Ⅰ〜ⅩⅫ で始まる行のみ採用 (中・小分類は全角空白で開始)
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'raw' / 'source' / '10_患者調査_R5' / 'R5_T39_utf8.csv'
OUT = ROOT / 'data' / 'static' / 'patient_survey_r5.json'

# 47都道府県 + 全国
PREFS = [
    '全国',
    '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
    '岐阜県', '静岡県', '愛知県', '三重県',
    '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
    '鳥取県', '島根県', '岡山県', '広島県', '山口県',
    '徳島県', '香川県', '愛媛県', '高知県',
    '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
]
PREF_SET = set(PREFS)

# CSV内の表記 → 正規化名 (e-Stat T39 は末尾suffixを省く)
def _strip_suffix(p):
    if p in ('全国', '北海道'):
        return p
    return p[:-1] if p.endswith(('県', '都', '府')) else p
CSV_TO_CANONICAL = {_strip_suffix(p): p for p in PREFS}
CSV_TO_CANONICAL_SET = set(CSV_TO_CANONICAL.keys())

# ローマ数字パターン (大分類)
ROMAN_PAT = re.compile(r'^(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ|Ⅶ|Ⅷ|Ⅸ|Ⅹ|ⅩⅠ|ⅩⅡ|ⅩⅢ|ⅩⅣ|ⅩⅤ|ⅩⅥ|ⅩⅦ|ⅩⅧ|ⅩⅨ|ⅩⅩ|ⅩⅩⅠ|ⅩⅩⅡ)　')

# CSV列インデックス (0-indexed):
# col 0: ラベル
# col 1: 入院 総数
# col 2: 入院 病院
# col 3: 入院 一般診療所
# col 4: 外来 総数
# col 5: 外来 病院
# ...
COL_INPATIENT_TOTAL = 1
COL_OUTPATIENT_TOTAL = 4


def safe_int(v):
    if v is None:
        return None
    s = str(v).strip()
    if s in ('', '-', '･', '‐', '...'):
        return None
    try:
        return int(s.replace(',', ''))
    except ValueError:
        try:
            return int(float(s))
        except ValueError:
            return None


def main():
    print(f'Reading {SRC.name}...')
    with open(SRC, 'r', encoding='utf-8') as f:
        rows = list(csv.reader(f))
    print(f'Total rows: {len(rows)}')

    # 状態機械: pref が見つかったら、続く行を解析
    result = {}
    current_pref = None
    categories_seen = set()

    for i, row in enumerate(rows):
        if not row:
            continue
        label = row[0].strip() if row[0] else ''

        # 都道府県名検出 (単独セル, CSV表記→正規化)
        if label in CSV_TO_CANONICAL_SET and (len(row) == 1 or all(not c.strip() for c in row[1:])):
            current_pref = CSV_TO_CANONICAL[label]
            result[current_pref] = {'total': {}, 'categories': {}}
            continue

        if current_pref is None:
            continue

        # 総数 行
        if label == '総数':
            inp = safe_int(row[COL_INPATIENT_TOTAL]) if len(row) > COL_INPATIENT_TOTAL else None
            outp = safe_int(row[COL_OUTPATIENT_TOTAL]) if len(row) > COL_OUTPATIENT_TOTAL else None
            result[current_pref]['total'] = {'inpatient': inp, 'outpatient': outp}
            continue

        # 大分類 行 (ローマ数字+全角空白で始まる)
        m = ROMAN_PAT.match(label)
        if m:
            chapter = m.group(1)
            name = label[len(chapter)+1:].strip()  # 「　」を除いた名称
            inp = safe_int(row[COL_INPATIENT_TOTAL]) if len(row) > COL_INPATIENT_TOTAL else None
            outp = safe_int(row[COL_OUTPATIENT_TOTAL]) if len(row) > COL_OUTPATIENT_TOTAL else None
            key = f'{chapter}_{name}'
            result[current_pref]['categories'][key] = {
                'chapter': chapter,
                'name': name,
                'inpatient': inp,
                'outpatient': outp,
            }
            categories_seen.add(key)

    # 検証
    print(f'\n都道府県カバー: {len(result)} / {len(PREFS)}')
    print(f'大分類ユニーク: {len(categories_seen)}')

    # サンプル: 全国・東京・高知・沖縄
    print('\n=== サンプル ===')
    for p in ['全国', '東京都', '高知県', '沖縄県']:
        if p not in result:
            continue
        d = result[p]
        print(f'{p}: 入院総数={d["total"].get("inpatient")} 外来総数={d["total"].get("outpatient")}')
        # Top3 大分類 by 外来
        top3 = sorted(d['categories'].items(), key=lambda x: -(x[1].get('outpatient') or 0))[:3]
        for k, v in top3:
            print(f'  {v["chapter"]} {v["name"]:<25}: 入院={v["inpatient"]}, 外来={v["outpatient"]}')

    # 全国受療率の妥当性チェック
    nat_inp = result['全国']['total'].get('inpatient')
    nat_out = result['全国']['total'].get('outpatient')
    print(f'\n全国総数: 入院={nat_inp} (想定945) / 外来={nat_out} (想定5850)')

    # 出力
    output = {
        'source': '厚労省 令和5年患者調査 都道府県編 第39表',
        'source_url': 'https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040234483&fileKind=1',
        'published': '2024-12-20',
        'survey_year': 2023,
        'unit': '受療率（人口10万対, 患者住所地ベース）',
        'note': 'NDB（供給）とは異なる、医療施設利用者の標本推計。3年に1回の調査。',
        'categories': sorted(list(categories_seen)),
        'prefectures': result,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f'\nWrote {OUT} ({OUT.stat().st_size // 1024}KB)')


if __name__ == '__main__':
    main()
