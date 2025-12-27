# Sprint 1 — MVP Slice

**Duration:** 2 weeks
**Goal:** 24-frame studio spin captured and visible in portal in < 60s end-to-end

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Multi-tenant enforcement via JWT claims | Security-first; all endpoints enforce org_id scoping |
| D2 | Direct S3 upload with presigned URLs | Minimizes backend latency, leverages S3 events |
| D3 | QC limited to sharpness + exposure | Simplest viable QC for MVP |
| D4 | Offline-first mobile with local queue | Critical for field reliability |
| D5 | Portal polls every 3s (no WebSocket) | Simplest path to "live" for MVP |
| D6 | React Native for mobile | Faster MVP; can migrate to native for camera control later |
| D7 | Burst-best deferred to Sprint 2 | Reduces Sprint 1 scope |

---

## Infrastructure Workstream

### [INFRA-001] Provision Core AWS Resources
**Objective:** Set up foundational AWS infrastructure for MVP
**Acceptance Criteria:**
- [ ] S3 bucket created with `org/{org_id}/site/{site_id}/session/{session_id}/` prefix structure
- [ ] SQS queue created for image upload events
- [ ] S3 Event Notification configured to publish to SQS on `.jpg/.heic` uploads
- [ ] IAM role for workers with S3 read/write and SQS consume permissions
- [ ] IAM role for backend with S3 presign permissions (limited to uploads)
- [ ] Environment variables documented (bucket name, queue URL)

**Technical Context:** Use Terraform or CloudFormation for reproducibility.
**Dependencies:** None
**Estimate:** M

---

### [INFRA-002] Provision PostgreSQL Database
**Objective:** Deploy production-ready PostgreSQL instance with approved schema
**Acceptance Criteria:**
- [ ] PostgreSQL instance provisioned (RDS recommended)
- [ ] All tables from approved data model created via migration script
- [ ] Indexes created on: `org_id`, `site_id`, `session_id`, `vehicle_id`, `hash_sha256`
- [ ] Row-level security policies applied
- [ ] Connection string stored in secrets manager
- [ ] Backup retention configured (point-in-time recovery)

**Technical Context:** Use migration tool (Flyway, Prisma Migrate, or versioned SQL).
**Dependencies:** None
**Estimate:** M

---

### [INFRA-003] Set Up Worker Execution Environment
**Objective:** Deploy infrastructure for image processing workers
**Acceptance Criteria:**
- [ ] Worker execution environment provisioned (Lambda or ECS Fargate)
- [ ] SQS queue integrated as event source
- [ ] Dead-letter queue configured (3 retries before DLQ)
- [ ] Worker has access to S3 and PostgreSQL
- [ ] CloudWatch logs enabled
- [ ] Auto-scaling configured based on queue depth (if ECS)

**Technical Context:** Lambda timeout >= 60s. ECS memory >= 2GB for image processing.
**Dependencies:** INFRA-001, INFRA-002
**Estimate:** M

---

## Backend Workstream

### [BACKEND-001] Implement Database Access Layer
**Objective:** Create type-safe database client and core CRUD operations
**Acceptance Criteria:**
- [ ] Database connection pool configured with retry logic
- [ ] Type definitions for all entities
- [ ] Repository pattern implemented (Prisma, TypeORM, or raw SQL)
- [ ] Helper functions enforce `org_id` scoping on ALL queries
- [ ] Unit tests for query construction

**Technical Context:** All queries MUST include org_id in WHERE clause.
**Dependencies:** INFRA-002
**Estimate:** M

---

### [BACKEND-002] Implement Device Authentication
**Objective:** `POST /auth/device` endpoint for device enrollment and token refresh
**Acceptance Criteria:**
- [ ] Accepts `{ org_id, platform, model, app_version }`
- [ ] Creates or updates device record
- [ ] Returns JWT with claims: `{ device_id, org_id, role: 'device' }`
- [ ] JWT expiry: 30 days
- [ ] Updates `last_seen` timestamp
- [ ] Returns 400 for invalid org_id or missing fields
- [ ] Rate limiting: 100 req/min per IP

**Technical Context:** RS256 signing. Device tokens cannot access user-scoped endpoints.
**Dependencies:** BACKEND-001
**Estimate:** M

---

### [BACKEND-003] Implement User Authentication
**Objective:** `POST /auth/login` endpoint for user login with OIDC
**Acceptance Criteria:**
- [ ] Accepts OIDC token from configured provider
- [ ] Validates token signature and expiry
- [ ] Looks up user by email (org_id scoped)
- [ ] Fetches accessible `site_ids` from `user_site_access`
- [ ] Returns JWT with claims: `{ user_id, org_id, site_ids[], role }`
- [ ] JWT expiry: 8 hours
- [ ] Returns 401 for invalid token, 403 for user not in org

**Technical Context:** OIDC provider config via environment variable.
**Dependencies:** BACKEND-001
**Blocked By:** OIDC provider provisioning (Auth0 or Cognito)
**Estimate:** L

---

### [BACKEND-004] Implement Sessions API
**Objective:** Create, update, and query capture sessions
**Acceptance Criteria:**
- [ ] `POST /sessions` accepts `{ site_id, vehicle: { vin?, stock }, mode, shot_list? }`
- [ ] Validates user/device has access to site_id
- [ ] Creates vehicle record if not exists
- [ ] Creates session with `status='active'`, denormalized org_id/site_id
- [ ] `PATCH /sessions/{id}` accepts `{ status, completed_at?, abandoned_at? }`
- [ ] `GET /sessions/{id}` returns session with vehicle details
- [ ] `GET /sessions` returns sessions filtered by user's accessible site_ids
- [ ] Supports filters: `?site_id=`, `?status=`, `?vehicle_id=`
- [ ] Pagination via `?limit=` and `?offset=`
- [ ] All endpoints enforce org_id scoping

**Technical Context:** shot_list JSONB: `{ studio360: { frame_count: 24 }, stills: [...] }`
**Dependencies:** BACKEND-001, BACKEND-002 or BACKEND-003
**Estimate:** L

---

### [BACKEND-005] Implement Presign API
**Objective:** Generate presigned S3 upload URLs
**Acceptance Criteria:**
- [ ] `POST /presign` accepts `{ session_id, file_name, content_type, content_sha256 }`
- [ ] Validates session belongs to authenticated org
- [ ] Generates S3 presigned PUT URL with key: `org/{org_id}/site/{site_id}/session/{session_id}/{uuid}.{ext}`
- [ ] Presigned URL expires in 15 minutes
- [ ] Returns `{ upload_url, storage_key, headers }`
- [ ] Content-Type restricted to `image/jpeg`, `image/heic`
- [ ] Rate limiting: 500 req/min per device

**Technical Context:** Server owns path construction. Include session metadata in S3 object tags.
**Dependencies:** BACKEND-001, INFRA-001, BACKEND-002/003
**Estimate:** M

---

### [BACKEND-006] Implement Events Ingestion API
**Objective:** `POST /events` endpoint for telemetry and audit logging
**Acceptance Criteria:**
- [ ] Accepts `{ entity_type, entity_id, type, message?, meta? }`
- [ ] Accepts batch array of events
- [ ] Enriches with org_id, actor_id, actor_type from JWT
- [ ] Inserts into events table
- [ ] Returns 201 on success
- [ ] Validates entity_type enum
- [ ] Rate limiting: 1000 req/min per actor

**Technical Context:** Mobile batches events locally, sends every 30s or on reconnect.
**Dependencies:** BACKEND-001, BACKEND-002/003
**Estimate:** S

---

### [BACKEND-007] Implement Images API
**Objective:** Query and publish images
**Acceptance Criteria:**
- [ ] `GET /images?session_id={uuid}` returns images for session
- [ ] Returns: `{ id, angle_deg, shot_name, thumb_keys, qc, status, created_at }`
- [ ] Sorted by `angle_deg` (360) or `created_at` (stills)
- [ ] `POST /images/{id}/publish` sets `status='published'`, `published_at=now()`
- [ ] Validates image belongs to user's org
- [ ] Returns 404 if image not found or wrong org
- [ ] Filters by org_id from JWT

**Technical Context:** Portal polls this every 3s. Optimize with index on `(session_id, created_at)`.
**Dependencies:** BACKEND-001, BACKEND-003
**Estimate:** M

---

## Worker Workstream

### [WORKER-001] Implement SQS Event Consumer
**Objective:** Poll SQS and dispatch image processing jobs
**Acceptance Criteria:**
- [ ] Polls SQS for S3 upload events (long polling 20s)
- [ ] Parses S3 event to extract bucket, key, org_id, session_id
- [ ] Downloads image to temp storage
- [ ] Dispatches to processing pipeline
- [ ] Deletes SQS message on success
- [ ] Moves to DLQ after 3 retries
- [ ] Logs errors with full context
- [ ] Graceful shutdown (drain in-flight)

**Technical Context:** Parse org/site/session from S3 key prefix.
**Dependencies:** INFRA-001, INFRA-003
**Estimate:** M

---

### [WORKER-002] Implement Thumbnail Generator
**Objective:** Generate multi-size thumbnails
**Acceptance Criteria:**
- [ ] Generates 3 sizes: 150x150, 600x600, 1200x1200
- [ ] Maintains aspect ratio (center crop)
- [ ] Saves to S3: `{original_key}_thumb_{size}.jpg`
- [ ] Updates `images.thumb_keys` JSONB
- [ ] Extracts EXIF (ISO, shutter, aperture, timestamp) → `images.exif`
- [ ] Computes SHA-256 → `images.hash_sha256`
- [ ] Extracts width/height
- [ ] Handles HEIC and JPEG formats

**Technical Context:** Use sharp (Node) or Pillow (Python). HEIC via libheif. Quality: 85%.
**Dependencies:** WORKER-001
**Estimate:** L

---

### [WORKER-003] Implement QC Pipeline
**Objective:** Run sharpness and exposure quality checks
**Acceptance Criteria:**
- [ ] Sharpness: Laplacian variance on grayscale
- [ ] Thresholds: `<100` = fail, `100-300` = warn, `>300` = pass
- [ ] Exposure: Histogram analysis (`>5%` pure white/black = fail)
- [ ] Stores in `images.qc` JSONB: `{ sharpness: { score, status }, exposure: { status } }`
- [ ] Sets `images.qc_version = 1`
- [ ] Updates `images.status` to `'processed'` or `'failed'`

**Technical Context:** Thresholds configurable via env vars. Run on full-res image.
**Dependencies:** WORKER-002
**Estimate:** M

---

### [WORKER-004] Implement Deduplication Check
**Objective:** Detect duplicate images
**Acceptance Criteria:**
- [ ] Query for existing `hash_sha256` within same org_id
- [ ] If match, mark in `qc.duplicate_of`
- [ ] Compute perceptual hash (pHash) → `images.phash` (optional)
- [ ] Log event if duplicate detected
- [ ] Does not block processing (informational only)

**Technical Context:** Exact hash is must-have. pHash is nice-to-have for Sprint 1.
**Dependencies:** WORKER-002
**Estimate:** S

---

### [WORKER-005] Implement Image Record Creation
**Objective:** Create database record for processed image
**Acceptance Criteria:**
- [ ] After pipeline completes, insert into images table
- [ ] Populate: org_id, site_id, session_id, vehicle_id (from session)
- [ ] Parse angle_deg or shot_name from S3 key or metadata
- [ ] Set status based on QC result
- [ ] Handle race condition (upsert on hash conflict)
- [ ] Transaction ensures atomicity

**Technical Context:** Lookup session to get vehicle_id, org_id, site_id.
**Dependencies:** WORKER-003, BACKEND-001
**Estimate:** M

---

## Mobile Workstream

### [MOBILE-001] Set Up React Native Project
**Objective:** Initialize cross-platform mobile project
**Acceptance Criteria:**
- [ ] React Native project created (Expo or bare workflow)
- [ ] Environment config for dev/staging/prod API endpoints
- [ ] JWT storage using secure storage (Keychain/Keystore)
- [ ] Navigation: Login → Session Setup → Capture → Review
- [ ] API client with auth interceptor
- [ ] Build pipeline for local dev and CI
- [ ] Native camera module placeholder for future migration

**Technical Context:** React Native for MVP speed. Native camera modules can be added later.
**Dependencies:** BACKEND-002
**Estimate:** L

---

### [MOBILE-002] Implement Device Authentication Flow
**Objective:** Register device and obtain auth token
**Acceptance Criteria:**
- [ ] On first launch, call `POST /auth/device`
- [ ] Store JWT securely
- [ ] Check token expiry on launch, refresh if needed
- [ ] Handle 401 by re-authenticating
- [ ] Display error UI on auth failure
- [ ] org_id from config (MVP: single org)

**Technical Context:** Device ID persists across reinstalls if possible.
**Dependencies:** MOBILE-001, BACKEND-002
**Estimate:** M

---

### [MOBILE-003] Implement Session Creation UI
**Objective:** UI for operator to start capture session
**Acceptance Criteria:**
- [ ] Form: VIN or Stock Number (at least one required)
- [ ] Mode selector: Studio 360 or Stills
- [ ] Studio 360: shows 24 frames at 15° intervals
- [ ] Stills: shows preset shot names
- [ ] Create button → `POST /sessions`
- [ ] Navigate to capture on success
- [ ] Display validation errors

**Technical Context:** site_id hardcoded for MVP single-site.
**Dependencies:** MOBILE-002, BACKEND-004
**Estimate:** M

---

### [MOBILE-004] Implement Studio 360 Capture Mode
**Objective:** Guided 24-frame 360° capture
**Acceptance Criteria:**
- [ ] Fullscreen camera preview with angle overlay (0°-345°)
- [ ] Exposure and white balance locked after first frame
- [ ] Shutter button triggers capture
- [ ] Visual/haptic feedback on capture
- [ ] Progress: X/24 frames
- [ ] Frames stored locally with angle metadata
- [ ] Auto-advance to next angle
- [ ] Done button after 24 frames

**Technical Context:** Exposure/WB lock requires native camera API module.
**Dependencies:** MOBILE-003
**Blocked By:** Native camera module for exposure lock
**Estimate:** XL

---

### [MOBILE-005] Implement Stills Capture Mode
**Objective:** Checklist-driven stills capture
**Acceptance Criteria:**
- [ ] Display checklist from shot_list
- [ ] Camera preview with shot name overlay
- [ ] Exposure/WB can reset between shots
- [ ] Shutter captures image
- [ ] Shot checked off after capture
- [ ] Tap checklist to navigate to shot
- [ ] Done enabled when required shots complete

**Technical Context:** shot_list defines required vs optional.
**Dependencies:** MOBILE-003
**Estimate:** L

---

### [MOBILE-006] Implement Image Upload Queue
**Objective:** Upload images with offline resilience
**Acceptance Criteria:**
- [ ] After capture, request presigned URL from `POST /presign`
- [ ] Upload to S3 using presigned URL
- [ ] If offline, queue locally
- [ ] Background task retries when online
- [ ] Upload progress in UI (spinner/badge)
- [ ] Mark uploaded on S3 200 response
- [ ] Queue persists across restarts
- [ ] Telemetry event on success/failure

**Technical Context:** Background fetch (iOS) or WorkManager (Android). SQLite queue.
**Dependencies:** MOBILE-004 or MOBILE-005, BACKEND-005
**Estimate:** XL

---

## Portal Workstream

### [PORTAL-001] Set Up Portal Project
**Objective:** Initialize React portal with auth
**Acceptance Criteria:**
- [ ] React app created (Vite)
- [ ] Routing: `/login`, `/sessions`, `/sessions/:id`
- [ ] OIDC auth integrated (same provider as backend)
- [ ] JWT stored and attached to requests
- [ ] API client with base URL from env
- [ ] Protected routes redirect to login

**Technical Context:** Use react-router. OIDC library: oidc-client-ts.
**Dependencies:** BACKEND-003
**Blocked By:** OIDC provider provisioning
**Estimate:** M

---

### [PORTAL-002] Implement Session List View
**Objective:** Display capture sessions
**Acceptance Criteria:**
- [ ] Fetches via `GET /sessions`
- [ ] Table: Vehicle, Mode, Operator, Site, Status, Started At
- [ ] Filter by site_id dropdown
- [ ] Click row → `/sessions/:id`
- [ ] Active sessions at top
- [ ] Refresh button

**Technical Context:** Filter by user's accessible site_ids from JWT.
**Dependencies:** PORTAL-001, BACKEND-004
**Estimate:** M

---

### [PORTAL-003] Implement Session Detail Gallery
**Objective:** Live-updating image gallery
**Acceptance Criteria:**
- [ ] Fetch session via `GET /sessions/:id`
- [ ] Display vehicle info
- [ ] Poll `GET /images?session_id=` every 3s while active
- [ ] Grid of 600px thumbnails
- [ ] QC badges: green (pass), yellow (warn), red (fail)
- [ ] Click thumbnail → lightbox (1200px)
- [ ] Stop polling when session complete

**Technical Context:** Clear interval on unmount.
**Dependencies:** PORTAL-001, BACKEND-007, WORKER-002
**Estimate:** L

---

### [PORTAL-004] Implement 360 Viewer
**Objective:** Interactive 360° viewer
**Acceptance Criteria:**
- [ ] Toggle: Gallery ↔ 360 View
- [ ] Images in circular sequence by angle_deg
- [ ] Click-drag or arrow keys to rotate
- [ ] Auto-play at 2 FPS
- [ ] Current angle indicator
- [ ] Highlight missing frames (gaps)
- [ ] QC status visible

**Technical Context:** Library or custom with image preloading.
**Dependencies:** PORTAL-003, BACKEND-007
**Estimate:** L

---

### [PORTAL-005] Implement Publish Toggle
**Objective:** Allow reviewers to publish images
**Acceptance Criteria:**
- [ ] Checkbox/button per image for publish
- [ ] Calls `POST /images/:id/publish`
- [ ] Published badge with timestamp
- [ ] Bulk publish for all passed images
- [ ] Role check: reviewer or admin only
- [ ] Error display on failure

**Technical Context:** Role from JWT claims + server enforcement.
**Dependencies:** PORTAL-003, BACKEND-007
**Estimate:** M

---

## Integration Tests

### [INTEG-001] End-to-End Smoke Test
**Objective:** Validate 60-second exit criteria
**Acceptance Criteria:**
- [ ] 24-frame studio 360 captured
- [ ] All 24 images uploaded within 10s of completion
- [ ] Workers process all within 50s
- [ ] Portal shows all 24 with QC badges within 60s
- [ ] No images stuck in 'pending'
- [ ] QC correctly identifies sharp vs blurry test images
- [ ] Repeat on 3G throttled network

**Dependencies:** All tickets
**Estimate:** M

---

### [INTEG-002] Offline Resilience Test
**Objective:** Validate offline capture and auto-upload
**Acceptance Criteria:**
- [ ] Capture with network disabled
- [ ] All images queued locally
- [ ] Network re-enabled → uploads within 2 min
- [ ] Portal reflects all images
- [ ] No data loss
- [ ] Events include offline/online transitions
- [ ] Test queue persistence across app kill

**Dependencies:** MOBILE-006, all backend/worker tickets
**Estimate:** M

---

## Dependencies Graph

```
INFRA-001 ─┬─→ INFRA-003 ─→ WORKER-001 ─→ WORKER-002 ─→ WORKER-003 ─→ WORKER-005
           │                                              ↓
INFRA-002 ─┴─→ BACKEND-001 ─┬─→ BACKEND-002 ─→ MOBILE-001 ─→ MOBILE-002 ─→ MOBILE-003
                            │        ↓                                         ↓
                            ├─→ BACKEND-003 ─→ PORTAL-001 ─→ PORTAL-002    MOBILE-004/005
                            │                       ↓                          ↓
                            ├─→ BACKEND-004 ────────┴──────────────────→ MOBILE-006
                            │                                               ↓
                            ├─→ BACKEND-005 ────────────────────────────────┘
                            │
                            ├─→ BACKEND-006
                            │
                            └─→ BACKEND-007 ─→ PORTAL-003 ─→ PORTAL-004
                                                   ↓
                                              PORTAL-005
```

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Camera exposure lock unavailable in RN | Medium | Degraded quality | Budget native module dev in MOBILE-004 |
| 60s target unachievable on slow networks | Medium | Fails acceptance | Early testing with throttling; may relax to "healthy network" |
| Worker latency exceeds budget | Medium | Misses 60s target | 2GB+ Lambda memory; consider lazy thumbnails |
| Multi-tenant data leakage | Low | Critical breach | Code review checklist; RLS policies |
| OIDC provider delay | Medium | Blocks portal | Provision immediately |

---

## Deferred to Sprint 2

- [MOBILE-007] Burst-and-Best Selection
- Walk360 mode with AR guidance
- Background removal / plate masking
- WebSocket for real-time portal updates
- Replace/reshoot flow
- Publish webhooks

---

## Next Actions

1. **Provision OIDC provider** (Auth0 or Cognito) — unblocks BACKEND-003 + PORTAL-001
2. **Start infrastructure tickets** (INFRA-001, INFRA-002, INFRA-003) — no blockers
3. **Start BACKEND-001** after INFRA-002 completes
4. **Assign engineers by workstream**
5. **Research React Native camera modules** for exposure lock feasibility
