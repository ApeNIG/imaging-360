import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module before importing
vi.mock('../index.js', () => ({
  query: vi.fn(),
  db: { connect: vi.fn() },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { VehiclesRepository, vehiclesRepository } from './vehicles.repository.js';
import { query } from '../index.js';

describe('VehiclesRepository', () => {
  const orgId = 'org-123';
  const siteId = 'site-456';
  const vehicleId = 'vehicle-789';

  const mockVehicleRow = {
    id: vehicleId,
    org_id: orgId,
    site_id: siteId,
    vin: '1HGBH41JXMN109186',
    stock: 'STK-12345',
    meta: { make: 'Honda', model: 'Accord', year: 2023 },
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-02'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findByVin', () => {
    it('should find vehicle by VIN', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockVehicleRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await vehiclesRepository.findByVin('1HGBH41JXMN109186', { orgId });

      expect(result).not.toBeNull();
      expect(result?.vin).toBe('1HGBH41JXMN109186');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('vin = $2'),
        [orgId, '1HGBH41JXMN109186']
      );
    });

    it('should return null when VIN not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await vehiclesRepository.findByVin('INVALID_VIN', { orgId });

      expect(result).toBeNull();
    });
  });

  describe('findByStock', () => {
    it('should find vehicle by stock number', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockVehicleRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await vehiclesRepository.findByStock('STK-12345', { orgId });

      expect(result).not.toBeNull();
      expect(result?.stock).toBe('STK-12345');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('stock = $2'),
        [orgId, 'STK-12345']
      );
    });

    it('should return null when stock not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await vehiclesRepository.findByStock('INVALID', { orgId });

      expect(result).toBeNull();
    });
  });

  describe('findOrCreate', () => {
    it('should return existing vehicle when found by VIN', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockVehicleRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await vehiclesRepository.findOrCreate(
        orgId,
        siteId,
        '1HGBH41JXMN109186',
        'STK-12345'
      );

      expect(result.id).toBe(vehicleId);
      expect(query).toHaveBeenCalledTimes(1); // Only VIN lookup
    });

    it('should return existing vehicle when found by stock', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] }) // VIN not found
        .mockResolvedValueOnce({ rows: [mockVehicleRow], rowCount: 1, command: 'SELECT', oid: 0, fields: [] }); // Stock found

      const result = await vehiclesRepository.findOrCreate(
        orgId,
        siteId,
        'NEW_VIN',
        'STK-12345'
      );

      expect(result.stock).toBe('STK-12345');
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('should create new vehicle when not found', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] }) // VIN not found
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] }) // Stock not found
        .mockResolvedValueOnce({ rows: [mockVehicleRow], rowCount: 1, command: 'INSERT', oid: 0, fields: [] }); // Create

      const result = await vehiclesRepository.findOrCreate(
        orgId,
        siteId,
        'NEW_VIN',
        'NEW_STOCK',
        { make: 'Honda' }
      );

      expect(result).toBeDefined();
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO vehicles'),
        expect.arrayContaining([orgId, siteId, 'NEW_VIN', 'NEW_STOCK'])
      );
    });

    it('should create vehicle with only VIN', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] }) // VIN not found
        .mockResolvedValueOnce({ rows: [{ ...mockVehicleRow, stock: null }], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

      await vehiclesRepository.findOrCreate(
        orgId,
        siteId,
        '1HGBH41JXMN109186',
        undefined
      );

      expect(query).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.arrayContaining([orgId, siteId, '1HGBH41JXMN109186', null])
      );
    });

    it('should create vehicle with only stock', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] }) // Stock not found
        .mockResolvedValueOnce({ rows: [{ ...mockVehicleRow, vin: null }], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

      await vehiclesRepository.findOrCreate(
        orgId,
        siteId,
        undefined,
        'STK-12345'
      );

      expect(query).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.arrayContaining([orgId, siteId, null, 'STK-12345'])
      );
    });
  });

  describe('findBySite', () => {
    it('should find all vehicles at site', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockVehicleRow, { ...mockVehicleRow, id: 'vehicle-2' }],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await vehiclesRepository.findBySite(siteId, { orgId });

      expect(result).toHaveLength(2);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('site_id = $2'),
        [orgId, siteId]
      );
    });

    it('should return empty array when no vehicles at site', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await vehiclesRepository.findBySite('empty-site', { orgId });

      expect(result).toEqual([]);
    });

    it('should order by created_at descending', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await vehiclesRepository.findBySite(siteId, { orgId });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });
  });

  describe('search', () => {
    it('should search vehicles by VIN or stock', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockVehicleRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await vehiclesRepository.search('12345', { orgId });

      expect(result).toHaveLength(1);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        [orgId, '%12345%']
      );
    });

    it('should limit results to 20', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await vehiclesRepository.search('test', { orgId });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 20'),
        expect.any(Array)
      );
    });

    it('should search case-insensitively', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockVehicleRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await vehiclesRepository.search('HGBH', { orgId });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.any(Array)
      );
    });

    it('should return empty array for no matches', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await vehiclesRepository.search('nomatch', { orgId });

      expect(result).toEqual([]);
    });
  });

  describe('mapRow', () => {
    it('should correctly map database row to entity', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockVehicleRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await vehiclesRepository.findByVin('1HGBH41JXMN109186', { orgId });

      expect(result).toEqual({
        id: vehicleId,
        orgId,
        siteId,
        vin: '1HGBH41JXMN109186',
        stock: 'STK-12345',
        meta: { make: 'Honda', model: 'Accord', year: 2023 },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      });
    });

    it('should handle null meta as empty object', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockVehicleRow, meta: null }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await vehiclesRepository.findByVin('1HGBH41JXMN109186', { orgId });

      expect(result?.meta).toEqual({});
    });

    it('should handle undefined VIN and stock', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockVehicleRow, vin: undefined, stock: undefined }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await vehiclesRepository.findBySite(siteId, { orgId });

      expect(result[0].vin).toBeUndefined();
      expect(result[0].stock).toBeUndefined();
    });
  });
});
