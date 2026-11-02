// src/users-register/users-register.service.ts
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";

@Injectable()
export class UsersRegisterService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  /**
   * Ghi số điện thoại chờ cấp tài khoản. Idempotent: đã đăng ký rồi, hoặc đã là user, thì không làm gì.
   * Caller luôn trả cùng một kết quả cho cả ba trường hợp để endpoint công khai này không bị dùng
   * dò xem số nào đã có trong hệ thống.
   */
  async register(phoneNumber: string): Promise<void> {
    await this.ds.query(
      `INSERT INTO users_register (phone_number)
       SELECT $1::varchar WHERE NOT EXISTS (SELECT 1 FROM users WHERE phone_number = $1::varchar)
       ON CONFLICT (phone_number) DO NOTHING`,
      [phoneNumber],
    );
  }
}
