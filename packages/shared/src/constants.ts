// ============================================================================
// API Constants
// ============================================================================

export const API_VERSION = 'v1';

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
} as const;

// ============================================================================
// Auth Constants
// ============================================================================

export const JWT_EXPIRY = {
  DEVICE: 30 * 24 * 60 * 60, // 30 days in seconds
  USER: 8 * 60 * 60, // 8 hours in seconds
} as const;

export const PRESIGN_EXPIRY_SECONDS = 15 * 60; // 15 minutes

// ============================================================================
// Rate Limits (requests per minute)
// ============================================================================

export const RATE_LIMITS = {
  AUTH_DEVICE: 100,
  PRESIGN: 500,
  EVENTS: 1000,
  DEFAULT: 300,
} as const;

// ============================================================================
// Storage Constants
// ============================================================================

export const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/heic'] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export const THUMBNAIL_SIZES = [150, 600, 1200] as const;
export type ThumbnailSize = (typeof THUMBNAIL_SIZES)[number];

export const STORAGE_PATHS = {
  original: (orgId: string, siteId: string, sessionId: string, filename: string) =>
    `org/${orgId}/site/${siteId}/session/${sessionId}/${filename}`,
  thumbnail: (orgId: string, siteId: string, sessionId: string, filename: string, size: ThumbnailSize) =>
    `org/${orgId}/site/${siteId}/session/${sessionId}/thumbs/${filename}_${size}.jpg`,
} as const;

// ============================================================================
// QC Constants
// ============================================================================

export const QC_THRESHOLDS = {
  SHARPNESS: {
    FAIL: 100,
    WARN: 300,
    // Above 300 is pass
  },
  EXPOSURE: {
    CLIPPING_THRESHOLD: 0.05, // 5% pixels clipped = fail
  },
} as const;

export const QC_VERSION = 1;

// ============================================================================
// Session Constants
// ============================================================================

export const DEFAULT_SHOT_LIST = {
  studio360: {
    frameCount: 24,
    angleStep: 15,
  },
  stills: [
    { name: 'front_3q', required: true },
    { name: 'rear_3q', required: true },
    { name: 'driver_side', required: true },
    { name: 'passenger_side', required: true },
    { name: 'interior_front', required: true },
    { name: 'interior_rear', required: true },
    { name: 'dash', required: true },
    { name: 'wheels', required: false },
    { name: 'engine', required: false },
    { name: 'trunk', required: false },
  ],
} as const;

export const SESSION_TIMEOUT_HOURS = 24;

// ============================================================================
// Polling Constants
// ============================================================================

export const PORTAL_POLL_INTERVAL_MS = 3000; // 3 seconds

// ============================================================================
// Mobile Constants
// ============================================================================

export const UPLOAD_RETRY = {
  MAX_ATTEMPTS: 5,
  INITIAL_DELAY_MS: 1000,
  MAX_DELAY_MS: 30000,
  BACKOFF_MULTIPLIER: 2,
} as const;

export const BURST_CAPTURE = {
  FRAME_COUNT: 5,
  INTERVAL_MS: 100,
} as const;
