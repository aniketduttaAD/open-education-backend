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

  // Fallback to individual connection parameters (hardcoded)
  return {
    type: 'postgres',
    host: 'db', // Docker service name
    port: 5432,
    username: 'openedu',
    password: 'Qt5ff3c6RDkGBTpuALBap1juR7uXjJlSG0cmSn54FZI=',
    database: 'openedu_db',
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
