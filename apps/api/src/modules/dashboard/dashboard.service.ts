import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import {
  AccountStatus,
  DashboardResponse,
  JwtPayload,
  PointTargetType,
  Role,
} from '@toolhackchain/shared';
import { SubAdmin } from '../../database/entities/sub-admin.entity';
import { User } from '../../database/entities/user.entity';
import { PointTransaction } from '../../database/entities/point-transaction.entity';

interface ManagedRow {
  id: string;
  status: AccountStatus;
  points: number;
  createdAt: Date;
  lastLoginAt: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKey(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** The last 7 calendar days (UTC), oldest first. */
function last7Days(): { keys: string[]; since: Date } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 6);
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    keys.push(dateKey(new Date(start.getTime() + i * DAY_MS)));
  }
  return { keys, since: start };
}

/**
 * Dashboard metrics, role-aware:
 *  - HOST: the "users" are the Admin(Con)s it manages.
 *  - ADMIN_CON: the "users" are the Users it manages.
 * All queries are scoped to the acting admin.
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(SubAdmin)
    private readonly subAdmins: Repository<SubAdmin>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PointTransaction)
    private readonly pointTx: Repository<PointTransaction>,
  ) {}

  async getDashboard(payload: JwtPayload): Promise<DashboardResponse> {
    if (payload.role === Role.HOST) {
      const rows = await this.subAdmins.find({
        where: { hostId: payload.sub },
      });
      return this.build(rows, PointTargetType.ADMIN_CON);
    }
    const rows = await this.users.find({
      where: { managedBySubAdminId: payload.sub },
    });
    return this.build(rows, PointTargetType.USER);
  }

  private async build(
    rows: ManagedRow[],
    targetType: PointTargetType,
  ): Promise<DashboardResponse> {
    const { keys, since } = last7Days();
    const sevenDaysAgoMs = Date.now() - 7 * DAY_MS;

    const totalUsers = rows.length;
    const activeUsers = rows.filter(
      (r) => r.status === AccountStatus.ACTIVE,
    ).length;
    const inactive7Days = rows.filter(
      (r) =>
        !r.lastLoginAt ||
        new Date(r.lastLoginAt).getTime() < sevenDaysAgoMs,
    ).length;
    const totalUnusedPoints = rows.reduce((sum, r) => sum + r.points, 0);

    const created: Record<string, number> = Object.fromEntries(
      keys.map((k) => [k, 0]),
    );
    for (const r of rows) {
      const k = dateKey(r.createdAt);
      if (k in created) created[k] += 1;
    }

    const used: Record<string, number> = Object.fromEntries(
      keys.map((k) => [k, 0]),
    );
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const txs = await this.pointTx.find({
        where: {
          toEntityType: targetType,
          toEntityId: In(ids),
          createdAt: MoreThanOrEqual(since),
        },
      });
      for (const t of txs) {
        // "Used" = points that left the account (debits).
        if (t.amount < 0) {
          const k = dateKey(t.createdAt);
          if (k in used) used[k] += -t.amount;
        }
      }
    }

    return {
      totalUsers,
      activeUsers,
      inactive7Days,
      totalUnusedPoints,
      createdPerDay: keys.map((date) => ({ date, value: created[date] })),
      pointsUsedPerDay: keys.map((date) => ({ date, value: used[date] })),
    };
  }
}
