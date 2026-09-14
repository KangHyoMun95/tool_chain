import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './config/typeorm.config';
import { AuthModule } from './modules/auth/auth.module';
import { AdminConModule } from './modules/admin-con/admin-con.module';
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
    AdminConModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
