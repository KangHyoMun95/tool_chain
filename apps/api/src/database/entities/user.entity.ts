import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountStatus, Role } from '@toolhackchain/shared';
import { AdminCon } from './admin-con.entity';

/** End user. Belongs to exactly one Admin(Con). No admin privileges. */
@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  username: string;

  @Column({ type: 'varchar', name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.ACTIVE })
  status: AccountStatus;

  @Column({ type: 'integer', default: 0 })
  points: number;

  /** FK -> sub_admins.id */
  @Index()
  @Column({ type: 'uuid', name: 'managed_by_admin_con_id' })
  managedByAdminConId: string;

  @ManyToOne(() => AdminCon, (adminCon) => adminCon.users, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'managed_by_admin_con_id' })
  managedByAdminCon: AdminCon;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
