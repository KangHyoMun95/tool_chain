import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("prediction_subscriptions")
export class PredictionSubscriptionEntity {
  @PrimaryGeneratedColumn("identity", { name: "prediction_subscription_id", type: "bigint", generatedIdentity: "ALWAYS" }) predictionSubscriptionId!: string;
  @Column({ name: "user_id", type: "bigint" }) userId!: string;
  @Column({ name: "prediction_id", type: "uuid" }) predictionId!: string;
  @Column({ name: "fee_amount", type: "bigint" }) feeAmount!: string; // price at charge time
  @Column({ name: "refunded_at", type: "timestamptz", nullable: true }) refundedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
