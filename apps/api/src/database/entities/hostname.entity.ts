import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SubAdmin } from './sub-admin.entity';
import { User } from './user.entity';

/**
 * A homepage ("trang chủ") owned by an Admin(Con): a plain relational record
 * (name + url), not JSON. One Admin(Con) has many hostnames; a hostname can be
 * assigned to many Users (many-to-many via user_hostnames).
 */
@Entity({ name: 'hostname' })
export class Hostname {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 1024 })
  url: string;

  /** Owner Admin(Con). FK -> sub_admins.id */
  @Index()
  @Column({ name: 'owner_sub_admin_id', type: 'uuid' })
  ownerSubAdminId: string;

  @ManyToOne(() => SubAdmin, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'owner_sub_admin_id' })
  owner: SubAdmin;

  /** Users this hostname is assigned to. */
  @ManyToMany(() => User, (user) => user.hostnames)
  users: User[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
