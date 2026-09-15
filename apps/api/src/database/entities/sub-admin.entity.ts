import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountStatus, Role } from '@toolhackchain/shared';
import { Admin } from './admin.entity';
import { User } from './user.entity';
import { HomepageConfig } from './homepage-config.entity';

/** Sub-admin. Belongs to exactly one Host; manages its own Users. */
@Entity({ name: 'sub_admins' })
export class SubAdmin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  username: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 20, nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'varchar', name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'enum', enum: Role, default: Role.ADMIN_CON })
  role: Role;

  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.ACTIVE })
  status: AccountStatus;

  @Column({ type: 'integer', default: 0 })
  points: number;

  /** FK -> admins.id */
  @Index()
  @Column({ type: 'uuid', name: 'host_id' })
  hostId: string;

  @ManyToOne(() => Admin, (admin) => admin.subAdmins, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'host_id' })
  host: Admin;

  /** Users managed by this Admin(Con). */
  @OneToMany(() => User, (user) => user.managedBySubAdmin)
  users: User[];

  /** Homepage configured by the Host for this Admin(Con) (one per SubAdmin). */
  @OneToOne(() => HomepageConfig, (config) => config.subAdmin)
  homepageConfig: HomepageConfig;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
