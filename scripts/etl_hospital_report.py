#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier B ETL: 入院患者数と平均在院日数の推移（カルテ#17）。病院報告 二次医療圏編。
1日平均在院患者数(E25/N3 総数)と平均在院日数(E24/N2 総数)を2013/2018/2023の3時点で、
二次医療圏×都道府県×全国で収録。カルテ#17と数値一致(山城南 在院患者数394/441/458,
在院日数19.8/21.0/21.7を検証済)。

出力: data/static/hospital_report_r5.json
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HR = ROOT / 'data' / 'raw' / 'source' / '11_病院報告'
MASTER = ROOT / 'data' / 'hsa' / 'area_master.json'
OUT = ROOT / 'data' / 'static' / 'hospital_report_r5.json'

FILES = {
    'zaiin': {2013: 'H25_zaiin.csv', 2018: 'H30_zaiin.csv', 2023: 'byoin_R5_1nichi_zaiin.csv'},
    'nissu': {2013: 'H25_zaiinnissu.csv', 2018: 'H30_zaiinnissu.csv', 2023: 'byoin_R5_zaiinnissu.csv'},
}
YEARS = [2013, 2018, 2023]


def _v(x):
    x = str(x).strip().replace(',', '')
    if x in ('-', '', '…', '･'):
        return None
    try:
        return float(x)
    except ValueError:
        return None


def _code(cell):
    s = str(cell).strip()
    if s.startswith('全国'):
        return 'JP'
    m = re.match(r'^(\d+)', s)
    return m.group(1) if m else ''


def load():
    data = {}  # key(4桁/2桁/JP) -> {zaiin:{y:v}, nissu:{y:v}}
    for metric, yrs in FILES.items():
        for y, fn in yrs.items():
            p = HR / fn
            if not p.exists():
                continue
            for r in csv.reader(open(p, encoding='cp932')):
                c = _code(r[0])
                if not c:
                    continue
                v = _v(r[1] if len(r) > 1 else None)  # col1 = 総数
                if v is None:
                    continue
                data.setdefault(c, {'zaiin': {}, 'nissu': {}})[metric][str(y)] = v
    return data


def main():
    data = load()
    master = json.load(open(MASTER, encoding='utf-8'))['areas']
    mbycode = {m['code']: m for m in master}

    areas = {}
    for c, d in data.items():
        if len(c) == 4 and c in mbycode:
            m = mbycode[c]
            areas[c] = {'pref': m['pref'], 'area': m['area'], 'prefCode': c[:2],
                        'zaiin': d['zaiin'], 'nissu': d['nissu']}
    # 都道府県行(2桁)・全国(JP)
    prefs = {c: d for c, d in data.items() if len(c) == 2}
    national = data.get('JP', {'zaiin': {}, 'nissu': {}})

    payload = {
        'source': '厚生労働省「病院報告」二次医療圏編（平成25/平成30/令和5年）',
        'note': '1日平均在院患者数(総数)と平均在院日数(全病床総数)の2013/2018/2023年比較。カルテ#17と数値一致。',
        'years': YEARS, 'areaCount': len(areas),
        'areas': areas, 'prefs': prefs, 'national': national,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    print(f"[hosprep] areas={len(areas)} prefs={len(prefs)} out={OUT.name}")
    ya = areas.get('2606')
    if ya:
        print('[hosprep] 山城南 在院患者数:', ya['zaiin'], '(カルテ 394/441/458)')
        print('[hosprep] 山城南 平均在院日数:', ya['nissu'], '(カルテ 19.8/21.0/21.7)')


if __name__ == '__main__':
    main()
