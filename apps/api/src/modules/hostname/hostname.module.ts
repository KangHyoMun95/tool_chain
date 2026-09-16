import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Hostname } from '../../database/entities/hostname.entity';
import { HostnameController } from './hostname.controller';
import { HostnameService } from './hostname.service';

@Module({
  imports: [TypeOrmModule.forFeature([Hostname])],
  controllers: [HostnameController],
  providers: [HostnameService],
  exports: [HostnameService],
})
export class HostnameModule {}
