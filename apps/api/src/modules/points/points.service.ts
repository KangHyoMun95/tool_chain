import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PointDirection, PointTargetType } from '@toolhackchain/shared';
import { AdminCon } from '../../database/entities/admin-con.entity';
import { User } from '../../database/entities/user.entity';
import { PointTransaction } from '../../database/entities/point-transaction.entity';

export interface AdjustPointsInput {
  /** Admin (Host or Con) initiating the change. */
  fromAdminId: string;
  targetType: PointTargetType;
  targetId: string;
  /** Positive magnitude; sign is derived from direction. */
  amount: number;
  direction: PointDirection;
  reason?: string;
}

/**
 * Central service for every points change. All mutations go through here and
 * are recorded as a PointTransaction in the same DB transaction (audit trail,
 * per CLAUDE.md). Callers must NOT mutate the `points` field directly.
 *
 * Caller is responsible for authorization/scoping (e.g. the Host owns the
 * target Admin(Con)); this service only performs the atomic balance change.
 */
@Injectable()
export class PointsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async adjust(input: AdjustPointsInput): Promise<PointTransaction> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new BadRequestException('amount must be a positive integer');
    }
    const signed =
      input.direction === PointDirection.CREDIT ? input.amount : -input.amount;

    return this.dataSource.transaction(async (manager) => {
      const entityType =
        input.targetType === PointTargetType.ADMIN_CON ? AdminCon : User;

      // Lock the target row so concurrent adjustments stay consistent.
      const target = await manager.findOne(entityType, {
        where: { id: input.targetId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!target) throw new NotFoundException('Target account not found');

      const newPoints = target.points + signed;
      if (newPoints < 0) {
        throw new BadRequestException('Insufficient points');
      }
      target.points = newPoints;
      await manager.save(target);

      const tx = manager.create(PointTransaction, {
        fromAdminId: input.fromAdminId,
        toEntityType: input.targetType,
        toEntityId: input.targetId,
        amount: signed,
        reason: input.reason ?? null,
      });
      return manager.save(tx);
    });
  }
}
