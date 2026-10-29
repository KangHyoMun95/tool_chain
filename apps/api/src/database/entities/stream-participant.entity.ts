import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("stream_participants")
export class StreamParticipantEntity {
  @PrimaryGeneratedColumn("identity", { name: "stream_participant_id", type: "bigint", generatedIdentity: "ALWAYS" }) streamParticipantId!: string;
  @Column({ name: "user_id", type: "bigint" }) userId!: string;
  @Column({ name: "stream_id", type: "bigint" }) streamId!: string;
  @Column({ name: "last_seen_at", type: "timestamptz", default: () => "now()" }) lastSeenAt!: Date;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
