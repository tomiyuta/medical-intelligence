export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 令和5年度DPC退院患者調査 由来の 二次医療圏×MDC別退院患者数・医療機関シェア。?code=2606
// カルテ #25,26(MDC別退院患者数)/#68(医療機関シェア) の一次データ。医療機関所在地ベース。
// ※厚労省の秘匿処理(小値非公開)により実数は数%過小の場合あり。構成比・シェアは信頼可能(PDF #68一致検証済)。
let cache = null;
function load() {
  const path = join(process.cwd(), 'data', 'static', 'dpc_mdc_r5.json');
  if (!existsSync(path)) return null;
  if (!cache) cache = JSON.parse(readFileSync(path, 'utf-8'));
  return cache;
}

export async function GET(request) {
  const data = load();
  if (!data) return NextResponse.json({ ready: false, area: null });
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) return NextResponse.json({ ready: true, source: data.source, areaCount: data.areaCount });
  const area = data.areas[code] || null;
  return NextResponse.json({ ready: true, source: data.source, note: data.note, mdcLabels: data.mdcLabels, code, area });
}
