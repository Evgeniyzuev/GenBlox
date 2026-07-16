export const CREATOR_ROOM_CHUNK_SIZE = 6_000;
export const CREATOR_ROOM_MAX_BYTES = 240_000;

export class CreatorRoomDeliveryError extends Error {
  constructor(message) {
    super(message);
    this.name = "CreatorRoomDeliveryError";
  }
}

export function hashCreatorSource(source) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createCreatorRoomDelivery(source, manifest, sessionId = crypto.randomUUID()) {
  const normalizedSource = String(source ?? "");
  const byteLength = new TextEncoder().encode(normalizedSource).length;
  if (!normalizedSource || byteLength > CREATOR_ROOM_MAX_BYTES) {
    throw new CreatorRoomDeliveryError("Room games must be valid GenBlox files smaller than 240 KB.");
  }

  const chunks = [];
  for (let offset = 0; offset < normalizedSource.length; offset += CREATOR_ROOM_CHUNK_SIZE) {
    chunks.push(normalizedSource.slice(offset, offset + CREATOR_ROOM_CHUNK_SIZE));
  }
  return {
    meta: {
      sessionId: String(sessionId),
      templateId: String(manifest.templateId),
      title: String(manifest.title).slice(0, 80),
      mode: manifest.mode,
      maxPlayers: manifest.maxPlayers,
      byteLength,
      sourceLength: normalizedSource.length,
      sourceHash: hashCreatorSource(normalizedSource),
      chunkCount: chunks.length,
    },
    chunks,
  };
}

export function assembleCreatorRoomSource(meta, chunkRecords) {
  if (!meta || !Number.isInteger(meta.chunkCount) || meta.chunkCount < 1 || meta.chunkCount > 64) {
    throw new CreatorRoomDeliveryError("The room game metadata is invalid.");
  }
  if (!Array.isArray(chunkRecords) || chunkRecords.length !== meta.chunkCount) {
    throw new CreatorRoomDeliveryError("The room game is still downloading.");
  }
  const chunks = chunkRecords.map((record, index) => {
    if (record?.sessionId !== meta.sessionId || record?.index !== index || typeof record?.source !== "string") {
      throw new CreatorRoomDeliveryError("The room game is still downloading.");
    }
    return record.source;
  });
  const source = chunks.join("");
  const byteLength = new TextEncoder().encode(source).length;
  if (source.length !== meta.sourceLength || byteLength !== meta.byteLength || hashCreatorSource(source) !== meta.sourceHash) {
    throw new CreatorRoomDeliveryError("The room game download did not pass its integrity check.");
  }
  return source;
}
