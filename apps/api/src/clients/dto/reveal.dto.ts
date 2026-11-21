import { IsIn } from 'class-validator';

export class RevealSensitiveDto {
  @IsIn(['pppoe', 'nid'])
  field!: 'pppoe' | 'nid';
}
