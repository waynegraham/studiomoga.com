import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import { createRequire } from "module";
import { compile } from "tailwindcss";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const INPUT_CSS = path.join(SRC_DIR, "styles", "main.css");
const OUTPUT_CSS = path.join(SRC_DIR, "assets", "styles.css");
const WATCH = process.argv.includes("--watch");
const CONTENT_EXTENSIONS = new Set([
  ".njk",
  ".html",
  ".md",
  ".11ty.js",
  ".js",
  ".ts",
  ".mjs",
  ".cjs",
]);

let isBuilding = false;
let pendingBuild = false;
let buildTimer;
let watchers = [];

async function ensureInputFile() {
  await fsp.mkdir(path.dirname(INPUT_CSS), { recursive: true });
  try {
    await fsp.access(INPUT_CSS);
  } catch {
    await fsp.writeFile(INPUT_CSS, '@import "tailwindcss";\n', "utf8");
  }
}

function extMatches(filePath) {
  for (const ext of CONTENT_EXTENSIONS) {
    if (filePath.endsWith(ext)) return true;
  }
  return false;
}

function extractCandidates(content) {
  const set = new Set();
  const classAttributeRegex = /class(?:Name)?\s*=\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = classAttributeRegex.exec(content)) !== null) {
    for (const token of match[1].split(/\s+/)) {
      const candidate = token.trim();
      if (candidate) set.add(candidate);
    }
  }
  return set;
}

async function walk(dirPath) {
  const files = [];
  let entries = [];
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function collectCandidates() {
  const files = await walk(SRC_DIR);
  const candidates = new Set();
  for (const filePath of files) {
    if (!extMatches(filePath)) continue;
    const content = await fsp.readFile(filePath, "utf8");
    for (const className of extractCandidates(content)) {
      candidates.add(className);
    }
  }
  return [...candidates];
}

async function runBuild() {
  if (isBuilding) {
    pendingBuild = true;
    return;
  }
  isBuilding = true;
  try {
    await ensureInputFile();
    const cssInput = await fsp.readFile(INPUT_CSS, "utf8");
    const compiler = await compile(cssInput, {
      from: INPUT_CSS,
      base: ROOT,
      loadStylesheet: async (id, baseDir) => {
        const importerBase = baseDir || ROOT;
        const isRelative = id.startsWith(".") || id.startsWith("/");
        let resolvedPath;

        if (isRelative) {
          resolvedPath = path.resolve(importerBase, id);
        } else if (id === "tailwindcss") {
          resolvedPath = require.resolve("tailwindcss/index.css");
        } else if (id.startsWith("tailwindcss/")) {
          const cssEntry = id.endsWith(".css") ? id : `${id}.css`;
          resolvedPath = require.resolve(cssEntry, { paths: [ROOT] });
        } else {
          resolvedPath = require.resolve(id, { paths: [importerBase, ROOT] });
        }

        const content = await fsp.readFile(resolvedPath, "utf8");
        return {
          path: resolvedPath,
          base: path.dirname(resolvedPath),
          content,
        };
      },
    });
    const candidates = await collectCandidates();
    const output = compiler.build(candidates);
    await fsp.mkdir(path.dirname(OUTPUT_CSS), { recursive: true });
    await fsp.writeFile(OUTPUT_CSS, output, "utf8");
    console.log(`[tailwind] Built ${path.relative(ROOT, OUTPUT_CSS)}`);
  } catch (error) {
    console.error("[tailwind] Build failed");
    console.error(error);
    process.exitCode = 1;
  } finally {
    isBuilding = false;
    if (pendingBuild) {
      pendingBuild = false;
      await runBuild();
    }
  }
}

function closeWatchers() {
  for (const watcher of watchers) watcher.close();
  watchers = [];
}

async function setupWatchers() {
  closeWatchers();
  const files = await walk(SRC_DIR);
  const dirs = new Set([SRC_DIR, path.dirname(INPUT_CSS)]);
  for (const filePath of files) {
    dirs.add(path.dirname(filePath));
  }
  for (const dirPath of dirs) {
    const watcher = fs.watch(dirPath, () => {
      clearTimeout(buildTimer);
      buildTimer = setTimeout(async () => {
        await runBuild();
        await setupWatchers();
      }, 120);
    });
    watchers.push(watcher);
  }
}

async function main() {
  await runBuild();
  if (!WATCH) return;
  await setupWatchers();
  console.log("[tailwind] Watching src for changes");
}

main();
