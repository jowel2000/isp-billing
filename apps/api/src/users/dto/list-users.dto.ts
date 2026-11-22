import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListUsersDto {
  @IsOptional()
  @IsIn(['super_admin', 'admin', 'staff', 'client'])
  role?: 'super_admin' | 'admin' | 'staff' | 'client';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  search?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  archived?: string;
}
