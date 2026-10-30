// src/game-sessions/game-session-id.ts
import { createHash } from "node:crypto";

// Namespace cố định cho UUIDv5. TUYỆT ĐỐI không đổi: đổi là mọi ván cũ ra ID khác.
const GAME_SESSION_NAMESPACE = "52491c65-79c8-4104-a85b-6a659735e9d7";

function uuidV5(name: string, namespace: string): string {
  const hash = createHash("sha1")
    .update(Buffer.from(namespace.replace(/-/g, ""), "hex"))
    .update(name, "utf8")
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variant RFC 4122
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Cùng một ván (stream + stream_round) luôn ra cùng ID → retry / batch lặp lại vẫn idempotent. */
export const gameSessionId = (keyId: string, streamRound: number): string =>
  uuidV5(`${keyId}|${streamRound}`, GAME_SESSION_NAMESPACE);
