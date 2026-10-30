import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("roles")
export class RoleEntity {
  @PrimaryGeneratedColumn("identity", { name: "role_id", type: "smallint", generatedIdentity: "ALWAYS" }) roleId!: number;
  @Column({ name: "role_name", length: 20, unique: true }) roleName!: string; // HOST / ADMIN / USER
}
