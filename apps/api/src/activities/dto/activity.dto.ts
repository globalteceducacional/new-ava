import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class RubricCriterionDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsNumber()
  weight!: number;
}

export class CreateActivityDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Módulo em que a atividade aparece na visão do curso. */
  @IsOptional()
  @IsString()
  moduleId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionDto)
  rubric?: RubricCriterionDto[];

  @IsOptional()
  @IsBoolean()
  allowLate?: boolean;
}

export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  moduleId?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionDto)
  rubric?: RubricCriterionDto[] | null;

  @IsOptional()
  @IsBoolean()
  allowLate?: boolean;
}

export class SubmitActivityDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;
}

export class GradeSubmissionDto {
  @IsObject()
  rubricScores!: Record<string, number>;

  @IsOptional()
  @IsString()
  feedback?: string;
}
