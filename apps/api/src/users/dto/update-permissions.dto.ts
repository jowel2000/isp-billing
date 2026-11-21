import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PermissionOverrideDto {
  @IsString()
  permissionKey!: string;

  @IsIn(['allow', 'deny'])
  effect!: 'allow' | 'deny';
}

export class UpdatePermissionsDto {
  @IsArray()
  @ArrayUnique((item: PermissionOverrideDto) => item.permissionKey)
  @ValidateNested({ each: true })
  @Type(() => PermissionOverrideDto)
  overrides!: PermissionOverrideDto[];
}
