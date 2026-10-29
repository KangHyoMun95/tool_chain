import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

export type CatalogStatus = "ACTIVE" | "DEACTIVE" | "ARCHIVE";

@Entity("lobbies")
export class LobbyEntity {
  @PrimaryGeneratedColumn("identity", { name: "lobby_id", type: "bigint", generatedIdentity: "ALWAYS" }) lobbyId!: string;
  @Column({ name: "lobby_name", length: 255 }) lobbyName!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @Column({ length: 20, default: "ACTIVE" }) status!: CatalogStatus;
}
