import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountStatus, Role } from '@toolhackchain/shared';
import { SubAdmin } from './sub-admin.entity';
import { Hostname } from './hostname.entity';

/** End user. Belongs to exactly one Admin(Con). No admin privileges. */
@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  username: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 20, nullable: true })
  phoneNumber: string | null;

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
  managedBySubAdminId: string;

  @ManyToOne(() => SubAdmin, (subAdmin) => subAdmin.users, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'managed_by_admin_con_id' })
  managedBySubAdmin: SubAdmin;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @ManyToMany(() => Hostname, (hostname) => hostname.users)
  @JoinTable({
    name: 'user_hostnames',
    joinColumn: { name: 'user_id' },
    inverseJoinColumn: { name: 'hostname_id' },
  })
  hostnames: Hostname[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
