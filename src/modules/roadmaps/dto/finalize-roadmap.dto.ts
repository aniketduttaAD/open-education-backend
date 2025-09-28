import { IsString } from 'class-validator';

export class FinalizeRoadmapDto {
  @IsString()
  id!: string;
}


