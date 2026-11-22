import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'loginId may contain letters, numbers, dot, underscore and dash',
  })
  loginId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^01\d{9}$/, { message: 'mobile must be a valid Bangladeshi number' })
  mobile?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;
}
