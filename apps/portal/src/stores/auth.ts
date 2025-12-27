import { create } from 'zustand';
import { api } from '@/lib/api';
import {
  isAuth0Configured,
  loginWithRedirect,
  handleRedirectCallback,
  logout as auth0Logout,
} from '@/lib/auth0';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
  error: string | null;
  isAuth0Available: boolean;

  initialize: () => void;
  login: (email: string, password: string) => Promise<void>;
  loginWithAuth0: () => Promise<void>;
  handleAuth0Callback: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  userId: null,
  error: null,
  isAuth0Available: isAuth0Configured(),

  initialize: () => {
    const token = api.loadToken();
    set({
      isAuthenticated: !!token,
      isLoading: false,
    });
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    try {
      const response = await api.login(email, password);
      set({
        isAuthenticated: true,
        userId: response.userId,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isAuthenticated: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Login failed',
      });
      throw error;
    }
  },

  loginWithAuth0: async () => {
    set({ isLoading: true, error: null });

    try {
      await loginWithRedirect();
      // User will be redirected to Auth0, page will unload
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initiate SSO login',
      });
      throw error;
    }
  },

  handleAuth0Callback: async () => {
    set({ isLoading: true, error: null });

    try {
      // Get the ID token from Auth0
      const { idToken } = await handleRedirectCallback();

      // Exchange it for our backend JWT
      const response = await api.loginWithIdToken(idToken);

      set({
        isAuthenticated: true,
        userId: response.userId,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isAuthenticated: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'SSO login failed',
      });
      throw error;
    }
  },

  logout: () => {
    api.clearToken();

    // Also logout from Auth0 if configured
    if (isAuth0Configured()) {
      auth0Logout();
    }

    set({
      isAuthenticated: false,
      userId: null,
      error: null,
    });
  },

  clearError: () => {
    set({ error: null });
  },
}));

// Initialize on load
useAuthStore.getState().initialize();
