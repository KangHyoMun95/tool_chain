// src/registration/ip.util.ts
import { isIP } from "node:net";

/** Bỏ tiền tố IPv4-mapped IPv6 ("::ffff:1.2.3.4" → "1.2.3.4") để cùng một client không bị tách làm hai khóa giới hạn. */
export const normalizeIp = (raw: string | undefined): string => (raw ?? "unknown").replace(/^::ffff:/i, "");

/** Địa chỉ nội bộ / loopback / link-local: dấu hiệu API đang thấy IP của Docker hoặc proxy chứ không phải IP client. */
export function isPrivateIp(raw: string): boolean {
  let ip = raw.startsWith("::ffff:") ? raw.slice(7) : raw;   // IPv4-mapped IPv6
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (v === 6) {
    ip = ip.toLowerCase();
    return ip === "::1" || ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80");
  }
  return true;   // không phải IP hợp lệ (vd "unknown")
}
