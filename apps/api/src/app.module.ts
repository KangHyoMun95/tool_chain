import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './config/typeorm.config';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { SubAdminModule } from './modules/sub-admin/sub-admin.module';
import { UserModule } from './modules/user/user.module';
import { HostnameModule } from './modules/hostname/hostname.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      // ConfigModule.forRoot has already populated process.env from .env.
      useFactory: () => buildDataSourceOptions(),
    }),
    AuditModule,
    AuthModule,
    SubAdminModule,
    UserModule,
    HostnameModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
