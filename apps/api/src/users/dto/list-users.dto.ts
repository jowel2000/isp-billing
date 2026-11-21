import { IsIn, IsOptional } from 'class-validator';

export class ListUsersDto {
  @IsOptional()
  @IsIn(['super_admin', 'admin', 'staff', 'client'])
  role?: 'super_admin' | 'admin' | 'staff' | 'client';
}
