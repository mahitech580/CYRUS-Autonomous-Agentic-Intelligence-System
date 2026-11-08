import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFile(join(root, path), "utf8");

test("every imported visual module exists and is loaded once", async () => {
  const entry = await read("redesign.css");
  const modules = [...entry.matchAll(/@import\\s+["']\\.\\/redesign\\/([^"']+)["'];/g)]
    .map((match) => match[1]);
  assert.ok(modules.length >= 30, "the design system should stay modular");
  assert.equal(new Set(modules).size, modules.length, "a module must not be imported twice");
  await Promise.all(modules.map(async (module) => {
    const info = await stat(join(root, "redesign", module));
    assert.ok(info.isFile(), `missing design module: ${module}`);
  }));
});

test("design tokens use the midnight spectrum palette", async () => {
  const tokens = await read("redesign/tokens.css");
  for (const token of ["#070b18", "#0d1528", "#67e8f9", "#7da5ff", "#b69cff"]) {
    assert.ok(tokens.includes(token), `missing design token ${token}`);
  }
  assert.match(tokens, /color-scheme:\\s*dark/);
});

test("responsive and motion preferences remain in the visual system", async () => {
  const modules = await read("redesign.css");
  const imported = [...modules.matchAll(/@import\\s+["']\\.\\/redesign\\/([^"']+)["'];/g)]
    .map((match) => match[1]);
  const styles = (await Promise.all(imported.map((file) => readFile(join(root, "redesign", file), "utf8")))).join("\\n");
  assert.match(styles, /max-width:\\s*640px/);
  assert.match(styles, /max-width:\\s*900px/);
  assert.match(styles, /prefers-reduced-motion:\\s*reduce/);
  assert.match(styles, /prefers-contrast:\\s*more/);
});

test("photographic references stay on Unsplash and carry accessible context", async () => {
  const app = await read("../src/App.jsx");
  const images = [...app.matchAll(/https:\\/\\/images\\.unsplash\\.com\\/[^"'\\s]+/g)].map((match) => match[0]);
  assert.ok(images.length >= 4, "hero and task-brief photography should remain present");
  assert.ok(images.every((url) => url.startsWith("https://images.unsplash.com/")));
  assert.match(app, /alt="Rows of illuminated server racks/);
  assert.match(app, /loading="lazy"/);
  assert.match(app, /https:\\/\\/unsplash\\.com\\/license/);
});
