// Thông tin tài khoản đang đăng nhập (GET /auth/me). balance là bigint nên API trả CHUỖI: không dùng Number/+/-.
// canParticipate do API tính (USER, ACTIVE, balance >= phí) — portal KHÔNG tự so balance với phí.
import { apiGet } from "./client";

/** name = display_name nếu đã đặt, không thì số điện thoại của chính user (không lộ số của ai khác). */
export type Me = { phone: string; name: string; balance: string; canParticipate: boolean };

export const getMe = async (): Promise<Me> => {
  const me = await apiGet<{ phone_number: string; display_name?: string | null; balance: string | number; can_participate?: boolean }>("/auth/me");
  return { phone: me.phone_number, name: me.display_name || me.phone_number, balance: String(me.balance), canParticipate: me.can_participate === true };
};

/** "1250000" → "1,250,000" (chỉ xử lý chuỗi, không ép sang số). */
export const formatBalance = (raw: string): string => raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
