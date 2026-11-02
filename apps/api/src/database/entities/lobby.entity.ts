import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import { CatalogStatus } from "@toolhackchain/shared";

@Entity("lobbies")
export class LobbyEntity {
  @PrimaryGeneratedColumn("uuid", { name: "lobby_id" }) lobbyId!: string;
  @Column({ name: "lobby_name", length: 255 }) lobbyName!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @Column({ length: 20, default: CatalogStatus.ACTIVE }) status!: CatalogStatus;
}
