import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export type RoadmapEditOp = 'rm-main' | 'add-main' | 'up-main' | 'add-sub' | 'rm-sub' | 'up-sub';

export class RoadmapEditChange {
  @IsIn(['rm-main', 'add-main', 'up-main', 'add-sub', 'rm-sub', 'up-sub'])
  op!: RoadmapEditOp;

  @IsOptional()
  @IsString()
  id?: string; // Main topic ID or subtopic ID depending on operation

  @IsOptional()
  @IsString()
  query?: string; // User query for AI processing
}

export class EditRoadmapDto {
  @IsString()
  roadmapId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoadmapEditChange)
  changes!: RoadmapEditChange[];
}


