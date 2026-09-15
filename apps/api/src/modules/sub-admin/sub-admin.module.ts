import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubAdmin } from '../../database/entities/sub-admin.entity';
import { PointsModule } from '../points/points.module';
import { SubAdminController } from './sub-admin.controller';
import { SubAdminService } from './sub-admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([SubAdmin]), PointsModule],
  controllers: [SubAdminController],
  providers: [SubAdminService],
  exports: [SubAdminService],
})
export class SubAdminModule {}
