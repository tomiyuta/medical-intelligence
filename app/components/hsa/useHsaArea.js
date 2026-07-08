'use client';
import { createContext, useContext, useEffect, useState } from 'react';

// 選択中の二次医療圏の全パネルデータを1リクエストで取得し、コンテキストで配布する。
const HsaAreaContext = createContext({ code: null, bundle: null, loading: false });

export function HsaAreaProvider({ code, children }) {
  const [state, setState] = useState({ code: null, bundle: null, loading: false });

  useEffect(() => {
    if (!code) { setState({ code: null, bundle: null, loading: false }); return; }
    let alive = true;
    setState(s => ({ code, bundle: s.code === code ? s.bundle : null, loading: true }));
    fetch(`/api/hsa/area/${code}`)
      .then(r => r.json())
      .then(b => { if (alive) setState({ code, bundle: b, loading: false }); })
      .catch(() => { if (alive) setState({ code, bundle: null, loading: false }); });
    return () => { alive = false; };
  }, [code]);

  return <HsaAreaContext.Provider value={state}>{children}</HsaAreaContext.Provider>;
}

// パネルが自分のスライス（overview/demand/...）を取り出す。
export function useHsaPanel(key) {
  const { code, bundle, loading } = useContext(HsaAreaContext);
  return { code, data: bundle ? bundle[key] : null, loading: loading || !bundle };
}

// サマリーカード等がバンドル全体を参照する。
export function useHsaBundle() {
  const { code, bundle, loading } = useContext(HsaAreaContext);
  return { code, bundle, loading: loading || !bundle };
}
