import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { HealthModule } from './modules/health/health.module';
import { getDatabaseConfig, getWinstonConfig } from './config';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { ResponseInterceptor } from './common/interceptors';
import { ErrorTrackingFilter } from './common/filters';
import { ValidationPipe } from './common/pipes';
import { ApplicationLog } from './common/entities/application-log.entity';
import { PostgresTransport } from './config/postgres-transport';
import { RoadmapsModule } from './modules/roadmaps/roadmaps.module';
import { AssessmentsModule } from './modules/assessments/assessments.module';
import { AIBuddyModule } from './modules/aibuddy/aibuddy.module';
import { CoursesModule } from './modules/courses/courses.module';
import { StorageModule } from './modules/storage/storage.module';
import { WebSocketModule } from './modules/websocket/websocket.module';
import { AIModule } from './modules/ai/ai.module';
import { QueueModule } from './modules/queue/queue.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getDatabaseConfig,
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([ApplicationLog]),
    WinstonModule.forRoot(getWinstonConfig()),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
    AuthModule,
    UsersModule,
    PaymentsModule,
    HealthModule,
    RoadmapsModule,
    AssessmentsModule,
    AIBuddyModule,
    CoursesModule,
    StorageModule,
    WebSocketModule,
    AIModule,
    QueueModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    PostgresTransport,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useFactory: () => new ErrorTrackingFilter(),
    },
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule {}


