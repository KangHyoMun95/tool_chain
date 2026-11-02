import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

export type TransactionType = "MINT" | "TRANSFER_OUT" | "TRANSFER_IN" | "CHARGE" | "REFUND";

@Entity("transactions")
export class TransactionEntity {
  @PrimaryGeneratedColumn("uuid", { name: "transaction_id" }) transactionId!: string;
  @Column({ name: "user_id", type: "uuid" }) userId!: string;
  @Column({ name: "predictions_subscriptions_id", type: "uuid", nullable: true }) predictionsSubscriptionsId!: string | null;
  @Column({ name: "transaction_type", length: 20 }) transactionType!: TransactionType;
  @Column({ type: "bigint" }) amount!: string;
  @Column({ name: "balance_before", type: "bigint" }) balanceBefore!: string;
  @Column({ name: "balance_after", type: "bigint" }) balanceAfter!: string;
  @Column({ name: "created_by", type: "uuid", nullable: true }) createdBy!: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
