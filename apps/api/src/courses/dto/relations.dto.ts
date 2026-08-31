import { IsOptional, IsString } from 'class-validator';

export class AssignTeacherDto {
  @IsString()
  teacherUserId!: string;
}

export class CreateEnrollmentDto {
  @IsString()
  studentUserId!: string;

  /** Quando o aluno pertence a mais de uma instituição. */
  @IsOptional()
  @IsString()
  institutionId?: string;
}

export class LinkCoursesDto {
  @IsString({ each: true })
  courseIds!: string[];
}
