import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import type { CatalogStatus } from "./lobby.entity.js";

@Entity("streams")
export class StreamEntity {
  @PrimaryGeneratedColumn("identity", { name: "stream_id", type: "bigint", generatedIdentity: "ALWAYS" }) streamId!: string;
  @Column({ name: "stream_name", length: 255 }) streamName!: string;
  @Column({ name: "category_id", type: "bigint" }) categoryId!: string;
  @Column({ name: "key_id", length: 768, unique: true }) keyId!: string; // <lobby>|<category>|<stream>, normalized
  @Column({ length: 20, default: "ACTIVE" }) status!: CatalogStatus;
}
