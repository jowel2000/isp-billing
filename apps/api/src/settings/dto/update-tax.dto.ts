import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateTaxDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(0)
  @Max(10000)
  rateBps!: number;

  @IsBoolean()
  inclusive!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  label?: string;
}
