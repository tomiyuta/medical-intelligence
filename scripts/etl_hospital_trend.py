#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier B ETL: 病床数及び診療実績の推移（カルテ#14 一般病床 / #15 療養病床 / #16 一般+療養）。
病院報告 二次医療圏編 2013-2023(全11年)の 1日平均在院患者数(N3)・平均在院日数(N2)・
病床利用率(N1)を病床種類別に集約。カルテ#14と数値一致(山城南 一般病床 2013 入院351/在院日数18.0/
利用率68.7)。※カルテの「病床数」線は医療施設調査(3年毎)由来のため本パネルは診療実績3指標を主軸。

出力: data/static/hospital_trend_r5.json
"""
import csv
import re
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'raw' / 'source' / '11_病院報告' / 'trend'
MASTER = ROOT / 'data' / 'hsa' / 'area_master.json'
OUT = ROOT / 'data' / 'static' / 'hospital_trend_r5.json'

YEARS = list(range(2013, 2024))
# 列(0-based): zaiin 総=1/一般=4/療養=3, nissu 総=1/一般=3/療養=2, riyou 総=1/一般=3/療養=2
COLS = {
    'zaiin': {'total': 1, 'ippan': 4, 'ryoyo': 3},
    'nissu': {'total': 1, 'ippan': 3, 'ryoyo': 2},
    'riyou': {'total': 1, 'ippan': 3, 'ryoyo': 2},
}
KINDS = ['ippan', 'ryoyo', 'total']  # 一般病床 / 療養病床 / 一般+療養(総数)


def num(x):
    x = str(x).strip().replace(',', '')
    if x in ('-', '', '…', '･', '***'):
        return None
    try:
        return float(x)
    except ValueError:
        return None


def code_of(cell):
    m = re.match(r'^(\d+)', str(cell).strip())
    return m.group(1) if m else ''


def load_year(y):
    """{code: {kind: {zaiin,nissu,riyou}}}"""
    out = {}
    for metric in ('zaiin', 'nissu', 'riyou'):
        p = SRC / f'{y}_{metric}.csv'
        if not p.exists():
            continue
        for r in csv.reader(open(p, encoding='cp932')):
            c = code_of(r[0])
            if len(c) != 4:
                continue
            d = out.setdefault(c, {})
            for kind, col in COLS[metric].items():
                v = num(r[col] if len(r) > col else None)
                if v is not None:
                    d.setdefault(kind, {})[metric] = v
    return out


def main():
    master = {m['code']: m for m in json.load(open(MASTER, encoding='utf-8'))['areas']}
    per_year = {y: load_year(y) for y in YEARS}

    areas = {}
    for code, m in master.items():
        rec = {k: {} for k in KINDS}
        has = False
        for y in YEARS:
            yd = per_year[y].get(code, {})
            for kind in KINDS:
                v = yd.get(kind)
                if v:
                    rec[kind][str(y)] = {'zaiin': v.get('zaiin'), 'nissu': v.get('nissu'), 'riyou': v.get('riyou')}
                    has = True
        if has:
            areas[code] = {'pref': m['pref'], 'area': m['area'], 'kinds': rec}

    payload = {
        'source': '厚生労働省「病院報告」二次医療圏編（2013〜2023年）',
        'note': '1日平均在院患者数・平均在院日数・病床利用率の推移(病床種類別)。カルテ#14-16と数値一致。'
                'カルテの病床数線は医療施設調査(3年毎)由来のため本パネルは診療実績3指標を主軸。',
        'years': YEARS, 'areaCount': len(areas), 'areas': areas,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    print(f"[hosp-trend] areas={len(areas)} out={OUT.name} {OUT.stat().st_size/1e6:.2f}MB")
    ya = areas.get('2606')
    if ya:
        ip = ya['kinds']['ippan']
        print('[hosp-trend] 山城南 一般病床 入院患者数:', {y: ip.get(y, {}).get('zaiin') for y in ('2013', '2018', '2023')}, '(カルテ 351/408/410)')
        print('  在院日数:', {y: ip.get(y, {}).get('nissu') for y in ('2013', '2018', '2023')}, '(18.0/19.5/19.7)')
        print('  利用率:', {y: ip.get(y, {}).get('riyou') for y in ('2013', '2018', '2023')}, '(68.7/66.8/64.7)')


if __name__ == '__main__':
    main()
