export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export class PaginationUtil {
  static createPaginationResult<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginationResult<T> {
    const pages = Math.ceil(total / limit);
    
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    };
  }

  static validatePaginationOptions(page: number, limit: number): PaginationOptions {
    const validatedPage = Math.max(1, Math.floor(page) || 1);
    const validatedLimit = Math.min(100, Math.max(1, Math.floor(limit) || 10));
    
    return {
      page: validatedPage,
      limit: validatedLimit,
    };
  }

  static getSkip(page: number, limit: number): number {
    return (page - 1) * limit;
  }
}
