import * as SecureStore from 'expo-secure-store';
import type {
  DeviceAuthResponse,
  CreateSessionRequest,
  Session,
  SessionWithDetails,
  PresignRequest,
  PresignResponse,
} from '@360-imaging/shared';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

class ApiClient {
  private token: string | null = null;

  async setToken(token: string) {
    this.token = token;
    await SecureStore.setItemAsync('auth_token', token);
  }

  async loadToken() {
    this.token = await SecureStore.getItemAsync('auth_token');
    return this.token;
  }

  async clearToken() {
    this.token = null;
    await SecureStore.deleteItemAsync('auth_token');
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    const response = await this.fetch<DeviceAuthResponse>('/auth/device', {
      method: 'POST',
      body: JSON.stringify(params),
    });

    await this.setToken(response.accessToken);
    return response;
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
}

export const api = new ApiClient();
