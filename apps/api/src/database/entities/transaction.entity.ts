import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

export type TransactionType = "MINT" | "TRANSFER_OUT" | "TRANSFER_IN" | "CHARGE" | "REFUND";

@Entity("transactions")
export class TransactionEntity {
  @PrimaryGeneratedColumn("identity", { name: "transaction_id", type: "bigint", generatedIdentity: "ALWAYS" }) transactionId!: string;
  @Column({ name: "user_id", type: "bigint" }) userId!: string;
  @Column({ name: "predictions_subscriptions_id", type: "bigint", nullable: true }) predictionsSubscriptionsId!: string | null;
  @Column({ name: "transaction_type", length: 20 }) transactionType!: TransactionType;
  @Column({ type: "bigint" }) amount!: string;
  @Column({ name: "balance_before", type: "bigint" }) balanceBefore!: string;
  @Column({ name: "balance_after", type: "bigint" }) balanceAfter!: string;
  @Column({ name: "created_by", type: "bigint", nullable: true }) createdBy!: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
