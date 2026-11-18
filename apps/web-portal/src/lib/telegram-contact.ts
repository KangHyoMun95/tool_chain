/**
 * Đọc TELE_CONTRACT (KHÔNG có tiền tố NEXT_PUBLIC_) lúc chạy ở server.
 * Trả về URL http/https hợp lệ, hoặc null để ẩn link: biến thiếu / rỗng / "null" / "undefined" ⇒ null lặng lẽ;
 * giá trị khác nhưng không phải URL http(s) ⇒ null kèm cảnh báo (không log nguyên giá trị, tránh lộ nội dung lạ).
 */
export function getTelegramContactUrl(): string | null {
  const raw = process.env.TELE_CONTRACT?.trim();
  if (!raw || /^(null|undefined)$/i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    // rơi xuống cảnh báo bên dưới
  }
  console.warn("[web-portal] TELE_CONTRACT is not a valid http/https URL; Telegram link is hidden");
  return null;
}
