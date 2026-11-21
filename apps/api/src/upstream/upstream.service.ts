import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UpstreamService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async status(tenantId: string) {
    const baseUrl = this.config.get<string>('TRIANGLE_BASE_URL') || '';
    const username = this.config.get<string>('TRIANGLE_USERNAME') || '';
    const password = this.config.get<string>('TRIANGLE_PASSWORD') || '';

    const session = await this.prisma.upstreamSession.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      adapter: 'triangle',
      baseUrl,
      configured: Boolean(baseUrl && username && password),
      session: session
        ? {
            status: session.status,
            expiresAt: session.expiresAt,
            lastVerifiedAt: session.lastVerifiedAt,
          }
        : {
            status: 'not_connected',
          },
      sync: {
        enabled: false,
        note: 'Sync jobs are introduced in Phase 1.',
      },
    };
  }
}
