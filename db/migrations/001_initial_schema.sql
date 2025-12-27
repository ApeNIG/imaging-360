-- Migration: 001_initial_schema
-- Description: Initial database schema for 360 Imaging platform
-- Created: 2025-01-15

BEGIN;

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE organizations IS 'Tenant root. All data belongs to exactly one organization.';
COMMENT ON COLUMN organizations.slug IS 'URL-safe identifier, must be unique';
COMMENT ON COLUMN organizations.settings IS 'Org-level configuration (QC thresholds, features, etc.)';

-- ============================================================================
-- SITES
-- ============================================================================

CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
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

COMMENT ON TABLE sites IS 'Physical locations within an organization';
COMMENT ON COLUMN sites.address IS 'JSON: { street, city, state, zip, country }';
COMMENT ON COLUMN sites.timezone IS 'IANA timezone identifier (e.g., America/New_York)';

-- ============================================================================
-- USERS
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'reviewer', 'operator')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (org_id, email)
);

CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_users_email ON users(email);

COMMENT ON TABLE users IS 'Human operators, reviewers, and admins. Scoped to organization.';
COMMENT ON COLUMN users.role IS 'admin: full access, reviewer: view+publish, operator: capture only';

-- ============================================================================
-- USER SITE ACCESS
-- ============================================================================

CREATE TABLE user_site_access (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, site_id)
);

CREATE INDEX idx_user_site_access_site ON user_site_access(site_id);

COMMENT ON TABLE user_site_access IS 'Many-to-many: which sites a user can access';

-- ============================================================================
-- DEVICES
-- ============================================================================

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'edge')),
    model TEXT,
    app_version TEXT,
    registered_at TIMESTAMPTZ DEFAULT now(),
    last_seen TIMESTAMPTZ
);

CREATE INDEX idx_devices_org ON devices(org_id);
CREATE INDEX idx_devices_site ON devices(site_id) WHERE site_id IS NOT NULL;

COMMENT ON TABLE devices IS 'Mobile devices and edge hardware. Scoped to organization.';
COMMENT ON COLUMN devices.platform IS 'ios, android, or edge (fixed hardware)';
COMMENT ON COLUMN devices.site_id IS 'Optional assigned site; NULL means unassigned';

-- ============================================================================
-- VEHICLES
-- ============================================================================

CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    vin TEXT,
    stock TEXT,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_vehicle_identifier CHECK (vin IS NOT NULL OR stock IS NOT NULL)
);

-- VIN is globally unique within org
CREATE UNIQUE INDEX idx_vehicles_org_vin ON vehicles(org_id, vin) WHERE vin IS NOT NULL;

-- Stock is unique within org+site
CREATE UNIQUE INDEX idx_vehicles_org_site_stock ON vehicles(org_id, site_id, stock) WHERE stock IS NOT NULL;

CREATE INDEX idx_vehicles_org_site ON vehicles(org_id, site_id);

COMMENT ON TABLE vehicles IS 'Vehicles being photographed. At least VIN or stock required.';
COMMENT ON COLUMN vehicles.meta IS 'Additional metadata: make, model, year, color, etc.';

-- ============================================================================
-- SESSIONS
-- ============================================================================

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
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
CREATE INDEX idx_sessions_operator ON sessions(operator_id);
CREATE INDEX idx_sessions_device ON sessions(device_id);
CREATE INDEX idx_sessions_status ON sessions(org_id, status) WHERE status = 'active';
CREATE INDEX idx_sessions_started ON sessions(org_id, started_at DESC);

COMMENT ON TABLE sessions IS 'Capture sessions. org_id/site_id denormalized for query performance.';
COMMENT ON COLUMN sessions.shot_list IS 'Capture config: { studio360: { frame_count }, stills: [...] }';
COMMENT ON COLUMN sessions.abandoned_at IS 'Timestamp for stale session cleanup';

-- ============================================================================
-- IMAGES
-- ============================================================================

CREATE TABLE images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    angle_deg INT CHECK (angle_deg >= 0 AND angle_deg < 360),
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
    published_at TIMESTAMPTZ
);

-- Dedupe within org using content hash
CREATE UNIQUE INDEX idx_images_org_hash ON images(org_id, hash_sha256);

CREATE INDEX idx_images_org_site ON images(org_id, site_id);
CREATE INDEX idx_images_session ON images(session_id);
CREATE INDEX idx_images_session_angle ON images(session_id, angle_deg) WHERE angle_deg IS NOT NULL;
CREATE INDEX idx_images_session_created ON images(session_id, created_at);
CREATE INDEX idx_images_vehicle ON images(vehicle_id);
CREATE INDEX idx_images_status ON images(org_id, status);
CREATE INDEX idx_images_phash ON images(org_id, phash) WHERE phash IS NOT NULL;
CREATE INDEX idx_images_pending ON images(org_id, created_at) WHERE status = 'pending';

COMMENT ON TABLE images IS 'Captured images. org_id/site_id/vehicle_id denormalized for query performance.';
COMMENT ON COLUMN images.angle_deg IS 'Angle for 360 captures (0-359), NULL for stills';
COMMENT ON COLUMN images.shot_name IS 'Shot name for stills (e.g., front_3q), NULL for 360';
COMMENT ON COLUMN images.hash_sha256 IS 'SHA-256 content hash for exact deduplication';
COMMENT ON COLUMN images.phash IS 'Perceptual hash for near-duplicate detection';
COMMENT ON COLUMN images.storage_key IS 'S3 object key for original image';
COMMENT ON COLUMN images.thumb_keys IS 'JSON: { "150": "key", "600": "key", "1200": "key" }';
COMMENT ON COLUMN images.qc IS 'QC results: { sharpness: { score, status }, exposure: { status } }';
COMMENT ON COLUMN images.qc_version IS 'Algorithm version for reprocessing detection';

-- ============================================================================
-- EVENTS
-- ============================================================================

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
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
CREATE INDEX idx_events_entity ON events(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_events_type ON events(org_id, type, created_at DESC);

COMMENT ON TABLE events IS 'Audit log and telemetry. Append-only.';
COMMENT ON COLUMN events.entity_type IS 'session, image, device, user, vehicle';
COMMENT ON COLUMN events.type IS 'Event type: upload_complete, qc_failed, published, etc.';
COMMENT ON COLUMN events.actor_type IS 'user, device, or system';

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_site_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- RLS policies use app.current_org_id set per connection
-- Example: SET app.current_org_id = 'uuid';

CREATE POLICY org_isolation_sites ON sites
    USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY org_isolation_users ON users
    USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY org_isolation_user_site_access ON user_site_access
    USING (user_id IN (SELECT id FROM users WHERE org_id = current_setting('app.current_org_id', true)::uuid));

CREATE POLICY org_isolation_devices ON devices
    USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY org_isolation_vehicles ON vehicles
    USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY org_isolation_sessions ON sessions
    USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY org_isolation_images ON images
    USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY org_isolation_events ON events
    USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sites_updated_at
    BEFORE UPDATE ON sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_vehicles_updated_at
    BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to set org context for RLS
CREATE OR REPLACE FUNCTION set_org_context(p_org_id UUID)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_org_id', p_org_id::text, false);
END;
$$ LANGUAGE plpgsql;

-- Function to get accessible site IDs for a user
CREATE OR REPLACE FUNCTION get_user_site_ids(p_user_id UUID)
RETURNS UUID[] AS $$
    SELECT ARRAY_AGG(site_id)
    FROM user_site_access
    WHERE user_id = p_user_id;
$$ LANGUAGE sql STABLE;

-- Function to check if user can access a site
CREATE OR REPLACE FUNCTION user_can_access_site(p_user_id UUID, p_site_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM user_site_access
        WHERE user_id = p_user_id AND site_id = p_site_id
    );
$$ LANGUAGE sql STABLE;

COMMIT;

-- ============================================================================
-- SEED DATA (for development/testing only)
-- ============================================================================

-- Uncomment below for development environment

/*
BEGIN;

-- Create test organization
INSERT INTO organizations (id, name, slug) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Test Dealership', 'test-dealership');

-- Create test site
INSERT INTO sites (id, org_id, name, slug, timezone) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Main Studio', 'main-studio', 'America/New_York');

-- Create test users
INSERT INTO users (id, org_id, email, name, role) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'admin@test.com', 'Admin User', 'admin'),
    ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'reviewer@test.com', 'Reviewer User', 'reviewer'),
    ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'operator@test.com', 'Operator User', 'operator');

-- Grant site access
INSERT INTO user_site_access (user_id, site_id) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001'),
    ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001'),
    ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001');

COMMIT;
*/
