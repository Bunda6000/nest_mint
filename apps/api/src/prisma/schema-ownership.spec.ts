import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The structural half of user data isolation (docs/adr/006-user-data-isolation.md): every table
// except `users` must belong to a user, and disappear with them. A new table that skips this fails CI.
const schema = readFileSync(
  fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url)),
  'utf8',
);

const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((match) => ({
  name: match[1]!,
  body: match[2]!,
}));

describe('Prisma schema ownership', () => {
  it('finds the models', () => {
    expect(models.map((m) => m.name)).toEqual(
      expect.arrayContaining(['User', 'RefreshToken', 'CategoryGroup', 'Category']),
    );
  });

  for (const model of models.filter((m) => m.name !== 'User')) {
    it(`${model.name} belongs to a user and is deleted with them`, () => {
      expect(model.body).toMatch(/^\s*userId\s+String\s+@map\("user_id"\)\s+@db\.Uuid/m);
      expect(model.body).toMatch(
        /@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/,
      );
    });
  }
});
