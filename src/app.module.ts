import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
// import { StorageModule } from './modules/storage/storage.module';
// import { CoursesModule } from './modules/courses/courses.module';
// import { AIModule } from './modules/ai/ai.module';
// import { WebSocketModule } from './modules/websocket/websocket.module';
// import { GamificationModule } from './modules/gamification/gamification.module';
// import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PaymentsModule } from './modules/payments/payments.module';
// import { CertificatesModule } from './modules/certificates/certificates.module';
// import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthModule } from './modules/health/health.module';
// import { QuizModule } from './modules/quiz/quiz.module';
// import { ProgressModule } from './modules/progress/progress.module';
// import { AdminModule } from './modules/admin/admin.module';
// import { CategoryModule } from './modules/categories/category.module';
// import { WishlistModule } from './modules/wishlist/wishlist.module';
// import { QueueModule } from './modules/queue/queue.module';
import { getDatabaseConfig, getWinstonConfig } from './config';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { ResponseInterceptor } from './common/interceptors';
import { ErrorTrackingFilter } from './common/filters';
import { ValidationPipe } from './common/pipes';
import { ApplicationLog } from './common/entities/application-log.entity';
import { PostgresTransport } from './config/postgres-transport';

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
    // StorageModule,
    // CoursesModule,
    // AIModule,
    // WebSocketModule,
    // GamificationModule,
    // AnalyticsModule,
    PaymentsModule,
    // CertificatesModule,
    // NotificationsModule,
    HealthModule,
    // QuizModule,
    // ProgressModule,
    // AdminModule,
    // CategoryModule,
    // WishlistModule,
    // QueueModule,
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


