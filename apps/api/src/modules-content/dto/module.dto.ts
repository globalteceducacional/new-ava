import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ModuleMaterialType } from '@prisma/client';

export class CreateModuleDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateModuleDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class CreateModuleVideoDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateModuleVideoDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class CreateVideoMaterialDto {
  @IsEnum(ModuleMaterialType)
  type!: ModuleMaterialType;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  refId?: string;
}

export class UpdateVideoMaterialDto {
  @IsOptional()
  @IsEnum(ModuleMaterialType)
  type?: ModuleMaterialType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  url?: string | null;

  @IsOptional()
  @IsString()
  refId?: string | null;
}

export class ReorderIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderedIds!: string[];
}
