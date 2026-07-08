#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""医療需給総覧カルテSVGから、座標付きテキスト片を抽出する検証用ツール。
PyMuPDFの get_svg_image は各グリフを絶対x配置の<tspan>にするが、<text>/<g>の
入れ子transform(matrix)で最終座標が決まる。ここでは<g>/<text>のtransformを
累積し、各<text>要素の最終(x,y)とテキストを返す。

使い方:
  python3 scripts/hsa_svg_text.py data/hsa/svg/2606/p13.svg          # 座標付きダンプ
  python3 scripts/hsa_svg_text.py data/hsa/svg/2606/p13.svg --rows   # 行クラスタ化
"""
import re, sys, html


def matmul(a, b):
    # 2x3 affine: [a c e; b d f]. compose a∘b (a applied to b's output)
    a0, a1, a2, a3, a4, a5 = a
    b0, b1, b2, b3, b4, b5 = b
    return (
        a0 * b0 + a2 * b1, a1 * b0 + a3 * b1,
        a0 * b2 + a2 * b3, a1 * b2 + a3 * b3,
        a0 * b4 + a2 * b5 + a4, a1 * b4 + a3 * b5 + a5,
    )


def parse_transform(s):
    if not s:
        return (1, 0, 0, 1, 0, 0)
    m = re.search(r'matrix\(([^)]+)\)', s)
    if m:
        p = [float(x) for x in re.split(r'[,\s]+', m.group(1).strip())]
        if len(p) == 6:
            return tuple(p)
    tx = ty = 0.0
    mt = re.search(r'translate\(([^)]+)\)', s)
    if mt:
        p = [float(x) for x in re.split(r'[,\s]+', mt.group(1).strip())]
        tx = p[0]; ty = p[1] if len(p) > 1 else 0.0
    return (1, 0, 0, 1, tx, ty)


def extract(svg):
    """Return list of dicts {x,y,text} in document order."""
    # Tokenize <g ...>, </g>, <text ...>...</text>
    out = []
    stack = [(1, 0, 0, 1, 0, 0)]
    pos = 0
    tok = re.compile(r'<g\b([^>]*)>|</g>|<text\b([^>]*)>(.*?)</text>', re.S)
    for m in tok.finditer(svg):
        if m.group(0) == '</g>':
            if len(stack) > 1:
                stack.pop()
        elif m.group(0).startswith('<g'):
            attrs = m.group(1)
            tr = parse_transform(re.search(r'transform="([^"]*)"', attrs).group(1) if re.search(r'transform="([^"]*)"', attrs) else '')
            stack.append(matmul(stack[-1], tr))
        else:  # <text>
            attrs, inner = m.group(2), m.group(3)
            tr = re.search(r'transform="([^"]*)"', attrs)
            local = parse_transform(tr.group(1)) if tr else (1, 0, 0, 1, 0, 0)
            # x/y attrs on text
            xa = re.search(r'\bx="([-\d.]+)"', attrs)
            ya = re.search(r'\by="([-\d.]+)"', attrs)
            if xa or ya:
                local = matmul(local, (1, 0, 0, 1, float(xa.group(1)) if xa else 0, float(ya.group(1)) if ya else 0))
            cur = matmul(stack[-1], local)
            txt = html.unescape(''.join(re.findall(r'<tspan[^>]*>([^<]*)</tspan>', inner)))
            if not txt.strip():
                txt = html.unescape(re.sub(r'<[^>]+>', '', inner))
            if txt.strip():
                out.append({'x': round(cur[4], 1), 'y': round(cur[5], 1), 'text': txt})
    return out


def cluster_rows(items, ytol=6):
    items = sorted(items, key=lambda d: (d['y'], d['x']))
    rows = []
    for it in items:
        placed = False
        for row in rows:
            if abs(row['y'] - it['y']) <= ytol:
                row['cells'].append(it); placed = True; break
        if not placed:
            rows.append({'y': it['y'], 'cells': [it]})
    for row in rows:
        row['cells'].sort(key=lambda d: d['x'])
    rows.sort(key=lambda r: r['y'])
    return rows


if __name__ == '__main__':
    path = sys.argv[1]
    svg = open(path, encoding='utf-8').read()
    items = extract(svg)
    if '--rows' in sys.argv:
        for row in cluster_rows(items):
            line = '  '.join(f'{c["text"]}' for c in row['cells'])
            print(f'y={row["y"]:7.1f} | {line}')
    else:
        for it in items:
            print(f'{it["x"]:7.1f},{it["y"]:7.1f}  {it["text"]}')
