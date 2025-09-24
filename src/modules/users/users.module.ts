import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './services/users.service';
import { TutorDocumentsService } from './services/tutor-documents.service';
import { User } from '../auth/entities';
import { File } from '../storage/entities/file.entity';
import { StorageModule } from '../storage/storage.module';
import { QueueModule } from '../queue/queue.module';
import { TutorDocumentSet } from './entities/tutor-document-set.entity';
import {
  StudentAchievement,
  StudentLoginStreak,
  StudentTokenAllocation,
  StudentWishlist,
  TutorDocument,
  TutorWithdrawal,
  TutorLeaderboard,
} from './entities';

/**
 * Users module for managing user profiles, achievements, and tutor-specific features
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      StudentAchievement,
      StudentLoginStreak,
      StudentTokenAllocation,
      StudentWishlist,
      TutorDocument,
      TutorDocumentSet,
      TutorWithdrawal,
      TutorLeaderboard,
      File,
    ]),
    StorageModule,
    QueueModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, TutorDocumentsService],
  exports: [UsersService, TutorDocumentsService],
})
export class UsersModule {}
