// Thông tin tài khoản đang đăng nhập (GET /auth/me). balance là bigint nên API trả CHUỖI: không dùng Number/+/-.
import { apiGet } from "./client";

export type Me = { phone: string; balance: string };

export const getMe = async (): Promise<Me> => {
  const me = await apiGet<{ phone_number: string; balance: string | number }>("/auth/me");
  return { phone: me.phone_number, balance: String(me.balance) };
};

/** "1250000" → "1,250,000" (chỉ xử lý chuỗi, không ép sang số). */
export const formatBalance = (raw: string): string => raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
