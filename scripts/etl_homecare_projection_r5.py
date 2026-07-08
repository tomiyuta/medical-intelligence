#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier B ETL: 在宅医療患者数の将来推計（発生率法, カルテ#50/#51）。
第10回NDBオープンデータ「C 在宅医療」の在宅時医学総合管理料(C002)・施設入居時等
医学総合管理料(C002-2)の全国・性年齢別算定回数から発生率を求め、社人研圏別将来人口
(細分19階級=90+分割, population_fine_r5)に乗じて圏別に将来推計。月件数=年間算定/12。

★90+分割の細分人口を使うことで将来トレンド(増減率)がカルテ#50/#51とほぼ一致(山城南
+88.8% vs カルテ+91.8%)。絶対水準は性別集約・NDB秘匿で約2〜3割上振れ=参考推計。
"""
import json
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'raw' / 'source' / '10_NDB' / 'C_zaitaku.xlsx'
FINE = ROOT / 'data' / 'static' / 'population_fine_r5.json'
OUT = ROOT / 'data' / 'static' / 'homecare_projection_r5.json'

# 19階級(0-4…85-89,90+) → 年齢グループ(カルテ#50)
AGE_GROUPS = [
    ('15歳未満', [0, 1, 2]), ('15〜64歳', list(range(3, 13))),
    ('65〜74歳', [13, 14]), ('75〜84歳', [15, 16]), ('85歳以上', [17, 18]),
]


def num(v):
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        return v
    s = str(v).strip().replace(',', '')
    if s in ('-', '', '…', '･'):
        return 0
    try:
        return float(s)
    except ValueError:
        return 0


def load_ndb():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb['全体']
    z = [0] * 19; s = [0] * 19; cur = ''
    for row in ws.iter_rows(min_row=5, values_only=True):
        c0 = str(row[0]).strip() if row[0] else ''
        if c0:
            cur = c0
        tgt = z if cur == 'C002' else (s if cur == 'C002-2' else None)
        if tgt is None:
            continue
        for b in range(19):  # 男 col6-24, 女 col25-43
            tgt[b] += num(row[6 + b]) + num(row[25 + b] if len(row) > 25 + b else 0)
    wb.close()
    return z, s


def main():
    z, s = load_ndb()
    fp = json.load(open(FINE, encoding='utf-8'))
    years = fp['years']; areas = fp['areas']
    nb = [0] * 19
    for a in areas.values():
        for i in range(19):
            nb[i] += a['years']['2020'][i]
    rz = [z[i] / nb[i] if nb[i] else 0 for i in range(19)]
    rs = [s[i] / nb[i] if nb[i] else 0 for i in range(19)]

    out = {}
    for code, a in areas.items():
        series = []
        for y in years:
            b = a['years'][str(y)]
            zt = sum(rz[i] * b[i] for i in range(19)) / 12.0
            st = sum(rs[i] * b[i] for i in range(19)) / 12.0
            byage = {lbl: round(sum((rz[i] + rs[i]) * b[i] for i in idx) / 12.0)
                     for lbl, idx in AGE_GROUPS}
            series.append({'year': int(y), 'zaitaku': round(zt), 'shisetsu': round(st),
                           'total': round(zt + st), 'byAge': byage})
        base = series[0]['total'] or 1
        out[code] = {'pref': a.get('pref', ''), 'area': a.get('area', ''), 'series': series,
                     'growth': round((series[-1]['total'] / base - 1) * 100, 1)}
    # pref/area names from population_r5
    pr = json.load(open(ROOT / 'data' / 'static' / 'population_r5.json', encoding='utf-8'))['areas']
    for c in out:
        if c in pr:
            out[c]['pref'] = pr[c]['pref']; out[c]['area'] = pr[c]['area']

    payload = {
        'source': '第10回NDBオープンデータ(2023年度診療分) 在宅時/施設入居時医学総合管理料 × 社人研令和5年推計人口(90+分割)',
        'note': '発生率法(参考推計)。全国年齢別発生率×圏将来人口。月件数=年間算定回数/12。'
                '増減率(将来トレンド)はカルテ#50/#51とほぼ一致。絶対水準は性別集約・NDB秘匿で約2〜3割上振れ。',
        'years': [int(y) for y in years], 'areaCount': len(out), 'areas': out,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    print(f"[homecare] areas={len(out)} out={OUT.name} {OUT.stat().st_size/1e6:.2f}MB")
    ya = out.get('2606')
    if ya:
        print(f"[homecare] 山城南 2020計{ya['series'][0]['total']}(カルテ669)"
              f" 2050計{ya['series'][-1]['total']}(1283) 増減{ya['growth']}%(カルテ+91.8%)")


if __name__ == '__main__':
    main()
