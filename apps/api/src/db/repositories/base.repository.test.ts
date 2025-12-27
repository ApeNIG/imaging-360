import { describe, it, expect, vi } from 'vitest';

// Mock logger before any imports that use it
vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock db module to avoid pg connection
vi.mock('../index.js', () => ({
  query: vi.fn(),
  db: {
    connect: vi.fn(),
    on: vi.fn(),
    query: vi.fn(),
  },
}));

import {
  toCamelCase,
  toSnakeCase,
  mapRowToCamel,
  mapEntityToSnake,
} from './base.repository.js';

describe('Base Repository Utilities', () => {
  describe('toCamelCase', () => {
    it('should convert snake_case to camelCase', () => {
      expect(toCamelCase('org_id')).toBe('orgId');
      expect(toCamelCase('created_at')).toBe('createdAt');
      expect(toCamelCase('vehicle_id')).toBe('vehicleId');
    });

    it('should handle multiple underscores', () => {
      expect(toCamelCase('some_long_column_name')).toBe('someLongColumnName');
    });

    it('should handle strings without underscores', () => {
      expect(toCamelCase('id')).toBe('id');
      expect(toCamelCase('name')).toBe('name');
    });

    it('should handle empty string', () => {
      expect(toCamelCase('')).toBe('');
    });

    it('should handle leading underscore', () => {
      expect(toCamelCase('_private')).toBe('Private');
    });
  });

  describe('toSnakeCase', () => {
    it('should convert camelCase to snake_case', () => {
      expect(toSnakeCase('orgId')).toBe('org_id');
      expect(toSnakeCase('createdAt')).toBe('created_at');
      expect(toSnakeCase('vehicleId')).toBe('vehicle_id');
    });

    it('should handle multiple capital letters', () => {
      expect(toSnakeCase('someLongColumnName')).toBe('some_long_column_name');
    });

    it('should handle strings without capitals', () => {
      expect(toSnakeCase('id')).toBe('id');
      expect(toSnakeCase('name')).toBe('name');
    });

    it('should handle empty string', () => {
      expect(toSnakeCase('')).toBe('');
    });

    it('should handle leading capital', () => {
      expect(toSnakeCase('OrgId')).toBe('_org_id');
    });
  });

  describe('mapRowToCamel', () => {
    it('should convert all keys from snake_case to camelCase', () => {
      const row = {
        id: '123',
        org_id: 'org-456',
        created_at: new Date('2024-01-01'),
        site_id: 'site-789',
      };

      const result = mapRowToCamel<{
        id: string;
        orgId: string;
        createdAt: Date;
        siteId: string;
      }>(row);

      expect(result).toEqual({
        id: '123',
        orgId: 'org-456',
        createdAt: new Date('2024-01-01'),
        siteId: 'site-789',
      });
    });

    it('should preserve values of different types', () => {
      const row = {
        id: '123',
        count: 42,
        is_active: true,
        meta_data: { foo: 'bar' },
        tags: ['a', 'b'],
        nullable_field: null,
      };

      const result = mapRowToCamel<Record<string, unknown>>(row);

      expect(result.id).toBe('123');
      expect(result.count).toBe(42);
      expect(result.isActive).toBe(true);
      expect(result.metaData).toEqual({ foo: 'bar' });
      expect(result.tags).toEqual(['a', 'b']);
      expect(result.nullableField).toBeNull();
    });

    it('should handle empty object', () => {
      const result = mapRowToCamel<Record<string, never>>({});
      expect(result).toEqual({});
    });
  });

  describe('mapEntityToSnake', () => {
    it('should convert all keys from camelCase to snake_case', () => {
      const entity = {
        id: '123',
        orgId: 'org-456',
        createdAt: new Date('2024-01-01'),
        siteId: 'site-789',
      };

      const result = mapEntityToSnake(entity);

      expect(result).toEqual({
        id: '123',
        org_id: 'org-456',
        created_at: new Date('2024-01-01'),
        site_id: 'site-789',
      });
    });

    it('should exclude undefined values', () => {
      const entity = {
        id: '123',
        orgId: 'org-456',
        siteId: undefined,
        name: undefined,
      };

      const result = mapEntityToSnake(entity);

      expect(result).toEqual({
        id: '123',
        org_id: 'org-456',
      });
      expect(result).not.toHaveProperty('site_id');
      expect(result).not.toHaveProperty('name');
    });

    it('should include null values', () => {
      const entity = {
        id: '123',
        siteId: null,
      };

      const result = mapEntityToSnake(entity);

      expect(result).toEqual({
        id: '123',
        site_id: null,
      });
    });

    it('should preserve values of different types', () => {
      const entity = {
        count: 42,
        isActive: true,
        metaData: { foo: 'bar' },
        tags: ['a', 'b'],
      };

      const result = mapEntityToSnake(entity);

      expect(result.count).toBe(42);
      expect(result.is_active).toBe(true);
      expect(result.meta_data).toEqual({ foo: 'bar' });
      expect(result.tags).toEqual(['a', 'b']);
    });

    it('should handle empty object', () => {
      const result = mapEntityToSnake({});
      expect(result).toEqual({});
    });
  });

  describe('Round-trip conversion', () => {
    it('should maintain data integrity through snake -> camel -> snake', () => {
      const original = {
        id: '123',
        org_id: 'org-456',
        created_at: new Date('2024-01-01'),
        some_value: 42,
      };

      const camel = mapRowToCamel<Record<string, unknown>>(original);
      const backToSnake = mapEntityToSnake(camel);

      expect(backToSnake).toEqual(original);
    });

    it('should maintain data integrity through camel -> snake -> camel', () => {
      const original = {
        id: '123',
        orgId: 'org-456',
        createdAt: new Date('2024-01-01'),
        someValue: 42,
      };

      const snake = mapEntityToSnake(original);
      const backToCamel = mapRowToCamel<Record<string, unknown>>(snake);

      expect(backToCamel).toEqual(original);
    });
  });
});
