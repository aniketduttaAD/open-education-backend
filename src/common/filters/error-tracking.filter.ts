import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

/**
 * Global error tracking filter for comprehensive error monitoring
 * Tracks all exceptions, logs them with context, and provides structured error responses
 */
@Catch()
export class ErrorTrackingFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorTrackingFilter.name);

  constructor(private readonly winstonLogger?: any) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode = 'INTERNAL_ERROR';
    let details: any = null;

    // Extract error information based on exception type
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || responseObj.error || message;
        errorCode = responseObj.errorCode || this.getErrorCodeFromStatus(status);
        details = responseObj.details || null;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      errorCode = 'APPLICATION_ERROR';
      details = {
        stack: exception.stack,
        name: exception.name,
      };
    }

    // Create error context for logging
    const errorContext = {
      timestamp: new Date().toISOString(),
      method: request.method,
      url: request.url,
      userAgent: request.get('User-Agent'),
      ip: request.ip,
      userId: (request as any).user?.id || null,
      status,
      errorCode,
      message,
      details,
      stack: exception instanceof Error ? exception.stack : null,
    };

    // Log error with appropriate level
    if (this.winstonLogger) {
      if (status >= 500) {
        this.winstonLogger.error('Server Error', errorContext);
      } else if (status >= 400) {
        this.winstonLogger.warn('Client Error', errorContext);
      } else {
        this.winstonLogger.log('Error', errorContext);
      }
    } else {
      // Fallback to NestJS logger
      if (status >= 500) {
        this.logger.error('Server Error', errorContext);
      } else if (status >= 400) {
        this.logger.warn('Client Error', errorContext);
      } else {
        this.logger.log('Error', errorContext);
      }
    }

    // Send structured error response
    const errorResponse = {
      success: false,
      error: {
        code: errorCode,
        message,
        ...(details && { details }),
      },
      timestamp: errorContext.timestamp,
      path: request.url,
      method: request.method,
    };

    response.status(status).json(errorResponse);
  }

  private getErrorCodeFromStatus(status: number): string {
    const errorCodes = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_ERROR',
      429: 'RATE_LIMIT_EXCEEDED',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    };

    return errorCodes[status as keyof typeof errorCodes] || 'UNKNOWN_ERROR';
  }
}
