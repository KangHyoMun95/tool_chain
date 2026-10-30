import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

export type UserStatus = "ACTIVE" | "DEACTIVE" | "DELETED";

@Entity("users")
export class UserEntity {
  @PrimaryGeneratedColumn("identity", { name: "user_id", type: "bigint", generatedIdentity: "ALWAYS" }) userId!: string;
  @Column({ name: "phone_number", length: 20, unique: true }) phoneNumber!: string;
  @Column({ length: 255 }) password!: string; // always a hash
  @Column({ name: "role_id", type: "smallint" }) roleId!: number;
  @Column({ name: "refer_user_id", type: "bigint", nullable: true }) referUserId!: string | null;
  @Column({ type: "bigint", default: 0 }) balance!: string;
  @Column({ length: 20, default: "ACTIVE" }) status!: UserStatus;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
