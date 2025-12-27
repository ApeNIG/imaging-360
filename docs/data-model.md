# Data Model

## Entity Relationship Diagram

```
┌──────────────────┐
│  organizations   │
│  ══════════════  │
│  id (PK)         │
│  name            │
│  slug (UNIQUE)   │
│  settings        │
└────────┬─────────┘
         │
         │ 1:N
         ▼
┌──────────────────┐       ┌──────────────────┐
│      sites       │       │      users       │
│  ══════════════  │       │  ══════════════  │
│  id (PK)         │       │  id (PK)         │
│  org_id (FK)     │◄──────│  org_id (FK)     │
│  name            │       │  email           │
│  slug            │       │  name            │
│  address         │       │  role            │
│  timezone        │       └────────┬─────────┘
└────────┬─────────┘                │
         │                          │
         │            ┌─────────────┴─────────────┐
         │            │    user_site_access       │
         │            │  ═══════════════════════  │
         │            │  user_id (FK, PK)         │
         └───────────►│  site_id (FK, PK)         │
                      └───────────────────────────┘
         │
         │ 1:N
         ▼
┌──────────────────┐       ┌──────────────────┐
│     vehicles     │       │     devices      │
│  ══════════════  │       │  ══════════════  │
│  id (PK)         │       │  id (PK)         │
│  org_id (FK)     │       │  org_id (FK)     │
│  site_id (FK)    │       │  site_id (FK)?   │
│  vin             │       │  platform        │
│  stock           │       │  model           │
│  meta            │       │  app_version     │
└────────┬─────────┘       │  last_seen       │
         │                 └──────────────────┘
         │
         │ 1:N
         ▼
┌──────────────────┐
│     sessions     │
│  ══════════════  │
│  id (PK)         │
│  org_id (FK)     │──────► denormalized
│  site_id (FK)    │──────► for query perf
│  vehicle_id (FK) │
│  operator_id (FK)│
│  device_id (FK)  │
│  mode            │
│  shot_list       │
│  status          │
│  started_at      │
│  completed_at    │
│  abandoned_at    │
└────────┬─────────┘
         │
         │ 1:N
         ▼
┌──────────────────┐
│     images       │
│  ══════════════  │
│  id (PK)         │
│  org_id (FK)     │──────► denormalized
│  site_id (FK)    │──────► for query perf
│  session_id (FK) │
│  vehicle_id (FK) │
│  angle_deg       │
│  shot_name       │
│  hash_sha256     │
│  phash           │
│  storage_key     │
│  thumb_keys      │
│  qc              │
│  qc_version      │
│  status          │
│  published_at    │
└──────────────────┘

┌──────────────────┐
│     events       │
│  ══════════════  │
│  id (PK)         │
│  org_id (FK)     │
│  entity_type     │
│  entity_id       │
│  type            │
│  actor_id        │
│  actor_type      │
│  message         │
│  meta            │
│  created_at      │
└──────────────────┘
```

---

## Schema Definition

### organizations

Tenant root. All data belongs to exactly one organization.

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Display name |
| slug | TEXT | URL-safe identifier, unique |
| settings | JSONB | Org-level configuration |

---

### sites

Physical locations within an organization.

```sql
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  address JSONB,
  timezone TEXT DEFAULT 'UTC',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE INDEX idx_sites_org ON sites(org_id);
```

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| org_id | UUID | Parent organization |
| name | TEXT | Display name |
| slug | TEXT | URL-safe identifier, unique within org |
| address | JSONB | `{ street, city, state, zip, country }` |
| timezone | TEXT | IANA timezone (e.g., `America/New_York`) |
| settings | JSONB | Site-level configuration |

---

### users

Human operators and reviewers. Scoped to organization.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'reviewer', 'operator')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, email)
);

CREATE INDEX idx_users_org ON users(org_id);
```

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| org_id | UUID | Parent organization |
| email | TEXT | Login email, unique within org |
| name | TEXT | Display name |
| role | TEXT | `admin`, `reviewer`, or `operator` |

**Role Permissions:**
- `operator`: Create sessions, capture images
- `reviewer`: Above + view all site sessions, publish images
- `admin`: Above + manage users, sites, settings

---

### user_site_access

Many-to-many: which sites a user can access.

```sql
CREATE TABLE user_site_access (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, site_id)
);
```

---

### devices

Mobile devices and edge hardware. Scoped to organization.

```sql
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  site_id UUID REFERENCES sites(id),
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'edge')),
  model TEXT,
  app_version TEXT,
  registered_at TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ
);

CREATE INDEX idx_devices_org ON devices(org_id);
CREATE INDEX idx_devices_site ON devices(site_id) WHERE site_id IS NOT NULL;
```

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| org_id | UUID | Parent organization |
| site_id | UUID | Optional assigned site |
| platform | TEXT | `ios`, `android`, or `edge` |
| model | TEXT | Device model (e.g., `iPhone 15 Pro`) |
| app_version | TEXT | App version string |
| last_seen | TIMESTAMPTZ | Last API activity |

---

### vehicles

Vehicles being photographed. Scoped to organization and site.

```sql
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  vin TEXT,
  stock TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, vin),
  UNIQUE (org_id, site_id, stock),
  CONSTRAINT chk_vehicle_identifier CHECK (vin IS NOT NULL OR stock IS NOT NULL)
);

CREATE INDEX idx_vehicles_org_site ON vehicles(org_id, site_id);
```

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| org_id | UUID | Parent organization |
| site_id | UUID | Location site |
| vin | TEXT | Vehicle Identification Number, unique within org |
| stock | TEXT | Stock number, unique within org+site |
| meta | JSONB | Additional metadata (make, model, year, etc.) |

**Constraint:** At least one of `vin` or `stock` must be provided.

---

### sessions

Capture sessions. Denormalized org_id/site_id for query performance.

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  mode TEXT NOT NULL CHECK (mode IN ('studio360', 'walk360', 'stills')),
  shot_list JSONB,
  operator_id UUID NOT NULL REFERENCES users(id),
  device_id UUID NOT NULL REFERENCES devices(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'complete', 'abandoned', 'failed')),
  abandoned_at TIMESTAMPTZ
);

CREATE INDEX idx_sessions_org_site ON sessions(org_id, site_id);
CREATE INDEX idx_sessions_vehicle ON sessions(vehicle_id);
CREATE INDEX idx_sessions_status ON sessions(org_id, status) WHERE status = 'active';
```

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| org_id | UUID | Denormalized from vehicle |
| site_id | UUID | Denormalized from vehicle |
| vehicle_id | UUID | Target vehicle |
| mode | TEXT | `studio360`, `walk360`, or `stills` |
| shot_list | JSONB | Capture configuration (see below) |
| operator_id | UUID | User performing capture |
| device_id | UUID | Device used for capture |
| status | TEXT | `active`, `complete`, `abandoned`, `failed` |
| abandoned_at | TIMESTAMPTZ | When session was abandoned (for cleanup) |

**shot_list JSONB Structure:**
```json
{
  "studio360": {
    "frame_count": 24,
    "angle_step": 15
  },
  "stills": [
    { "name": "front_3q", "required": true },
    { "name": "rear_3q", "required": true },
    { "name": "interior", "required": true },
    { "name": "dash", "required": false }
  ]
}
```

**Status State Machine:**
```
active → complete    (normal completion)
active → abandoned   (timeout or manual cancel)
active → failed      (unrecoverable error)
```

---

### images

Captured images. Denormalized org_id/site_id for query performance.

```sql
CREATE TABLE images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  session_id UUID NOT NULL REFERENCES sessions(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  angle_deg INT,
  shot_name TEXT,
  hash_sha256 CHAR(64) NOT NULL,
  phash BIGINT,
  width INT,
  height INT,
  exif JSONB,
  storage_key TEXT NOT NULL,
  thumb_keys JSONB,
  qc JSONB,
  qc_version INT DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'published')),
  created_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ,
  UNIQUE (org_id, hash_sha256)
);

CREATE INDEX idx_images_org_site ON images(org_id, site_id);
CREATE INDEX idx_images_session ON images(session_id);
CREATE INDEX idx_images_status ON images(org_id, status);
CREATE INDEX idx_images_phash ON images(org_id, phash) WHERE phash IS NOT NULL;
```

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| org_id | UUID | Denormalized from session |
| site_id | UUID | Denormalized from session |
| session_id | UUID | Parent session |
| vehicle_id | UUID | Denormalized from session |
| angle_deg | INT | Angle for 360 captures (0-345) |
| shot_name | TEXT | Shot name for stills (e.g., `front_3q`) |
| hash_sha256 | CHAR(64) | Content hash for deduplication |
| phash | BIGINT | Perceptual hash for near-duplicate detection |
| width | INT | Image width in pixels |
| height | INT | Image height in pixels |
| exif | JSONB | Extracted EXIF data |
| storage_key | TEXT | S3 object key |
| thumb_keys | JSONB | Thumbnail S3 keys by size |
| qc | JSONB | Quality check results |
| qc_version | INT | Algorithm version (for reprocessing) |
| status | TEXT | Processing status |
| published_at | TIMESTAMPTZ | When image was published |

**exif JSONB Structure:**
```json
{
  "iso": 100,
  "shutter": "1/250",
  "aperture": "f/1.8",
  "focal_length": "26mm",
  "timestamp": "2025-01-15T10:01:00Z",
  "camera_make": "Apple",
  "camera_model": "iPhone 15 Pro"
}
```

**thumb_keys JSONB Structure:**
```json
{
  "150": "org/.../uuid_thumb_150.jpg",
  "600": "org/.../uuid_thumb_600.jpg",
  "1200": "org/.../uuid_thumb_1200.jpg"
}
```

**qc JSONB Structure:**
```json
{
  "sharpness": {
    "score": 450,
    "status": "pass"
  },
  "exposure": {
    "status": "pass",
    "clipped_highlights": 0.2,
    "clipped_shadows": 0.1
  },
  "duplicate_of": null
}
```

**Status State Machine:**
```
pending → processing → processed → published
                   ↘→ failed
```

---

### events

Audit log and telemetry. Append-only.

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  type TEXT NOT NULL,
  actor_id UUID,
  actor_type TEXT CHECK (actor_type IN ('user', 'device', 'system')),
  message TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_events_org_entity ON events(org_id, entity_type, entity_id);
CREATE INDEX idx_events_org_created ON events(org_id, created_at DESC);
```

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| org_id | UUID | Parent organization |
| entity_type | TEXT | `session`, `image`, `device`, `user` |
| entity_id | UUID | Referenced entity |
| type | TEXT | Event type (see below) |
| actor_id | UUID | User or device that triggered event |
| actor_type | TEXT | `user`, `device`, or `system` |
| message | TEXT | Human-readable description |
| meta | JSONB | Additional context |

**Event Types:**
- `session_started`, `session_completed`, `session_abandoned`
- `upload_started`, `upload_complete`, `upload_failed`
- `processing_started`, `processing_complete`, `processing_failed`
- `qc_passed`, `qc_failed`
- `published`
- `offline`, `online`

---

## Row-Level Security

```sql
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Example policy (assumes app.current_org_id is set per connection)
CREATE POLICY org_isolation ON vehicles
  USING (org_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY org_isolation ON sessions
  USING (org_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY org_isolation ON images
  USING (org_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY org_isolation ON events
  USING (org_id = current_setting('app.current_org_id')::uuid);
```

---

## Indexes Summary

| Table | Index | Purpose |
|-------|-------|---------|
| sites | org_id | List sites by org |
| users | org_id | List users by org |
| devices | org_id | List devices by org |
| devices | site_id | List devices by site |
| vehicles | (org_id, site_id) | List vehicles by org+site |
| sessions | (org_id, site_id) | List sessions by org+site |
| sessions | vehicle_id | Sessions for vehicle |
| sessions | (org_id, status) | Active sessions by org |
| images | (org_id, site_id) | List images by org+site |
| images | session_id | Images for session |
| images | (org_id, status) | Images by processing status |
| images | (org_id, phash) | Near-duplicate detection |
| events | (org_id, entity_type, entity_id) | Events for entity |
| events | (org_id, created_at DESC) | Recent events |

---

## Migration Order

1. `organizations`
2. `sites`
3. `users`
4. `user_site_access`
5. `devices`
6. `vehicles`
7. `sessions`
8. `images`
9. `events`
10. Row-level security policies
11. Indexes
