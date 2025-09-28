import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WebSocketGateway } from './websocket.gateway';
import { AIModule } from '../ai/ai.module';
import { CoursesModule } from '../courses/courses.module';

/**
 * WebSocket module for real-time features
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '7d', // Hardcoded for production
        },
      }),
      inject: [ConfigService],
    }),
    forwardRef(() => AIModule),
    forwardRef(() => CoursesModule),
  ],
  providers: [WebSocketGateway],
  exports: [WebSocketGateway],
})
export class WebSocketModule {}
