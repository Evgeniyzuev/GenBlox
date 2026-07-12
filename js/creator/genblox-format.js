export const GENBLOX_LIMITS = Object.freeze({ file: 240_000, manifest: 8_000, html: 80_000, css: 80_000, javascript: 120_000 });

const HEADER = "=== GENBLOX GAME 1 ===";
const END = "=== END ===";
const SECTION_NAMES = ["MANIFEST", "HTML", "CSS", "JAVASCRIPT"];
const REQUIRED_MANIFEST_FIELDS = ["formatVersion", "templateId", "title", "description", "mode", "maxPlayers", "orientation", "sdkVersion"];

export class GenBloxFormatError extends Error {
  constructor(message, line = null, hint = "Ask AI to return the complete GenBlox file without Markdown fences.") {
    super(message);
    this.name = "GenBloxFormatError";
    this.line = line;
    this.hint = hint;
  }
}

function marker(name) { return `=== ${name} ===`; }
function lineOf(text, index) { return text.slice(0, Math.max(0, index)).split("\n").length; }

export function parseGenBloxFile(input) {
  const text = String(input ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (text.length > GENBLOX_LIMITS.file) throw new GenBloxFormatError("This game file is too big.", null, "Ask AI to make the game smaller than 240 KB.");
  if (/^```|```$/m.test(text)) throw new GenBloxFormatError("The file contains Markdown code fences.", null, "Ask AI to return plain text without ``` marks.");
  if (!text.startsWith(HEADER)) throw new GenBloxFormatError("The GenBlox header is missing.", 1);
  if (!text.endsWith(END)) throw new GenBloxFormatError("The END marker is missing.", text.split("\n").length, "Ask AI to restore === END === at the bottom.");

  const positions = SECTION_NAMES.map((name) => {
    const token = marker(name);
    const first = text.indexOf(token);
    if (first < 0) throw new GenBloxFormatError(`The ${name} section is missing.`, null, `Ask AI to restore ${token}.`);
    if (text.indexOf(token, first + token.length) >= 0) throw new GenBloxFormatError(`The ${name} section appears twice.`, lineOf(text, first));
    return { name, token, index: first };
  });
  positions.forEach((entry, index) => {
    if (index && entry.index < positions[index - 1].index) throw new GenBloxFormatError(`${entry.name} is in the wrong place.`, lineOf(text, entry.index));
  });

  const sections = {};
  positions.forEach((entry, index) => {
    const start = entry.index + entry.token.length;
    const finish = index + 1 < positions.length ? positions[index + 1].index : text.lastIndexOf(END);
    sections[entry.name.toLowerCase()] = text.slice(start, finish).trim();
  });
  for (const [name, limit] of Object.entries({ manifest: GENBLOX_LIMITS.manifest, html: GENBLOX_LIMITS.html, css: GENBLOX_LIMITS.css, javascript: GENBLOX_LIMITS.javascript })) {
    if (sections[name].length > limit) throw new GenBloxFormatError(`The ${name.toUpperCase()} section is too big.`, null, `Ask AI to shorten the ${name.toUpperCase()} section.`);
  }
  if (/<script\b/i.test(sections.html)) throw new GenBloxFormatError("The HTML section contains a script tag.", null, "Ask AI to move all code into the JAVASCRIPT section.");
  if (/<(?:iframe|object|embed|base|link|meta)\b/i.test(sections.html)) throw new GenBloxFormatError("The HTML section contains a blocked web element.", null, "Ask AI to use simple HTML elements, Canvas, CSS, and emoji only.");

  let manifest;
  try { manifest = JSON.parse(sections.manifest); }
  catch (error) { throw new GenBloxFormatError(`The MANIFEST JSON is broken: ${error.message}`, lineOf(text, positions[0].index)); }
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (manifest[field] === undefined || manifest[field] === "") throw new GenBloxFormatError(`The manifest field "${field}" is missing.`, lineOf(text, positions[0].index));
  }
  if (manifest.formatVersion !== 1 || manifest.sdkVersion !== 1) throw new GenBloxFormatError("This game uses an unsupported format or SDK version.");
  if (!['solo', 'multiplayer'].includes(manifest.mode)) throw new GenBloxFormatError('The manifest mode must be "solo" or "multiplayer".');
  if (!Number.isInteger(manifest.maxPlayers) || manifest.maxPlayers < 1 || manifest.maxPlayers > 8) throw new GenBloxFormatError("maxPlayers must be a whole number from 1 to 8.");
  if (!['portrait', 'landscape', 'any'].includes(manifest.orientation)) throw new GenBloxFormatError('orientation must be "portrait", "landscape", or "any".');
  return { manifest, html: sections.html, css: sections.css, javascript: sections.javascript };
}

export function serializeGenBloxFile(game) {
  const text = [HEADER, marker("MANIFEST"), JSON.stringify(game.manifest, null, 2), marker("HTML"), game.html.trim(), marker("CSS"), game.css.trim(), marker("JAVASCRIPT"), game.javascript.trim(), END].join("\n");
  parseGenBloxFile(text);
  return `${text}\n`;
}
