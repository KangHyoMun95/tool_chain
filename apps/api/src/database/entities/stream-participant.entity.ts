import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("stream_participants")
export class StreamParticipantEntity {
  @PrimaryGeneratedColumn("uuid", { name: "stream_participant_id" }) streamParticipantId!: string;
  @Column({ name: "user_id", type: "uuid" }) userId!: string;
  @Column({ name: "stream_id", type: "uuid" }) streamId!: string;
  @Column({ name: "last_seen_at", type: "timestamptz", default: () => "now()" }) lastSeenAt!: Date;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
