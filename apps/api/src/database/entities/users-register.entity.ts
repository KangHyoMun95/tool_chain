import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

// Số điện thoại đăng ký từ portal, chờ Admin cấp tài khoản.
@Entity("users_register")
export class UsersRegisterEntity {
  @PrimaryGeneratedColumn("uuid", { name: "user_register_id" }) userRegisterId!: string;
  @Column({ name: "phone_number", length: 20, unique: true }) phoneNumber!: string;
  @Column({ name: "created_at", type: "timestamptz", nullable: true }) createdAt!: Date | null; // V16, dòng cũ NULL
}
