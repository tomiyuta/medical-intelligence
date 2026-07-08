#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier B ETL: 診療科別 従事医師数（令和6年三師統計 第25表・主たる診療科・従業地）。
医療需給総覧カルテ#13「診療科別医師数」に対応するが、カルテはベンダー独自の医師配置
（住所地/購入データ）を用いており公開三師統計と数値一致しない（[[hsa-karte13-not-reproducible]]）。
本パネルは厚労省公開統計による**独自集計**として、二次医療圏 vs 全国(pooled)を
同一の65歳以上人口10万対で内部整合的に提示する（総計はカルテと約0.5%一致）。

出力: data/static/physician_specialty_r6.json
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_IN = ROOT / 'data' / 'raw' / 'source' / '07_三師統計' / 'mr_isi0025_r6.csv'
POP = ROOT / 'data' / 'static' / 'population_r5.json'
MASTER = ROOT / 'data' / 'hsa' / 'area_master.json'
OUT = ROOT / 'data' / 'static' / 'physician_specialty_r6.json'

# 表示する診療科(第25表の列index → 表示名, 系統)。臨床研修医/全科/不詳は総計のみで非表示。
SPECIALTIES = [
    (2, '内科', '内科系'), (3, '呼吸器内科', '内科系'), (4, '循環器内科', '内科系'),
    (5, '消化器内科', '内科系'), (6, '腎臓内科', '内科系'), (7, '脳神経内科', '内科系'),
    (8, '糖尿病内科', '内科系'), (9, '血液内科', '内科系'), (12, 'リウマチ科', '内科系'),
    (13, '感染症内科', '内科系'),
    (14, '小児科', '小児'),
    (15, '精神科', '精神'), (16, '心療内科', '精神'),
    (10, '皮膚科', '皮膚'),
    (17, '外科', '外科系'), (18, '呼吸器外科', '外科系'), (19, '心臓血管外科', '外科系'),
    (20, '乳腺外科', '外科系'), (22, '消化器外科', '外科系'), (23, '泌尿器科', '外科系'),
    (25, '脳神経外科', '外科系'), (26, '整形外科', '外科系'), (27, '形成外科', '外科系'),
    (29, '眼科', '眼・耳鼻'), (30, '耳鼻いんこう科', '眼・耳鼻'),
    (31, '小児外科', '周産期'), (32, '産婦人科', '周産期'), (33, '産科', '周産期'), (34, '婦人科', '周産期'),
    (35, 'リハビリテーション科', 'リハビリ'),
    (36, '放射線科', '放射線'), (37, '麻酔科', '麻酔'),
    (38, '病理診断科', '検査系'), (39, '臨床検査科', '検査系'),
    (40, '救急科', '集中治療系'), (41, '集中治療科', '集中治療系'),
]
COL_TOTAL = 1


def val(x):
    x = str(x).strip()
    return 0 if x in ('-', '', '…', '･') else int(float(x))


def code_of(cell):
    m = re.match(r'^(\d+)', str(cell).strip())
    return m.group(1) if m else ''


def main():
    rows = list(csv.reader(open(CSV_IN, encoding='cp932')))
    master = {m['code']: m for m in json.load(open(MASTER, encoding='utf-8'))['areas']}
    pop = json.load(open(POP, encoding='utf-8'))['areas']

    # 圏別(4桁)行と全国(2桁都道府県)集計
    area_rows = {}
    nat = {ci: 0 for ci, _, _ in SPECIALTIES}
    nat[COL_TOTAL] = 0
    nat_p65 = 0
    for r in rows[4:]:
        c = code_of(r[0])
        if len(c) == 4 and c in master:
            area_rows[c] = r
        elif len(c) == 2:  # 都道府県行 → 全国合算
            nat[COL_TOTAL] += val(r[COL_TOTAL])
            for ci, _, _ in SPECIALTIES:
                nat[ci] += val(r[ci] if len(r) > ci else 0)
    for c, a in pop.items():
        nat_p65 += a['years']['2020']['a65']

    def per100k(cnt, p):
        return round(cnt / p * 1e5, 1) if p else None

    nat_specs = [{'name': nm, 'family': fam, 'count': nat[ci], 'per100k': per100k(nat[ci], nat_p65)}
                 for ci, nm, fam in SPECIALTIES]
    nat_specs_map = {s['name']: s['per100k'] for s in nat_specs}

    out = {}
    for c, r in area_rows.items():
        p65 = pop[c]['years']['2020']['a65']
        specs = []
        for ci, nm, fam in SPECIALTIES:
            cnt = val(r[ci] if len(r) > ci else 0)
            specs.append({'name': nm, 'family': fam, 'count': cnt,
                          'per100k': per100k(cnt, p65), 'natPer100k': nat_specs_map[nm]})
        out[c] = {
            'pref': master[c]['pref'], 'area': master[c]['area'], 'pop65': p65,
            'total': val(r[COL_TOTAL]), 'totalPer100k': per100k(val(r[COL_TOTAL]), p65),
            'specialties': specs,
        }

    payload = {
        'source': '厚生労働省「令和6年医師・歯科医師・薬剤師統計」第25表(医療施設従事医師・主たる診療科・従業地)'
                  ' × 令和2年国勢調査65歳以上人口',
        'note': '独自集計。65歳以上人口10万対の医師数を診療科別に圏 vs 全国(pooled)で比較。'
                'カルテ#13はベンダー独自の医師配置を用いており本集計とは絶対値が異なる(総計は約0.5%一致)。',
        'national': {'total': nat[COL_TOTAL], 'totalPer100k': per100k(nat[COL_TOTAL], nat_p65),
                     'pop65': nat_p65, 'specialties': nat_specs},
        'areaCount': len(out), 'areas': out,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    print(f"[specialty] areas={len(out)} national医師={nat[COL_TOTAL]} out={OUT.name} {OUT.stat().st_size/1e6:.2f}MB")
    ya = out.get('2606')
    if ya:
        print('[specialty] 山城南 総計/10万(65+):', ya['totalPer100k'], '(カルテ556.6・±0.5%)')
        for s in ya['specialties'][:4]:
            print(f"  {s['name']}: 圏{s['per100k']} vs 全国{s['natPer100k']}")


if __name__ == '__main__':
    main()
