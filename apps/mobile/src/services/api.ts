import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type {
  DeviceAuthResponse,
  CreateSessionRequest,
  Session,
  SessionWithDetails,
  PresignRequest,
  PresignResponse,
  Image,
} from '@360-imaging/shared';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const TOKEN_KEY = 'auth_token';
const TOKEN_EXPIRY_KEY = 'auth_token_expiry';
const DEVICE_ID_KEY = 'device_id';

// Refresh token 1 hour before expiry
const REFRESH_BUFFER_SECONDS = 60 * 60;

class ApiClient {
  private token: string | null = null;
  private tokenExpiry: number | null = null;
  private deviceId: string | null = null;
  private refreshPromise: Promise<void> | null = null;

  async setToken(token: string, expiresIn: number, deviceId: string) {
    this.token = token;
    this.deviceId = deviceId;
    this.tokenExpiry = Date.now() + (expiresIn * 1000);

    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token),
      SecureStore.setItemAsync(TOKEN_EXPIRY_KEY, String(this.tokenExpiry)),
      SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId),
    ]);
  }

  async loadToken(): Promise<string | null> {
    const [token, expiryStr, deviceId] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(TOKEN_EXPIRY_KEY),
      SecureStore.getItemAsync(DEVICE_ID_KEY),
    ]);

    this.token = token;
    this.tokenExpiry = expiryStr ? parseInt(expiryStr, 10) : null;
    this.deviceId = deviceId;

    // Check if token is expired or about to expire
    if (this.token && this.isTokenExpired()) {
      await this.refreshTokenIfNeeded();
    }

    return this.token;
  }

  async clearToken() {
    this.token = null;
    this.tokenExpiry = null;
    this.deviceId = null;

    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(TOKEN_EXPIRY_KEY),
      SecureStore.deleteItemAsync(DEVICE_ID_KEY),
    ]);
  }

  getDeviceId(): string | null {
    return this.deviceId;
  }

  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) return true;
    return Date.now() >= this.tokenExpiry - (REFRESH_BUFFER_SECONDS * 1000);
  }

  private async refreshTokenIfNeeded(): Promise<void> {
    if (!this.isTokenExpired()) return;

    // Prevent concurrent refreshes
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefreshToken();

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefreshToken(): Promise<void> {
    const orgId = process.env.EXPO_PUBLIC_ORG_ID;
    if (!orgId) {
      throw new Error('Organization ID not configured');
    }

    const response = await this.authenticateDevice({
      orgId,
      platform: Platform.OS as 'ios' | 'android',
      model: Device.modelName || 'Unknown',
      appVersion: Constants.expoConfig?.version || '1.0.0',
    });

    // Token is automatically set in authenticateDevice
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    // Check and refresh token before making request
    await this.refreshTokenIfNeeded();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_URL}/v1${path}`, {
      ...options,
      headers,
    });

    // Handle 401 by trying to refresh token once
    if (response.status === 401 && this.token) {
      await this.doRefreshToken();

      // Retry request with new token
      headers['Authorization'] = `Bearer ${this.token}`;
      const retryResponse = await fetch(`${API_URL}/v1${path}`, {
        ...options,
        headers,
      });

      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.error?.message || error.message || 'Request failed');
      }

      return retryResponse.json();
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.error?.message || error.message || 'Request failed');
    }

    return response.json();
  }

  // Auth
  async authenticateDevice(params: {
    orgId: string;
    platform: 'ios' | 'android';
    model: string;
    appVersion: string;
  }): Promise<DeviceAuthResponse> {
    // Use raw fetch to avoid refresh loop
    const response = await fetch(`${API_URL}/v1/auth/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.error?.message || error.message || 'Authentication failed');
    }

    const data: DeviceAuthResponse = await response.json();
    await this.setToken(data.accessToken, data.expiresIn, data.deviceId);
    return data;
  }

  // Sessions
  async getSessions(params?: { siteId?: string; status?: string }) {
    const query = new URLSearchParams();
    if (params?.siteId) query.set('siteId', params.siteId);
    if (params?.status) query.set('status', params.status);

    const queryString = query.toString();
    return this.fetch<{ data: SessionWithDetails[]; total: number }>(
      `/sessions${queryString ? `?${queryString}` : ''}`
    );
  }

  async createSession(params: CreateSessionRequest): Promise<Session> {
    return this.fetch<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async getSession(sessionId: string): Promise<SessionWithDetails> {
    return this.fetch<SessionWithDetails>(`/sessions/${sessionId}`);
  }

  async updateSession(
    sessionId: string,
    params: { status?: string; completedAt?: Date }
  ): Promise<Session> {
    return this.fetch<Session>(`/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
  }

  // Presign
  async getPresignedUrl(params: Omit<PresignRequest, 'contentSha256'> & { contentSha256: string }): Promise<PresignResponse> {
    return this.fetch<PresignResponse>('/presign', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Images
  async getImages(sessionId: string): Promise<{ data: Image[]; total: number }> {
    return this.fetch<{ data: Image[]; total: number }>(`/images?sessionId=${sessionId}`);
  }

  // Events
  async sendEvent(params: {
    entityType: string;
    entityId: string;
    type: string;
    message?: string;
    meta?: Record<string, unknown>;
  }) {
    return this.fetch<{ id: string }>('/events', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async sendBatchEvents(events: Array<{
    entityType: string;
    entityId: string;
    type: string;
    message?: string;
    meta?: Record<string, unknown>;
  }>) {
    return this.fetch<{ accepted: number }>('/events/batch', {
      method: 'POST',
      body: JSON.stringify({ events }),
    });
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await fetch(`${API_URL}/v1/health`);
      return true;
    } catch {
      return false;
    }
  }
}

export const api = new ApiClient();
