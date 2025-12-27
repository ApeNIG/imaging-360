import type { SessionWithDetails, Image, PublishResponse, Site } from '@360-imaging/shared';

const API_URL = import.meta.env.VITE_API_URL || '';

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  loadToken(): string | null {
    this.token = localStorage.getItem('auth_token');
    return this.token;
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
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

    if (response.status === 401) {
      this.clearToken();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.error?.message || error.message || 'Request failed');
    }

    return response.json();
  }

  // Auth - In production, this would use OIDC
  async login(email: string, password: string) {
    // TODO: Implement OIDC login flow
    // For now, this is a placeholder
    const response = await this.fetch<{ accessToken: string; userId: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.setToken(response.accessToken);
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

  async getSession(sessionId: string): Promise<SessionWithDetails> {
    return this.fetch<SessionWithDetails>(`/sessions/${sessionId}`);
  }

  // Images
  async getImages(sessionId: string) {
    return this.fetch<{ data: Image[]; total: number }>(`/images?sessionId=${sessionId}`);
  }

  async publishImage(imageId: string): Promise<PublishResponse> {
    return this.fetch<PublishResponse>(`/images/${imageId}/publish`, {
      method: 'POST',
    });
  }

  async publishImages(imageIds: string[]): Promise<PublishResponse[]> {
    const results = await Promise.all(
      imageIds.map((id) => this.publishImage(id))
    );
    return results;
  }

  // Sites
  async getSites(): Promise<{ data: Site[] }> {
    return this.fetch<{ data: Site[] }>('/sites');
  }
}

export const api = new ApiClient();
