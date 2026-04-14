import { readFileSync } from 'fs';
import { join } from 'path';

let cache = {};

function loadJSON(name) {
  if (!cache[name]) {
    const p = join(process.cwd(), 'data', 'static', name + '.json');
    cache[name] = JSON.parse(readFileSync(p, 'utf-8'));
  }
  return cache[name];
}

export function getTiers() { return loadJSON('tiers'); }
export function getPrefectures() { return loadJSON('prefectures'); }
export function getTopFacilities() { return loadJSON('top_facilities'); }
