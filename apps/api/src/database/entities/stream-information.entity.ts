import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("stream_information")
export class StreamInformationEntity {
  @PrimaryGeneratedColumn("identity", { name: "stream_information_id", type: "bigint", generatedIdentity: "ALWAYS" }) streamInformationId!: string;
  @Column({ name: "stream_id", type: "bigint" }) streamId!: string;
  @Column({ name: "streamer_id", length: 255 }) streamerId!: string; // streamer name (text), not a FK
}
