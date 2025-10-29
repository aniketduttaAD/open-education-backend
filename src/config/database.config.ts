import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL');
  
  
  if (databaseUrl) {
    // Use DATABASE_URL if provided (for container setup)
    return {
      type: 'postgres',
      url: databaseUrl,
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
      synchronize: false, 
      logging: false, 
      ssl: false,
      extra: {
        ssl: false,
      },
    };
  }

  // Fallback to individual connection parameters
  const host = configService.get<string>('DB_HOST') || 'localhost';
  const port = configService.get<number>('DB_PORT') || 5433;
  const username = configService.get<string>('DB_USERNAME') || 'openedu';
  const password = configService.get<string>('DB_PASSWORD') || 'Qt5ff3c6RDkGBTpuALBap1juR7uXjJlSG0cmSn54FZI=';
  const database = configService.get<string>('DB_NAME') || 'openedu_db';

  return {
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    synchronize: false, 
    logging: false, 
    ssl: false,
    extra: {
      ssl: false,
    },
  };
};

export default getDatabaseConfig;
