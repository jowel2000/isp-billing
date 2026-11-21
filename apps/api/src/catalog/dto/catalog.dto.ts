import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateAreaDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  thana?: string;

  @IsOptional()
  @IsString()
  upstreamId?: string;
}

export class UpdateAreaDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  thana?: string;

  @IsOptional()
  @IsString()
  upstreamId?: string;
}

export class CreatePackageDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  speedMbps?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  upstreamPricePaisa?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  localPricePaisa?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cbpPaisa?: number;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;

  @IsOptional()
  @IsString()
  upstreamId?: string;
}

export class UpdatePackageDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  speedMbps?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  upstreamPricePaisa?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  localPricePaisa?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cbpPaisa?: number;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;

  @IsOptional()
  @IsString()
  upstreamId?: string;
}
