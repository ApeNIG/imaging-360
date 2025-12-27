import { create } from 'zustand';
import { api } from '@/lib/api';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
  error: string | null;

  initialize: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  userId: null,
  error: null,

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

  logout: () => {
    api.clearToken();
    set({
      isAuthenticated: false,
      userId: null,
      error: null,
    });
  },
}));

// Initialize on load
useAuthStore.getState().initialize();
