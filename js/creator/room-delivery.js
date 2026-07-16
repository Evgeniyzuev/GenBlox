export const CREATOR_ROOM_CHUNK_SIZE = 6_000;
export const CREATOR_ROOM_MAX_BYTES = 240_000;

export class CreatorRoomDeliveryError extends Error {
  constructor(message) {
    super(message);
    this.name = "CreatorRoomDeliveryError";
  }
}

export function createCreatorSessionId(cryptoSource = globalThis.crypto) {
  if (typeof cryptoSource?.randomUUID === "function") {
    try { return cryptoSource.randomUUID(); } catch { /* fall through */ }
  }
  if (typeof cryptoSource?.getRandomValues === "function") {
    try {
      const values = new Uint32Array(4);
      cryptoSource.getRandomValues(values);
      return [...values].map((value) => value.toString(16).padStart(8, "0")).join("-");
    } catch { /* fall through */ }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function hashCreatorSource(source) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createCreatorRoomDelivery(source, manifest, sessionId = createCreatorSessionId()) {
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

function waitFor(check, timeoutMs, pollMs = 50) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const poll = () => {
      try {
        if (check()) return resolve();
      } catch (error) {
        return reject(error);
      }
      if (Date.now() - startedAt >= timeoutMs) return reject(new CreatorRoomDeliveryError("Playroom did not confirm the room game upload in time."));
      setTimeout(poll, pollMs);
    };
    poll();
  });
}

export async function publishCreatorRoomDelivery(client, source, manifest, { timeoutMs = 12_000, sessionId } = {}) {
  if (!client?.started) throw new CreatorRoomDeliveryError("Join or create a room first.");
  const delivery = createCreatorRoomDelivery(source, manifest, sessionId ?? createCreatorSessionId());
  try {
    delivery.chunks.forEach((chunk, index) => {
      client.setGameState(`creator-room:chunk:${index}`, { sessionId: delivery.meta.sessionId, index, source: chunk });
    });
    await waitFor(() => delivery.chunks.every((chunk, index) => {
      const record = client.getGameState(`creator-room:chunk:${index}`);
      return record?.sessionId === delivery.meta.sessionId && record?.index === index && record?.source === chunk;
    }), timeoutMs);

    client.setGameState(`creator-preview:${delivery.meta.sessionId}`, {
      kind: "creator-preview",
      values: {},
      revision: 1,
    });
    const revision = (client.getRoomState()?.revision ?? 0) + 1;
    client.setRoomState({
      screen: "game",
      activeGame: "creator-room",
      creatorGame: delivery.meta,
      startedAt: Date.now(),
      revision,
    });
    await waitFor(() => {
      const room = client.getRoomState();
      return room?.screen === "game" && room?.activeGame === "creator-room" && room?.creatorGame?.sessionId === delivery.meta.sessionId;
    }, timeoutMs);
    return delivery.meta;
  } catch (error) {
    if (error instanceof CreatorRoomDeliveryError) throw error;
    throw new CreatorRoomDeliveryError(`Playroom could not receive the room game: ${error.message || error}`);
  }
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
