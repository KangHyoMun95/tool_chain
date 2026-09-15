import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Immutable audit trail of every data change. Intentionally has NO foreign
 * keys — it records who changed what by value, decoupled from the entities it
 * references (so audit rows survive deletes). One row per changed column (for
 * updates), or a single row (columnName null) for create/delete/action events.
 */
@Entity({ name: 'audit_logs' })
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** CREATE | UPDATE | DELETE | DEACTIVATE | ACTIVATE | GRANT_POINTS ... */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  action: string;

  /** Logical entity/table affected, e.g. "SubAdmin", "User". */
  @Index()
  @Column({ name: 'entity_type', type: 'varchar', length: 64 })
  entityType: string;

  /** Affected record id (no FK). */
  @Index()
  @Column({ name: 'entity_id', type: 'varchar', length: 64, nullable: true })
  entityId: string | null;

  @Column({ name: 'column_name', type: 'varchar', length: 64, nullable: true })
  columnName: string | null;

  @Column({ name: 'old_value', type: 'text', nullable: true })
  oldValue: string | null;

  @Column({ name: 'new_value', type: 'text', nullable: true })
  newValue: string | null;

  /** Account id that performed the change (no FK). */
  @Index()
  @Column({ name: 'actor_by', type: 'varchar', length: 64, nullable: true })
  actorBy: string | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 32, nullable: true })
  actorRole: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
