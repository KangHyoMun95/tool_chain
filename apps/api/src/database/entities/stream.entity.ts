import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { CatalogStatus } from "@toolhackchain/shared";

@Entity("streams")
export class StreamEntity {
  @PrimaryGeneratedColumn("uuid", { name: "stream_id" }) streamId!: string;
  @Column({ name: "stream_name", length: 255 }) streamName!: string;
  @Column({ name: "category_id", type: "uuid" }) categoryId!: string;
  @Column({ length: 20, default: CatalogStatus.ACTIVE }) status!: CatalogStatus;
}
