#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
医療需給総覧（日本経営）330 PDF を SVG（テキスト保持）へ抽出し、
MedIntel の「医療圏カルテ」ビュー用の manifest / 検索インデックス / 圏域マスタを生成する。

Layer 1（レポート層）の全量反映パイプライン。
- 各ページを PyMuPDF get_svg_image(text_as_path=False) で SVG 化 → data/hsa/svg/{code}/p{NN}.svg
  （テキストは <text>/<tspan> 要素かつ各グリフ絶対座標配置＝フォント差でも崩れない）
- manifest.json  : 圏域一覧＋各ページの章・タイトル
- search_index.json : 全ページのプレーンテキスト（横断全文検索用）
- area_master.json : hsa コード ⇔ サイト medical_areas_national の圏名突合（P0 圏域マスタ）

出力先は data/hsa/（.gitignore / .vercelignore 済み）。
使い方: python3 scripts/extract_hsa_svg.py [--limit N] [--jobs K]
"""
import os, re, sys, json, glob, argparse, gzip
from concurrent.futures import ProcessPoolExecutor, as_completed

import fitz  # PyMuPDF

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_ROOT = os.path.expanduser("~/Downloads/nkgr_医療圏レポート")
OUT_ROOT = os.path.join(ROOT, "data", "hsa")
SVG_ROOT = os.path.join(OUT_ROOT, "svg")
SITE_AREAS = os.path.join(ROOT, "data", "static", "medical_areas_national.json")

HEADER_RE = re.compile(r'^\s*20\d{2}\s*[©(c)]*\s*NIHONKEIEI\s*Co\.,?\s*Ltd\.?\s*\d*', re.I)
COPY_INLINE_RE = re.compile(r'20\d{2}\s*©\s*NIHONKEIEI\s*Co\.,?Ltd\.?\s*\d+')
# 章扉ページ: 行頭が "1/ 地域の概況" など
CHAPTER_RE = re.compile(r'^\s*([1-4])\s*/\s*(.+)$')

PREF_JP = {
    'hokkaido':'北海道','aomori':'青森県','iwate':'岩手県','miyagi':'宮城県','akita':'秋田県',
    'yamagata':'山形県','fukushima':'福島県','ibaraki':'茨城県','tochigi':'栃木県','gunma':'群馬県',
    'saitama':'埼玉県','chiba':'千葉県','tokyo':'東京都','kanagawa':'神奈川県','niigata':'新潟県',
    'toyama':'富山県','ishikawa':'石川県','fukui':'福井県','yamanashi':'山梨県','nagano':'長野県',
    'gifu':'岐阜県','shizuoka':'静岡県','aichi':'愛知県','mie':'三重県','shiga':'滋賀県',
    'kyoto':'京都府','osaka':'大阪府','hyogo':'兵庫県','nara':'奈良県','wakayama':'和歌山県',
    'tottori':'鳥取県','shimane':'島根県','okayama':'岡山県','hiroshima':'広島県','yamaguchi':'山口県',
    'tokushima':'徳島県','kagawa':'香川県','ehime':'愛媛県','kochi':'高知県','fukuoka':'福岡県',
    'saga':'佐賀県','nagasaki':'長崎県','kumamoto':'熊本県','oita':'大分県','miyazaki':'宮崎県',
    'kagoshima':'鹿児島県','okinawa':'沖縄県',
}


def clean_title(raw_lines):
    """ページ先頭テキストからタイトル1行を抽出（コピーライト・ページ番号除去）。"""
    for ln in raw_lines:
        s = ln.strip()
        if not s:
            continue
        # コピーライトヘッダ行はスキップ。行内にタイトルが続く稀なケースのみ抽出。
        if HEADER_RE.match(s) or COPY_INLINE_RE.search(s):
            s2 = COPY_INLINE_RE.sub('', s)
            s2 = HEADER_RE.sub('', s2).strip(' |｜')
            if s2:
                return s2
            continue
        # ページ番号・記号のみの行はスキップ
        if re.fullmatch(r'[\d\s|｜／/－-]+', s):
            continue
        return s
    return ''


def detect_chapter_divider(raw_lines):
    """章扉なら (章番号, 章名) を返す。"""
    for ln in raw_lines[:4]:
        s = COPY_INLINE_RE.sub('', ln).strip(' |｜')
        m = CHAPTER_RE.match(s)
        if m:
            name = m.group(2).strip()
            # 章名が短すぎる/長すぎる誤検出を弾く
            if 2 <= len(name) <= 40:
                return int(m.group(1)), name
    return None


def process_pdf(args):
    """1 PDF を SVG 群＋ページメタへ。子プロセスで実行。"""
    code, pref_romaji, pdf_path = args
    out_dir = os.path.join(SVG_ROOT, code)
    os.makedirs(out_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    pages = []
    cur_chapter = "表紙・目次"
    cur_chapter_idx = 0
    for i, page in enumerate(doc):
        n = i + 1
        # --- SVG（テキスト保持）---
        svg = page.get_svg_image(matrix=fitz.Matrix(1, 1), text_as_path=False)
        with open(os.path.join(out_dir, f"p{n:02d}.svg"), "w", encoding="utf-8") as f:
            f.write(svg)
        # --- テキスト（タイトル・章・検索用）---
        text = page.get_text("text") or ""
        raw_lines = text.split("\n")
        div = detect_chapter_divider(raw_lines)
        if div:
            cur_chapter_idx, cur_chapter = div
        title = clean_title(raw_lines)
        # 検索用プレーンテキスト（改行→空白・連続空白圧縮・コピーライト除去）
        flat = COPY_INLINE_RE.sub(' ', text)
        flat = re.sub(r'\s+', ' ', flat).strip()
        pages.append({
            "n": n,
            "title": title[:120],
            "chapter": cur_chapter,
            "chapterIdx": cur_chapter_idx,
            "text": flat,
        })
    doc.close()
    return code, pref_romaji, os.path.basename(pdf_path), pages


def build_area_master(entries):
    """P0: hsa コード ⇔ サイト圏名の突合表を作る。"""
    site = json.load(open(SITE_AREAS, encoding="utf-8"))
    # (pref_code, area_name) と pref_code 単位のリスト
    site_by_code = {}
    for r in site:
        site_by_code.setdefault(r["pref_code"], []).append(r)
    master = []
    unmatched = []
    for e in entries:
        code = e["code"]           # 例 2606
        pref_code = code[:2]       # 26
        area_jp = e["area"]        # 山城南
        cand = site_by_code.get(pref_code, [])
        match = next((r for r in cand if r["area"] == area_jp), None)
        status = "exact"
        site_area = area_jp
        if not match:
            # ゆるい突合（記号/空白差を無視）
            def norm(x): return re.sub(r'[\s・･,、／/]', '', x)
            match = next((r for r in cand if norm(r["area"]) == norm(area_jp)), None)
            if match:
                status = "normalized"
                site_area = match["area"]
            else:
                status = "unmatched"
                site_area = None
                unmatched.append((code, e["pref"], area_jp))
        master.append({
            "code": code,
            "pref_code": pref_code,
            "pref": e["pref"],
            "prefRomaji": e["prefRomaji"],
            "area": area_jp,
            "siteArea": site_area,
            "match": status,
            "hosp": (match or {}).get("hosp"),
            "wards": (match or {}).get("wards"),
            "beds": (match or {}).get("beds"),
        })
    return master, unmatched


def discover_pdfs(limit=None):
    """PDF を走査し (code, pref_romaji, path, area_jp) を集める。area_jp は index ページ抽出済 CSV から。"""
    # 目録 CSV（DL 時に生成）から code→area_jp を引く
    csv_path = os.path.join(PDF_ROOT, "目録_medical_areas.csv")
    area_jp_by_code = {}
    if os.path.exists(csv_path):
        import csv as _csv
        with open(csv_path, encoding="utf-8-sig") as f:
            for row in _csv.DictReader(f):
                area_jp_by_code[row["医療圏コード"]] = row["医療圏名"]
    files = sorted(glob.glob(os.path.join(PDF_ROOT, "*", "*.pdf")))
    out = []
    for p in files:
        fn = os.path.basename(p)
        m = re.match(r'hsa(\d+)-([a-z]+)-', fn)
        if not m:
            continue
        code, pref_romaji = m.group(1), m.group(2)
        out.append({
            "code": code, "prefRomaji": pref_romaji, "path": p,
            "pref": PREF_JP.get(pref_romaji, pref_romaji),
            "area": area_jp_by_code.get(code, ""),
        })
    if limit:
        out = out[:limit]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="最初のN件のみ（動作確認用）")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 4)
    args = ap.parse_args()

    os.makedirs(SVG_ROOT, exist_ok=True)
    entries = discover_pdfs(args.limit)
    print(f"[extract] PDF {len(entries)} 件 / jobs={args.jobs}", flush=True)

    # 圏名が CSV に無い場合、PDF 名から area_jp を補完できないので、CSV は必須
    master, unmatched = build_area_master(entries)
    master_by_code = {m["code"]: m for m in master}

    tasks = [(e["code"], e["prefRomaji"], e["path"]) for e in entries]
    areas_meta = []
    index = []          # 全ページ本文（横断検索用）
    done = 0
    with ProcessPoolExecutor(max_workers=args.jobs) as ex:
        futs = {ex.submit(process_pdf, t): t for t in tasks}
        for fut in as_completed(futs):
            code, pref_romaji, fname, pages = fut.result()
            m = master_by_code[code]
            # 章の並び（出現順）
            chapters = []
            for pg in pages:
                key = (pg["chapterIdx"], pg["chapter"])
                if key not in chapters:
                    chapters.append(key)
            areas_meta.append({
                "code": code,
                "pref": m["pref"],
                "prefCode": m["pref_code"],
                "prefRomaji": pref_romaji,
                "area": m["area"],
                "siteArea": m["siteArea"],
                "file": fname,
                "pageCount": len(pages),
                "chapters": [{"idx": i, "name": nm} for i, nm in chapters],
                "slides": [{"n": p["n"], "title": p["title"],
                            "chapter": p["chapter"], "chapterIdx": p["chapterIdx"]} for p in pages],
            })
            for p in pages:
                index.append({
                    "code": code, "pref": m["pref"], "area": m["area"],
                    "n": p["n"], "title": p["title"], "text": p["text"],
                })
            done += 1
            if done % 20 == 0 or done == len(tasks):
                print(f"[extract] {done}/{len(tasks)}", flush=True)

    # 並び順を安定化
    areas_meta.sort(key=lambda a: a["code"])
    index.sort(key=lambda r: (r["code"], r["n"]))

    manifest = {
        "source": "医療需給総覧 1.0（株式会社日本経営）",
        "note": "各ページ下部記載の公表データを用いて株式会社日本経営が作成。個人確認用にローカル反映。",
        "count": len(areas_meta),
        "prefectures": sorted({a["pref"] for a in areas_meta},
                              key=lambda p: list(PREF_JP.values()).index(p) if p in PREF_JP.values() else 99),
        "areas": areas_meta,
    }
    with open(os.path.join(OUT_ROOT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False)

    # 検索インデックス（全ページ本文・gzip 圧縮）
    with gzip.open(os.path.join(OUT_ROOT, "search_index.json.gz"), "wt", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)

    with open(os.path.join(OUT_ROOT, "area_master.json"), "w", encoding="utf-8") as f:
        json.dump({"count": len(master), "unmatched": unmatched, "areas": master},
                  f, ensure_ascii=False, indent=1)

    print(f"[extract] 完了 areas={len(areas_meta)} unmatched={len(unmatched)}", flush=True)
    if unmatched:
        print("[extract] 未突合:", unmatched[:10], flush=True)


if __name__ == "__main__":
    main()
