import { Column, Entity, PrimaryColumn } from "typeorm";

/** Cấu hình chạy của job / service (V4). Hiện chỉ AI (apps/ai) đọc; API chưa dùng. */
@Entity("job_configs")
export class JobConfigEntity {
  @PrimaryColumn({ name: "config_key", length: 100 }) configKey!: string;
  @Column({ name: "config_value", type: "int", nullable: true }) configValue!: number | null; // NULL = tắt (tùy khóa)
  @Column({ length: 20 }) unit!: string; // minute | hour | times
}
