import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve, sep } from "node:path";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const html = await readFile(join(root, "index.html"), "utf8");
assert.match(html, /<title>Enouia<\/title>/);
assert.match(html, /type="range"/);
assert.match(html, /<noscript>/);
assert.doesNotMatch(
  html,
  /astro-island|\/admin\/|\/api\/|localhost|127\.0\.0\.1/,
);
const assets = [...html.matchAll(/(?:src|href)="(\/[^"#]*)"/g)].map(
  (match) => match[1],
);
for (const match of html.matchAll(/srcset="([^"]+)"/g)) {
  for (const candidate of match[1].split(","))
    assets.push(candidate.trim().split(/\s+/)[0]);
}
for (const asset of assets) {
  const path = resolve(root, `.${asset}`);
  assert.ok(path.startsWith(root.endsWith(sep) ? root : root + sep));
  assert.ok((await stat(path)).isFile(), `Missing asset: ${asset}`);
}
let total = 0;
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(path);
      continue;
    }
    total += (await stat(path)).size;
    if (/\.(js|html)$/.test(entry.name)) {
      const source = await readFile(path, "utf8");
      assert.doesNotMatch(source, /@tiptap|@vue|\.private\/posts|astro-island/);
    }
  }
}
await inspect(root);
// Two unique artworks, each in two responsive sizes, plus the complete page.
assert.ok(total < 1_000_000, `Static site exceeds its 1 MB budget: ${total}`);
console.log(
  `Enouia: static output and local asset references verified; ${total.toLocaleString()} bytes total.`,
);
