import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^01\d{9}$/)
  mobile?: string;

  @IsOptional()
  @IsString()
  altMobile?: string;

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'expired', 'free', 'removed'])
  status?: string;

  @IsOptional()
  @IsIn(['prepaid', 'postpaid'])
  billingType?: 'prepaid' | 'postpaid';

  @IsOptional()
  @IsString()
  pppoeUsername?: string;

  @IsOptional()
  @IsString()
  pppoePassword?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  nidNumber?: string;

  @IsOptional()
  @IsString()
  packageId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyAmountPaisa?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountPaisa?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dueDay?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  graceDays?: number;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  @IsOptional()
  @IsBoolean()
  autoRecharge?: boolean;
}
