import test from "node:test";
import assert from "node:assert/strict";
import { parseGenBloxFile, serializeGenBloxFile } from "../js/creator/genblox-format.js";
import { CLICKER_FILE, CLICKER_GAME } from "../js/creator/templates.js";

test("Clicker template round-trips",()=>assert.deepEqual(parseGenBloxFile(serializeGenBloxFile(CLICKER_GAME)),CLICKER_GAME));
test("exported Clicker parses",()=>assert.equal(parseGenBloxFile(CLICKER_FILE).manifest.templateId,"clicker-1"));
test("explains a missing section",()=>assert.throws(()=>parseGenBloxFile(CLICKER_FILE.replace("=== JAVASCRIPT ===","")),/JAVASCRIPT section is missing/));
test("rejects Markdown fences",()=>assert.throws(()=>parseGenBloxFile(`\`\`\`\n${CLICKER_FILE}\n\`\`\``),/Markdown code fences/));
test("rejects broken JSON",()=>assert.throws(()=>parseGenBloxFile(CLICKER_FILE.replace('"formatVersion": 1','"formatVersion":')),/MANIFEST JSON is broken/));
test("rejects scripts hidden in HTML",()=>assert.throws(()=>parseGenBloxFile(CLICKER_FILE.replace('<main class="game">','<script>alert(1)</script><main class="game">')),/HTML section contains a script tag/));
