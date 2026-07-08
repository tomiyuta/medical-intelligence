#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P2 ETL: 令和6年度病床機能報告 施設票 → 二次医療圏×医療機関の救急・医療機器データ
医療需給総覧カルテ #57,58（救急車受入を行う病院の概要）/ #60,61（救急車受入件数）をネイティブ再構築。

施設票の列:
  col0 病診区分 / col2 医療機関名 / col3 都道府県コード / col5 二次医療圏名 / col12 設置主体
  col99 三次救急認定 / col100 二次救急認定 / col101 救急告示 / col154 救急車受入件数(年間)
  col169-172 CT / col173-175 MRI / col228 救急救命士(常勤)

出力: data/static/emergency_r6.json
"""
import json, re
import openpyxl
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / 'data' / 'raw' / 'source' / '06_病床機能報告' / 'data_R6' / 'R6_施設票.xlsx'
MASTER = ROOT / 'data' / 'hsa' / 'area_master.json'
OUT = ROOT / 'data' / 'static' / 'emergency_r6.json'

C_KIND, C_MNAME, C_PREF, C_AREANAME = 0, 2, 3, 5
C_SETCHI = 12
C_TERT, C_SEC, C_KOKUJI = 99, 100, 101
C_AMBUL = 154
CT_COLS = [169, 170, 171, 172]
MRI_COLS = [173, 174, 175]
C_KYUMEI = 228
# 施設全体の職種別職員数（常勤列, 非常勤列）。非常勤は既に常勤換算値 → 常勤換算=常勤+非常勤。
STAFF = {
    '医師': (200, 201), '看護師': (204, 205), '准看護師': (206, 207), '看護補助者': (208, 209),
    '助産師': (210, 211), '理学療法士': (212, 213), '作業療法士': (214, 215), '言語聴覚士': (216, 217),
    '薬剤師': (218, 219),
}
STAFF_ALL = {  # 全職員合計に含む全職種
    **STAFF, '歯科医師': (202, 203), '診療放射線技師': (220, 221), '臨床検査技師': (222, 223),
    '臨床工学技士': (224, 225), '管理栄養士': (226, 227), '救急救命士': (228, 229),
}


def num(v):
    if v is None: return 0
    if isinstance(v, (int, float)): return v
    s = str(v).strip().replace(',', '')
    if s in ('', '-', '該当なし', '－'): return 0
    try: return float(s) if '.' in s else int(s)
    except ValueError: return 0


def is_yes(v):
    if v is None: return False
    s = str(v).strip()
    return s in ('有', '1', '1.0', 'あり', '○', '有り') or s.startswith('有')


def pref2(v):
    if v is None: return None
    s = str(v).strip()
    if s.endswith('.0'): s = s[:-2]
    return s.zfill(2)


def kyukyu_type(row):
    if is_yes(row[C_TERT] if len(row) > C_TERT else None): return '三次救急'
    if is_yes(row[C_SEC] if len(row) > C_SEC else None): return '二次救急'
    if is_yes(row[C_KOKUJI] if len(row) > C_KOKUJI else None): return '救急告示'
    return 'その他'


def main():
    master = json.load(open(MASTER, encoding='utf-8'))['areas']
    key2hsa = {(m['pref_code'], m['siteArea']): m['code'] for m in master if m.get('siteArea')}
    pref_name = {m['code'][:2]: m['pref'] for m in master}

    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb['Sheet1']
    areas = defaultdict(list)
    unmatched = set()
    for i, row in enumerate(ws.iter_rows(min_row=7, values_only=True)):
        kind = row[C_KIND] if len(row) > C_KIND else None
        if kind != '病院':          # 病院のみ（PDFも「病院のみ」）
            continue
        name = row[C_MNAME] if len(row) > C_MNAME else None
        if not name or str(name).strip() in ('', '必須項目'):
            continue
        pc = pref2(row[C_PREF])
        area_name = str(row[C_AREANAME]).strip() if row[C_AREANAME] else None
        hsa = key2hsa.get((pc, area_name))
        if not hsa:
            if pc and area_name: unmatched.add((pc, area_name))
            continue
        ambul = int(num(row[C_AMBUL] if len(row) > C_AMBUL else 0))
        ct = sum(int(num(row[c])) for c in CT_COLS if len(row) > c)
        mri = sum(int(num(row[c])) for c in MRI_COLS if len(row) > c)

        def fte(role):  # 常勤換算 = 常勤 + 非常勤(既に常勤換算)
            cf, cp = STAFF_ALL[role]
            return num(row[cf] if len(row) > cf else 0) + num(row[cp] if len(row) > cp else 0)
        doc = round(fte('医師'), 1)
        doc_full = int(num(row[200] if len(row) > 200 else 0))
        nurse = round(fte('看護師') + fte('准看護師') + fte('助産師'), 1)  # PDF「看護職員」定義
        rehab = round(fte('理学療法士') + fte('作業療法士') + fte('言語聴覚士'), 1)
        total = round(sum(fte(r) for r in STAFF_ALL), 1)

        areas[hsa].append({
            'name': str(name).strip(),
            'setchi': str(row[C_SETCHI]).strip() if len(row) > C_SETCHI and row[C_SETCHI] else '',
            'kyukyuType': kyukyu_type(row),
            'ambulance': ambul,
            'ct': ct, 'mri': mri,
            'kyumeishi': round(num(row[C_KYUMEI] if len(row) > C_KYUMEI else 0), 1),
            'staff': {
                'doc': doc, 'docFull': doc_full,
                'docFullRatio': round(doc_full / doc * 100, 1) if doc else 0,
                'nurse': nurse, 'nurseAid': round(fte('看護補助者'), 1),
                'rehab': rehab, 'pharm': round(fte('薬剤師'), 1), 'total': total,
            },
        })
    wb.close()

    out = {}
    for hsa, facs in areas.items():
        facs.sort(key=lambda x: -x['ambulance'])
        er = [f for f in facs if f['ambulance'] > 0 or f['kyukyuType'] != 'その他']
        out[hsa] = {
            'pref': pref_name.get(hsa[:2], ''),
            'facilities': facs,
            'totals': {
                'hospitals': len(facs),
                'erHospitals': len(er),
                'ambulanceTotal': sum(f['ambulance'] for f in facs),
                'tertiary': sum(1 for f in facs if f['kyukyuType'] == '三次救急'),
                'secondary': sum(1 for f in facs if f['kyukyuType'] == '二次救急'),
            },
        }

    payload = {
        'source': '厚労省 令和6年度病床機能報告 施設票 (2024年7月1日時点／救急車受入件数は令和5年度年間)',
        'published': '2025-09-30',
        'note': '病院のみ。救急車受入件数は年間実績。救急種別は三次＞二次＞告示の優先で1施設1区分。CT/MRIは台数合計。',
        'areaCount': len(out),
        'areas': out,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    print(f"[etl] areas={len(out)} 総病院={sum(a['totals']['hospitals'] for a in out.values())} "
          f"救急車受入合計={sum(a['totals']['ambulanceTotal'] for a in out.values()):,}")
    if unmatched:
        print(f"[etl] 未突合圏域 {len(unmatched)}: {sorted(unmatched)[:10]}")


if __name__ == '__main__':
    main()
