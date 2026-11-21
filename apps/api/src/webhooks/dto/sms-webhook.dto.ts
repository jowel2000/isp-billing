import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SmsWebhookDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  receivedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceId?: string;
}
