import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import * as Network from 'expo-network';
import * as Crypto from 'expo-crypto';
import { api } from './api';
import { UPLOAD_RETRY } from '@360-imaging/shared';

interface QueuedUpload {
  id: string;
  sessionId: string;
  uri: string;
  angle?: number;
  shotName?: string;
  width: number;
  height: number;
  status: 'queued' | 'uploading' | 'confirmed' | 'failed';
  attempts: number;
  createdAt: number;
  error?: string;
}

class UploadQueue {
  private db: SQLite.SQLiteDatabase | null = null;
  private isProcessing = false;

  async initialize() {
    this.db = await SQLite.openDatabaseAsync('upload_queue.db');

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS uploads (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        uri TEXT NOT NULL,
        angle INTEGER,
        shot_name TEXT,
        width INTEGER,
        height INTEGER,
        status TEXT DEFAULT 'queued',
        attempts INTEGER DEFAULT 0,
        created_at INTEGER,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);
    `);

    // Start processing queue
    this.processQueue();

    // Listen for network changes
    this.watchNetwork();
  }

  async add(params: {
    sessionId: string;
    uri: string;
    angle?: number;
    shotName?: string;
    width: number;
    height: number;
  }): Promise<string> {
    if (!this.db) throw new Error('Queue not initialized');

    const id = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    await this.db.runAsync(
      `INSERT INTO uploads (id, session_id, uri, angle, shot_name, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.sessionId, params.uri, params.angle ?? null, params.shotName ?? null, params.width, params.height, Date.now()]
    );

    // Trigger processing
    this.processQueue();

    return id;
  }

  async getQueuedCount(): Promise<number> {
    if (!this.db) return 0;

    const result = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM uploads WHERE status IN ('queued', 'uploading')`
    );

    return result?.count || 0;
  }

  private async processQueue() {
    if (this.isProcessing || !this.db) return;

    // Check network
    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected) return;

    this.isProcessing = true;

    try {
      // Get next queued item
      const item = await this.db.getFirstAsync<QueuedUpload>(
        `SELECT * FROM uploads WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`
      );

      if (!item) {
        this.isProcessing = false;
        return;
      }

      // Update status to uploading
      await this.db.runAsync(
        `UPDATE uploads SET status = 'uploading', attempts = attempts + 1 WHERE id = ?`,
        [item.id]
      );

      try {
        await this.uploadItem(item);

        // Mark as confirmed
        await this.db.runAsync(
          `UPDATE uploads SET status = 'confirmed' WHERE id = ?`,
          [item.id]
        );

        // Clean up local file
        await FileSystem.deleteAsync(item.uri, { idempotent: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (item.attempts >= UPLOAD_RETRY.MAX_ATTEMPTS) {
          // Mark as failed
          await this.db.runAsync(
            `UPDATE uploads SET status = 'failed', error = ? WHERE id = ?`,
            [errorMessage, item.id]
          );
        } else {
          // Reset to queued for retry
          await this.db.runAsync(
            `UPDATE uploads SET status = 'queued', error = ? WHERE id = ?`,
            [errorMessage, item.id]
          );

          // Schedule retry with backoff
          const delay = Math.min(
            UPLOAD_RETRY.INITIAL_DELAY_MS * Math.pow(UPLOAD_RETRY.BACKOFF_MULTIPLIER, item.attempts),
            UPLOAD_RETRY.MAX_DELAY_MS
          );

          setTimeout(() => this.processQueue(), delay);
        }
      }
    } finally {
      this.isProcessing = false;
    }

    // Process next item
    this.processQueue();
  }

  private async uploadItem(item: QueuedUpload) {
    // Read file and compute hash
    const fileInfo = await FileSystem.getInfoAsync(item.uri);
    if (!fileInfo.exists) {
      throw new Error('File not found');
    }

    // Read file as base64 to compute SHA-256
    const base64 = await FileSystem.readAsStringAsync(item.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      base64,
      { encoding: Crypto.CryptoEncoding.HEX }
    );

    // Get presigned URL
    const presignResponse = await api.getPresignedUrl({
      sessionId: item.sessionId,
      fileName: `${item.id}.jpg`,
      contentType: 'image/jpeg',
      contentSha256: hash,
    });

    // Upload to S3
    const uploadResult = await FileSystem.uploadAsync(presignResponse.uploadUrl, item.uri, {
      httpMethod: 'PUT',
      headers: presignResponse.headers,
    });

    if (uploadResult.status !== 200) {
      throw new Error(`Upload failed with status ${uploadResult.status}`);
    }

    // Send upload complete event
    await api.sendEvent({
      entityType: 'image',
      entityId: item.id,
      type: 'upload_complete',
      meta: {
        storageKey: presignResponse.storageKey,
        angle: item.angle,
        shotName: item.shotName,
      },
    });
  }

  private watchNetwork() {
    // Poll network status every 30 seconds
    setInterval(async () => {
      const networkState = await Network.getNetworkStateAsync();
      if (networkState.isConnected) {
        this.processQueue();
      }
    }, 30000);
  }
}

export const uploadQueue = new UploadQueue();
