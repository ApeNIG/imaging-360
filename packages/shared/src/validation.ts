import { ALLOWED_CONTENT_TYPES } from './constants.js';
import type { CreateSessionRequest, PresignRequest, CreateEventRequest } from './types/index.js';

// ============================================================================
// Validation Helpers
// ============================================================================

export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export function isValidVIN(vin: string): boolean {
  // Basic VIN validation: 17 alphanumeric chars, no I, O, Q
  const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/i;
  return vinRegex.test(vin);
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidContentType(contentType: string): contentType is (typeof ALLOWED_CONTENT_TYPES)[number] {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType);
}

export function isValidSHA256(hash: string): boolean {
  const sha256Regex = /^[a-f0-9]{64}$/i;
  return sha256Regex.test(hash);
}

// ============================================================================
// Request Validation
// ============================================================================

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function validateCreateSession(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const req = data as Partial<CreateSessionRequest>;

  if (!req.siteId || !isValidUUID(req.siteId)) {
    errors.push({ field: 'siteId', message: 'Valid site ID required' });
  }

  if (!req.vehicle) {
    errors.push({ field: 'vehicle', message: 'Vehicle information required' });
  } else {
    if (!req.vehicle.vin && !req.vehicle.stock) {
      errors.push({ field: 'vehicle', message: 'Either VIN or stock number required' });
    }
    if (req.vehicle.vin && !isValidVIN(req.vehicle.vin)) {
      errors.push({ field: 'vehicle.vin', message: 'Invalid VIN format' });
    }
  }

  if (!req.mode || !['studio360', 'walk360', 'stills'].includes(req.mode)) {
    errors.push({ field: 'mode', message: 'Valid capture mode required (studio360, walk360, stills)' });
  }

  return { valid: errors.length === 0, errors };
}

export function validatePresignRequest(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const req = data as Partial<PresignRequest>;

  if (!req.sessionId || !isValidUUID(req.sessionId)) {
    errors.push({ field: 'sessionId', message: 'Valid session ID required' });
  }

  if (!req.fileName || req.fileName.length === 0) {
    errors.push({ field: 'fileName', message: 'File name required' });
  }

  if (!req.contentType || !isValidContentType(req.contentType)) {
    errors.push({ field: 'contentType', message: 'Content type must be image/jpeg or image/heic' });
  }

  if (!req.contentSha256 || !isValidSHA256(req.contentSha256)) {
    errors.push({ field: 'contentSha256', message: 'Valid SHA-256 hash required' });
  }

  return { valid: errors.length === 0, errors };
}

export function validateCreateEvent(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const req = data as Partial<CreateEventRequest>;

  if (!req.entityType || !['session', 'image', 'device', 'user', 'vehicle'].includes(req.entityType)) {
    errors.push({ field: 'entityType', message: 'Valid entity type required' });
  }

  if (!req.entityId || !isValidUUID(req.entityId)) {
    errors.push({ field: 'entityId', message: 'Valid entity ID required' });
  }

  if (!req.type || typeof req.type !== 'string') {
    errors.push({ field: 'type', message: 'Event type required' });
  }

  return { valid: errors.length === 0, errors };
}
