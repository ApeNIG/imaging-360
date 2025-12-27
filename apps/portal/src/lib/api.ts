import type { SessionWithDetails, Image, PublishResponse, Site } from '@360-imaging/shared';
import { mockSessions, mockSites, mockImages } from './mockData';

const API_URL = import.meta.env.VITE_API_URL || '';
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

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

  // Auth - Demo mode login (email/password form)
  async login(email: string, password: string) {
    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 500)); // Simulate network delay
      const mockToken = 'demo-token-' + Date.now();
      this.setToken(mockToken);
      return { accessToken: mockToken, userId: 'demo-user-001' };
    }

    const response = await this.fetch<{ accessToken: string; userId: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.setToken(response.accessToken);
    return response;
  }

  // Auth - OIDC login with ID token from Auth0
  async loginWithIdToken(idToken: string) {
    const response = await this.fetch<{ accessToken: string; userId: string; expiresIn: number }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      }
    );

    this.setToken(response.accessToken);
    return response;
  }

  // Sessions
  async getSessions(params?: { siteId?: string; status?: string }) {
    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 300));
      let sessions = [...mockSessions];
      if (params?.siteId) {
        sessions = sessions.filter((s) => s.siteId === params.siteId);
      }
      if (params?.status) {
        sessions = sessions.filter((s) => s.status === params.status);
      }
      return { data: sessions, total: sessions.length };
    }

    const query = new URLSearchParams();
    if (params?.siteId) query.set('siteId', params.siteId);
    if (params?.status) query.set('status', params.status);

    const queryString = query.toString();
    return this.fetch<{ data: SessionWithDetails[]; total: number }>(
      `/sessions${queryString ? `?${queryString}` : ''}`
    );
  }

  async getSession(sessionId: string): Promise<SessionWithDetails> {
    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 200));
      const session = mockSessions.find((s) => s.id === sessionId);
      if (!session) throw new Error('Session not found');
      return session;
    }
    return this.fetch<SessionWithDetails>(`/sessions/${sessionId}`);
  }

  // Images
  async getImages(sessionId: string) {
    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 200));
      const images = mockImages[sessionId] || [];
      return { data: images, total: images.length };
    }
    return this.fetch<{ data: Image[]; total: number }>(`/images?sessionId=${sessionId}`);
  }

  async publishImage(imageId: string): Promise<PublishResponse> {
    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 300));
      // Update mock data
      for (const sessionImages of Object.values(mockImages)) {
        const image = sessionImages.find((img) => img.id === imageId);
        if (image) {
          image.status = 'published';
          image.publishedAt = new Date();
          return { id: imageId, status: 'published', publishedAt: image.publishedAt };
        }
      }
      throw new Error('Image not found');
    }
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
    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 200));
      return { data: mockSites };
    }
    return this.fetch<{ data: Site[] }>('/sites');
  }

}

export { DEMO_MODE };

export const api = new ApiClient();
