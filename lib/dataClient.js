'use client';
import { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────
// useData(key) — クライアント側 fetch の一元化キャッシュ層
//
// endpoint(path) → Promise<json> をモジュールスコープに保持する。
// 同一 path への同時/後続 fetch は in-flight の Promise を共有し
// （dedup）、二度目以降は解決済み Promise を即返す。ビューを跨いで
// 同じデータが再取得されない = fetch 重複排除 + キャッシュ。
//
// 依存ゼロ・挙動不変（同じ path は同じ JSON を非同期に返すだけ）。
// ─────────────────────────────────────────────────────────────

// path -> Promise<data>
const _cache = new Map();

// path を fetch して JSON 化した Promise を返す。既にキャッシュ済み
// （in-flight 含む）ならそれを共有する。失敗した Promise はキャッシュ
// から除去し、次回リトライ可能にする。
export function fetchData(path) {
  if (path == null) return Promise.resolve(null);
  let p = _cache.get(path);
  if (!p) {
    p = fetch(path).then((r) => r.json());
    p.catch(() => { _cache.delete(path); }); // 失敗はキャッシュしない
    _cache.set(path, p);
  }
  return p;
}

// テスト/明示破棄用（通常は不要）。
export function clearDataCache(path) {
  if (path == null) _cache.clear();
  else _cache.delete(path);
}

// useData(path, initial) — path の JSON を購読するフック。
// 解決までは initial を返す（従来の useState 初期値と等価）。
// path が変われば新しい path を購読し直す。path が null の間は
// fetch せず initial を返す。
export function useData(path, initial = null) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    if (path == null) { setData(initial); return; }
    let alive = true;
    fetchData(path).then((d) => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
    // initial は再購読トリガにしない（従来 useState 初期値と同義の固定値想定）
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}
