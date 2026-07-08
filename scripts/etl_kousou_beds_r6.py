#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""P2/Tier B ETL: 地域医療構想「病床機能等の見える化（令和6年度）」構想区域別必要病床数。
医療需給総覧カルテ #19「病床機能別の病床数の推移と必要病床数」をネイティブ再構築。
1ファイルに 2015〜2024 病床機能報告実績・2025見込量・2025必要数（地域医療構想の固定値）が揃う。
併せて #4 圏概況用の 2020国勢調査人口・2020面積 も抽出。

構想区域コード(列idx1, 例 2606=山城南)= 二次医療圏コードで area_master と結合。
※一部県は複数二次医療圏を1構想区域に統合しているため、直接一致した圏のみ収録。

出力: data/static/bed_necessity_r6.json
"""
import json
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'raw' / 'source' / '08_地域医療構想' / 'kousou_byosho.xlsx'
MASTER = ROOT / 'data' / 'hsa' / 'area_master.json'
OUT = ROOT / 'data' / 'static' / 'bed_necessity_r6.json'

FUNCS = ('合計', '高度急性期', '急性期', '回復期', '慢性期')
# 列インデックス(0-based): 機能label=4, 2015=5,(2016/17欠),2018=7,2019=8,2020=9,2021=10,2022=11,2023=12,2024=13, 見込=16, 必要=17
YEAR_COLS = {'2015': 5, '2018': 7, '2019': 8, '2020': 9, '2021': 10, '2022': 11, '2023': 12, '2024': 13}
COL_MIKOMI, COL_HITSUYO = 16, 17


def num(v):
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return None


def fnum(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def main():
    master = {m['code']: m for m in json.load(open(MASTER, encoding='utf-8'))['areas']}
    # 構想区域コードは先頭ゼロ無(北海道=101 ⇔ master 0101)。整数値で対応付け
    int2master = {int(c): c for c in master}
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb['構想区域別必要量との比較']

    areas = {}  # code -> {series, menseki, jinko}
    for row in ws.iter_rows(min_row=1, values_only=True):
        code = str(row[1]).strip() if row[1] is not None else ''
        if not code or code == 'None':
            continue
        l3 = str(row[3]).strip() if len(row) > 3 and row[3] is not None else ''
        l4 = str(row[4]).strip() if len(row) > 4 and row[4] is not None else ''
        a = areas.setdefault(code, {'series': {}, 'menseki': None, 'jinko': None})
        if l3 == '2020面積':
            a['menseki'] = fnum(row[5])
        elif l3 == '2020国勢調査人口':
            a['jinko'] = fnum(row[5])   # 万人
        if l4 in FUNCS and l4 not in a['series']:
            s = {y: num(row[c]) for y, c in YEAR_COLS.items()}
            s['見込'] = num(row[COL_MIKOMI])
            s['必要'] = num(row[COL_HITSUYO])
            a['series'][l4] = s
    wb.close()

    out = {}
    matched = 0
    for code, a in areas.items():
        try:
            hsa = int2master.get(int(code))
        except ValueError:
            hsa = None
        if not hsa:
            continue
        if not a['series'].get('合計'):
            continue
        m = master[hsa]
        matched += 1
        out[hsa] = {
            'pref': m['pref'], 'area': m['area'],
            'menseki': a['menseki'], 'jinko2020': a['jinko'],
            'series': a['series'],
        }

    payload = {
        'source': '厚生労働省「地域医療構想 地域別の病床機能等の見える化（令和6年度）」構想区域別',
        'note': '2015〜2024=病床機能報告実績、2025見込量・必要数=地域医療構想。必要数は構想区域単位の固定値。'
                '構想区域=二次医療圏(直接一致した圏のみ)。面積・人口は2020国勢調査。',
        'areaCount': matched, 'areas': out,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    print(f"[kousou] matched={matched}/{len(master)} out={OUT.name} {OUT.stat().st_size/1e6:.2f}MB")
    ya = out.get('2606')
    if ya:
        print('[kousou] 山城南 面積:', ya['menseki'], 'km2  人口:', ya['jinko2020'], '万')
        for f in FUNCS:
            print(f'  {f}: 2024実績={ya["series"][f]["2024"]} 必要={ya["series"][f]["必要"]}')


if __name__ == '__main__':
    main()
