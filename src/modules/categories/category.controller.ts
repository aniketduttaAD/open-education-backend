import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CategoryService } from './services/category.service';
import { CreateCategoryDto, UpdateCategoryDto, AssignCourseCategoryDto, GenerateRecommendationsDto, TrackRecommendationClickDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

/**
 * Category controller for category management and recommendations
 */
@ApiTags('Categories & Recommendations')
@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new category (admin only)' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid category data' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async createCategory(
    @CurrentUser() user: JwtPayload,
    @Body() createDto: CreateCategoryDto,
  ) {
    const category = await this.categoryService.createCategory(createDto);
    return {
      success: true,
      data: category,
      message: 'Category created successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Update category (admin only)' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid update data' })
  @ApiBearerAuth()
  async updateCategory(
    @CurrentUser() user: JwtPayload,
    @Param('id') categoryId: string,
    @Body() updateDto: UpdateCategoryDto,
  ) {
    const category = await this.categoryService.updateCategory(categoryId, updateDto);
    return {
      success: true,
      data: category,
      message: 'Category updated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category details' })
  @ApiResponse({ status: 200, description: 'Category details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiBearerAuth()
  async getCategory(@Param('id') categoryId: string) {
    const category = await this.categoryService.getCategory(categoryId);
    return {
      success: true,
      data: category,
      message: 'Category details retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get categories' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully' })
  @ApiQuery({ name: 'parentId', required: false, type: String, description: 'Filter by parent category ID' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, description: 'Include inactive categories' })
  @ApiBearerAuth()
  async getCategories(
    @Query('parentId') parentId?: string,
    @Query('includeInactive') includeInactive: boolean = false,
  ) {
    const categories = await this.categoryService.getCategories(parentId, includeInactive);
    return {
      success: true,
      data: categories,
      message: 'Categories retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tree/hierarchy')
  @ApiOperation({ summary: 'Get category tree hierarchy' })
  @ApiResponse({ status: 200, description: 'Category tree retrieved successfully' })
  @ApiBearerAuth()
  async getCategoryTree() {
    const categories = await this.categoryService.getCategoryTree();
    return {
      success: true,
      data: categories,
      message: 'Category tree retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Delete category (admin only)' })
  @ApiResponse({ status: 200, description: 'Category deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete category' })
  @ApiBearerAuth()
  async deleteCategory(
    @CurrentUser() user: JwtPayload,
    @Param('id') categoryId: string,
  ) {
    await this.categoryService.deleteCategory(categoryId);
    return {
      success: true,
      message: 'Category deleted successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('assign-course')
  @UseGuards(RolesGuard)
  @Roles('tutor', 'admin')
  @ApiOperation({ summary: 'Assign course to category (tutor/admin only)' })
  @ApiResponse({ status: 201, description: 'Course assigned to category successfully' })
  @ApiResponse({ status: 400, description: 'Invalid assignment data' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async assignCourseToCategory(
    @CurrentUser() user: JwtPayload,
    @Body() assignDto: AssignCourseCategoryDto,
  ) {
    const courseCategory = await this.categoryService.assignCourseToCategory(assignDto);
    return {
      success: true,
      data: courseCategory,
      message: 'Course assigned to category successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('courses/:courseId/categories/:categoryId')
  @UseGuards(RolesGuard)
  @Roles('tutor', 'admin')
  @ApiOperation({ summary: 'Remove course from category (tutor/admin only)' })
  @ApiResponse({ status: 200, description: 'Course removed from category successfully' })
  @ApiBearerAuth()
  async removeCourseFromCategory(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Param('categoryId') categoryId: string,
  ) {
    await this.categoryService.removeCourseFromCategory(courseId, categoryId);
    return {
      success: true,
      message: 'Course removed from category successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id/courses')
  @ApiOperation({ summary: 'Get courses by category' })
  @ApiResponse({ status: 200, description: 'Courses retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiBearerAuth()
  async getCoursesByCategory(
    @Param('id') categoryId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const result = await this.categoryService.getCoursesByCategory(categoryId, page, limit);
    return {
      success: true,
      data: result.courses,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit),
      },
      message: 'Courses retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('recommendations/generate')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Generate recommendations (student only)' })
  @ApiResponse({ status: 201, description: 'Recommendations generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid recommendation data' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async generateRecommendations(
    @CurrentUser() user: JwtPayload,
    @Body() generateDto: GenerateRecommendationsDto,
  ) {
    const recommendations = await this.categoryService.generateRecommendations({
      ...generateDto,
      user_id: user.sub,
    });
    return {
      success: true,
      data: recommendations,
      message: 'Recommendations generated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('recommendations')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Get user recommendations (student only)' })
  @ApiResponse({ status: 200, description: 'Recommendations retrieved successfully' })
  @ApiQuery({ name: 'type', required: false, type: String, description: 'Filter by recommendation type' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of recommendations' })
  @ApiBearerAuth()
  async getRecommendations(
    @CurrentUser() user: JwtPayload,
    @Query('type') type?: string,
    @Query('limit') limit: number = 10,
  ) {
    const recommendations = await this.categoryService.getRecommendations(user.sub, type, limit);
    return {
      success: true,
      data: recommendations,
      message: 'Recommendations retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('recommendations/track-click')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Track recommendation click (student only)' })
  @ApiResponse({ status: 200, description: 'Click tracked successfully' })
  @ApiResponse({ status: 400, description: 'Invalid tracking data' })
  @ApiBearerAuth()
  async trackRecommendationClick(
    @CurrentUser() user: JwtPayload,
    @Body() trackDto: TrackRecommendationClickDto,
  ) {
    const recommendation = await this.categoryService.trackRecommendationClick(trackDto);
    return {
      success: true,
      data: recommendation,
      message: 'Click tracked successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
