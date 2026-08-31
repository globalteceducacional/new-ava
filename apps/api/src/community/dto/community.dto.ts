import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTopicDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;

  @IsOptional()
  @IsString()
  moduleId?: string;

  @IsOptional()
  @IsString()
  moduleVideoId?: string;

  @IsOptional()
  @IsString()
  contentItemId?: string;
}

export class CreateReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  /** Responder a outro comentário (mesmo post). */
  @IsOptional()
  @IsString()
  parentId?: string;
}
