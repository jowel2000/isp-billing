import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'loginId may contain letters, numbers, dot, underscore and dash',
  })
  loginId!: string;

  @IsString()
  @Matches(/^01\d{9}$/, { message: 'mobile must be a valid Bangladeshi number' })
  mobile!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  roleName!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  areaIds?: string[];
}
