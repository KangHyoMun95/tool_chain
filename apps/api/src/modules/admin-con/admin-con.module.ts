import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminCon } from '../../database/entities/admin-con.entity';
import { AdminConController } from './admin-con.controller';
import { AdminConService } from './admin-con.service';

@Module({
  imports: [TypeOrmModule.forFeature([AdminCon])],
  controllers: [AdminConController],
  providers: [AdminConService],
  exports: [AdminConService],
})
export class AdminConModule {}
