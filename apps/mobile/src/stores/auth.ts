import { create } from 'zustand';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from '@/services/api';
import { uploadQueue } from '@/services/upload-queue';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  deviceId: string | null;
  error: string | null;

  initialize: () => Promise<void>;
  authenticateDevice: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  deviceId: null,
  error: null,

  initialize: async () => {
    try {
      // Load existing token
      const token = await api.loadToken();

      if (token) {
        set({ isAuthenticated: true, isLoading: false });

        // Initialize upload queue
        await uploadQueue.initialize();
      } else {
        set({ isAuthenticated: false, isLoading: false });
      }
    } catch (error) {
      set({ isAuthenticated: false, isLoading: false });
    }
  },

  authenticateDevice: async () => {
    set({ isLoading: true, error: null });

    try {
      const orgId = process.env.EXPO_PUBLIC_ORG_ID;

      if (!orgId) {
        throw new Error('Organization ID not configured');
      }

      const response = await api.authenticateDevice({
        orgId,
        platform: Platform.OS as 'ios' | 'android',
        model: Device.modelName || 'Unknown',
        appVersion: Constants.expoConfig?.version || '1.0.0',
      });

      // Initialize upload queue after auth
      await uploadQueue.initialize();

      set({
        isAuthenticated: true,
        deviceId: response.deviceId,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isAuthenticated: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      });
      throw error;
    }
  },

  logout: async () => {
    await api.clearToken();
    set({
      isAuthenticated: false,
      deviceId: null,
      error: null,
    });
  },
}));
