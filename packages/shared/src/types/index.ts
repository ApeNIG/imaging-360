// ============================================================================
// Core Entity Types
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Site {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  address?: SiteAddress;
  timezone: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SiteAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface User {
  id: string;
  orgId: string;
  email: string;
  name?: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'admin' | 'reviewer' | 'operator';

export interface Device {
  id: string;
  orgId: string;
  siteId?: string;
  platform: Platform;
  model?: string;
  appVersion?: string;
  registeredAt: Date;
  lastSeen?: Date;
}

export type Platform = 'ios' | 'android' | 'edge';

export interface Vehicle {
  id: string;
  orgId: string;
  siteId: string;
  vin?: string;
  stock?: string;
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  orgId: string;
  siteId: string;
  vehicleId: string;
  mode: CaptureMode;
  shotList?: ShotList;
  operatorId: string;
  deviceId: string;
  startedAt: Date;
  completedAt?: Date;
  status: SessionStatus;
  abandonedAt?: Date;
}

export type CaptureMode = 'studio360' | 'walk360' | 'stills';
export type SessionStatus = 'active' | 'complete' | 'abandoned' | 'failed';

export interface ShotList {
  studio360?: {
    frameCount: number;
    angleStep?: number;
  };
  stills?: StillShot[];
}

export interface StillShot {
  name: string;
  required: boolean;
}

export interface Image {
  id: string;
  orgId: string;
  siteId: string;
  sessionId: string;
  vehicleId: string;
  angleDeg?: number;
  shotName?: string;
  hashSha256: string;
  phash?: string;
  width?: number;
  height?: number;
  exif?: ImageExif;
  storageKey: string;
  thumbKeys?: ThumbKeys;
  qc?: QCResult;
  qcVersion: number;
  status: ImageStatus;
  createdAt: Date;
  publishedAt?: Date;
}

export type ImageStatus = 'pending' | 'processing' | 'processed' | 'failed' | 'published';

export interface ImageExif {
  iso?: number;
  shutter?: string;
  aperture?: string;
  focalLength?: string;
  timestamp?: Date;
  cameraMake?: string;
  cameraModel?: string;
}

export interface ThumbKeys {
  '150'?: string;
  '600'?: string;
  '1200'?: string;
}

export interface QCResult {
  sharpness?: {
    score: number;
    status: QCStatus;
  };
  exposure?: {
    status: QCStatus;
    clippedHighlights?: number;
    clippedShadows?: number;
  };
  duplicateOf?: string;
}

export type QCStatus = 'pass' | 'warn' | 'fail';

export interface Event {
  id: string;
  orgId: string;
  entityType: EntityType;
  entityId: string;
  type: EventType;
  actorId?: string;
  actorType?: ActorType;
  message?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

export type EntityType = 'session' | 'image' | 'device' | 'user' | 'vehicle';
export type ActorType = 'user' | 'device' | 'system';
export type EventType =
  | 'session_started'
  | 'session_completed'
  | 'session_abandoned'
  | 'upload_started'
  | 'upload_complete'
  | 'upload_failed'
  | 'processing_started'
  | 'processing_complete'
  | 'processing_failed'
  | 'qc_passed'
  | 'qc_failed'
  | 'published'
  | 'offline'
  | 'online';

// ============================================================================
// API Request/Response Types
// ============================================================================

// Auth
export interface DeviceAuthRequest {
  orgId: string;
  platform: Platform;
  model: string;
  appVersion: string;
}

export interface DeviceAuthResponse {
  deviceId: string;
  accessToken: string;
  expiresIn: number;
}

export interface UserLoginRequest {
  idToken: string;
}

export interface UserLoginResponse {
  userId: string;
  accessToken: string;
  expiresIn: number;
}

// Sessions
export interface CreateSessionRequest {
  siteId: string;
  vehicle: {
    vin?: string;
    stock?: string;
  };
  mode: CaptureMode;
  shotList?: ShotList;
}

export interface UpdateSessionRequest {
  status?: SessionStatus;
  completedAt?: Date;
}

export interface SessionListParams {
  siteId?: string;
  status?: SessionStatus;
  vehicleId?: string;
  limit?: number;
  offset?: number;
}

export interface SessionWithDetails extends Session {
  vehicle: Vehicle;
  operator?: Pick<User, 'id' | 'name'>;
  site?: Pick<Site, 'id' | 'name'>;
  imageCount?: number;
}

// Presign
export interface PresignRequest {
  sessionId: string;
  fileName: string;
  contentType: 'image/jpeg' | 'image/heic';
  contentSha256: string;
}

export interface PresignResponse {
  uploadUrl: string;
  storageKey: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

// Images
export interface ImageListParams {
  sessionId: string;
  status?: ImageStatus;
}

export interface PublishResponse {
  id: string;
  status: 'published';
  publishedAt: Date;
}

// Events
export interface CreateEventRequest {
  entityType: EntityType;
  entityId: string;
  type: EventType;
  message?: string;
  meta?: Record<string, unknown>;
}

export interface BatchEventsRequest {
  events: CreateEventRequest[];
}

// ============================================================================
// JWT Claims
// ============================================================================

export interface DeviceJwtPayload {
  sub: string; // device_id
  orgId: string;
  role: 'device';
  exp: number;
  iat: number;
}

export interface UserJwtPayload {
  sub: string; // user_id
  orgId: string;
  siteIds: string[];
  role: UserRole;
  exp: number;
  iat: number;
}

export type JwtPayload = DeviceJwtPayload | UserJwtPayload;

// ============================================================================
// API Response Wrappers
// ============================================================================

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
}

// ============================================================================
// Worker Types
// ============================================================================

export interface S3EventRecord {
  bucket: string;
  key: string;
  size: number;
  etag: string;
}

export interface ProcessingJob {
  imageKey: string;
  orgId: string;
  siteId: string;
  sessionId: string;
  contentType: string;
}

export interface ProcessingResult {
  status: 'success' | 'failed';
  imageId?: string;
  error?: string;
  thumbnails?: ThumbKeys;
  qc?: QCResult;
}
