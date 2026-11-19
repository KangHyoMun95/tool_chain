import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("roles")
export class RoleEntity {
  @PrimaryGeneratedColumn("uuid", { name: "role_id" }) roleId!: string;
  @Column({ name: "role_name", length: 20, unique: true }) roleName!: string; // HOST / ADMIN / USER
}
