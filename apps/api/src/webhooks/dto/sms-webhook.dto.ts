import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SmsWebhookDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;

  /** MacroDroid / generic forwarder alias. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message_body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  receivedAt?: string;

  /** MacroDroid / generic forwarder alias. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  received_at?: string;

  /** Exact SMS arrival time from the phone (ISO-8601 or local yyyy-MM-dd HH:mm:ss). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  smsReceivedAt?: string;

  /** IANA timezone used when smsReceivedAt is a local timestamp. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  /** Stable per-SMS key computed by the phone; prevents duplicate forwarding. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;

  /** Optional phone-side OTP hint; the server still extracts and validates. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  otp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  simSlot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  signature?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  timestamp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nonce?: string;
}
