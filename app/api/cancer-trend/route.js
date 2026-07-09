export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

let cache = null;
function load() {
  if (!cache) cache = JSON.parse(readFileSync(join(process.cwd(), 'data', 'static', 'cancer_trend.json'), 'utf-8'));
  return cache;
}

// ?pref=<都道府県名> で該当県 + 全国の部位別 ASR75 時系列を返す。
// pref 省略時は全国系列 + 県一覧のみ(部位×性×47県の全量配信を避ける)。
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pref = searchParams.get('pref');
  const data = load();
  const prefList = Object.keys(data.prefectures);

  const meta = {
    years: data.years,
    sites: data._sites,
    basis: data._basis,
    unit: data._unit,
    caveat: data._caveat,
    source: data._source,
    national: data.national,
    prefectures: prefList,
  };

  // ?all=1: 展開ビュー用に47県全系列を同梱(部位別スモールマルチプルの背景線)。
  // gzip後 ~30KB 程度でクライアント側の相対位置描画に必要なため opt-in で返す。
  if (searchParams.get('all')) {
    return NextResponse.json({ ...meta, prefecture: null, allSeries: data.prefectures });
  }

  if (!pref) {
    return NextResponse.json({ ...meta, prefecture: null });
  }

  const series = data.prefectures[pref];
  if (!series) {
    return NextResponse.json(
      { ...meta, prefecture: null, error: `unknown prefecture: ${pref}` },
      { status: 404 }
    );
  }

  return NextResponse.json({ ...meta, prefecture: { name: pref, data: series } });
}
