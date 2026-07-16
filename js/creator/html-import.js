import { GENBLOX_LIMITS, serializeGenBloxFile } from "./genblox-format.js";

export class HtmlImportError extends Error {
  constructor(message, hint = "Use one self-contained HTML file with inline CSS and JavaScript.") {
    super(message);
    this.name = "HtmlImportError";
    this.hint = hint;
  }
}

function decodeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? match;
    const hex = entity[1]?.toLowerCase() === "x";
    const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    try { return String.fromCodePoint(codePoint); } catch { return match; }
  });
}

function plainText(value) {
  return decodeEntities(String(value ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function slug(value) {
  return plainText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56) || "html-game";
}

function collectTagContents(source, tagName) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}\\s*>`, "gi");
  return [...source.matchAll(pattern)].map((match) => ({ attributes: match[1], content: match[2] }));
}

export function convertStandaloneHtml(input, { filename = "game.html" } = {}) {
  const source = String(input ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!source) throw new HtmlImportError("The HTML file is empty.");
  if (new TextEncoder().encode(source).length > GENBLOX_LIMITS.file) {
    throw new HtmlImportError("The HTML file is too big.", "Keep the complete standalone HTML file smaller than 240 KB.");
  }
  if (/<script\b[^>]*\bsrc\s*=/i.test(source)) {
    throw new HtmlImportError("External scripts cannot be imported.", "Put the JavaScript directly inside a <script> tag.");
  }
  if (/<link\b(?=[^>]*\brel\s*=\s*["']?stylesheet\b)[^>]*>/i.test(source)) {
    throw new HtmlImportError("External stylesheets cannot be imported.", "Put the CSS directly inside a <style> tag.");
  }

  const styles = collectTagContents(source, "style").map((entry) => entry.content.trim()).filter(Boolean);
  if (styles.some((css) => /@import\s/i.test(css))) {
    throw new HtmlImportError("CSS @import is not available in GenBlox.", "Copy the required CSS into the HTML file itself.");
  }

  const scripts = collectTagContents(source, "script").map((entry) => {
    const type = entry.attributes.match(/\btype\s*=\s*(?:["']([^"']+)["']|([^\s>]+))/i)?.slice(1).find(Boolean)?.toLowerCase();
    if (type && !["text/javascript", "application/javascript"].includes(type)) {
      throw new HtmlImportError(`Script type "${type}" cannot be imported.`, "Use a normal inline JavaScript <script> without type=module.");
    }
    return entry.content.trim();
  }).filter(Boolean);

  const bodyMatch = source.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  let html = bodyMatch?.[1] ?? source
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, "")
    .replace(/<\/?html\b[^>]*>/gi, "")
    .replace(/<\/?body\b[^>]*>/gi, "");
  html = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
    .trim();
  if (!html) throw new HtmlImportError("The HTML body is empty.", "Add the visible game markup inside <body>.");

  const title = plainText(source.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1])
    || plainText(source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1])
    || plainText(filename.replace(/\.html?$/i, ""))
    || "Imported HTML Game";
  const game = {
    manifest: {
      formatVersion: 1,
      templateId: `${slug(title)}-html-1`,
      title: title.slice(0, 80),
      description: "Imported from a standalone HTML game.",
      mode: "solo",
      maxPlayers: 1,
      orientation: "any",
      sdkVersion: 1,
    },
    html,
    css: styles.join("\n\n"),
    javascript: scripts.join("\n\n"),
  };
  try {
    return { game, source: serializeGenBloxFile(game) };
  } catch (error) {
    throw new HtmlImportError(error.message, error.hint || "Remove unsupported web elements and try the HTML import again.");
  }
}
