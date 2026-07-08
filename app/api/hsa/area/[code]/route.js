import { NextResponse } from 'next/server';
import { getAreaBundle } from '../../../../../lib/hsaData';

// 二次医療圏カルテの全パネルデータを1レスポンスで返す（13 fetch → 1）。
// 静的JSONはデプロイ時のみ変化するためエッジで長期キャッシュ可能。
export async function GET(request, { params }) {
  const { code } = params;
  if (!code || !/^\d{4}$/.test(code)) return NextResponse.json({ error: 'invalid code' }, { status: 400 });
  const bundle = getAreaBundle(code);
  return NextResponse.json({ code, ...bundle }, {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
  });
}
