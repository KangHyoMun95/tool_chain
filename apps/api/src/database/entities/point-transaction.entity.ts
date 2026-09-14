import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PointTargetType } from '@toolhackchain/shared';

/**
 * Immutable audit log of every points movement. All point changes must be
 * written here (see CLAUDE.md) rather than mutating a balance field directly.
 */
@Entity({ name: 'point_transactions' })
export class PointTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Admin (Host or Con) who initiated the change. FK-ish -> admins/sub_admins. */
  @Index()
  @Column({ type: 'uuid', name: 'from_admin_id' })
  fromAdminId: string;

  /** Whether the target is an Admin(Con) or a User. */
  @Column({ type: 'enum', enum: PointTargetType, name: 'to_entity_type' })
  toEntityType: PointTargetType;

  /** Id of the targeted admin_con or user. */
  @Index()
  @Column({ type: 'uuid', name: 'to_entity_id' })
  toEntityId: string;

  /** Signed amount: positive = credit, negative = debit. */
  @Column({ type: 'integer' })
  amount: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
