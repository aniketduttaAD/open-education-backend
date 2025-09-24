import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { GamificationService } from './services/gamification.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

/**
 * Gamification controller for achievements, streaks, and leaderboards
 */
@ApiTags('Gamification')
@Controller('gamification')
@UseGuards(JwtAuthGuard)
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('achievements')
  @ApiOperation({ summary: 'Get user achievements' })
  @ApiResponse({ status: 200, description: 'Achievements retrieved successfully' })
  @ApiBearerAuth()
  async getUserAchievements(@CurrentUser() user: JwtPayload) {
    return this.gamificationService.getUserAchievements(user.sub);
  }

  @Get('streaks')
  @ApiOperation({ summary: 'Get user streaks' })
  @ApiResponse({ status: 200, description: 'Streaks retrieved successfully' })
  @ApiBearerAuth()
  async getUserStreaks(@CurrentUser() user: JwtPayload) {
    return this.gamificationService.getUserStreaks(user.sub);
  }

  @Post('achievements/:type')
  @ApiOperation({ summary: 'Award achievement to user' })
  @ApiResponse({ status: 201, description: 'Achievement awarded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid achievement type or user already has achievement' })
  @ApiParam({ name: 'type', description: 'Achievement type' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async awardAchievement(
    @CurrentUser() user: JwtPayload,
    @Param('type') type: string,
    @Body() metadata?: Record<string, any>,
  ) {
    return this.gamificationService.awardAchievement(user.sub, type as any, metadata);
  }

  @Post('streaks/login')
  @ApiOperation({ summary: 'Update user login streak' })
  @ApiResponse({ status: 200, description: 'Login streak updated successfully' })
  @ApiBearerAuth()
  async updateLoginStreak(@CurrentUser() user: JwtPayload) {
    return this.gamificationService.updateLoginStreak(user.sub);
  }

  @Get('leaderboards/:type')
  @ApiOperation({ summary: 'Get leaderboards' })
  @ApiResponse({ status: 200, description: 'Leaderboard retrieved successfully' })
  @ApiParam({ name: 'type', description: 'Leaderboard type (students, tutors, courses)' })
  @ApiBearerAuth()
  async getLeaderboards(@Param('type') type: 'students' | 'tutors' | 'courses') {
    return this.gamificationService.getLeaderboards(type);
  }

  @Post('initialize')
  @ApiOperation({ summary: 'Initialize default achievements (admin only)' })
  @ApiResponse({ status: 201, description: 'Default achievements initialized successfully' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async initializeDefaultAchievements() {
    return this.gamificationService.initializeDefaultAchievements();
  }
}
