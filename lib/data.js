import { readFileSync } from 'fs';
import { join } from 'path';

let cache = {};

function load(name) {
  if (!cache[name]) {
    const p = join(process.cwd(), 'data', 'static', name + '.json');
    cache[name] = JSON.parse(readFileSync(p, 'utf-8'));
  }
  return cache[name];
}

export function getTiers() { return load('tiers'); }
export function getPrefectures() { return load('prefectures'); }
export function getTopFacilities() { return load('top_facilities'); }
export function getPrefecturesFull() { return load('prefectures_full'); }
export function getMunicipalities() { return load('municipalities'); }
