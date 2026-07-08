export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';

// 全330圏×全ページの本文横断検索。?q=回復期 不足 [&pref=京都府]
// スペース区切りは AND。マッチしたページの圏名・章・タイトル・抜粋を返す。
let index = null;
function loadIndex() {
  if (index) return index;
  const path = join(process.cwd(), 'data', 'hsa', 'search_index.json.gz');
  if (!existsSync(path)) { index = []; return index; }
  index = JSON.parse(gunzipSync(readFileSync(path)).toString('utf-8'));
  return index;
}

function snippet(text, terms, len = 90) {
  const i = text.indexOf(terms[0]);
  if (i < 0) return text.slice(0, len);
  const start = Math.max(0, i - 30);
  return (start > 0 ? '…' : '') + text.slice(start, start + len) + '…';
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const pref = searchParams.get('pref');
  const limit = Math.min(parseInt(searchParams.get('limit') || '80', 10), 300);
  if (!q) return NextResponse.json({ q, total: 0, results: [] });
  const terms = q.split(/\s+/).filter(Boolean);
  const idx = loadIndex();
  const out = [];
  for (const r of idx) {
    if (pref && r.pref !== pref) continue;
    const hay = r.title + ' ' + r.text;
    if (terms.every(t => hay.includes(t))) {
      out.push({
        code: r.code, pref: r.pref, area: r.area, n: r.n,
        title: r.title, snippet: snippet(r.text, terms),
      });
      if (out.length >= limit) break;
    }
  }
  return NextResponse.json({ q, total: out.length, results: out });
}
