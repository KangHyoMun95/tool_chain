// Quốc gia của streamer (tên tiếng Anh từ nguồn, vd "Colombia") → cờ emoji. Không tra được thì 🏳️.
// Lưu ý: Windows không vẽ emoji cờ (hiện hai chữ cái mã nước); đây là phương án tạm theo yêu cầu.

const ISO: Record<string, string> = {
  argentina: "AR", australia: "AU", austria: "AT", belarus: "BY", belgium: "BE", bolivia: "BO", brazil: "BR", bulgaria: "BG",
  cambodia: "KH", canada: "CA", chile: "CL", china: "CN", colombia: "CO", "costa rica": "CR", croatia: "HR", cuba: "CU",
  "czech republic": "CZ", czechia: "CZ", denmark: "DK", "dominican republic": "DO", ecuador: "EC", egypt: "EG", estonia: "EE",
  finland: "FI", france: "FR", germany: "DE", greece: "GR", guatemala: "GT", honduras: "HN", hungary: "HU", india: "IN",
  indonesia: "ID", ireland: "IE", israel: "IL", italy: "IT", japan: "JP", kazakhstan: "KZ", korea: "KR", "south korea": "KR",
  latvia: "LV", lithuania: "LT", malaysia: "MY", mexico: "MX", moldova: "MD", netherlands: "NL", "new zealand": "NZ",
  nicaragua: "NI", nigeria: "NG", norway: "NO", panama: "PA", paraguay: "PY", peru: "PE", philippines: "PH", poland: "PL",
  portugal: "PT", "puerto rico": "PR", romania: "RO", russia: "RU", serbia: "RS", singapore: "SG", slovakia: "SK",
  slovenia: "SI", "south africa": "ZA", spain: "ES", sweden: "SE", switzerland: "CH", taiwan: "TW", thailand: "TH",
  turkey: "TR", ukraine: "UA", "united kingdom": "GB", uk: "GB", england: "GB", "united states": "US", usa: "US", us: "US",
  uruguay: "UY", venezuela: "VE", vietnam: "VN", "viet nam": "VN",
};

const FALLBACK = "🏳️";

/** Mã nước 2 chữ cái → cờ emoji (hai ký tự chỉ báo vùng). */
const fromIso = (code: string): string =>
  Array.from(code.toUpperCase(), (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("");

export function countryFlag(country: string | null | undefined): string {
  const key = country?.trim().toLowerCase();
  if (!key) return FALLBACK;
  if (/^[a-z]{2}$/.test(key)) return fromIso(key);   // nguồn đã là mã nước
  const code = ISO[key];
  return code ? fromIso(code) : FALLBACK;
}
