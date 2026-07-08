#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier B ETL: 二次医療圏の概況(#4 圏概況)。人口・面積・人口密度を都道府県内比較で。
人口=令和2年国勢調査(population_r5の2020総人口)、面積=地域医療構想見える化(2020国勢調査面積)。
出力を都道府県ごとにまとめ、府内比較＋府計＋全国行を持たせる。

出力: data/static/area_overview.json
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POP = ROOT / 'data' / 'static' / 'population_r5.json'
NEC = ROOT / 'data' / 'static' / 'bed_necessity_r6.json'
MASTER = ROOT / 'data' / 'hsa' / 'area_master.json'
MSN1 = ROOT / 'data' / 'raw' / 'source' / '09_医療施設調査' / 'N1_病院数病床種類別.csv'
MSN2 = ROOT / 'data' / 'raw' / 'source' / '09_医療施設調査' / 'N2_診療所数.csv'
OUT = ROOT / 'data' / 'static' / 'area_overview.json'

# 全国土面積(㎢, 令和2国勢調査・北方領土竹島除く)。三重県の圏別面積が構想区域統合で欠くため、
# 全国行は既知の確定値を用いる(人口は全圏合算で一致)。
NATIONAL_AREA = 372864.20


def _v(x):
    x = str(x).strip().replace(',', '')
    return 0 if x in ('-', '', '…', '･') else int(float(x))


def _code(cell):
    m = re.match(r'^(\d+)', str(cell).strip())
    return m.group(1) if m else ''


def load_facilities():
    """医療施設調査R5(二次医療圏編)から圏別 病院数/一般病床/療養病床/一般診療所数。
    4桁=二次医療圏の小計行を直接読む。N1: 病院数=1,療養病床=11,一般病床=12。N2: 一般診療所数=1。"""
    fac = {}
    if MSN1.exists():
        for r in csv.reader(open(MSN1, encoding='cp932')):
            c = _code(r[0])
            if len(c) == 4 and len(r) > 12:
                d = fac.setdefault(c, {})
                d['byoin'] = _v(r[1]); d['ippan'] = _v(r[12]); d['ryoyo'] = _v(r[11])
    if MSN2.exists():
        for r in csv.reader(open(MSN2, encoding='cp932')):
            c = _code(r[0])
            if len(c) == 4:
                fac.setdefault(c, {})['shinryo'] = _v(r[1])
    return fac


def main():
    pop = json.load(open(POP, encoding='utf-8'))['areas']
    nec = json.load(open(NEC, encoding='utf-8'))['areas']
    master = json.load(open(MASTER, encoding='utf-8'))['areas']
    fac = load_facilities()

    def per100k(cnt, p):
        return round(cnt / p * 1e5, 1) if cnt is not None and p else None

    by_pref = {}
    areas = {}
    nat_pop = 0
    nat_fac = {'byoin': 0, 'ippan': 0, 'ryoyo': 0, 'shinryo': 0}
    for m in master:
        c = m['code']
        p = pop.get(c)
        if not p:
            continue
        pp = p['years']['2020']['total']
        area_km2 = nec[c]['menseki'] if c in nec else None
        density = round(pp / area_km2, 1) if area_km2 else None
        f = fac.get(c, {})
        med = {
            'byoin': f.get('byoin'), 'shinryo': f.get('shinryo'),
            'ippan': f.get('ippan'), 'ryoyo': f.get('ryoyo'),
            'byoinP': per100k(f.get('byoin'), pp), 'shinryoP': per100k(f.get('shinryo'), pp),
            'ippanP': per100k(f.get('ippan'), pp), 'ryoyoP': per100k(f.get('ryoyo'), pp),
        }
        for k in nat_fac:
            if f.get(k) is not None:
                nat_fac[k] += f[k]
        rec = {'code': c, 'area': m['area'], 'pop': pp, 'menseki': area_km2, 'density': density, 'med': med}
        areas[c] = {'pref': m['pref'], **rec}
        by_pref.setdefault(m['pref'], []).append(rec)
        nat_pop += pp

    prefs = {}
    for pf, lst in by_pref.items():
        lst.sort(key=lambda x: x['code'])
        tp = sum(x['pop'] for x in lst)
        haveA = [x for x in lst if x['menseki'] is not None]
        tm = round(sum(x['menseki'] for x in haveA), 2) if len(haveA) == len(lst) else None
        # 府計の医療資源(実数合算→府人口で10万対)
        pf_fac = {k: sum((x['med'][k] or 0) for x in lst) for k in ('byoin', 'shinryo', 'ippan', 'ryoyo')}
        prefs[pf] = {
            'areas': lst,
            'total': {'pop': tp, 'menseki': tm, 'density': round(tp / tm, 1) if tm else None,
                      'areaComplete': len(haveA) == len(lst),
                      'med': {'byoinP': per100k(pf_fac['byoin'], tp), 'shinryoP': per100k(pf_fac['shinryo'], tp),
                              'ippanP': per100k(pf_fac['ippan'], tp), 'ryoyoP': per100k(pf_fac['ryoyo'], tp)}},
        }

    payload = {
        'source': '人口=令和2年国勢調査、面積=地域医療構想 病床機能等の見える化(令和6年度)の2020国勢調査面積',
        'note': '人口密度=人口÷面積。三重県は構想区域統合により圏別面積が欠測(人口のみ)。',
        'national': {'pop': nat_pop, 'menseki': NATIONAL_AREA, 'density': round(nat_pop / NATIONAL_AREA, 1),
                     'med': {'byoinP': per100k(nat_fac['byoin'], nat_pop), 'shinryoP': per100k(nat_fac['shinryo'], nat_pop),
                             'ippanP': per100k(nat_fac['ippan'], nat_pop), 'ryoyoP': per100k(nat_fac['ryoyo'], nat_pop)}},
        'facSource': '令和5年医療施設(静態・動態)調査 二次医療圏編。人口10万対は令和2年国勢調査人口で算出'
                     '(カルテ#9は公表時点推計人口ベースのため絶対値に±2%程度差。施設数・病床数の実数は一致)。',
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
