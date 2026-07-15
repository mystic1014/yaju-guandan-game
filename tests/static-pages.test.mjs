import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

test("GitHub Pages build contains the playable static app", () => {
  const html = readFileSync("docs/index.html", "utf8");
  assert.match(html, /雅局掼蛋/);
  assert.match(html, /\.\/assets\/.*\.js/);
  assert.match(html, /\.\/assets\/.*\.css/);
  assert.equal(existsSync("docs/og-guandan.png"), true);
  const assets = readdirSync("docs/assets");
  assert.equal(assets.some((name) => name.endsWith(".js")), true);
  assert.equal(assets.some((name) => name.endsWith(".css")), true);
});
