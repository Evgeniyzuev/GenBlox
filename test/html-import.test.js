import test from "node:test";
import assert from "node:assert/strict";

import { HtmlImportError, convertStandaloneHtml } from "../js/creator/html-import.js";
import { parseGenBloxFile } from "../js/creator/genblox-format.js";

const STANDALONE_GAME = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>5 в ряд · 😎 vs 😝</title>
  <style>body{margin:0;background:#111}.cell{color:white}</style>
</head>
<body>
  <main class="game"><h1>😎 vs 😝</h1><button id="again">Новая игра</button></main>
  <script>(()=>{document.querySelector('#again').onclick=()=>GenBlox.restart();GenBlox.ready()})()</script>
</body>
</html>`;

test("standalone HTML converts into a valid GenBlox game", () => {
  const imported = convertStandaloneHtml(STANDALONE_GAME, { filename: "five.html" });
  const game = parseGenBloxFile(imported.source);
  assert.equal(game.manifest.title, "5 в ряд · 😎 vs 😝");
  assert.equal(game.manifest.mode, "solo");
  assert.match(game.html, /<main class="game">/);
  assert.doesNotMatch(game.html, /<(?:script|style)\b/i);
  assert.match(game.css, /background:#111/);
  assert.match(game.javascript, /GenBlox\.ready/);
});

test("HTML import rejects resources that cannot run in the sandbox", () => {
  assert.throws(() => convertStandaloneHtml('<body><main>Game</main><script src="game.js"></script></body>'), /External scripts/);
  assert.throws(() => convertStandaloneHtml('<body><main>Game</main><script type="module">export default 1</script></body>'), /cannot be imported/);
  assert.throws(() => convertStandaloneHtml('<style>@import "theme.css";</style><body><main>Game</main></body>'), /@import/);
  assert.throws(() => convertStandaloneHtml('<body><iframe src="game.html"></iframe></body>'), HtmlImportError);
});
