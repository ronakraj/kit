#!/usr/bin/env node
// Checks that the repo's markdown docs haven't drifted from reality:
//   - every relative link/image target actually exists on disk
//   - every in-page "#anchor" link matches a real heading
//   - every `npm run <script>` mentioned matches a real package.json script
// Doesn't (can't) judge whether prose is accurate — this only catches
// structural drift: renamed/deleted files, removed npm scripts, stale anchors.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(import.meta.dirname, "..");

function findMarkdownFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...findMarkdownFiles(full));
    else if (name.endsWith(".md")) out.push(full);
  }
  return out;
}

const docFiles = [join(ROOT, "README.md"), ...findMarkdownFiles(join(ROOT, "docs"))].filter(existsSync);

// Mirrors GitHub's heading-to-anchor slugification closely enough for our
// own docs (lowercase, spaces -> hyphens, strip anything but word chars/hyphens).
function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const knownScripts = new Set(Object.keys(packageJson.scripts ?? {}));

const errors = [];

for (const file of docFiles) {
  const content = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const headingSlugs = new Set(
    [...content.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slugify(m[1]))
  );

  for (const m of content.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:)/.test(target)) continue; // external, not checked (avoids network flakiness in CI)

    const [pathPart, anchor] = target.split("#");
    if (pathPart === "") {
      // pure "#anchor" link into this same file
      if (anchor && !headingSlugs.has(anchor)) {
        errors.push(`${rel}: link target "#${anchor}" doesn't match any heading in this file`);
      }
      continue;
    }

    const resolved = resolve(dirname(file), pathPart);
    if (!existsSync(resolved)) {
      errors.push(`${rel}: link target "${pathPart}" does not exist (resolved to ${relative(ROOT, resolved)})`);
    }
  }

  for (const m of content.matchAll(/npm run ([\w:-]+)/g)) {
    const script = m[1];
    if (!knownScripts.has(script)) {
      errors.push(`${rel}: references \`npm run ${script}\`, but no such script exists in package.json`);
    }
  }
}

if (errors.length > 0) {
  console.error(`✖ Docs check found ${errors.length} problem${errors.length === 1 ? "" : "s"}:\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error("\nFix the stale reference, or update the doc to match reality.");
  process.exit(1);
}

console.log(`✓ Docs check passed — ${docFiles.length} file(s) scanned, all links/anchors/commands check out.`);
