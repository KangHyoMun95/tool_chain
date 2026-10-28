// src/ticks/tick.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("ticks")
@Index(["itemId", "sourceTs"])
export class TickEntity {
  @PrimaryGeneratedColumn({ type: "bigint" }) seq!: string;
  @Column({ name: "dedup_key", length: 40, unique: true }) dedupKey!: string;
  @Column({ name: "item_id", length: 64 }) itemId!: string;
  @Column({ name: "source_ts", type: "timestamptz" }) sourceTs!: Date;
  @Column({ type: "jsonb" }) data!: Record<string, unknown>;
  @CreateDateColumn({ name: "received_at", type: "timestamptz" }) receivedAt!: Date;
}