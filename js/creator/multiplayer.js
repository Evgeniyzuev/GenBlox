export const CREATOR_MULTIPLAYER_LIMITS = Object.freeze({
  keyLength: 48,
  valueBytes: 8_000,
  stateBytes: 32_000,
});

const KEY_PATTERN = /^[a-zA-Z0-9:_-]+$/;
const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export class CreatorMultiplayerError extends Error {
  constructor(message) {
    super(message);
    this.name = "CreatorMultiplayerError";
  }
}

function jsonSize(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function normalizeCreatorGameId(templateId) {
  const normalized = String(templateId ?? "custom")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `creator-preview:${normalized || "custom"}`;
}

export function validateCreatorStateWrite(key, value, currentState = {}) {
  const normalizedKey = String(key ?? "");
  if (!normalizedKey || normalizedKey.length > CREATOR_MULTIPLAYER_LIMITS.keyLength || !KEY_PATTERN.test(normalizedKey) || BLOCKED_KEYS.has(normalizedKey)) {
    throw new CreatorMultiplayerError("Shared-state keys may use letters, numbers, :, _, and - (up to 48 characters).");
  }

  let safeValue;
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("unsupported value");
    if (new TextEncoder().encode(serialized).length > CREATOR_MULTIPLAYER_LIMITS.valueBytes) {
      throw new CreatorMultiplayerError("A shared-state value must be smaller than 8 KB.");
    }
    safeValue = JSON.parse(serialized);
  } catch (error) {
    if (error instanceof CreatorMultiplayerError) throw error;
    throw new CreatorMultiplayerError("Shared state must contain JSON-safe values only.");
  }

  const nextState = { ...currentState, [normalizedKey]: safeValue };
  if (jsonSize(nextState) > CREATOR_MULTIPLAYER_LIMITS.stateBytes) {
    throw new CreatorMultiplayerError("The complete shared state must be smaller than 32 KB.");
  }
  return { key: normalizedKey, value: safeValue, state: nextState };
}
