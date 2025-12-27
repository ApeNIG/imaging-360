import type { Vehicle } from '@360-imaging/shared';
import { query } from '../index.js';
import {
  BaseRepository,
  QueryOptions,
  mapEntityToSnake,
} from './base.repository.js';

interface VehicleEntity extends Vehicle {
  createdAt: Date;
  updatedAt: Date;
}

export class VehiclesRepository extends BaseRepository<VehicleEntity> {
  protected tableName = 'vehicles';
  protected columns = [
    'id',
    'org_id',
    'site_id',
    'vin',
    'stock',
    'meta',
    'created_at',
    'updated_at',
  ];

  protected mapRow(row: Record<string, unknown>): VehicleEntity {
    return {
      id: row.id as string,
      orgId: row.org_id as string,
      siteId: row.site_id as string,
      vin: row.vin as string | undefined,
      stock: row.stock as string | undefined,
      meta: (row.meta as Record<string, unknown>) || {},
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  protected mapEntity(entity: Partial<VehicleEntity>): Record<string, unknown> {
    return mapEntityToSnake({
      orgId: entity.orgId,
      siteId: entity.siteId,
      vin: entity.vin,
      stock: entity.stock,
      meta: entity.meta ? JSON.stringify(entity.meta) : undefined,
    });
  }

  /**
   * Find vehicle by VIN
   */
  async findByVin(vin: string, opts: QueryOptions): Promise<VehicleEntity | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM vehicles WHERE org_id = $1 AND vin = $2`,
      [opts.orgId, vin]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find vehicle by stock number
   */
  async findByStock(stock: string, opts: QueryOptions): Promise<VehicleEntity | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM vehicles WHERE org_id = $1 AND stock = $2`,
      [opts.orgId, stock]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find or create vehicle by VIN or stock
   */
  async findOrCreate(
    orgId: string,
    siteId: string,
    vin?: string,
    stock?: string,
    meta?: Record<string, unknown>
  ): Promise<VehicleEntity> {
    // Try to find by VIN first
    if (vin) {
      const existing = await this.findByVin(vin, { orgId });
      if (existing) return existing;
    }

    // Try to find by stock
    if (stock) {
      const existing = await this.findByStock(stock, { orgId });
      if (existing) return existing;
    }

    // Create new vehicle
    const result = await query<Record<string, unknown>>(
      `INSERT INTO vehicles (org_id, site_id, vin, stock, meta)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [orgId, siteId, vin || null, stock || null, meta ? JSON.stringify(meta) : '{}']
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find vehicles by site
   */
  async findBySite(siteId: string, opts: QueryOptions): Promise<VehicleEntity[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM vehicles
       WHERE org_id = $1 AND site_id = $2
       ORDER BY created_at DESC`,
      [opts.orgId, siteId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Search vehicles by VIN or stock (partial match)
   */
  async search(
    searchTerm: string,
    opts: QueryOptions
  ): Promise<VehicleEntity[]> {
    const pattern = `%${searchTerm}%`;
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM vehicles
       WHERE org_id = $1 AND (vin ILIKE $2 OR stock ILIKE $2)
       ORDER BY created_at DESC
       LIMIT 20`,
      [opts.orgId, pattern]
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}

export const vehiclesRepository = new VehiclesRepository();
