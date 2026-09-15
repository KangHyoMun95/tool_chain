import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './config/typeorm.config';
import { AuthModule } from './modules/auth/auth.module';
import { SubAdminModule } from './modules/sub-admin/sub-admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      // ConfigModule.forRoot has already populated process.env from .env.
      useFactory: () => buildDataSourceOptions(),
    }),
    AuthModule,
    SubAdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
