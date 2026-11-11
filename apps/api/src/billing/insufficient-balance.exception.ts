// src/billing/insufficient-balance.exception.ts
import { HttpException, HttpStatus } from "@nestjs/common";

export const INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE";

/** 402 { code: "INSUFFICIENT_BALANCE" }: USER không đủ điểm để vào trang chi tiết / tham gia stream. Portal bắt mã này. */
export class InsufficientBalanceException extends HttpException {
  constructor() {
    super({ statusCode: HttpStatus.PAYMENT_REQUIRED, code: INSUFFICIENT_BALANCE, message: "Insufficient balance" }, HttpStatus.PAYMENT_REQUIRED);
  }
}
