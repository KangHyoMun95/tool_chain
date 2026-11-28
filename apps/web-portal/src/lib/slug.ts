/** Tên → slug cho tên file ảnh: bỏ dấu, chữ thường, ký tự lạ thành "_". "Cái Lobby 1" → "cai_lobby_1". */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
