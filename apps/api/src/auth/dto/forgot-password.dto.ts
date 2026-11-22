import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ForgotRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  identifier!: string;
}

export class ForgotVerifyDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  identifier!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(8)
  otp!: string;
}

export class ForgotResetDto {
  @IsString()
  @MinLength(10)
  resetToken!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  loginId?: string;

  @IsString()
  @MinLength(6)
  @MaxLength(80)
  newPassword!: string;
}
