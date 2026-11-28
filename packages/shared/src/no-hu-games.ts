// packages/shared/src/no-hu-games.ts
// Danh sách game của lobby NỔ HŨ. DB (categories.category_name) chỉ lưu MÃ (UPPER_SNAKE_CASE); tên hiển thị (vi / en) và file ảnh nằm ở đây.
// Thứ tự hiển thị lấy từ categories.sort_order trong DB (V7 gieo 1..11 theo đúng thứ tự khai báo dưới đây). SỬA Ở ĐÂY ⇒ sửa V7 / migration mới.
// Ảnh: apps/web-portal/public/images/categories/<image>.<ext>, `image` = MÃ viết thường (lower_snake_case).

export type NoHuGame = { vi: string; en: string; image: string };
export type NoHuGameLocale = "vi" | "en";

export const NO_HU_GAMES: Readonly<Record<string, NoHuGame>> = {
  GATES_OF_OLYMPUS: { vi: "Gates of Olympus", en: "Gates of Olympus", image: "gates_of_olympus" },
  FORTUNE_TIGER: { vi: "Fortune Tiger", en: "Fortune Tiger", image: "fortune_tiger" },
  AVIATOR: { vi: "Phi công", en: "Aviator", image: "aviator" },
  MAHJONG_WAYS: { vi: "Đường mạt chược", en: "Mahjong Ways", image: "mahjong_ways" },
  FORTUNE_GEMS_2: { vi: "Ngọc may mắn 2", en: "Fortune Gems 2", image: "fortune_gems_2" },
  WILD_BOUNTY_SHOWDOWN: { vi: "Quyết chiến tiền thưởng", en: "Wild Bounty Showdown", image: "wild_bounty_showdown" },
  FORTUNE_GEMS_3: { vi: "Ngọc may mắn 3", en: "Fortune Gems 3", image: "fortune_gems_3" },
  LUCKY_NEKO: { vi: "Mèo may mắn", en: "Lucky Neko", image: "lucky_neko" },
  GOLDEN_EMPIRE: { vi: "Đế quốc hoàng gia", en: "Golden Empire", image: "golden_empire" },
  SUPER_ACE: { vi: "Siêu át", en: "Super Ace", image: "super_ace" },
  TREASURES_OF_AZTEC: { vi: "Kho báu Aztec", en: "Treasures of Aztec", image: "treasures_of_aztec" },
};

/**
 * Chuẩn hóa tên game để SO SÁNH BẰNG NHAU: trim, bỏ dấu tiếng Việt (đ → d), chữ thường, "_" coi như khoảng trắng, gộp khoảng trắng.
 * Khác `normalizeName` (khóa chống trùng ở DB, giữ nguyên dấu): hàm này chỉ dùng để nhận diện game khi nhập file.
 */
export function normalizeGameName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mọi cách gọi của một game (tên vi, tên en, MÃ) sau chuẩn hóa. */
function aliases(code: string, g: NoHuGame): Set<string> {
  return new Set([normalizeGameName(g.vi), normalizeGameName(g.en), normalizeGameName(code)]);
}

/**
 * Kiểm tra bảng game: sau chuẩn hóa, tên của hai game KHÁC nhau không được trùng (vd hai game cùng tên "Ngọc may mắn 2").
 * Một game có tên vi trùng tên en (hoặc trùng MÃ) của chính nó là hợp lệ. Trả danh sách lỗi (rỗng = hợp lệ).
 */
export function validateNoHuGames(games: Readonly<Record<string, NoHuGame>> = NO_HU_GAMES): string[] {
  const errors: string[] = [];
  const owner = new Map<string, string>();
  const images = new Map<string, string>();
  for (const [code, g] of Object.entries(games)) {
    if (!/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(code)) errors.push(`Mã game "${code}" phải là UPPER_SNAKE_CASE`);
    if (g.image !== code.toLowerCase()) errors.push(`Game ${code}: image phải là "${code.toLowerCase()}" (MÃ viết thường), đang là "${g.image}"`);
    const prevImage = images.get(g.image);
    if (prevImage) errors.push(`Game ${code} và ${prevImage} dùng chung file ảnh "${g.image}"`);
    images.set(g.image, code);
    for (const a of aliases(code, g)) {
      const prev = owner.get(a);
      if (prev !== undefined && prev !== code) errors.push(`Game ${code} và ${prev} trùng tên sau chuẩn hóa: "${a}"`);
      owner.set(a, code);
    }
  }
  return errors;
}

const lookup = new Map<string, string>();
for (const [code, g] of Object.entries(NO_HU_GAMES)) for (const a of aliases(code, g)) if (!lookup.has(a)) lookup.set(a, code);

/**
 * Tên người dùng gõ (vi, en hoặc MÃ; không phân biệt hoa / thường / dấu) → MÃ của game, hoặc null.
 * So khớp BẰNG NHAU sau chuẩn hóa, KHÔNG contains / startsWith ("Ngọc may mắn" thiếu số ⇒ null).
 */
export function resolveNoHuGame(raw: string): string | null {
  return lookup.get(normalizeGameName(raw)) ?? null;
}

/** Tên hiển thị theo ngôn ngữ; MÃ không có trong bảng ⇒ trả MÃ (fallback). */
export function noHuGameName(code: string, locale: NoHuGameLocale): string {
  return NO_HU_GAMES[code]?.[locale] ?? code;
}

/**
 * Bộ đổi chữ → MÃ cho parser import (dùng chung trình duyệt và server): `resolveNoHuGame`, thêm khớp bằng đúng MÃ cho category có trong DB
 * mà chưa có trong NO_HU_GAMES. Kết quả phải là một MÃ có trong `dbCodes` (category của lobby có thật), ngược lại null.
 */
export function createGameResolver(dbCodes: readonly string[]): (raw: string) => string | null {
  const known = new Set(dbCodes);
  const byNorm = new Map(dbCodes.map((c) => [normalizeGameName(c), c]));
  return (raw) => {
    const code = resolveNoHuGame(raw) ?? byNorm.get(normalizeGameName(raw)) ?? null;
    return code !== null && known.has(code) ? code : null;
  };
}
