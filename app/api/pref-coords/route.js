export const revalidate = 86400;
import { NextResponse } from 'next/server';
import { getPrefCoords } from '../../../lib/data.js';
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' };
export async function GET() { return NextResponse.json(getPrefCoords(), { headers: CACHE_HEADERS }); }
