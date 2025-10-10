import { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';
import { PostgresTransport } from './postgres-transport';

/**
 * Winston logging configuration for the OpenEducation platform
 * Provides structured logging with different levels and outputs
 * Uses PostgreSQL for log storage in production
 */
export const getWinstonConfig = (postgresTransport?: PostgresTransport): WinstonModuleOptions => {
  const logLevel = 'info'; 
  const nodeEnv = 'production'; 

  const logFormat = winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.prettyPrint(),
  );

  const consoleFormat = winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.printf(({ timestamp, level, message, context, trace, ...meta }) => {
      let logMessage = `${timestamp} [${context || 'Application'}] ${level}: ${message}`;
      
      if (Object.keys(meta).length > 0) {
        logMessage += `\n${JSON.stringify(meta, null, 2)}`;
      }
      
      if (trace) {
        logMessage += `\n${trace}`;
      }
      
      return logMessage;
    }),
  );

  const transports: winston.transport[] = [
    // Console transport for development
    new winston.transports.Console({
      level: logLevel,
      format: consoleFormat,
    }),
  ];

  // Add PostgreSQL transport for production
  if (nodeEnv === 'production' && postgresTransport) {
    transports.push(postgresTransport);
  }

  return {
    level: logLevel,
    format: logFormat,
    transports,
    // Global metadata
    defaultMeta: {
      service: 'openedu-backend',
      version: process.env.npm_package_version || '1.0.0',
    },
    // Exception handling
    exceptionHandlers: nodeEnv === 'production' && postgresTransport 
      ? [postgresTransport]
      : [new winston.transports.Console()],
    // Rejection handling
    rejectionHandlers: nodeEnv === 'production' && postgresTransport 
      ? [postgresTransport]
      : [new winston.transports.Console()],
  };
};

export default getWinstonConfig;
