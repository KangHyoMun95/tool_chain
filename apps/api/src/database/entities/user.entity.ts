import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import { UserStatus } from "@toolhackchain/shared";

@Entity("users")
export class UserEntity {
  @PrimaryGeneratedColumn("uuid", { name: "user_id" }) userId!: string;
  @Column({ name: "phone_number", length: 20, unique: true }) phoneNumber!: string;
  @Column({ length: 255, select: false }) password!: string; // always a hash; never selected by default
  @Column({ name: "role_id", type: "smallint" }) roleId!: number;
  @Column({ name: "refer_user_id", type: "uuid", nullable: true }) referUserId!: string | null;
  @Column({ type: "bigint", default: 0 }) balance!: string;
  @Column({ length: 20, default: UserStatus.ACTIVE }) status!: UserStatus;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
