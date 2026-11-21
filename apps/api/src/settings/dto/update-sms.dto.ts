import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateSmsDto {
  @IsString()
  @MaxLength(60)
  provider!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  apiEndpoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  senderId?: string;

  @IsBoolean()
  isActive!: boolean;
}
