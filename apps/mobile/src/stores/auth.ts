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
  isOnline: boolean;

  initialize: () => Promise<void>;
  authenticateDevice: () => Promise<void>;
  logout: () => Promise<void>;
  setOnlineStatus: (online: boolean) => void;
  checkConnection: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  deviceId: null,
  error: null,
  isOnline: true,

  initialize: async () => {
    try {
      // Load existing token (handles refresh if needed)
      const token = await api.loadToken();
      const deviceId = api.getDeviceId();

      if (token) {
        set({
          isAuthenticated: true,
          deviceId,
          isLoading: false,
        });

        // Initialize upload queue
        await uploadQueue.initialize();

        // Check online status
        const isOnline = await api.healthCheck();
        set({ isOnline });
      } else {
        set({ isAuthenticated: false, isLoading: false });
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
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
        isOnline: true,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      console.error('Device auth error:', message);

      set({
        isAuthenticated: false,
        isLoading: false,
        error: message,
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

  setOnlineStatus: (online: boolean) => {
    set({ isOnline: online });
  },

  checkConnection: async () => {
    const isOnline = await api.healthCheck();
    set({ isOnline });
    return isOnline;
  },
}));
