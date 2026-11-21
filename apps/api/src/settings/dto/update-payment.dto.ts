import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdatePaymentDto {
  @IsOptional()
  @IsIn(['bkash', 'nagad', 'rocket'])
  type?: 'bkash' | 'nagad' | 'rocket';

  @IsOptional()
  @IsString()
  @Matches(/^$|^01\d{9}$/, { message: 'merchantNumber must be a valid mobile number' })
  merchantNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  merchantLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  merchantInstructions?: string;

  @IsOptional()
  @IsBoolean()
  merchantActive?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^$|^01\d{9}$/, { message: 'personalNumber must be a valid mobile number' })
  personalNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  personalLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  personalInstructions?: string;

  @IsOptional()
  @IsBoolean()
  personalActive?: boolean;

  /**
   * Backward-compatible aliases for the old bKash-only settings form.
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;

  @IsBoolean()
  isActive!: boolean;
}
