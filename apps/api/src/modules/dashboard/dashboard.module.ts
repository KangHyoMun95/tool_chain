import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubAdmin } from '../../database/entities/sub-admin.entity';
import { User } from '../../database/entities/user.entity';
import { PointTransaction } from '../../database/entities/point-transaction.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([SubAdmin, User, PointTransaction])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
