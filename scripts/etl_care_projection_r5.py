#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P4 ETL: 要介護(要支援)認定者数の将来推計（医療需給総覧 #52,53）
将来認定者数(圏,年) = Σ_年齢[ 都道府県認定率(年齢,要介護度) × 圏将来人口(年齢,年) ]
認定率(都道府県,年齢) = 認定者数(介護保険事業状況報告R5) / 都道府県人口(社人研2025)

介護ファイル(9シート): ①総数 ②第1号計 ③65-69 ④70-74 ⑤75-79 ⑥80-84 ⑦85-89 ⑧90+ ⑨第2号
  各シート: 都道府県 × 要介護度(要支援1,2/要介護1-5/合計)
出力: data/static/care_projection_r5.json
"""
import openpyxl, json
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
CARE = Path('/Users/yutatomi/Downloads/01_投資・定量分析/MedicalCRM_Data/P4_将来推計/介護認定者数_都道府県年齢別.xlsx')
POP = ROOT / 'data' / 'static' / 'population_r5.json'
MASTER = ROOT / 'data' / 'hsa' / 'area_master.json'
OUT = ROOT / 'data' / 'static' / 'care_projection_r5.json'

# シート → (年齢グループ名, 対応するpop 5歳階級band). 85+は85-89と90+を合算
SHEET_AGE = {
    '04-1-1T③': ('65-69', [13]), '04-1-1T④': ('70-74', [14]),
    '04-1-1T⑤': ('75-79', [15]), '04-1-1T⑥': ('80-84', [16]),
    '04-1-1T⑦': ('85+', [17]), '04-1-1T⑧': ('85+', [17]),   # 85-89 と 90+ を 85+ に合算
}
LEVELS = ['要支援1', '要支援2', '要介護1', '要介護2', '要介護3', '要介護4', '要介護5']
BASE_YEAR = '2025'   # 認定データ(令和5年度末=2024)に最も近い推計年


def num(v):
    return v if isinstance(v, (int, float)) else 0


def main():
    # 認定者数: 都道府県 → 年齢グループ → 要介護度別 認定者数
    wb = openpyxl.load_workbook(CARE, read_only=True, data_only=True)
    cert = defaultdict(lambda: defaultdict(lambda: [0] * 7))
    for sheet, (agrp, _bands) in SHEET_AGE.items():
        ws = wb[sheet]
        for row in ws.iter_rows(min_row=6, values_only=True):
            pref = str(row[0]).strip() if row[0] else ''
            if not pref.endswith(('都', '道', '府', '県')):
                continue
            for i in range(7):   # 要支援1..要介護5 = col1-7
                cert[pref][agrp][i] += int(num(row[1 + i]))
    wb.close()

    # 都道府県人口(社人研 BASE_YEAR) by 5歳band → 年齢グループ
    popdata = json.load(open(POP, encoding='utf-8'))
    master = {m['code']: m for m in json.load(open(MASTER, encoding='utf-8'))['areas']}
    years = popdata['years']
    pref_pop = defaultdict(lambda: defaultdict(float))  # pref → agrp → 人口
    for code, a in popdata['areas'].items():
        pref = master[code]['pref']
        bands = a['years'][BASE_YEAR]['bands']
        for agrp, blist in [('65-69', [13]), ('70-74', [14]), ('75-79', [15]), ('80-84', [16]), ('85+', [17])]:
            pref_pop[pref][agrp] += sum(bands[b] for b in blist)

    # 認定率(都道府県, 年齢グループ, 要介護度) = 認定者数 / 人口
    AGRPS = ['65-69', '70-74', '75-79', '80-84', '85+']
    rate = defaultdict(lambda: defaultdict(lambda: [0.0] * 7))
    for pref, ag in cert.items():
        for agrp in AGRPS:
            pop = pref_pop[pref].get(agrp, 0)
            if pop <= 0:
                continue
            for i in range(7):
                rate[pref][agrp][i] = ag[agrp][i] / pop

    # 圏の将来認定者数
    AGRP_BANDS = {'65-69': [13], '70-74': [14], '75-79': [15], '80-84': [16], '85+': [17]}
    areas = {}
    for code, a in popdata['areas'].items():
        pref = master[code]['pref']
        if pref not in rate:
            continue
        yrs = {}
        for y in years:
            bands = a['years'][str(y)]['bands']
            by_level = [0.0] * 7
            for agrp in AGRPS:
                pop = sum(bands[b] for b in AGRP_BANDS[agrp])
                for i in range(7):
                    by_level[i] += rate[pref][agrp][i] * pop
            yrs[str(y)] = {'levels': [round(x) for x in by_level], 'total': round(sum(by_level))}
        areas[code] = {'pref': a['pref'], 'area': a['area'], 'years': yrs}

    payload = {
        'source': '推計: 介護保険事業状況報告(令和5年度末)認定率 × 社人研 令和5年推計人口',
        'note': '要介護(要支援)認定者数の将来推計。認定率(都道府県・年齢階級別)×圏将来人口。第1号被保険者(65歳以上)。',
        'levels': LEVELS, 'years': years, 'areaCount': len(areas), 'areas': areas,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    print(f"[care] 圏={len(areas)} out={OUT.stat().st_size/1e6:.2f}MB")
    # 検証: 全国合計 認定者数(BASE) vs 介護統計の第1号計
    nat = sum(a['years'][BASE_YEAR]['total'] for a in areas.values())
    print(f"[care] 全国{BASE_YEAR}認定者数(推計)={nat:,} (介護統計 第1号≒690万)")
    ya = areas.get('2606')
    if ya:
        print("[care] 山城南 認定者数:", {y: ya['years'][y]['total'] for y in ['2020', '2030', '2040', '2050']})


if __name__ == '__main__':
    main()
