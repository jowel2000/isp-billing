import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsIn(['bkash', 'cash'])
  method!: 'bkash' | 'cash';

  @IsInt()
  @Min(1)
  amountPaisa!: number;

  @IsOptional()
  @IsString()
  trxId?: string;

  @IsOptional()
  @IsIn(['bkash', 'nagad', 'rocket'])
  provider?: string;

  @IsOptional()
  @IsIn(['merchant', 'personal', 'manual'])
  accountType?: string;

  @IsOptional()
  @IsString()
  senderNumber?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  referenceCode?: string;
}

export class ListPaymentsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['pending', 'verified', 'rejected', 'refunded', 'unmatched'])
  status?: string;

  @IsOptional()
  @IsIn(['bkash', 'cash'])
  method?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class RejectPaymentDto {
  @IsString()
  reason!: string;
}

export class MatchPaymentDto {
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;
}

export class PortalPaymentDto {
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountPaisa?: number;

  @IsOptional()
  @IsIn(['bkash', 'nagad', 'rocket'])
  provider?: string;

  @IsOptional()
  @IsIn(['merchant', 'personal'])
  accountType?: 'merchant' | 'personal';

  @IsOptional()
  @IsString()
  trxId?: string;

  @IsOptional()
  @IsString()
  referenceCode?: string;

  @IsOptional()
  @IsString()
  senderNumber?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
