import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateAutoRechargeDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  approvalThresholdPaisa?: number;
}
