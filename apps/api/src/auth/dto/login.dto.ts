import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  loginId?: string;

  /**
   * Backward-compatible fallback. New clients should send `loginId`.
   */
  @IsOptional()
  @IsString()
  @MinLength(3)
  mobile?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
