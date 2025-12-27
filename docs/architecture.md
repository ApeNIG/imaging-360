# Architecture

## System Overview

360 Imaging is a vehicle photography platform with three primary components:

1. **Mobile App** — iOS/Android capture for studio360, walk360, stills
2. **Backend API** — Auth, sessions, presigned uploads, event ingestion
3. **Processing Pipeline** — Thumbnails, QC, deduplication, masking

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │     │     Portal      │     │    Webhooks     │
│  (React Native) │     │    (React)      │     │   (External)    │
└────────┬────────┘     └────────┬────────┘     └────────▲────────┘
         │                       │                       │
         │ REST + Presign        │ REST                  │
         ▼                       ▼                       │
┌─────────────────────────────────────────────────────────────────┐
│                         Backend API                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │   Auth   │ │ Sessions │ │  Presign │ │  Images  │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌──────────┐    ┌──────────┐    ┌──────────┐
       │ Postgres │    │    S3    │    │   SQS    │
       └──────────┘    └────┬─────┘    └────┬─────┘
                            │               │
                            │ S3 Event      │
                            └───────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Worker Pipeline   │
                         │ ┌─────┐ ┌────┐ ┌───┐│
                         │ │Thumb│→│ QC │→│DB ││
                         │ └─────┘ └────┘ └───┘│
                         └─────────────────────┘
```

## Component Responsibilities

### Mobile App
- Camera capture with exposure/WB lock
- Burst capture and local frame selection
- Offline queue with automatic retry
- Direct S3 upload via presigned URLs
- Telemetry event emission

### Backend API
- Device and user authentication (JWT)
- Session lifecycle management
- Presigned URL generation (server owns path)
- Event ingestion for audit trail
- Image query and publish endpoints

### Processing Pipeline
- SQS-triggered workers
- Thumbnail generation (150, 600, 1200px)
- QC: sharpness (Laplacian variance), exposure (histogram)
- Deduplication via SHA-256 and pHash
- Database record creation

### Portal
- Session list and detail views
- Real-time gallery (3s polling)
- 360 viewer with angle navigation
- QC badge display
- Publish workflow

## Multi-Tenancy

All data is scoped to `org_id`. Site-specific resources also require `site_id`.

```
Organization
    └── Site(s)
        └── Vehicle(s)
            └── Session(s)
                └── Image(s)
```

**Enforcement layers:**
1. JWT claims include `org_id` and `site_ids[]`
2. All queries filter by `org_id`
3. Row-level security policies in PostgreSQL
4. S3 paths prefixed with `org/{org_id}/site/{site_id}/`

## Upload Flow

```
1. Mobile: POST /presign { session_id, file_name, content_type, content_sha256 }
2. Backend: Validate session ownership, generate S3 presigned PUT URL
3. Backend: Return { upload_url, storage_key }
4. Mobile: PUT to S3 with presigned URL
5. S3: Emit event to SQS on successful upload
6. Worker: Poll SQS, download image, process
7. Worker: Generate thumbnails, run QC, insert DB record
8. Portal: Poll GET /images, display with QC badges
```

## Offline Strategy

Mobile app uses local SQLite queue:

```
State Machine:
  captured → queued → uploading → confirmed
                 ↓
              failed → retry (exponential backoff)
```

- Queue persists across app restarts
- Background task monitors network
- Retries with exponential backoff (max 5 attempts)
- Events logged for offline/online transitions

## Storage Layout

```
s3://imaging-{env}/
  org/{org_id}/
    site/{site_id}/
      session/{session_id}/
        {uuid}.jpg                    # Original upload
        {uuid}_thumb_150.jpg          # Thumbnails
        {uuid}_thumb_600.jpg
        {uuid}_thumb_1200.jpg

  originals-restricted/               # Future: raw/HEIF with tighter IAM
    org/{org_id}/...
```

## Security Model

### Authentication
- **Devices**: JWT with 30-day expiry, `role: 'device'`
- **Users**: OIDC → JWT with 8-hour expiry, includes `site_ids[]`

### Authorization
- Devices can: create sessions, presign uploads, emit events
- Operators can: above + view own sessions
- Reviewers can: view all site sessions, publish images
- Admins can: all operations within org

### Presigned URLs
- 15-minute expiry
- Scoped to exact object key
- Content-type restricted to `image/jpeg`, `image/heic`
- SHA-256 validation

## Technology Stack

| Component | Technology |
|-----------|------------|
| Mobile | React Native (Expo or bare) |
| Backend | Node.js + Express (or Fastify) |
| Database | PostgreSQL (RDS) |
| Storage | S3 |
| Queue | SQS |
| Workers | Lambda or ECS Fargate |
| Portal | React + Vite |
| Auth | OIDC (Auth0 or Cognito) |
| IaC | Terraform or CloudFormation |

## Performance Targets

| Metric | Target |
|--------|--------|
| Capture → Thumbnail visible | < 10s P50 |
| Capture → Portal visible | < 60s P50 |
| Upload retry on reconnect | < 2 min |
| QC processing per image | < 5s |

## Future Considerations (Sprint 2+)

- WebSocket for real-time portal updates
- Walk360 AR guidance with IMU integration
- Background removal (rembg) pipeline stage
- Plate/face masking for privacy
- BLE turntable control
- Publish webhooks to external systems
