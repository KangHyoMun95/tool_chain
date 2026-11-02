import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import { CatalogStatus } from "@toolhackchain/shared";

@Entity("categories")
export class CategoryEntity {
  @PrimaryGeneratedColumn("uuid", { name: "category_id" }) categoryId!: string;
  @Column({ name: "category_name", length: 255 }) categoryName!: string;
  @Column({ name: "lobby_id", type: "uuid" }) lobbyId!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @Column({ length: 20, default: CatalogStatus.ACTIVE }) status!: CatalogStatus;
}
