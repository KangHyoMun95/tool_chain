import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity("job_configs")
export class JobConfigEntity {
  @PrimaryColumn({ type: "text" }) type!: string;
  @Column({ type: "integer", nullable: true }) value!: number | null;
  @Column({ type: "text" }) unit!: string;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
