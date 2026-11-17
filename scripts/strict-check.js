#!/usr/bin/env node
/**
 * Strict type checking, one area at a time.
 *
 * The project compiles with `strict: false`, and turning it on everywhere at
 * once means hundreds of errors. TypeScript can't apply `strict` to only some
 * folders, so this builds the normal program with the strict flags on and
 * reports diagnostics only for files under STRICT_PATHS. Add a path once it is
 * clean; `npm test` runs this, so it stays clean.
 *
 *   node scripts/strict-check.js          check the allowlist
 *   node scripts/strict-check.js --all    error count per folder, for planning
 */
const path = require("path");
const ts = require("typescript");

/** Paths (relative to the repo root) held to `strict: true`. */
const STRICT_PATHS = [
  "index.ts",
  "utils/",
  "interfaces/",
  "islander/",
  "components/",
  "events/",
  "modules/Music/",
  "modules/RaidModule.ts",
  "modules/RaidReminders.ts",
  "modules/statistics.ts",
  "modules/VintageStoryStatus.ts",
];

const root = path.resolve(__dirname, "..");
const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, strict: true, noEmit: true });

const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const isStrict = (file) => STRICT_PATHS.some((p) => (p.endsWith("/") ? file.startsWith(p) : file === p));

const diagnostics = ts
  .getPreEmitDiagnostics(program)
  .filter((d) => d.file && !relative(d.file.fileName).startsWith("node_modules/"));

if (process.argv.includes("--all")) {
  const perFolder = new Map();
  for (const d of diagnostics) {
    const parts = relative(d.file.fileName).split("/");
    const key = parts.length > 2 ? parts.slice(0, 2).join("/") : parts.join("/");
    perFolder.set(key, (perFolder.get(key) ?? 0) + 1);
  }
  for (const [folder, count] of [...perFolder].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(count).padStart(5)}  ${folder}${isStrict(folder + "/") || isStrict(folder) ? "  (strict)" : ""}`);
  }
  console.log(`${String(diagnostics.length).padStart(5)}  total`);
  process.exit(0);
}

const failures = diagnostics.filter((d) => isStrict(relative(d.file.fileName)));
const host = { getCanonicalFileName: (f) => f, getCurrentDirectory: () => root, getNewLine: () => "\n" };
if (failures.length > 0) {
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(failures, host));
  console.error(`\nstrict-check: ${failures.length} error(s) in strict paths.`);
  process.exit(1);
}
console.log(`strict-check: ${STRICT_PATHS.length} path(s) clean under strict mode.`);
