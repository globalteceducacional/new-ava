import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsString,
  Min,
} from 'class-validator';

export class ReportLessonProgressDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  currentTime!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  duration!: number;
}

export class ImportLessonProgressDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  videoIds!: string[];
}
