#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P2 ETL: 医師偏在指標関連データ（令和6年1月公表版・全診療科）→ 二次医療圏別データ
出典: 厚労省 001424491.xlsx シート「2医師偏在指標」
医療需給総覧カルテ P.11/12（医師偏在指標）の一次ソースそのもの。カルテ値と一致検証済み
（全国255.58→256、京都府 丹後155.6→156 等）。圏域名の接頭4桁=二次医療圏コード=hsaコードで直結。

出力: data/static/physician_distribution.json
  areas[hsaCode] = { pref, area, index, stdDoctors, pop10man, utilRatio,
                     classification(医師多数/中間/医師少数), rank(全国330圏の順位), percentile }
"""
import json, os, re
import openpyxl
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
XLSX = Path('/Users/yutatomi/Downloads/01_投資・定量分析/MedicalCRM_Data/医師偏在指標/医師偏在指標_令和6年1月.xlsx')
MASTER = ROOT / 'data' / 'hsa' / 'area_master.json'
OUT = ROOT / 'data' / 'static' / 'physician_distribution.json'

# 医師多数/少数の全国閾値（上位1/3=217.6以上, 下位1/3=179.3以下。厚労省 001188443.pdf 記載）
MAJORITY_TH = 217.6
MINORITY_TH = 179.3


def num(v):
    if v is None: return None
    if isinstance(v, (int, float)): return v
    try: return float(str(v).replace(',', ''))
    except ValueError: return None


def classify(v):
    if v is None: return '不明'
    if v >= MAJORITY_TH: return '医師多数'
    if v <= MINORITY_TH: return '医師少数'
    return '中間'


def main():
    master_codes = {m['code'] for m in json.load(open(MASTER, encoding='utf-8'))['areas']}
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb['2医師偏在指標']

    national = None
    prefs = {}       # 都道府県名 -> index
    areas = {}
    unmatched = []

    for r in ws.iter_rows(min_row=4, values_only=True):
        kubun = r[0]
        if not kubun:
            continue
        idx = num(r[3])
        if kubun == '全国':
            national = idx
        elif kubun == '都道府県':
            # r[1] = "01 北海道" → 名称
            name = re.sub(r'^\d+\s*', '', str(r[1])).strip()
            prefs[name] = idx
        elif kubun == '二次医療圏':
            raw = str(r[2])          # "0101南渡島"
            m = re.match(r'(\d{4})(.*)', raw)
            if not m:
                continue
            code, name = m.group(1), m.group(2).strip()
            if code not in master_codes:
                unmatched.append((code, name))
                continue
            areas[code] = {
                'area': name,
                'index': round(idx, 1) if idx is not None else None,
                'stdDoctors': round(num(r[4])) if num(r[4]) is not None else None,
                'pop10man': round(num(r[5]), 3) if num(r[5]) is not None else None,
                'utilRatio': round(num(r[6]), 3) if num(r[6]) is not None else None,
                'classification': classify(idx),
            }
    wb.close()

    # 都道府県名を付与（先頭2桁→都道府県）
    pref_name_by_code = {}
    for m in json.load(open(MASTER, encoding='utf-8'))['areas']:
        pref_name_by_code[m['code'][:2]] = m['pref']
    for code, a in areas.items():
        a['pref'] = pref_name_by_code.get(code[:2], '')
        a['prefIndex'] = round(prefs.get(a['pref']), 1) if a['pref'] in prefs else None

    # 全国順位（指標降順）・パーセンタイル
    ranked = sorted(areas.items(), key=lambda kv: -(kv[1]['index'] or 0))
    n = len(ranked)
    for i, (code, a) in enumerate(ranked):
        a['rank'] = i + 1
        a['percentile'] = round((n - i) / n * 100)  # 高いほど医師多い

    payload = {
        'source': '医師偏在指標関連データ（令和6年1月公表版・全診療科）（厚生労働省）',
        'sourceUrl': 'https://www.mhlw.go.jp/content/001424491.xlsx',
        'nationalIndex': round(national, 1) if national is not None else None,
        'majorityThreshold': MAJORITY_TH,
        'minorityThreshold': MINORITY_TH,
        'note': '医師偏在指標=患者流出入・医師/患者の年齢構成を調整した相対的な医師充足度。医師多数=全国上位1/3(217.6以上)、医師少数=下位1/3(179.3以下)。標準化医師数・人口は2021/1/1基準。医療需給総覧カルテと数値一致。',
        'areaCount': len(areas),
        'prefs': {k: round(v, 1) for k, v in prefs.items() if v is not None},
        'areas': areas,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    print(f"[etl] areas={len(areas)} national={payload['nationalIndex']} 都道府県={len(prefs)}")
    print(f"[etl] 多数圏={sum(1 for a in areas.values() if a['classification']=='医師多数')} "
          f"少数圏={sum(1 for a in areas.values() if a['classification']=='医師少数')} "
          f"中間={sum(1 for a in areas.values() if a['classification']=='中間')}")
    if unmatched:
        print(f"[etl] 未突合 {len(unmatched)}: {unmatched[:10]}")


if __name__ == '__main__':
    main()
