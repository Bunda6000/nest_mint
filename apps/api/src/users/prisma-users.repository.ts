import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { NewUser, User } from './user.entity.js';
import { DuplicateEmailError, type UsersRepository } from './users.repository.js';

const userFields = { id: true, email: true, passwordHash: true, displayName: true } as const;

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email }, select: userFields });
  }

  async create(user: NewUser): Promise<User> {
    try {
      return await this.prisma.user.create({ data: user, select: userFields });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateEmailError();
      }
      throw error;
    }
  }
}
