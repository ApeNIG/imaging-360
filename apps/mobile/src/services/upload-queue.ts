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

interface DbRow {
  id: string;
  session_id: string;
  uri: string;
  angle: number | null;
  shot_name: string | null;
  width: number;
  height: number;
  status: string;
  attempts: number;
  created_at: number;
  error: string | null;
}

class UploadQueue {
  private db: SQLite.SQLiteDatabase | null = null;
  private isProcessing = false;

  async initialize() {
    this.db = SQLite.openDatabase('upload_queue.db');

    await this.execSql(`
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
      )
    `);

    await this.execSql(`
      CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status)
    `);

    // Start processing queue
    this.processQueue();

    // Listen for network changes
    this.watchNetwork();
  }

  private execSql(sql: string, args: (string | number | null)[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      this.db.transaction(
        (tx) => {
          tx.executeSql(sql, args);
        },
        (error) => reject(error),
        () => resolve()
      );
    });
  }

  private runSql(sql: string, args: (string | number | null)[] = []): Promise<SQLite.SQLResultSet> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      this.db.transaction(
        (tx) => {
          tx.executeSql(
            sql,
            args,
            (_, result) => resolve(result),
            (_, error) => {
              reject(error);
              return false;
            }
          );
        },
        (error) => reject(error)
      );
    });
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

    await this.runSql(
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

    const result = await this.runSql(
      `SELECT COUNT(*) as count FROM uploads WHERE status IN ('queued', 'uploading')`
    );

    if (result.rows.length > 0) {
      return (result.rows.item(0) as { count: number }).count;
    }
    return 0;
  }

  private async processQueue() {
    if (this.isProcessing || !this.db) return;

    // Check network
    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected) return;

    this.isProcessing = true;

    try {
      // Get next queued item
      const result = await this.runSql(
        `SELECT * FROM uploads WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`
      );

      if (result.rows.length === 0) {
        this.isProcessing = false;
        return;
      }

      const row = result.rows.item(0) as DbRow;
      const item: QueuedUpload = {
        id: row.id,
        sessionId: row.session_id,
        uri: row.uri,
        angle: row.angle ?? undefined,
        shotName: row.shot_name ?? undefined,
        width: row.width,
        height: row.height,
        status: row.status as QueuedUpload['status'],
        attempts: row.attempts,
        createdAt: row.created_at,
        error: row.error ?? undefined,
      };

      // Update status to uploading
      await this.runSql(
        `UPDATE uploads SET status = 'uploading', attempts = attempts + 1 WHERE id = ?`,
        [item.id]
      );

      try {
        await this.uploadItem(item);

        // Mark as confirmed
        await this.runSql(
          `UPDATE uploads SET status = 'confirmed' WHERE id = ?`,
          [item.id]
        );

        // Clean up local file
        await FileSystem.deleteAsync(item.uri, { idempotent: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (item.attempts >= UPLOAD_RETRY.MAX_ATTEMPTS) {
          // Mark as failed
          await this.runSql(
            `UPDATE uploads SET status = 'failed', error = ? WHERE id = ?`,
            [errorMessage, item.id]
          );
        } else {
          // Reset to queued for retry
          await this.runSql(
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
