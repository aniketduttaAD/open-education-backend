import { IsString, IsOptional, IsArray, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartQuizAttemptDto {
  @ApiProperty({ description: 'Quiz ID' })
  @IsString()
  quiz_id!: string;

  @ApiPropertyOptional({ description: 'Enrollment ID' })
  @IsOptional()
  @IsString()
  enrollment_id?: string;
}

export class SubmitQuizAnswersDto {
  @ApiProperty({ description: 'Quiz attempt ID' })
  @IsString()
  attempt_id!: string;

  @ApiProperty({ description: 'Student answers' })
  @IsArray()
  answers!: Array<{
    question_id: string;
    answer: string | string[];
    time_spent_seconds: number;
  }>;
}

export class QuizAttemptResultDto {
  @ApiProperty({ description: 'Attempt ID' })
  id!: string;

  @ApiProperty({ description: 'Quiz ID' })
  quiz_id!: string;

  @ApiProperty({ description: 'Student ID' })
  student_id!: string;

  @ApiProperty({ description: 'Attempt status' })
  status!: string;

  @ApiProperty({ description: 'Final score' })
  score!: number;

  @ApiProperty({ description: 'Total questions' })
  total_questions!: number;

  @ApiProperty({ description: 'Correct answers' })
  correct_answers!: number;

  @ApiProperty({ description: 'Attempt number' })
  attempt_number!: number;

  @ApiProperty({ description: 'Time taken in seconds' })
  time_taken_seconds!: number;

  @ApiProperty({ description: 'Answers with feedback' })
  answers!: Array<{
    question_id: string;
    answer: string | string[];
    is_correct: boolean;
    points_earned: number;
    time_spent_seconds: number;
  }>;

  @ApiPropertyOptional({ description: 'Feedback and recommendations' })
  feedback?: {
    overall_feedback?: string;
    strengths?: string[];
    areas_for_improvement?: string[];
    recommended_resources?: string[];
  };

  @ApiProperty({ description: 'Completion timestamp' })
  completed_at!: Date;
}
