export const revalidate = 86400;
import { NextResponse } from 'next/server';
import { getNdbCheckupRiskRatesStandardized } from '../../../../lib/data.js';
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' };
export async function GET() { return NextResponse.json(getNdbCheckupRiskRatesStandardized(), { headers: CACHE_HEADERS }); }
