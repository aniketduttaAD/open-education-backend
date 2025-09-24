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
import { WishlistService } from './services/wishlist.service';
import { AddToWishlistDto, UpdateWishlistItemDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

/**
 * Wishlist controller for wishlist management
 */
@ApiTags('Wishlist')
@Controller('wishlist')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
@ApiBearerAuth()
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Post()
  @ApiOperation({ summary: 'Add course to wishlist (student only)' })
  @ApiResponse({ status: 201, description: 'Course added to wishlist successfully' })
  @ApiResponse({ status: 400, description: 'Invalid wishlist data' })
  @HttpCode(HttpStatus.CREATED)
  async addToWishlist(
    @CurrentUser() user: JwtPayload,
    @Body() addDto: AddToWishlistDto,
  ) {
    const wishlistItem = await this.wishlistService.addToWishlist(addDto, user.sub);
    return {
      success: true,
      data: wishlistItem,
      message: 'Course added to wishlist successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update wishlist item (student only)' })
  @ApiResponse({ status: 200, description: 'Wishlist item updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid update data' })
  async updateWishlistItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') wishlistId: string,
    @Body() updateDto: UpdateWishlistItemDto,
  ) {
    const wishlistItem = await this.wishlistService.updateWishlistItem(wishlistId, updateDto, user.sub);
    return {
      success: true,
      data: wishlistItem,
      message: 'Wishlist item updated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove item from wishlist (student only)' })
  @ApiResponse({ status: 200, description: 'Item removed from wishlist successfully' })
  @ApiResponse({ status: 404, description: 'Wishlist item not found' })
  async removeFromWishlist(
    @CurrentUser() user: JwtPayload,
    @Param('id') wishlistId: string,
  ) {
    await this.wishlistService.removeFromWishlist(wishlistId, user.sub);
    return {
      success: true,
      message: 'Item removed from wishlist successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('courses/:courseId')
  @ApiOperation({ summary: 'Remove course from wishlist (student only)' })
  @ApiResponse({ status: 200, description: 'Course removed from wishlist successfully' })
  @ApiResponse({ status: 404, description: 'Course not found in wishlist' })
  async removeCourseFromWishlist(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
  ) {
    await this.wishlistService.removeCourseFromWishlist(courseId, user.sub);
    return {
      success: true,
      message: 'Course removed from wishlist successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get user wishlist (student only)' })
  @ApiResponse({ status: 200, description: 'Wishlist retrieved successfully' })
  @ApiQuery({ name: 'listName', required: false, type: String, description: 'Filter by list name' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async getWishlist(
    @CurrentUser() user: JwtPayload,
    @Query('listName') listName?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const result = await this.wishlistService.getWishlist(user.sub, listName, page, limit);
    return {
      success: true,
      data: result.items,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit),
      },
      message: 'Wishlist retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get wishlist item details (student only)' })
  @ApiResponse({ status: 200, description: 'Wishlist item retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Wishlist item not found' })
  async getWishlistItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') wishlistId: string,
  ) {
    const wishlistItem = await this.wishlistService.getWishlistItem(wishlistId, user.sub);
    return {
      success: true,
      data: wishlistItem,
      message: 'Wishlist item retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('lists/names')
  @ApiOperation({ summary: 'Get wishlist list names (student only)' })
  @ApiResponse({ status: 200, description: 'List names retrieved successfully' })
  async getWishlistLists(@CurrentUser() user: JwtPayload) {
    const lists = await this.wishlistService.getWishlistLists(user.sub);
    return {
      success: true,
      data: lists,
      message: 'List names retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('stats/overview')
  @ApiOperation({ summary: 'Get wishlist statistics (student only)' })
  @ApiResponse({ status: 200, description: 'Wishlist statistics retrieved successfully' })
  async getWishlistStats(@CurrentUser() user: JwtPayload) {
    const stats = await this.wishlistService.getWishlistStats(user.sub);
    return {
      success: true,
      data: stats,
      message: 'Wishlist statistics retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('alerts/price')
  @ApiOperation({ summary: 'Get price alerts (student only)' })
  @ApiResponse({ status: 200, description: 'Price alerts retrieved successfully' })
  async getPriceAlerts(@CurrentUser() user: JwtPayload) {
    const alerts = await this.wishlistService.checkPriceAlerts(user.sub);
    return {
      success: true,
      data: alerts,
      message: 'Price alerts retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('analytics/insights')
  @ApiOperation({ summary: 'Get wishlist analytics (student only)' })
  @ApiResponse({ status: 200, description: 'Wishlist analytics retrieved successfully' })
  async getWishlistAnalytics(@CurrentUser() user: JwtPayload) {
    const analytics = await this.wishlistService.getWishlistAnalytics(user.sub);
    return {
      success: true,
      data: analytics,
      message: 'Wishlist analytics retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Put(':id/move')
  @ApiOperation({ summary: 'Move wishlist item to different list (student only)' })
  @ApiResponse({ status: 200, description: 'Item moved successfully' })
  @ApiResponse({ status: 404, description: 'Wishlist item not found' })
  async moveToWishlistList(
    @CurrentUser() user: JwtPayload,
    @Param('id') wishlistId: string,
    @Body() body: { list_name: string },
  ) {
    const wishlistItem = await this.wishlistService.moveToWishlistList(wishlistId, body.list_name, user.sub);
    return {
      success: true,
      data: wishlistItem,
      message: 'Item moved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate wishlist item to different list (student only)' })
  @ApiResponse({ status: 201, description: 'Item duplicated successfully' })
  @ApiResponse({ status: 404, description: 'Wishlist item not found' })
  @HttpCode(HttpStatus.CREATED)
  async duplicateWishlistItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') wishlistId: string,
    @Body() body: { list_name: string },
  ) {
    const wishlistItem = await this.wishlistService.duplicateWishlistItem(wishlistId, body.list_name, user.sub);
    return {
      success: true,
      data: wishlistItem,
      message: 'Item duplicated successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
