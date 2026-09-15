import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';

/** Canonical audit actions. */
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  DEACTIVATE = 'DEACTIVATE',
  ACTIVATE = 'ACTIVATE',
  GRANT_POINTS = 'GRANT_POINTS',
}

export interface AuditChange {
  columnName: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface AuditInput {
  action: AuditAction | string;
  entityType: string;
  entityId?: string | null;
  actorBy?: string | null;
  actorRole?: string | null;
  reason?: string | null;
  /** Field-level changes; when omitted a single summary row is written. */
  changes?: AuditChange[];
}

function toText(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/**
 * Central audit trail. Every service that changes data MUST call record()
 * (see CLAUDE.md). Writes one row per changed column, or a single row for
 * create/delete/action events.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
  ) {}

  async record(input: AuditInput): Promise<void> {
    const base = {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      actorBy: input.actorBy ?? null,
      actorRole: input.actorRole ?? null,
      reason: input.reason ?? null,
    };
    const rows =
      input.changes && input.changes.length
        ? input.changes.map((c) =>
            this.repo.create({
              ...base,
              columnName: c.columnName,
              oldValue: toText(c.oldValue),
              newValue: toText(c.newValue),
            }),
          )
        : [this.repo.create({ ...base, columnName: null, oldValue: null, newValue: null })];
    await this.repo.save(rows);
  }
}
