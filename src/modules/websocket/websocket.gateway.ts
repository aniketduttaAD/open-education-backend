import {
  WebSocketGateway as WSGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards';
import { AIService } from '../ai/services/ai.service';

/**
 * WebSocket Gateway for real-time features
 * Handles: AI Buddy chat, progress tracking, notifications, live classes
 */
@WSGateway({
  cors: {
    origin: 'https://openeducation.vercel.app', // Hardcoded
    credentials: true,
  },
  namespace: '/ws',
})
export class WebSocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WebSocketGateway.name);
  private readonly connectedUsers = new Map<string, string>(); // socketId -> userId
  private readonly userSockets = new Map<string, string>(); // userId -> socketId

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject(forwardRef(() => AIService))
    private aiService: AIService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractTokenFromSocket(client);
      if (!token) {
        this.logger.warn(`Connection rejected: No token provided for socket ${client.id}`);
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub;

      if (!userId) {
        this.logger.warn(`Connection rejected: Invalid token for socket ${client.id}`);
        client.disconnect();
        return;
      }

      // Store user connection
      this.connectedUsers.set(client.id, userId);
      this.userSockets.set(userId, client.id);

      // Join user-specific room
      await client.join(`user:${userId}`);

      this.logger.log(`User ${userId} connected with socket ${client.id}`);
      
      // Send connection confirmation
      client.emit('connection:established', {
        userId,
        socketId: client.id,
        timestamp: new Date().toISOString(),
      });

      // Notify about user online status
      this.server.to(`user:${userId}`).emit('user:online', {
        userId,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      this.logger.error(`Connection failed for socket ${client.id}:`, error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    
    if (userId) {
      this.connectedUsers.delete(client.id);
      this.userSockets.delete(userId);
      
      this.logger.log(`User ${userId} disconnected from socket ${client.id}`);
      
      // Notify about user offline status
      this.server.to(`user:${userId}`).emit('user:offline', {
        userId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // AI Buddy Real-time Chat
  @SubscribeMessage('ai-buddy:join')
  async handleAIBuddyJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { courseId: string },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    const roomName = `course:${data.courseId}:ai-buddy`;
    await client.join(roomName);
    
    this.logger.log(`User ${userId} joined AI Buddy room for course ${data.courseId}`);
    
    client.emit('ai-buddy:joined', {
      courseId: data.courseId,
      roomName,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('ai-buddy:message')
  async handleAIBuddyMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      courseId: string;
      message: string;
      timestamp: string;
    },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    const roomName = `course:${data.courseId}:ai-buddy`;
    
    // Broadcast user message to room
    this.server.to(roomName).emit('ai-buddy:user-message', {
      userId,
      courseId: data.courseId,
      message: data.message,
      timestamp: data.timestamp,
    });

    try {
      this.logger.log(`Processing AI Buddy message from user ${userId} for course ${data.courseId}`);
      
      // Process AI response using the AI service
      const aiResponse = await this.aiService.chatWithAIBuddy(
        userId,
        data.courseId,
        data.message,
      );

      // Emit AI response to room
      this.server.to(roomName).emit('ai-buddy:ai-response', {
        courseId: data.courseId,
        message: aiResponse.response,
        tokensUsed: aiResponse.tokensUsed,
        remainingTokens: aiResponse.remainingTokens,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`AI response sent for course ${data.courseId}, tokens used: ${aiResponse.tokensUsed}`);

    } catch (error) {
      this.logger.error(`AI Buddy error for course ${data.courseId}:`, error);
      
      // Emit error response
      this.server.to(roomName).emit('ai-buddy:error', {
        courseId: data.courseId,
        error: 'Failed to process AI response. Please try again.',
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Video Progress Tracking
  @SubscribeMessage('video:start')
  async handleVideoStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      courseId: string;
      videoId: string;
      timestamp: string;
    },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    this.logger.log(`User ${userId} started video ${data.videoId} in course ${data.courseId}`);
    
    // Join course progress room
    await client.join(`course:${data.courseId}:progress`);
    
    // Notify course progress room
    this.server.to(`course:${data.courseId}:progress`).emit('video:started', {
      userId,
      courseId: data.courseId,
      videoId: data.videoId,
      timestamp: data.timestamp,
    });
  }

  @SubscribeMessage('video:progress')
  async handleVideoProgress(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      courseId: string;
      videoId: string;
      currentTime: number;
      duration: number;
      percentage: number;
    },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    // Update progress in course room
    this.server.to(`course:${data.courseId}:progress`).emit('video:progress-update', {
      userId,
      courseId: data.courseId,
      videoId: data.videoId,
      currentTime: data.currentTime,
      duration: data.duration,
      percentage: data.percentage,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('video:complete')
  async handleVideoComplete(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      courseId: string;
      videoId: string;
      totalWatched: number;
      timestamp: string;
    },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    this.logger.log(`User ${userId} completed video ${data.videoId} in course ${data.courseId}`);
    
    // Notify course progress room
    this.server.to(`course:${data.courseId}:progress`).emit('video:completed', {
      userId,
      courseId: data.courseId,
      videoId: data.videoId,
      totalWatched: data.totalWatched,
      timestamp: data.timestamp,
    });
  }


  // Notifications
  @SubscribeMessage('notifications:subscribe')
  async handleNotificationsSubscribe(@ConnectedSocket() client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    await client.join(`user:${userId}:notifications`);
    this.logger.log(`User ${userId} subscribed to notifications`);
  }

  // Analytics Subscription
  @SubscribeMessage('analytics:subscribe')
  async handleAnalyticsSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { type: string; id: string },
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    const roomName = `analytics:${data.type}:${data.id}`;
    await client.join(roomName);
    
    this.logger.log(`User ${userId} subscribed to analytics: ${roomName}`);
  }

  // Gamification Updates
  @SubscribeMessage('gamification:subscribe')
  async handleGamificationSubscribe(@ConnectedSocket() client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    await client.join(`user:${userId}:gamification`);
    this.logger.log(`User ${userId} subscribed to gamification updates`);
  }

  // Utility Methods
  private extractTokenFromSocket(client: Socket): string | null {
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }

  // Public methods for other services to emit events
  emitToUser(userId: string, event: string, data: any) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit(event, data);
    }
  }

  emitToRoom(roomName: string, event: string, data: any) {
    this.server.to(roomName).emit(event, data);
  }

  emitToAll(event: string, data: any) {
    this.server.emit(event, data);
  }

  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  isUserConnected(userId: string): boolean {
    return this.userSockets.has(userId);
  }
}
