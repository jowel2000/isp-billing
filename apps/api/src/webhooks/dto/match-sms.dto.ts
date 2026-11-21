import { IsString, MinLength } from 'class-validator';

export class MatchSmsDto {
  @IsString()
  @MinLength(1)
  clientId!: string;
}
