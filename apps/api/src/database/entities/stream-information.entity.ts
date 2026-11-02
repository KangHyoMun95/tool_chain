import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("stream_information")
export class StreamInformationEntity {
  @PrimaryGeneratedColumn("uuid", { name: "stream_information_id" }) streamInformationId!: string;
  @Column({ name: "stream_id", type: "uuid" }) streamId!: string;
  @Column({ name: "streamer_id", length: 255 }) streamerId!: string; // streamer name (text), not a FK
}
