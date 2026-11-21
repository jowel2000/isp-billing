import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user';
import { encryptString } from '../common/crypto';
import { UpdateAutoRechargeDto } from './dto/update-auto-recharge.dto';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { UpdateSmsDto } from './dto/update-sms.dto';
import { UpdateTaxDto } from './dto/update-tax.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTax(tenantId: string) {
    const existing = await this.prisma.taxSetting.findUnique({ where: { tenantId } });
    if (existing) return existing;

    return this.prisma.taxSetting.create({
      data: { tenantId, enabled: false, rateBps: 500, inclusive: false, label: 'VAT' },
    });
  }

  async updateTax(actor: AuthUser, dto: UpdateTaxDto) {
    const updated = await this.prisma.taxSetting.upsert({
      where: { tenantId: actor.tenantId },
      update: {
        enabled: dto.enabled,
        rateBps: dto.rateBps,
        inclusive: dto.inclusive,
        label: dto.label ?? 'VAT',
      },
      create: {
        tenantId: actor.tenantId,
        enabled: dto.enabled,
        rateBps: dto.rateBps,
        inclusive: dto.inclusive,
        label: dto.label ?? 'VAT',
      },
    });

    await this.audit(actor, 'settings.tax.update', updated.id, dto);
    return updated;
  }

  async getPayment(tenantId: string) {
    const gateways = await this.prisma.paymentGateway.findMany({
      where: { tenantId },
      orderBy: { type: 'asc' },
    });
    return gateways.map((gateway) => this.toPaymentResponse(gateway));
  }

  async updatePayment(actor: AuthUser, dto: UpdatePaymentDto) {
    const type = dto.type ?? 'bkash';
    const existing = await this.prisma.paymentGateway.findFirst({
      where: { tenantId: actor.tenantId, type },
    });

    const data: any = {
      type,
      isActive: dto.isActive,
      merchantActive:
        dto.merchantActive ?? existing?.merchantActive ?? Boolean(existing?.merchantNumber),
      personalActive:
        dto.personalActive ?? existing?.personalActive ?? Boolean(existing?.personalNumber),
    };

    if (dto.merchantNumber !== undefined) {
      data.merchantNumber = dto.merchantNumber || null;
    }
    if (dto.merchantLabel !== undefined) {
      data.label = dto.merchantLabel;
    } else if (dto.label !== undefined) {
      data.label = dto.label;
    }
    if (dto.merchantInstructions !== undefined) {
      data.instructions = dto.merchantInstructions;
    } else if (dto.instructions !== undefined) {
      data.instructions = dto.instructions;
    }
    if (dto.personalNumber !== undefined) {
      data.personalNumber = dto.personalNumber || null;
    }
    if (dto.personalLabel !== undefined) {
      data.personalLabel = dto.personalLabel;
    }
    if (dto.personalInstructions !== undefined) {
      data.personalInstructions = dto.personalInstructions;
    }

    const gateway = existing
      ? await this.prisma.paymentGateway.update({ where: { id: existing.id }, data })
      : await this.prisma.paymentGateway.create({
          data: {
            id: `${actor.tenantId}-${type}`,
            tenantId: actor.tenantId,
            type,
            isActive: dto.isActive,
            merchantActive: dto.merchantActive ?? Boolean(dto.merchantNumber),
            personalActive: dto.personalActive ?? Boolean(dto.personalNumber),
            merchantNumber: dto.merchantNumber ?? null,
            label: dto.merchantLabel ?? dto.label ?? `${type} Merchant`,
            instructions:
              dto.merchantInstructions ??
              dto.instructions ??
              'Send Money and submit the reference.',
            personalNumber: dto.personalNumber ?? null,
            personalLabel: dto.personalLabel ?? `${type} Personal`,
            personalInstructions:
              dto.personalInstructions ??
              'Send Money to this number and submit the reference.',
          },
        });

    await this.audit(actor, 'settings.payment.update', gateway.id, {
      type,
      isActive: dto.isActive,
      merchantActive: gateway.merchantActive,
      personalActive: gateway.personalActive,
    });

    return this.toPaymentResponse(gateway);
  }

  private toPaymentResponse(gateway: {
    id: string;
    type: string;
    merchantNumber: string | null;
    label: string | null;
    instructions: string | null;
    merchantActive: boolean;
    personalNumber: string | null;
    personalLabel: string | null;
    personalInstructions: string | null;
    personalActive: boolean;
    isActive: boolean;
    updatedAt: Date;
  }) {
    return {
      id: gateway.id,
      type: gateway.type,
      merchantNumber: gateway.merchantNumber,
      label: gateway.label,
      instructions: gateway.instructions,
      merchantActive: gateway.merchantActive,
      personalNumber: gateway.personalNumber,
      personalLabel: gateway.personalLabel,
      personalInstructions: gateway.personalInstructions,
      personalActive: gateway.personalActive,
      isActive: gateway.isActive,
      updatedAt: gateway.updatedAt,
    };
  }

  async getSms(tenantId: string) {
    const gateways = await this.prisma.smsGateway.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });

    return gateways.map((gateway) => ({
      id: gateway.id,
      provider: gateway.provider,
      apiEndpoint: gateway.apiEndpoint,
      senderId: gateway.senderId,
      isActive: gateway.isActive,
      hasApiKey: Boolean(gateway.credentialsEnc),
      updatedAt: gateway.updatedAt,
    }));
  }

  async updateSms(actor: AuthUser, dto: UpdateSmsDto) {
    const existing = await this.prisma.smsGateway.findFirst({
      where: { tenantId: actor.tenantId, provider: dto.provider },
    });

    const data = {
      apiEndpoint: dto.apiEndpoint ?? null,
      senderId: dto.senderId ?? null,
      isActive: dto.isActive,
      credentialsEnc: dto.apiKey ? encryptString(dto.apiKey) : existing?.credentialsEnc,
    };

    const gateway = existing
      ? await this.prisma.smsGateway.update({ where: { id: existing.id }, data })
      : await this.prisma.smsGateway.create({
          data: { tenantId: actor.tenantId, provider: dto.provider, ...data },
        });

    await this.audit(actor, 'settings.sms.update', gateway.id, {
      provider: dto.provider,
      isActive: dto.isActive,
      hasApiKey: Boolean(dto.apiKey) || Boolean(existing?.credentialsEnc),
    });

    return {
      id: gateway.id,
      provider: gateway.provider,
      apiEndpoint: gateway.apiEndpoint,
      senderId: gateway.senderId,
      isActive: gateway.isActive,
      hasApiKey: Boolean(gateway.credentialsEnc),
      updatedAt: gateway.updatedAt,
    };
  }

  async getAutoRecharge(tenantId: string) {
    const [enabled, threshold] = await this.prisma.$transaction([
      this.prisma.setting.findUnique({
        where: { tenantId_key: { tenantId, key: 'auto_recharge_enabled' } },
      }),
      this.prisma.setting.findUnique({
        where: {
          tenantId_key: { tenantId, key: 'auto_recharge_approval_threshold_paisa' },
        },
      }),
    ]);

    return {
      enabled: enabled?.value === 'true',
      approvalThresholdPaisa: Number(threshold?.value ?? 0),
    };
  }

  async updateAutoRecharge(actor: AuthUser, dto: UpdateAutoRechargeDto) {
    await this.prisma.$transaction([
      this.prisma.setting.upsert({
        where: {
          tenantId_key: { tenantId: actor.tenantId, key: 'auto_recharge_enabled' },
        },
        update: { value: dto.enabled ? 'true' : 'false' },
        create: {
          tenantId: actor.tenantId,
          key: 'auto_recharge_enabled',
          value: dto.enabled ? 'true' : 'false',
        },
      }),
      this.prisma.setting.upsert({
        where: {
          tenantId_key: {
            tenantId: actor.tenantId,
            key: 'auto_recharge_approval_threshold_paisa',
          },
        },
        update: { value: String(dto.approvalThresholdPaisa ?? 0) },
        create: {
          tenantId: actor.tenantId,
          key: 'auto_recharge_approval_threshold_paisa',
          value: String(dto.approvalThresholdPaisa ?? 0),
        },
      }),
    ]);

    await this.audit(actor, 'settings.auto_recharge.update', actor.tenantId, dto);
    return this.getAutoRecharge(actor.tenantId);
  }

  async getBranding(tenantId: string) {
    const rows = await this.prisma.setting.findMany({
      where: {
        tenantId,
        key: { in: ['brand_name', 'brand_logo'] },
      },
    });

    const name = rows.find((row) => row.key === 'brand_name')?.value;
    const logo = rows.find((row) => row.key === 'brand_logo')?.value;

    return {
      name: name || 'JR COMMUNICATION',
      logoDataUrl: logo || null,
    };
  }

  async getPublicBranding() {
    const tenant = await this.prisma.tenant.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (!tenant) {
      return { name: 'JR COMMUNICATION', logoDataUrl: null };
    }

    const branding = await this.getBranding(tenant.id);
    return {
      name: branding.name || tenant.name || 'JR COMMUNICATION',
      logoDataUrl: branding.logoDataUrl,
    };
  }

  async updateBranding(actor: AuthUser, dto: UpdateBrandingDto) {
    const name = dto.name.trim();
    const logo = dto.logoDataUrl?.trim() ?? '';

    if (logo) {
      if (!/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(logo)) {
        throw new BadRequestException('Logo must be a PNG, JPG, WebP or SVG image');
      }
      if (logo.length > 250_000) {
        throw new BadRequestException('Logo is too large; it will be resized automatically');
      }
    }

    await this.prisma.$transaction([
      this.prisma.setting.upsert({
        where: { tenantId_key: { tenantId: actor.tenantId, key: 'brand_name' } },
        update: { value: name },
        create: { tenantId: actor.tenantId, key: 'brand_name', value: name },
      }),
      this.prisma.setting.upsert({
        where: { tenantId_key: { tenantId: actor.tenantId, key: 'brand_logo' } },
        update: { value: logo },
        create: { tenantId: actor.tenantId, key: 'brand_logo', value: logo },
      }),
    ]);

    await this.audit(actor, 'settings.branding.update', actor.tenantId, {
      name,
      hasLogo: Boolean(logo),
    });

    return this.getBranding(actor.tenantId);
  }

  private async audit(actor: AuthUser, action: string, entityId: string, after: unknown) {
    await this.prisma.auditLog
      .create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.id,
          action,
          entityType: 'settings',
          entityId,
          after: JSON.stringify(after),
        },
      })
      .catch(() => undefined);
  }
}
