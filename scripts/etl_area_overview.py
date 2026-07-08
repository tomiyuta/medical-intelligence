#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier B ETL: 二次医療圏の概況(#4 圏概況)。人口・面積・人口密度を都道府県内比較で。
人口=令和2年国勢調査(population_r5の2020総人口)、面積=地域医療構想見える化(2020国勢調査面積)。
出力を都道府県ごとにまとめ、府内比較＋府計＋全国行を持たせる。

出力: data/static/area_overview.json
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POP = ROOT / 'data' / 'static' / 'population_r5.json'
NEC = ROOT / 'data' / 'static' / 'bed_necessity_r6.json'
MASTER = ROOT / 'data' / 'hsa' / 'area_master.json'
OUT = ROOT / 'data' / 'static' / 'area_overview.json'

# 全国土面積(㎢, 令和2国勢調査・北方領土竹島除く)。三重県の圏別面積が構想区域統合で欠くため、
# 全国行は既知の確定値を用いる(人口は全圏合算で一致)。
NATIONAL_AREA = 372864.20


def main():
    pop = json.load(open(POP, encoding='utf-8'))['areas']
    nec = json.load(open(NEC, encoding='utf-8'))['areas']
    master = json.load(open(MASTER, encoding='utf-8'))['areas']

    by_pref = {}
    areas = {}
    nat_pop = 0
    for m in master:
        c = m['code']
        p = pop.get(c)
        if not p:
            continue
        pp = p['years']['2020']['total']
        area_km2 = nec[c]['menseki'] if c in nec else None
        density = round(pp / area_km2, 1) if area_km2 else None
        rec = {'code': c, 'area': m['area'], 'pop': pp, 'menseki': area_km2, 'density': density}
        areas[c] = {'pref': m['pref'], **rec}
        by_pref.setdefault(m['pref'], []).append(rec)
        nat_pop += pp

    prefs = {}
    for pf, lst in by_pref.items():
        lst.sort(key=lambda x: x['code'])
        tp = sum(x['pop'] for x in lst)
        haveA = [x for x in lst if x['menseki'] is not None]
        tm = round(sum(x['menseki'] for x in haveA), 2) if len(haveA) == len(lst) else None
        prefs[pf] = {
            'areas': lst,
            'total': {'pop': tp, 'menseki': tm, 'density': round(tp / tm, 1) if tm else None,
                      'areaComplete': len(haveA) == len(lst)},
        }

    payload = {
        'source': '人口=令和2年国勢調査、面積=地域医療構想 病床機能等の見える化(令和6年度)の2020国勢調査面積',
        'note': '人口密度=人口÷面積。三重県は構想区域統合により圏別面積が欠測(人口のみ)。',
        'national': {'pop': nat_pop, 'menseki': NATIONAL_AREA, 'density': round(nat_pop / NATIONAL_AREA, 1)},
        'prefs': prefs, 'areas': areas,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    print(f"[overview] prefs={len(prefs)} areas={len(areas)} national_pop={nat_pop} out={OUT.name}")
    k = prefs.get('京都府')
    if k:
        print('[overview] 京都府計:', k['total'])
        for a in k['areas']:
            print(f"  {a['area']}: 人口{a['pop']} 面積{a['menseki']} 密度{a['density']}")


if __name__ == '__main__':
    main()
