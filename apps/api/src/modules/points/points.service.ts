import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PointDirection, PointTargetType } from '@toolhackchain/shared';
import { SubAdmin } from '../../database/entities/sub-admin.entity';
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

export interface TransferToUserInput {
  /** The Admin(Con) whose balance funds the transfer. */
  adminConId: string;
  userId: string;
  /** Positive magnitude. */
  amount: number;
  /** CREDIT: Admin(Con) -> User. DEBIT: User -> Admin(Con) (take back). */
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
        input.targetType === PointTargetType.ADMIN_CON ? SubAdmin : User;

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

  /**
   * Transfer points between an Admin(Con) and one of its Users. Unlike the Host
   * granting to an Admin(Con) (which mints points), an Admin(Con) funds its
   * Users from its OWN balance:
   *  - CREDIT: Admin(Con) -> User  (admin balance decreases, user increases)
   *  - DEBIT:  User -> Admin(Con)  (user balance decreases, admin increases)
   * Both balances change atomically and a single PointTransaction (user side)
   * records the movement, with fromAdminId identifying the funding Admin(Con).
   */
  async transferSubAdminToUser(
    input: TransferToUserInput,
  ): Promise<PointTransaction> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new BadRequestException('amount must be a positive integer');
    }

    return this.dataSource.transaction(async (manager) => {
      // Lock admin first, then user, consistently to avoid deadlocks.
      const admin = await manager.findOne(SubAdmin, {
        where: { id: input.adminConId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!admin) throw new NotFoundException('Admin(Con) not found');

      const user = await manager.findOne(User, {
        where: { id: input.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.managedBySubAdminId !== input.adminConId) {
        throw new NotFoundException('User not found');
      }

      if (input.direction === PointDirection.CREDIT) {
        if (admin.points < input.amount) {
          throw new BadRequestException('Admin(Con) không đủ điểm để cấp');
        }
        admin.points -= input.amount;
        user.points += input.amount;
      } else {
        if (user.points < input.amount) {
          throw new BadRequestException('User không đủ điểm để thu hồi');
        }
        user.points -= input.amount;
        admin.points += input.amount;
      }
      await manager.save(admin);
      await manager.save(user);

      const signedForUser =
        input.direction === PointDirection.CREDIT ? input.amount : -input.amount;
      const tx = manager.create(PointTransaction, {
        fromAdminId: input.adminConId,
        toEntityType: PointTargetType.USER,
        toEntityId: input.userId,
        amount: signedForUser,
        reason: input.reason ?? null,
      });
      return manager.save(tx);
    });
  }
}
