import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^01\d{9}$/, { message: 'mobile must be a valid Bangladeshi number' })
  mobile!: string;

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
  @IsIn(['prepaid', 'postpaid'])
  billingType?: 'prepaid' | 'postpaid';

  @IsOptional()
  @IsIn(['active', 'inactive', 'expired', 'free'])
  status?: string;

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
  @Min(1)
  dueDay?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  graceDays?: number;

  @IsOptional()
  @IsBoolean()
  autoRecharge?: boolean;
}
