import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class UpdateAreasDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  areaIds!: string[];
}
