# API Reference

Base URL: `https://api.example.com/v1`

## Authentication

All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

Two token types:
- **Device tokens**: Obtained via `POST /auth/device`, 30-day expiry
- **User tokens**: Obtained via `POST /auth/login`, 8-hour expiry

---

## Auth Endpoints

### POST /auth/device

Enroll or refresh a device token.

**Request:**
```json
{
  "org_id": "uuid",
  "platform": "ios | android | edge",
  "model": "iPhone 15 Pro",
  "app_version": "1.0.0"
}
```

**Response (200):**
```json
{
  "device_id": "uuid",
  "access_token": "eyJhbG...",
  "expires_in": 2592000
}
```

**JWT Claims:**
```json
{
  "sub": "device_id",
  "org_id": "uuid",
  "role": "device",
  "exp": 1234567890
}
```

---

### POST /auth/login

User login via OIDC token exchange.

**Request:**
```json
{
  "id_token": "eyJhbG..."
}
```

**Response (200):**
```json
{
  "user_id": "uuid",
  "access_token": "eyJhbG...",
  "expires_in": 28800
}
```

**JWT Claims:**
```json
{
  "sub": "user_id",
  "org_id": "uuid",
  "site_ids": ["uuid", "uuid"],
  "role": "operator | reviewer | admin",
  "exp": 1234567890
}
```

**Errors:**
- `401 Unauthorized` — Invalid OIDC token
- `403 Forbidden` — User not found in organization

---

## Sessions Endpoints

### POST /sessions

Create a new capture session.

**Auth:** Device or User token

**Request:**
```json
{
  "site_id": "uuid",
  "vehicle": {
    "vin": "1HGCM82633A123456",
    "stock": "STK-001"
  },
  "mode": "studio360 | walk360 | stills",
  "shot_list": {
    "studio360": { "frame_count": 24 },
    "stills": ["front_3q", "rear_3q", "interior", "dash"]
  }
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "org_id": "uuid",
  "site_id": "uuid",
  "vehicle_id": "uuid",
  "mode": "studio360",
  "shot_list": { ... },
  "status": "active",
  "started_at": "2025-01-15T10:00:00Z"
}
```

**Notes:**
- Creates vehicle record if not exists (requires `vin` or `stock`)
- Validates user/device has access to `site_id`

---

### GET /sessions

List sessions for accessible sites.

**Auth:** User token

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| site_id | uuid | Filter by site |
| status | string | Filter by status (active, complete, abandoned, failed) |
| vehicle_id | uuid | Filter by vehicle |
| limit | int | Max results (default 50, max 100) |
| offset | int | Pagination offset |

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "vehicle": { "vin": "...", "stock": "..." },
      "mode": "studio360",
      "status": "active",
      "operator": { "id": "uuid", "name": "John" },
      "site": { "id": "uuid", "name": "Main Studio" },
      "started_at": "2025-01-15T10:00:00Z",
      "image_count": 12
    }
  ],
  "total": 45,
  "limit": 50,
  "offset": 0
}
```

---

### GET /sessions/:id

Get session details.

**Auth:** Device or User token

**Response (200):**
```json
{
  "id": "uuid",
  "org_id": "uuid",
  "site_id": "uuid",
  "vehicle": {
    "id": "uuid",
    "vin": "1HGCM82633A123456",
    "stock": "STK-001"
  },
  "mode": "studio360",
  "shot_list": { ... },
  "operator": { "id": "uuid", "name": "John" },
  "device": { "id": "uuid", "model": "iPhone 15 Pro" },
  "status": "active",
  "started_at": "2025-01-15T10:00:00Z",
  "completed_at": null
}
```

---

### PATCH /sessions/:id

Update session status.

**Auth:** Device or User token

**Request:**
```json
{
  "status": "complete | abandoned | failed",
  "completed_at": "2025-01-15T10:30:00Z"
}
```

**Response (200):** Updated session object

---

## Presign Endpoint

### POST /presign

Generate presigned S3 upload URL.

**Auth:** Device or User token

**Request:**
```json
{
  "session_id": "uuid",
  "file_name": "IMG_001.jpg",
  "content_type": "image/jpeg",
  "content_sha256": "abc123..."
}
```

**Response (200):**
```json
{
  "upload_url": "https://s3.amazonaws.com/bucket/...",
  "storage_key": "org/{org_id}/site/{site_id}/session/{session_id}/{uuid}.jpg",
  "headers": {
    "Content-Type": "image/jpeg",
    "x-amz-content-sha256": "abc123..."
  },
  "expires_at": "2025-01-15T10:15:00Z"
}
```

**Notes:**
- URL expires in 15 minutes
- Content-type restricted to `image/jpeg`, `image/heic`
- Server constructs canonical storage path

**Errors:**
- `400 Bad Request` — Invalid content type or missing fields
- `403 Forbidden` — Session not owned by caller
- `404 Not Found` — Session not found

---

## Images Endpoints

### GET /images

List images for a session.

**Auth:** User token

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| session_id | uuid | **Required.** Filter by session |
| status | string | Filter by status |

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "angle_deg": 0,
      "shot_name": null,
      "thumb_keys": {
        "150": "org/.../thumb_150.jpg",
        "600": "org/.../thumb_600.jpg",
        "1200": "org/.../thumb_1200.jpg"
      },
      "qc": {
        "sharpness": { "score": 450, "status": "pass" },
        "exposure": { "status": "pass" }
      },
      "status": "processed",
      "created_at": "2025-01-15T10:01:00Z"
    }
  ],
  "total": 24
}
```

**Sorting:**
- Studio360: by `angle_deg` ascending
- Stills: by `created_at` ascending

---

### GET /images/:id

Get single image details.

**Auth:** User token

**Response (200):**
```json
{
  "id": "uuid",
  "session_id": "uuid",
  "vehicle_id": "uuid",
  "angle_deg": 15,
  "shot_name": null,
  "storage_key": "org/.../uuid.jpg",
  "thumb_keys": { ... },
  "width": 4032,
  "height": 3024,
  "exif": {
    "iso": 100,
    "shutter": "1/250",
    "aperture": "f/1.8",
    "timestamp": "2025-01-15T10:01:00Z"
  },
  "qc": { ... },
  "status": "processed",
  "created_at": "2025-01-15T10:01:00Z",
  "published_at": null
}
```

---

### POST /images/:id/publish

Mark image as published.

**Auth:** User token (reviewer or admin role)

**Response (200):**
```json
{
  "id": "uuid",
  "status": "published",
  "published_at": "2025-01-15T11:00:00Z"
}
```

**Errors:**
- `403 Forbidden` — User lacks reviewer/admin role
- `404 Not Found` — Image not found or not in user's org

---

## Events Endpoint

### POST /events

Ingest telemetry and audit events.

**Auth:** Device or User token

**Request (single):**
```json
{
  "entity_type": "session | image | device",
  "entity_id": "uuid",
  "type": "upload_started | upload_complete | upload_failed | qc_failed | published",
  "message": "Optional description",
  "meta": { "key": "value" }
}
```

**Request (batch):**
```json
{
  "events": [
    { "entity_type": "image", "entity_id": "uuid", "type": "upload_complete" },
    { "entity_type": "image", "entity_id": "uuid", "type": "upload_complete" }
  ]
}
```

**Response (201):**
```json
{
  "accepted": 2
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": { ... }
  },
  "request_id": "uuid"
}
```

**Standard HTTP Status Codes:**
| Code | Meaning |
|------|---------|
| 400 | Bad Request — Validation error |
| 401 | Unauthorized — Missing or invalid token |
| 403 | Forbidden — Insufficient permissions |
| 404 | Not Found — Resource doesn't exist or wrong org |
| 429 | Too Many Requests — Rate limit exceeded |
| 500 | Internal Server Error |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| POST /auth/device | 100/min per IP |
| POST /presign | 500/min per device |
| POST /events | 1000/min per actor |
| All others | 300/min per token |

---

## OpenAPI Specification

```yaml
openapi: 3.0.3
info:
  title: 360 Imaging API
  version: 0.1.0
servers:
  - url: https://api.example.com/v1
security:
  - bearerAuth: []

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    Vehicle:
      type: object
      properties:
        id: { type: string, format: uuid }
        vin: { type: string }
        stock: { type: string }

    Session:
      type: object
      properties:
        id: { type: string, format: uuid }
        org_id: { type: string, format: uuid }
        site_id: { type: string, format: uuid }
        vehicle_id: { type: string, format: uuid }
        mode: { type: string, enum: [studio360, walk360, stills] }
        shot_list: { type: object }
        status: { type: string, enum: [active, complete, abandoned, failed] }
        started_at: { type: string, format: date-time }
        completed_at: { type: string, format: date-time, nullable: true }

    Image:
      type: object
      properties:
        id: { type: string, format: uuid }
        session_id: { type: string, format: uuid }
        angle_deg: { type: integer, nullable: true }
        shot_name: { type: string, nullable: true }
        thumb_keys: { type: object }
        qc: { type: object }
        status: { type: string, enum: [pending, processing, processed, failed, published] }
        created_at: { type: string, format: date-time }
        published_at: { type: string, format: date-time, nullable: true }

    Error:
      type: object
      properties:
        error:
          type: object
          properties:
            code: { type: string }
            message: { type: string }
            details: { type: object }
        request_id: { type: string, format: uuid }

paths:
  /auth/device:
    post:
      summary: Enroll or refresh device token
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [org_id, platform, model, app_version]
              properties:
                org_id: { type: string, format: uuid }
                platform: { type: string, enum: [ios, android, edge] }
                model: { type: string }
                app_version: { type: string }
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  device_id: { type: string, format: uuid }
                  access_token: { type: string }
                  expires_in: { type: integer }

  /auth/login:
    post:
      summary: User login via OIDC
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [id_token]
              properties:
                id_token: { type: string }
      responses:
        '200':
          description: Success
        '401':
          description: Invalid token
        '403':
          description: User not in org

  /sessions:
    get:
      summary: List sessions
      parameters:
        - name: site_id
          in: query
          schema: { type: string, format: uuid }
        - name: status
          in: query
          schema: { type: string }
        - name: limit
          in: query
          schema: { type: integer, default: 50 }
        - name: offset
          in: query
          schema: { type: integer, default: 0 }
      responses:
        '200':
          description: Success
    post:
      summary: Create session
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [site_id, vehicle, mode]
              properties:
                site_id: { type: string, format: uuid }
                vehicle:
                  type: object
                  properties:
                    vin: { type: string }
                    stock: { type: string }
                mode: { type: string, enum: [studio360, walk360, stills] }
                shot_list: { type: object }
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Session'

  /sessions/{id}:
    get:
      summary: Get session details
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Session'
    patch:
      summary: Update session
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                status: { type: string, enum: [complete, abandoned, failed] }
      responses:
        '200':
          description: Success

  /presign:
    post:
      summary: Get presigned upload URL
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [session_id, file_name, content_type, content_sha256]
              properties:
                session_id: { type: string, format: uuid }
                file_name: { type: string }
                content_type: { type: string, enum: [image/jpeg, image/heic] }
                content_sha256: { type: string }
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  upload_url: { type: string, format: uri }
                  storage_key: { type: string }
                  headers: { type: object }
                  expires_at: { type: string, format: date-time }

  /images:
    get:
      summary: List images
      parameters:
        - name: session_id
          in: query
          required: true
          schema: { type: string, format: uuid }
        - name: status
          in: query
          schema: { type: string }
      responses:
        '200':
          description: Success

  /images/{id}:
    get:
      summary: Get image details
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Image'

  /images/{id}/publish:
    post:
      summary: Publish image
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        '200':
          description: Success
        '403':
          description: Insufficient permissions

  /events:
    post:
      summary: Ingest events
      requestBody:
        required: true
        content:
          application/json:
            schema:
              oneOf:
                - type: object
                  properties:
                    entity_type: { type: string }
                    entity_id: { type: string, format: uuid }
                    type: { type: string }
                    message: { type: string }
                    meta: { type: object }
                - type: object
                  properties:
                    events:
                      type: array
                      items:
                        type: object
      responses:
        '201':
          description: Accepted
```
