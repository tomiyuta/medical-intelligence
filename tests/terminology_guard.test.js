#!/usr/bin/env node
/**
 * Phase 4-1 P0-5: terminology guard for review safety
 *
 * 外部レビュアー Conditional Go 採択の再混入を防ぐ CI guard。
 * reviewer Done 条件:
 *   - UI/docs に forbidden terms が再混入したら CI で落ちる
 *   - self-reference / 否定文は allowlist で許容
 *   - 「診断ツール」「ランキング」「優良施設」「劣後地域」「政策効果」などを検出
 *   - PHASE4_REVIEW_PACKAGE.md の historical notes は例外化
 *   - npm test または npm run lint 相当で実行可能
 *
 * 使用:
 *   node tests/terminology_guard.test.js
 *   npm test
 *
 * exit code:
 *   0 = pass (forbidden terms 検出なし)
 *   1 = fail (1件以上検出)
 *
 * docs: docs/PHASE4_REVIEW_PACKAGE.md §6 (誤読防止ルール)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(__dirname, '.terminology-allowlist.json');

// ── ANSI color (環境によっては効かないが decorative なだけなので問題なし) ──
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// ── 設定読み込み ──
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`${RED}❌ Config not found: ${CONFIG_PATH}${RESET}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

// ── ファイル走査 (再帰、exclude考慮) ──
function walkDir(dir, excludePaths, results = []) {
  const absExcludes = excludePaths.map(p => path.resolve(ROOT, p));
  const absDir = path.resolve(dir);

  // この dir 自体が除外対象なら skip
  for (const ex of absExcludes) {
    if (absDir === ex || absDir.startsWith(ex + path.sep)) return results;
  }

  if (!fs.existsSync(absDir)) return results;
  const stat = fs.statSync(absDir);
  if (stat.isFile()) {
    results.push(absDir);
    return results;
  }
  if (!stat.isDirectory()) return results;

  for (const name of fs.readdirSync(absDir)) {
    if (name.startsWith('.') && name !== '.terminology-allowlist.json') continue;
    walkDir(path.join(absDir, name), excludePaths, results);
  }
  return results;
}

// ── スキャン対象ファイル ──
function collectFiles(config) {
  const allFiles = new Set();
  for (const p of config.scan_paths) {
    const abs = path.resolve(ROOT, p);
    if (!fs.existsSync(abs)) continue;
    walkDir(abs, config.exclude_paths || [], []).forEach(f => allFiles.add(f));
  }
  // .md / .js / .jsx / .ts / .tsx のみ
  return [...allFiles].filter(f => /\.(md|js|jsx|ts|tsx)$/i.test(f));
}

// ── allowlist 判定 ──
function isFileAllowlisted(absPath, config) {
  const rel = path.relative(ROOT, absPath);
  return (config.allowlist_files || []).some(a => a.path === rel);
}

// ── 検査本体 ──
function scanFile(absPath, terms) {
  const rel = path.relative(ROOT, absPath);
  const content = fs.readFileSync(absPath, 'utf-8');
  const lines = content.split('\n');
  const findings = [];

  for (const t of terms) {
    const term = t.term;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let idx = line.indexOf(term);
      while (idx !== -1) {
        // ── 否定文・self-reference の context 判定 ──
        // 行内に「ではない」「ではありません」「ではなく」「ではない、」「ではない。」等が前後にあるか
        const negPattern = /(?:≠|ではな[いくか]|ではありませ[んぬ]|ではあ[らり]ませ[んぬ]|示すものではな|示す指標ではな|意味するわけではな|意味するものではあ[りら]ませ[んぬ]|意味しませ[んぬ]|意味ではな|主張ではあ[りら]ませ[んぬ]|主張ではな|評価ではな|評価できませ[んぬ]|評価をしませ[んぬ]|使用しませ[んぬ]|使用できませ[んぬ]|断定[しせ]ない|表現を避け|該当しませ[んぬ]|読まれ[るな]|読[むめ]|誤読|懸念|公式|内製|参考指標|認証ではあ[りら]ませ[んぬ]|公式分類ではあ[りら]ませ[んぬ]|提案ではあ[りら]ませ[んぬ]|過剰|含[むめ]ない)/;

        const ctxStart = Math.max(0, idx - 30);
        const ctxEnd = Math.min(line.length, idx + term.length + 30);
        const context = line.slice(ctxStart, ctxEnd);

        const negated = negPattern.test(context);

        if (!negated) {
          findings.push({
            file: rel,
            line: i + 1,
            term,
            severity: t.severity,
            reason: t.reason,
            context: line.trim().slice(0, 120),
          });
        }

        idx = line.indexOf(term, idx + term.length);
      }
    }
  }

  return findings;
}

// ── main ──
function main() {
  const config = loadConfig();
  const files = collectFiles(config);

  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}  Terminology Guard (Phase 4-1 P0-5)${RESET}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`Scan paths: ${config.scan_paths.join(', ')}`);
  console.log(`Forbidden terms: ${config.forbidden_terms.length}`);
  console.log(`Files scanned: ${files.length}`);
  console.log(`Allowlisted files: ${(config.allowlist_files || []).length}`);
  console.log('');

  const allFindings = [];
  for (const f of files) {
    if (isFileAllowlisted(f, config)) continue;
    const found = scanFile(f, config.forbidden_terms);
    allFindings.push(...found);
  }

  if (allFindings.length === 0) {
    console.log(`${GREEN}${BOLD}✅ PASS: No forbidden terms detected.${RESET}`);
    console.log(`${GREEN}reviewer Conditional Go #1 (P0 docs alignment) 維持済${RESET}`);
    process.exit(0);
  }

  // ── 失敗時のレポート ──
  console.log(`${RED}${BOLD}❌ FAIL: ${allFindings.length} forbidden term(s) detected${RESET}`);
  console.log('');

  const bySeverity = { P0: [], P1: [], P2: [] };
  for (const f of allFindings) {
    (bySeverity[f.severity] || bySeverity.P0).push(f);
  }

  for (const sev of ['P0', 'P1', 'P2']) {
    if (bySeverity[sev].length === 0) continue;
    const color = sev === 'P0' ? RED : sev === 'P1' ? YELLOW : BLUE;
    console.log(`${color}${BOLD}── ${sev} (${bySeverity[sev].length}件) ──${RESET}`);
    for (const f of bySeverity[sev]) {
      console.log(`${color}  ${f.file}:${f.line}${RESET}  ${BOLD}[${f.term}]${RESET}`);
      console.log(`    reason: ${f.reason}`);
      console.log(`    line  : ${f.context}`);
    }
    console.log('');
  }

  console.log(`${YELLOW}対処方法:${RESET}`);
  console.log(`  1. 該当箇所を中立表現に修正する (例: 「診断ツール」→「仮説生成ツール」)`);
  console.log(`  2. 否定文 (「~ではない」「~を示しません」等) なら自動的に許容される`);
  console.log(`  3. 歴史的記録など正当な self-reference は tests/.terminology-allowlist.json の allowlist_files に追加`);
  console.log(`  4. docs: docs/PHASE4_REVIEW_PACKAGE.md §6 (誤読防止ルール) を参照`);
  console.log('');

  process.exit(1);
}

main();
