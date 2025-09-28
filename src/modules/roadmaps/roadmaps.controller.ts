import { Body, Controller, Post, Logger, UseGuards, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';
import { RoadmapsService } from './roadmaps.service';
import { GenerateRoadmapDto } from './dto/generate-roadmap.dto';
import { EditRoadmapDto } from './dto/edit-roadmap.dto';
import { FinalizeRoadmapDto } from './dto/finalize-roadmap.dto';

@ApiTags('Roadmaps')
@Controller('api/roadmaps')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoadmapsController {
  private readonly logger = new Logger(RoadmapsController.name);
  constructor(private readonly roadmapsService: RoadmapsService) {}

  @Post('generate')
  @Roles('tutor', 'admin')
  @ApiOperation({ summary: 'Generate course roadmap (tutor only)' })
  @ApiResponse({ status: 201, description: 'Roadmap generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid roadmap data' })
  @ApiResponse({ status: 403, description: 'Forbidden - tutor only' })
  @ApiBearerAuth()
  async generate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateRoadmapDto,
    @Query('courseId') courseId?: string,
  ) {
    this.logger.log(`Generating roadmap for tutor: ${user.sub}, courseId: ${courseId}`);
    return this.roadmapsService.generate(dto, courseId, user.sub);
  }

  @Post('edit')
  @Roles('tutor', 'admin')
  @ApiOperation({ summary: 'Edit course roadmap (tutor only)' })
  @ApiResponse({ status: 200, description: 'Roadmap edited successfully' })
  @ApiResponse({ status: 400, description: 'Invalid edit data' })
  @ApiResponse({ status: 403, description: 'Forbidden - tutor only' })
  @ApiResponse({ status: 404, description: 'Roadmap not found' })
  @ApiBearerAuth()
  async edit(
    @CurrentUser() user: JwtPayload,
    @Body() dto: EditRoadmapDto,
    @Query('courseId') courseId?: string,
  ) {
    this.logger.log(`POST /api/roadmaps/edit roadmapId=${dto?.roadmapId}, courseId: ${courseId}`);
    return this.roadmapsService.edit(dto, courseId, user.sub);
  }

  @Post('finalize')
  @Roles('tutor', 'admin')
  @ApiOperation({ summary: 'Finalize course roadmap and start content generation (tutor only)' })
  @ApiResponse({ status: 200, description: 'Roadmap finalized successfully' })
  @ApiResponse({ status: 400, description: 'Invalid finalize data' })
  @ApiResponse({ status: 403, description: 'Forbidden - tutor only' })
  @ApiResponse({ status: 404, description: 'Roadmap not found' })
  @ApiBearerAuth()
  async finalize(
    @CurrentUser() user: JwtPayload,
    @Body() dto: FinalizeRoadmapDto,
    @Query('courseId') courseId?: string,
  ) {
    this.logger.log(`POST /api/roadmaps/finalize id=${dto?.id}, courseId: ${courseId}`);
    return this.roadmapsService.finalize(dto, courseId, user.sub);
  }
}


 