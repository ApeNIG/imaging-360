import { describe, it, expect } from 'vitest';
import {
  isValidUUID,
  isValidVIN,
  isValidEmail,
  isValidContentType,
  isValidSHA256,
  validateCreateSession,
  validatePresignRequest,
  validateCreateEvent,
} from './validation.js';

describe('Validation Helpers', () => {
  describe('isValidUUID', () => {
    it('should accept valid UUIDv4', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    });

    it('should accept UUIDv1-v5', () => {
      // v1
      expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
      // v4
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      // v5
      expect(isValidUUID('886313e1-3b8a-5372-9b90-0c9aee199e5d')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false); // too short
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false); // too long
      expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false); // no dashes
      expect(isValidUUID('gggggggg-gggg-4ggg-8ggg-gggggggggggg')).toBe(false); // invalid chars
    });

    it('should reject UUIDs with invalid version digit', () => {
      // Version must be 1-5 (third group first char)
      expect(isValidUUID('550e8400-e29b-61d4-a716-446655440000')).toBe(false); // v6 invalid
      expect(isValidUUID('550e8400-e29b-01d4-a716-446655440000')).toBe(false); // v0 invalid
    });
  });

  describe('isValidVIN', () => {
    it('should accept valid VINs', () => {
      expect(isValidVIN('1HGBH41JXMN109186')).toBe(true);
      expect(isValidVIN('5YJSA1E22HF190923')).toBe(true); // Tesla
      expect(isValidVIN('WVWZZZ3CZWE123456')).toBe(true); // VW
    });

    it('should be case insensitive', () => {
      expect(isValidVIN('1hgbh41jxmn109186')).toBe(true);
      expect(isValidVIN('1HGBH41JXMN109186')).toBe(true);
    });

    it('should reject VINs with I, O, Q (ambiguous chars)', () => {
      expect(isValidVIN('1HGBH41IXMN109186')).toBe(false); // I
      expect(isValidVIN('1HGBH41OXMN109186')).toBe(false); // O
      expect(isValidVIN('1HGBH41QXMN109186')).toBe(false); // Q
    });

    it('should reject VINs with wrong length', () => {
      expect(isValidVIN('')).toBe(false);
      expect(isValidVIN('1HGBH41JXMN10918')).toBe(false); // 16 chars
      expect(isValidVIN('1HGBH41JXMN1091867')).toBe(false); // 18 chars
    });

    it('should reject VINs with invalid characters', () => {
      expect(isValidVIN('1HGBH41JXMN10918!')).toBe(false);
      expect(isValidVIN('1HGBH41JXMN10918 ')).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('should accept valid emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('user.name@example.com')).toBe(true);
      expect(isValidEmail('user+tag@example.co.uk')).toBe(true);
      expect(isValidEmail('a@b.co')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user@example')).toBe(false);
      expect(isValidEmail('user @example.com')).toBe(false); // space
    });
  });

  describe('isValidContentType', () => {
    it('should accept allowed content types', () => {
      expect(isValidContentType('image/jpeg')).toBe(true);
      expect(isValidContentType('image/heic')).toBe(true);
    });

    it('should reject disallowed content types', () => {
      expect(isValidContentType('image/png')).toBe(false);
      expect(isValidContentType('image/gif')).toBe(false);
      expect(isValidContentType('image/webp')).toBe(false);
      expect(isValidContentType('application/json')).toBe(false);
      expect(isValidContentType('')).toBe(false);
    });
  });

  describe('isValidSHA256', () => {
    it('should accept valid SHA-256 hashes', () => {
      expect(isValidSHA256('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe(true);
      expect(isValidSHA256('E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855')).toBe(true);
    });

    it('should reject invalid SHA-256 hashes', () => {
      expect(isValidSHA256('')).toBe(false);
      expect(isValidSHA256('e3b0c44298fc1c149afbf4c8996fb92427ae41e4')).toBe(false); // too short
      expect(isValidSHA256('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85500')).toBe(false); // too long
      expect(isValidSHA256('g3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe(false); // invalid char g
    });
  });
});

describe('Request Validation', () => {
  describe('validateCreateSession', () => {
    const validRequest = {
      siteId: '550e8400-e29b-41d4-a716-446655440000',
      vehicle: { vin: '1HGBH41JXMN109186' },
      mode: 'studio360',
    };

    it('should validate correct request', () => {
      const result = validateCreateSession(validRequest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept request with stock instead of VIN', () => {
      const result = validateCreateSession({
        ...validRequest,
        vehicle: { stock: 'STK12345' },
      });
      expect(result.valid).toBe(true);
    });

    it('should accept request with both VIN and stock', () => {
      const result = validateCreateSession({
        ...validRequest,
        vehicle: { vin: '1HGBH41JXMN109186', stock: 'STK12345' },
      });
      expect(result.valid).toBe(true);
    });

    it('should accept all valid capture modes', () => {
      expect(validateCreateSession({ ...validRequest, mode: 'studio360' }).valid).toBe(true);
      expect(validateCreateSession({ ...validRequest, mode: 'walk360' }).valid).toBe(true);
      expect(validateCreateSession({ ...validRequest, mode: 'stills' }).valid).toBe(true);
    });

    it('should reject missing siteId', () => {
      const result = validateCreateSession({
        vehicle: { vin: '1HGBH41JXMN109186' },
        mode: 'studio360',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'siteId' })
      );
    });

    it('should reject invalid siteId format', () => {
      const result = validateCreateSession({
        ...validRequest,
        siteId: 'not-a-uuid',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'siteId' })
      );
    });

    it('should reject missing vehicle', () => {
      const result = validateCreateSession({
        siteId: validRequest.siteId,
        mode: 'studio360',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'vehicle' })
      );
    });

    it('should reject vehicle without VIN or stock', () => {
      const result = validateCreateSession({
        ...validRequest,
        vehicle: {},
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'vehicle' })
      );
    });

    it('should reject invalid VIN format', () => {
      const result = validateCreateSession({
        ...validRequest,
        vehicle: { vin: 'INVALID' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'vehicle.vin' })
      );
    });

    it('should reject invalid capture mode', () => {
      const result = validateCreateSession({
        ...validRequest,
        mode: 'invalid-mode',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'mode' })
      );
    });

    it('should reject missing mode', () => {
      const result = validateCreateSession({
        siteId: validRequest.siteId,
        vehicle: validRequest.vehicle,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'mode' })
      );
    });

    it('should collect multiple errors', () => {
      const result = validateCreateSession({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('validatePresignRequest', () => {
    const validRequest = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      contentSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };

    it('should validate correct request', () => {
      const result = validatePresignRequest(validRequest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept HEIC content type', () => {
      const result = validatePresignRequest({
        ...validRequest,
        contentType: 'image/heic',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject missing sessionId', () => {
      const { sessionId, ...rest } = validRequest;
      const result = validatePresignRequest(rest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'sessionId' })
      );
    });

    it('should reject invalid sessionId format', () => {
      const result = validatePresignRequest({
        ...validRequest,
        sessionId: 'not-a-uuid',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'sessionId' })
      );
    });

    it('should reject missing fileName', () => {
      const result = validatePresignRequest({
        ...validRequest,
        fileName: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'fileName' })
      );
    });

    it('should reject invalid content type', () => {
      const result = validatePresignRequest({
        ...validRequest,
        contentType: 'image/png',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'contentType' })
      );
    });

    it('should reject invalid SHA-256 hash', () => {
      const result = validatePresignRequest({
        ...validRequest,
        contentSha256: 'invalid-hash',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'contentSha256' })
      );
    });
  });

  describe('validateCreateEvent', () => {
    const validRequest = {
      entityType: 'session',
      entityId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'session_started',
    };

    it('should validate correct request', () => {
      const result = validateCreateEvent(validRequest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept all valid entity types', () => {
      const entityTypes = ['session', 'image', 'device', 'user', 'vehicle'];
      for (const entityType of entityTypes) {
        const result = validateCreateEvent({ ...validRequest, entityType });
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid entity type', () => {
      const result = validateCreateEvent({
        ...validRequest,
        entityType: 'invalid',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'entityType' })
      );
    });

    it('should reject missing entityType', () => {
      const { entityType, ...rest } = validRequest;
      const result = validateCreateEvent(rest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'entityType' })
      );
    });

    it('should reject invalid entityId format', () => {
      const result = validateCreateEvent({
        ...validRequest,
        entityId: 'not-a-uuid',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'entityId' })
      );
    });

    it('should reject missing type', () => {
      const { type, ...rest } = validRequest;
      const result = validateCreateEvent(rest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'type' })
      );
    });

    it('should accept any string as event type', () => {
      const result = validateCreateEvent({
        ...validRequest,
        type: 'custom_event_type',
      });
      expect(result.valid).toBe(true);
    });
  });
});
