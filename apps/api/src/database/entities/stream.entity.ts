import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { CatalogStatus } from "@toolhackchain/shared";

@Entity("streams")
export class StreamEntity {
  @PrimaryGeneratedColumn("identity", { name: "stream_id", type: "bigint", generatedIdentity: "ALWAYS" }) streamId!: string;
  @Column({ name: "stream_name", length: 255 }) streamName!: string;
  @Column({ name: "category_id", type: "bigint" }) categoryId!: string;
  @Column({ length: 20, default: CatalogStatus.ACTIVE }) status!: CatalogStatus;
}
