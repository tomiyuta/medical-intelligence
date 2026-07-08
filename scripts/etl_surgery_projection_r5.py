#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier B ETL: 手術件数の将来推計（発生率法, カルテ#44/#45）。
第10回NDBオープンデータ「K 手術」の入院/外来シート(診療行為×性×5歳階級 算定回数)から
全国年齢別発生率を求め、社人研圏別将来人口(90+分割 population_fine_r5)に乗じて圏別に推計。
#44=年齢区分別 入院/外来手術件数、#45=部位別(款)手術件数。

★手術は年齢分散が大きく、絶対水準がカルテ#44とほぼ一致(山城南 入院手術2020=7174 vs
カルテ6976=+2.8%, 増減+13% vs +10.5%)。在宅より高精度。参考推計だが水準も近い。
"""
import json
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'raw' / 'source' / '10_NDB' / 'K_shujutsu.xlsx'
FINE = ROOT / 'data' / 'static' / 'population_fine_r5.json'
POPR5 = ROOT / 'data' / 'static' / 'population_r5.json'
OUT = ROOT / 'data' / 'static' / 'surgery_projection_r5.json'

AGE_GROUPS = [
    ('年少人口', [0, 1, 2]), ('生産年齢人口', list(range(3, 13))),
    ('前期高齢者', [13, 14]), ('後期高齢者', [15, 16, 17, 18]),
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


def load_sheet(sh):
    """(全体by19band, 款別by19band)。男 col7-25, 女 col26-44。款=col0。"""
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb[sh]
    total = [0] * 19
    parts = {}
    cur = ''
    for row in ws.iter_rows(min_row=5, values_only=True):
        k = str(row[0]).strip() if row[0] else ''
        if k:
            cur = k
        ageband = [num(row[7 + b]) + num(row[26 + b] if len(row) > 26 + b else 0) for b in range(19)]
        for b in range(19):
            total[b] += ageband[b]
        p = parts.setdefault(cur, [0] * 19)
        for b in range(19):
            p[b] += ageband[b]
    wb.close()
    return total, parts


def main():
    nyuin, nyuin_parts = load_sheet('入院')
    gairai, gairai_parts = load_sheet('外来')
    fp = json.load(open(FINE, encoding='utf-8'))
    years = fp['years']; areas = fp['areas']
    nb = [0] * 19
    for a in areas.values():
        for i in range(19):
            nb[i] += a['years']['2020'][i]

    def rate(agg):
        return [agg[i] / nb[i] if nb[i] else 0 for i in range(19)]

    r_ny, r_ga = rate(nyuin), rate(gairai)
    # 部位(款)別 発生率(入院+外来合算)。款名を短縮
    part_rates = {}
    for k in set(list(nyuin_parts) + list(gairai_parts)):
        comb = [nyuin_parts.get(k, [0] * 19)[i] + gairai_parts.get(k, [0] * 19)[i] for i in range(19)]
        part_rates[k] = rate(comb)

    def clean_part(k):
        # "第１款　皮膚・皮下組織" → "皮膚・皮下組織"
        import re
        return re.sub(r'^第[０-９0-9]+款[　\s]*', '', k)

    out = {}
    for code, a in areas.items():
        series = []
        for y in years:
            b = a['years'][str(y)]
            ny = sum(r_ny[i] * b[i] for i in range(19))
            ga = sum(r_ga[i] * b[i] for i in range(19))
            byage = {lbl: round(sum((r_ny[i] + r_ga[i]) * b[i] for i in idx)) for lbl, idx in AGE_GROUPS}
            series.append({'year': int(y), 'nyuin': round(ny), 'gairai': round(ga),
                           'total': round(ny + ga), 'byAge': byage})
        # 2020断面の部位別(入院+外来)
        b0 = a['years']['2020']
        parts = sorted(
            [{'name': clean_part(k), 'count': round(sum(r[i] * b0[i] for i in range(19)))}
             for k, r in part_rates.items() if clean_part(k)],
            key=lambda x: -x['count'])[:12]
        base = series[0]['nyuin'] or 1
        out[code] = {'pref': a.get('pref', ''), 'area': a.get('area', ''), 'series': series,
                     'parts2020': parts,
                     'growthNyuin': round((series[-1]['nyuin'] / base - 1) * 100, 1)}

    pr = json.load(open(POPR5, encoding='utf-8'))['areas']
    for c in out:
        if c in pr:
            out[c]['pref'] = pr[c]['pref']; out[c]['area'] = pr[c]['area']

    payload = {
        'source': '第10回NDBオープンデータ(2023年度診療分) K手術(入院・外来) × 社人研令和5年推計人口(90+分割)',
        'note': '発生率法。全国年齢別発生率×圏将来人口。年間手術件数。手術は年齢分散が大きく水準もカルテ#44と'
                'ほぼ一致(±3%程度)。参考推計。',
        'years': [int(y) for y in years], 'areaCount': len(out), 'areas': out,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    print(f"[surgery] areas={len(out)} out={OUT.name} {OUT.stat().st_size/1e6:.2f}MB")
    ya = out.get('2606')
    if ya:
        s0, s1 = ya['series'][0], ya['series'][-1]
        print(f"[surgery] 山城南 入院手術 2020={s0['nyuin']}(カルテ6976) 2050={s1['nyuin']}(7707) 増減{ya['growthNyuin']}%(+10.5%)")
        print(f"[surgery] 部位top3: {[(p['name'], p['count']) for p in ya['parts2020'][:3]]}")


if __name__ == '__main__':
    main()
