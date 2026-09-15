import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SubAdmin } from './sub-admin.entity';

/**
 * Homepage config owned/written by the Host, one per Admin(Con), read by that
 * Admin(Con)'s Users. Content is open JSON until the builder mechanism is
 * decided (see CLAUDE.md) — keep the shape flexible.
 */
@Entity({ name: 'homepage_configs' })
export class HomepageConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK -> sub_admins.id (one config per Admin(Con)). */
  @Index({ unique: true })
  @Column({ type: 'uuid', name: 'admin_con_id' })
  subAdminId: string;

  @OneToOne(() => SubAdmin, (subAdmin) => subAdmin.homepageConfig, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'admin_con_id' })
  subAdmin: SubAdmin;

  /** Free-form JSON config; structure TBD. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  content: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
