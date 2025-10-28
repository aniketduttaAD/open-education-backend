import {
  WebSocketGateway as WSGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger, UseGuards, Inject, forwardRef } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { JwtAuthGuard } from "../../common/guards";
import { AIService } from "../ai/services/ai.service";
import { CoursesService } from "../courses/services/courses.service";
import { ProgressUpdate } from "./interfaces/progress-update.interface";

/**
 * WebSocket Gateway for real-time features
 * Handles: AI Buddy chat, progress tracking, notifications, live classes
 */
@WSGateway({
  cors: {
    origin: ["https://open-education-frontend.vercel.app", "https://openeducation.vercel.app", "http://localhost:3000"],
    credentials: true,
  },
  namespace: "/ws",
})
export class WebSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
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
    @Inject(forwardRef(() => CoursesService))
    private coursesService: CoursesService
  ) {}

  afterInit(server: Server) {
    this.logger.log("WebSocket Gateway initialized");
  }

  async handleConnection(client: Socket) {
    try {
      this.logger.debug(
        `Incoming WS connection ${client.id} origin=${
          client.handshake.headers.origin ||
          client.handshake.headers.referer ||
          "unknown"
        }`
      );
      const hasAuth = !!(client.handshake as any)?.auth;
      const queryKeys = Object.keys((client.handshake as any)?.query || {});
      this.logger.debug(
        `Handshake details socket=${
          client.id
        } hasAuth=${hasAuth} queryKeys=${queryKeys.join(",")}`
      );
      const token = this.extractTokenFromSocket(client);
      this.logger.debug(
        `Token check socket=${client.id} length=${token ? token.length : 0}`
      );
      let userId: string | null = null;
      if (token) {
        try {
          const payload = await this.jwtService.verifyAsync(token);
          userId = payload?.sub || null;
        } catch (e) {
          this.logger.warn(`JWT verify failed for socket ${client.id}`);
        }
      }

      // Allow unauth connections for read-only progress subscriptions
      if (userId) {
        this.connectedUsers.set(client.id, userId);
        this.userSockets.set(userId, client.id);
        await client.join(`user:${userId}`);
        this.logger.log(`User ${userId} connected with socket ${client.id}`);
      } else {
        this.logger.log(`Unauthenticated socket connected ${client.id} (progress-only)`);
      }

      // Send connection confirmation
      client.emit("connection:established", {
        userId,
        socketId: client.id,
        timestamp: new Date().toISOString(),
      });

      // Notify about user online status
      if (userId) {
        this.server.to(`user:${userId}`).emit("user:online", {
          userId,
          timestamp: new Date().toISOString(),
        });
      }
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
      this.server.to(`user:${userId}`).emit("user:offline", {
        userId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // AI Buddy Real-time Chat
  @SubscribeMessage("ai-buddy:join")
  async handleAIBuddyJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { courseId: string }
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    const roomName = `course:${data.courseId}:ai-buddy`;
    await client.join(roomName);

    this.logger.log(
      `User ${userId} joined AI Buddy room for course ${data.courseId}`
    );

    client.emit("ai-buddy:joined", {
      courseId: data.courseId,
      roomName,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage("ai-buddy:message")
  async handleAIBuddyMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      courseId: string;
      message: string;
      timestamp: string;
    }
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    const roomName = `course:${data.courseId}:ai-buddy`;

    // Broadcast user message to room
    this.server.to(roomName).emit("ai-buddy:user-message", {
      userId,
      courseId: data.courseId,
      message: data.message,
      timestamp: data.timestamp,
    });

    try {
      this.logger.log(
        `Processing AI Buddy message from user ${userId} for course ${data.courseId}`
      );

      // Process AI response using the AI service
      const aiResponse = await this.aiService.chatWithAIBuddy(
        userId,
        data.courseId,
        data.message
      );

      // Emit AI response to room
      this.server.to(roomName).emit("ai-buddy:ai-response", {
        courseId: data.courseId,
        message: aiResponse.response,
        tokensUsed: aiResponse.tokensUsed,
        remainingTokens: aiResponse.remainingTokens,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `AI response sent for course ${data.courseId}, tokens used: ${aiResponse.tokensUsed}`
      );
    } catch (error) {
      this.logger.error(`AI Buddy error for course ${data.courseId}:`, error);

      // Emit error response
      this.server.to(roomName).emit("ai-buddy:error", {
        courseId: data.courseId,
        error: "Failed to process AI response. Please try again.",
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Video Progress Tracking
  @SubscribeMessage("video:start")
  async handleVideoStart(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      courseId: string;
      videoId: string;
      timestamp: string;
    }
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    this.logger.log(
      `User ${userId} started video ${data.videoId} in course ${data.courseId}`
    );

    // Join course progress room
    await client.join(`course:${data.courseId}:progress`);

    // Notify course progress room
    this.server.to(`course:${data.courseId}:progress`).emit("video:started", {
      userId,
      courseId: data.courseId,
      videoId: data.videoId,
      timestamp: data.timestamp,
    });
  }

  @SubscribeMessage("video:progress")
  async handleVideoProgress(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      courseId: string;
      videoId: string;
      currentTime: number;
      duration: number;
      percentage: number;
    }
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    // Update progress in course room
    this.server
      .to(`course:${data.courseId}:progress`)
      .emit("video:progress-update", {
        userId,
        courseId: data.courseId,
        videoId: data.videoId,
        currentTime: data.currentTime,
        duration: data.duration,
        percentage: data.percentage,
        timestamp: new Date().toISOString(),
      });
  }

  @SubscribeMessage("video:complete")
  async handleVideoComplete(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      courseId: string;
      videoId: string;
      totalWatched: number;
      timestamp: string;
    }
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    this.logger.log(
      `User ${userId} completed video ${data.videoId} in course ${data.courseId}`
    );

    // Notify course progress room
    this.server.to(`course:${data.courseId}:progress`).emit("video:completed", {
      userId,
      courseId: data.courseId,
      videoId: data.videoId,
      totalWatched: data.totalWatched,
      timestamp: data.timestamp,
    });
  }

  // Notifications
  @SubscribeMessage("notifications:subscribe")
  async handleNotificationsSubscribe(@ConnectedSocket() client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    await client.join(`user:${userId}:notifications`);
    this.logger.log(`User ${userId} subscribed to notifications`);
  }

  // Analytics Subscription
  @SubscribeMessage("analytics:subscribe")
  async handleAnalyticsSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { type: string; id: string }
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    const roomName = `analytics:${data.type}:${data.id}`;
    await client.join(roomName);

    this.logger.log(`User ${userId} subscribed to analytics: ${roomName}`);
  }

  // Gamification Updates
  @SubscribeMessage("gamification:subscribe")
  async handleGamificationSubscribe(@ConnectedSocket() client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) return;

    await client.join(`user:${userId}:gamification`);
    this.logger.log(`User ${userId} subscribed to gamification updates`);
  }

  // Utility Methods
  @SubscribeMessage('progress:subscribe')
  async handleProgressSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { courseId?: string; sessionId?: string }
  ) {
    try {
      if (data?.courseId) {
        const ch = `courses:${data.courseId}`;
        await client.join(ch);
        this.logger.log(`Socket ${client.id} subscribed to ${ch}`);
        client.emit('progress:subscribed', { channel: ch });
        return;
      }
      if (data?.sessionId) {
        const ch = `session:${data.sessionId}`;
        await client.join(ch);
        this.logger.log(`Socket ${client.id} subscribed to ${ch}`);
        client.emit('progress:subscribed', { channel: ch });
        return;
      }
      client.emit('error', { message: 'courseId or sessionId is required' });
    } catch (error) {
      this.logger.error('Failed to subscribe to progress', error);
      client.emit('error', { message: 'Subscription failed' });
    }
  }
  private extractTokenFromSocket(client: Socket): string | null {
    // 1) Authorization header: "Bearer <token>"
    const authHeader = client.handshake.headers.authorization as
      | string
      | undefined;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      this.logger.debug(
        `Token source=Authorization header socket=${client.id}`
      );
      return authHeader.substring(7);
    }

    // 2) Socket.IO auth payload: { auth: { token: "<token>" | "Bearer <token>" } }
    const authToken = (client.handshake as any)?.auth?.token as
      | string
      | undefined;
    if (authToken) {
      this.logger.debug(`Token source=handshake.auth socket=${client.id}`);
      return authToken.startsWith("Bearer ")
        ? authToken.substring(7)
        : authToken;
    }

    // 3) Query param fallback: ?token=...
    const queryToken =
      ((client.handshake as any)?.query?.token as string | undefined) ||
      undefined;
    if (queryToken) {
      this.logger.debug(`Token source=query socket=${client.id}`);
      return queryToken.startsWith("Bearer ")
        ? queryToken.substring(7)
        : queryToken;
    }

    this.logger.debug(`No token source detected socket=${client.id}`);
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

  // Course-specific lifecycle event methods
  /**
   * Join a course-specific channel for real-time updates
   */
  @SubscribeMessage("course:join")
  async handleJoinCourse(
    @MessageBody() data: { courseId: string },
    @ConnectedSocket() client: Socket
  ) {
    const userId = this.connectedUsers.get(client.id) || null;

    try {
      // Authorization check - verify user is tutor or enrolled student
      const hasAccess = userId ? await this.checkCourseAccess(userId, data.courseId) : true;
      if (!hasAccess) {
        client.emit("error", {
          message:
            "Access denied. You must be the course tutor or an enrolled student.",
          code: "COURSE_ACCESS_DENIED",
        });
        return;
      }

      const courseChannel = `courses:${data.courseId}`;
      await client.join(courseChannel);

      this.logger.log(`Socket ${client.id} joined course channel: ${courseChannel} user=${userId || 'anonymous'}`);

      client.emit("course:joined", {
        courseId: data.courseId,
        channel: courseChannel,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to join course channel for user ${userId}:`,
        error
      );
      client.emit("error", {
        message: "Failed to join course channel",
        code: "JOIN_FAILED",
      });
    }
  }

  /**
   * Leave a course-specific channel
   */
  @SubscribeMessage("course:leave")
  async handleLeaveCourse(
    @MessageBody() data: { courseId: string },
    @ConnectedSocket() client: Socket
  ) {
    const userId = this.connectedUsers.get(client.id);
    if (!userId) {
      client.emit("error", { message: "User not authenticated" });
      return;
    }

    const courseChannel = `courses:${data.courseId}`;
    await client.leave(courseChannel);

    this.logger.log(`User ${userId} left course channel: ${courseChannel}`);

    client.emit("course:left", {
      courseId: data.courseId,
      channel: courseChannel,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit event to all users in a course channel
   */
  emitToCourseChannel(courseId: string, event: string, data: any) {
    const courseChannel = `courses:${courseId}`;
    this.server.to(courseChannel).emit(event, data);
    this.logger.log(`Emitted ${event} to course channel: ${courseChannel}`);
  }

  /**
   * Emit roadmap lifecycle events
   */
  emitRoadmapEvent(
    courseId: string,
    event:
      | "roadmap_generate_started"
      | "roadmap_generate_done"
      | "roadmap_edit_applied",
    data: any
  ) {
    this.emitToCourseChannel(courseId, event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit finalize lifecycle events
   */
  emitFinalizeEvent(
    courseId: string,
    event: "finalize_started" | "finalize_done",
    data: any
  ) {
    this.emitToCourseChannel(courseId, event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit to a session channel before a course exists
   */
  emitToSession(sessionId: string, event: string, data: any) {
    this.server.to(`session:${sessionId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit content job events
   */
  emitJobEvent(
    courseId: string,
    event:
      | "job_started"
      | "markdown_done"
      | "transcript_done"
      | "slides_done"
      | "audio_done"
      | "video_done"
      | "upload_done"
      | "job_completed"
      | "job_failed",
    data: any
  ) {
    this.emitToCourseChannel(courseId, event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit embeddings events
   */
  emitEmbeddingsEvent(
    courseId: string,
    event: "embeddings_started" | "embeddings_done",
    data: any
  ) {
    this.emitToCourseChannel(courseId, event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit assessment events
   */
  emitAssessmentEvent(
    courseId: string,
    event:
      | "quiz_started"
      | "quiz_done"
      | "flashcards_started"
      | "flashcards_done",
    data: any
  ) {
    this.emitToCourseChannel(courseId, event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit progress updates for content generation
   */
  emitProgressUpdate(courseId: string, progressData: ProgressUpdate) {
    this.emitToCourseChannel(courseId, "content_generation_progress", {
      ...progressData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit progress updates for specific phases
   */
  emitProgressPhase(
    courseId: string,
    phase: string,
    progressData: ProgressUpdate
  ) {
    this.emitToCourseChannel(courseId, `progress:${phase}`, {
      ...progressData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check if user has access to a course (tutor or enrolled student)
   */
  private async checkCourseAccess(
    userId: string,
    courseId: string
  ): Promise<boolean> {
    try {
      // Get course details
      const course = await this.coursesService.getCourseById(courseId);
      if (!course) {
        return false;
      }

      // Check if user is the course tutor
      if (course.tutor_user_id === userId) {
        return true;
      }

      // Check if user is enrolled as a student
      const enrollments = await this.coursesService.getStudentEnrollments(
        userId
      );
      const isEnrolled = enrollments.some(
        (enrollment: any) => enrollment.course_id === courseId
      );

      return isEnrolled;
    } catch (error) {
      this.logger.error(
        `Failed to check course access for user ${userId} in course ${courseId}:`,
        error
      );
      return false;
    }
  }
}
