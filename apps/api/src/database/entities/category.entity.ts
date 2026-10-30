import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import type { CatalogStatus } from "./lobby.entity.js";

@Entity("categories")
export class CategoryEntity {
  @PrimaryGeneratedColumn("identity", { name: "category_id", type: "bigint", generatedIdentity: "ALWAYS" }) categoryId!: string;
  @Column({ name: "category_name", length: 255 }) categoryName!: string;
  @Column({ name: "lobby_id", type: "bigint" }) lobbyId!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @Column({ length: 20, default: "ACTIVE" }) status!: CatalogStatus;
}
