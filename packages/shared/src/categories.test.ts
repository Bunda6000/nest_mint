import { describe, expect, it } from 'vitest';
import {
  createCategorySchema,
  createGroupSchema,
  reorderSchema,
  updateCategoryItemSchema,
} from './categories.js';
import { fieldErrors } from './auth/register.js';

const id = 'a3bb189e-8bf9-4888-9912-ace4e6543002';

describe('createGroupSchema', () => {
  it('trims the name', () => {
    expect(createGroupSchema.parse({ name: '  Pets  ' })).toEqual({ name: 'Pets' });
  });

  it('rejects a blank or too long name', () => {
    const blank = createGroupSchema.safeParse({ name: '   ' });
    expect(blank.success).toBe(false);
    if (!blank.success) expect(fieldErrors(blank.error)).toEqual({ name: 'Enter a name' });

    expect(createGroupSchema.safeParse({ name: 'x'.repeat(61) }).success).toBe(false);
    expect(createGroupSchema.safeParse({ name: 'x'.repeat(60) }).success).toBe(true);
  });
});

describe('createCategorySchema', () => {
  it('needs a valid group id and a name', () => {
    expect(createCategorySchema.parse({ groupId: id, name: ' Tyres ' })).toEqual({
      groupId: id,
      name: 'Tyres',
    });
    expect(createCategorySchema.safeParse({ groupId: 'nope', name: 'Tyres' }).success).toBe(false);
  });
});

describe('updateCategoryItemSchema', () => {
  it('accepts a rename, an archive, a restore, or both', () => {
    expect(updateCategoryItemSchema.parse({ name: 'Gas' })).toEqual({ name: 'Gas' });
    expect(updateCategoryItemSchema.parse({ archived: true })).toEqual({ archived: true });
    expect(updateCategoryItemSchema.parse({ archived: false })).toEqual({ archived: false });
    expect(updateCategoryItemSchema.parse({ name: 'Gas', archived: false })).toEqual({
      name: 'Gas',
      archived: false,
    });
  });

  it('rejects an empty change', () => {
    expect(updateCategoryItemSchema.safeParse({}).success).toBe(false);
  });
});

describe('reorderSchema', () => {
  it('needs at least one id, each only once', () => {
    expect(reorderSchema.safeParse({ ids: [id] }).success).toBe(true);
    expect(reorderSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(reorderSchema.safeParse({ ids: [id, id] }).success).toBe(false);
    expect(reorderSchema.safeParse({ ids: ['x'] }).success).toBe(false);
  });
});
