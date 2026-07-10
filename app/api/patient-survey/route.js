export const revalidate = 86400;
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' };

let cache = null;
function load() {
  if (!cache) cache = JSON.parse(readFileSync(join(process.cwd(), 'data', 'static', 'patient_survey_r5.json'), 'utf-8'));
  return cache;
}

export async function GET() {
  return NextResponse.json(load(), { headers: CACHE_HEADERS });
}
