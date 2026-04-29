#!/usr/bin/env python3
"""
Phase 4-3c-B-lite: 広島県二次医療圏 prototype

reviewer 採択 scope:
- 広島県のみ (全国拡張禁止)
- Supply + Population のみ (NDB Risk side 実装禁止)
- UI 変更なし (data + docs + test のみ)

input:
- data/static/area_emergency_homecare.json (既存 ETL、医療圏 master)
- data/static/medical_areas_national.json (既存 ETL、病床 ETL)
- data/static/area_demographics.json (既存 ETL、人口 ETL)
- JMAP screen-confirmed fixture (本 prototype 内に明示記載)

JMAP fixture (2026-04-30 reviewer/Claude 共同確認):
  - 出典: JMAP (https://jmap.jp/) Hiroshima 二次医療圏別集計、病院数
  - 確認時刻: 2026-04-30 osascript scrape による
  - data source 元: ウェルネスデータベース (毎月更新)

output:
- data/static/secondary_area_hiroshima_prototype.json
"""
import json
from pathlib import Path
import hashlib

ROOT = Path(__file__).resolve().parents[1]

# ============================================================
# JMAP screen-confirmed fixture (Phase 4-3c-B-lite, 2026-04-30)
# ============================================================
# 出典: JMAP (公益社団法人日本医師会, https://jmap.jp/)
# 取得方法: 広島県 (pref_id=34) × 二次医療圏別集計 × 病院数
# 一括 download は医師会員限定のため、本 prototype では 7 圏域のみ画面確認値を fixture 化
# JMAP 利用規約に従い、対外公開時は当サイト名・情報入手元の表記を行う

JMAP_HIROSHIMA_FIXTURE = {
    "_source": "JMAP screen-confirmed fixture (公益社団法人日本医師会)",
    "_source_url": "https://jmap.jp/",
    "_data_source_origin": "ウェルネスデータベース (地方厚生局公表資料、毎月25日に前月情報へ更新)",
    "_confirmed_at": "2026-04-30",
    "_scope": "広島県のみ (全国拡張禁止、Phase 4-3c-B-lite)",
    "_disclaimer": "本データは画面表示の確認値であり、JMAP の一括 download (医師会員限定) ではない。対外公開時は JMAP の名称と情報入手元の表記を行うこと。",
    "areas": [
        {"area": "広島",       "area_alt": "広島(広島市安佐南区など)",   "jmap_hospitals": 92},
        {"area": "広島西",     "area_alt": "広島西(廿日市市など)",      "jmap_hospitals": 12},
        {"area": "呉",         "area_alt": "呉(呉市など)",            "jmap_hospitals": 28},
        {"area": "広島中央",   "area_alt": "広島中央(東広島市など)",    "jmap_hospitals": 19},
        {"area": "尾三",       "area_alt": "尾三(尾道市など)",          "jmap_hospitals": 21},
        {"area": "福山・府中", "area_alt": "福山・府中(福山市など)",    "jmap_hospitals": 45},
        {"area": "備北",       "area_alt": "備北(三次市など)",          "jmap_hospitals": 10},
    ],
    "_total_jmap": 227,
}

EXPECTED_AREA_COUNT = 7
EXPECTED_HIROSHIMA_AREAS = ["広島", "広島西", "呉", "広島中央", "尾三", "福山・府中", "備北"]

def load_existing_etl():
    """既存 3 ETL から広島県の圏域 master を取得"""
    with open(ROOT / "data/static/area_emergency_homecare.json") as f:
        hc = json.load(f)
    with open(ROOT / "data/static/medical_areas_national.json") as f:
        bd = json.load(f)
    with open(ROOT / "data/static/area_demographics.json") as f:
        dm = json.load(f)

    hiroshima = {
        "homecare_etl": [a for a in hc if a.get("pref") == "広島県"],
        "bed_etl": [a for a in bd if a.get("pref") == "広島県"],
        "demo_etl": [a for a in dm if a.get("pref") == "広島県"],
    }
    return hiroshima

def cross_reference_areas(existing, jmap):
    """JMAP fixture と既存 ETL の圏域名を照合"""
    result = []
    jmap_by_area = {a["area"]: a for a in jmap["areas"]}
    for area_name in EXPECTED_HIROSHIMA_AREAS:
        hc_match = next((a for a in existing["homecare_etl"] if a.get("area") == area_name), None)
        bd_match = next((a for a in existing["bed_etl"] if a.get("area") == area_name), None)
        dm_match = next((a for a in existing["demo_etl"] if a.get("area") == area_name), None)
        jmap_match = jmap_by_area.get(area_name)

        # population 集計 (既存 demo_etl の munis から)
        pop_total = sum(m.get("pop", 0) for m in (dm_match or {}).get("munis", []))
        p65_total = sum(m.get("p65", 0) for m in (dm_match or {}).get("munis", []))

        result.append({
            "area": area_name,
            "munis_count": len(((dm_match or {}).get("munis", []))),
            "supply": {
                "etl_hospitals": (hc_match or {}).get("hospitals"),
                "etl_homecare_facilities": (hc_match or {}).get("homecare"),
                "etl_homecare_patients": (hc_match or {}).get("homecare_patients"),
                "etl_beds": (bd_match or {}).get("beds"),
                "etl_wards": (bd_match or {}).get("wards"),
                "jmap_hospitals": (jmap_match or {}).get("jmap_hospitals"),
                "jmap_area_alt": (jmap_match or {}).get("area_alt"),
                "diff_hospitals_etl_vs_jmap": (
                    (jmap_match or {}).get("jmap_hospitals", 0) - (hc_match or {}).get("hospitals", 0)
                    if hc_match and jmap_match else None
                ),
            },
            "population": {
                "pop_total": pop_total,
                "p65_total": p65_total,
                "aging_ratio": round(p65_total / pop_total * 100, 2) if pop_total > 0 else None,
            },
        })
    return result

def aggregate_municipalities(existing):
    """市区町村→二次医療圏集計 prototype skeleton"""
    aggregation = {}
    for area in existing["demo_etl"]:
        area_name = area.get("area")
        munis = area.get("munis", [])
        aggregation[area_name] = {
            "muni_count": len(munis),
            "muni_names": [m.get("name") for m in munis],
            "agg_pop": sum(m.get("pop", 0) for m in munis),
            "agg_p65": sum(m.get("p65", 0) for m in munis),
            "agg_aging_ratio": round(
                sum(m.get("p65", 0) for m in munis) / sum(m.get("pop", 0) for m in munis) * 100, 2
            ) if sum(m.get("pop", 0) for m in munis) > 0 else None,
        }
    return aggregation

def main():
    existing = load_existing_etl()

    # 圏域数照合
    n_hc = len(existing["homecare_etl"])
    n_bd = len(existing["bed_etl"])
    n_dm = len(existing["demo_etl"])
    n_jmap = len(JMAP_HIROSHIMA_FIXTURE["areas"])

    assert n_hc == EXPECTED_AREA_COUNT, f"homecare ETL 圏域数 {n_hc} != {EXPECTED_AREA_COUNT}"
    assert n_bd == EXPECTED_AREA_COUNT, f"bed ETL 圏域数 {n_bd} != {EXPECTED_AREA_COUNT}"
    assert n_dm == EXPECTED_AREA_COUNT, f"demo ETL 圏域数 {n_dm} != {EXPECTED_AREA_COUNT}"
    assert n_jmap == EXPECTED_AREA_COUNT, f"JMAP fixture 圏域数 {n_jmap} != {EXPECTED_AREA_COUNT}"

    cross_ref = cross_reference_areas(existing, JMAP_HIROSHIMA_FIXTURE)
    municipality_agg = aggregate_municipalities(existing)

    # JMAP 合計値 vs ETL 合計値
    total_jmap = sum(a["supply"]["jmap_hospitals"] or 0 for a in cross_ref)
    total_etl = sum(a["supply"]["etl_hospitals"] or 0 for a in cross_ref)

    output = {
        "_phase": "Phase 4-3c-B-lite",
        "_scope": "広島県のみ (Hiroshima focus)",
        "_disclaimer": "Supply + Population prototype のみ。NDB Risk side は別フェーズで再設計が必要 (4-3c-Risk-NDB)",
        "_generated_at": "2026-04-30",
        "_data_sources": {
            "existing_etl": {
                "homecare": "data/static/area_emergency_homecare.json",
                "beds": "data/static/medical_areas_national.json",
                "demographics": "data/static/area_demographics.json",
            },
            "jmap_fixture": JMAP_HIROSHIMA_FIXTURE,
            "ipss_2023_projection_skeleton": {
                "url": "https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/t-page.asp",
                "title": "日本の地域別将来推計人口（令和5年推計）",
                "publication": "2023-12-22 公表 / 2024-10 報告書刊行",
                "note": "市区町村別 Excel から二次医療圏に集計が必要。本 prototype では既存 area_demographics.json (国勢調査 2020 ベース) で代替。社人研 2023 推計の取り込みは別フェーズで実施。",
                "scope": "skeleton のみ",
            },
        },
        "area_count": {
            "homecare_etl": n_hc,
            "bed_etl": n_bd,
            "demo_etl": n_dm,
            "jmap_fixture": n_jmap,
            "consistent": (n_hc == n_bd == n_dm == n_jmap),
        },
        "expected_area_names": EXPECTED_HIROSHIMA_AREAS,
        "cross_reference": cross_ref,
        "municipality_aggregation": municipality_agg,
        "totals": {
            "jmap_hospitals": total_jmap,
            "etl_hospitals": total_etl,
            "diff": total_jmap - total_etl,
            "diff_explanation": "JMAP (毎月25日更新の最新) と既存 ETL (取り込み時点) の時期差。差分が大きい場合は ETL 再取得を推奨。",
        },
        "ndb_risk_side_status": {
            "implemented": False,
            "reason": "reviewer 採択方針 (Phase 4-3c-B-lite scope 外)",
            "deferred_to": "Phase 4-3c-Risk-NDB (別フェーズ、性年齢別再集計・分母再設計・秘匿値「－」のゼロ変換・年齢標準化の再設計が必要)",
            "details_doc": "docs/PHASE4_3C_REQUIREMENTS.md §12.5",
        },
    }

    out_path = ROOT / "data/static/secondary_area_hiroshima_prototype.json"
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2))
    print(f"[OK] prototype 出力: {out_path} ({out_path.stat().st_size} bytes)")
    print()
    print("=== 圏域数照合 ===")
    print(f"  homecare ETL: {n_hc}")
    print(f"  bed ETL:      {n_bd}")
    print(f"  demo ETL:     {n_dm}")
    print(f"  JMAP fixture: {n_jmap}")
    print(f"  consistent:   {output['area_count']['consistent']}")
    print()
    print("=== 病院数 (JMAP vs ETL) ===")
    print(f"  {'area':12} | {'JMAP':>5} | {'ETL':>5} | {'diff':>5}")
    print("-" * 45)
    for a in cross_ref:
        s = a["supply"]
        print(f"  {a['area']:12} | {s['jmap_hospitals']:>5} | {s['etl_hospitals']:>5} | {s['diff_hospitals_etl_vs_jmap']:>+5}")
    print(f"  {'合計':12} | {total_jmap:>5} | {total_etl:>5} | {total_jmap - total_etl:>+5}")
    print()
    print("=== 人口集計 (市区町村→二次医療圏) ===")
    for area_name in EXPECTED_HIROSHIMA_AREAS:
        agg = municipality_agg[area_name]
        print(f"  {area_name:12} | munis={agg['muni_count']:>2} | pop={agg['agg_pop']:>9} | p65={agg['agg_p65']:>8} | aging={agg['agg_aging_ratio']}%")

if __name__ == "__main__":
    main()
