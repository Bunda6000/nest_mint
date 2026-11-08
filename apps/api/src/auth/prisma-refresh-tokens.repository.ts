import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  NewRefreshToken,
  RefreshTokenRecord,
  RefreshTokensRepository,
  RevokeReason,
} from './refresh-tokens.repository.js';

@Injectable()
export class PrismaRefreshTokensRepository implements RefreshTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(token: NewRefreshToken): Promise<void> {
    await this.prisma.refreshToken.create({ data: token });
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    return row && { ...row, revokeReason: row.revokeReason as RevokeReason | null };
  }

  async revoke(id: string, reason: RevokeReason, at: Date): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: at, revokeReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: RevokeReason, at: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at, revokeReason: reason },
    });
  }
}
