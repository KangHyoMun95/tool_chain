import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

export type StreamCloseReason =
  | "CLIENT_CLOSED" | "PING_FAILED" | "INSUFFICIENT_BALANCE" | "SESSION_REVOKED" | "SERVER_SHUTDOWN" | "SERVER_RESTART";

// Mỗi kết nối SSE tham gia stream (trang chi tiết) một dòng. Participant đang sống nằm trong RAM của API, bảng này chỉ là nhật ký.
@Entity("stream_connections")
export class StreamConnectionEntity {
  @PrimaryGeneratedColumn("uuid", { name: "stream_connection_id" }) streamConnectionId!: string;
  @Column({ name: "user_id", type: "uuid" }) userId!: string;
  @Column({ name: "stream_id", type: "uuid" }) streamId!: string;
  @Column({ name: "opened_at", type: "timestamptz", default: () => "now()" }) openedAt!: Date;
  @Column({ name: "last_ping_at", type: "timestamptz", nullable: true }) lastPingAt!: Date | null;
  @Column({ name: "closed_at", type: "timestamptz", nullable: true }) closedAt!: Date | null;
  @Column({ name: "close_reason", type: "varchar", length: 32, nullable: true }) closeReason!: StreamCloseReason | null;
}
