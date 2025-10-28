import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS for frontend access
  app.enableCors({
    origin: [
      'https://open-education-frontend.vercel.app', // Hosted FE
      'http://localhost:3000',            // Development frontend
      'http://localhost:3001',            // Alternative dev port
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  
  await app.listen(8081); // Backend port
}

bootstrap();