import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateBrandingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(250_000)
  logoDataUrl?: string;
}
