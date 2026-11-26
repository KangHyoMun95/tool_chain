import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity("transaction_daily_summaries")
export class TransactionDailySummaryEntity {
  @PrimaryColumn({ name: "user_id", type: "uuid" }) userId!: string;
  @PrimaryColumn({ name: "transaction_type", type: "text" }) transactionType!: "CHARGE" | "REFUND";
  @PrimaryColumn({ type: "date" }) day!: string;
  @Column({ name: "tx_count", type: "integer" }) txCount!: number;
  @Column({ name: "total_amount", type: "bigint" }) totalAmount!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
