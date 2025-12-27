import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth';

export default function LoginScreen() {
  const { authenticateDevice, isLoading, error } = useAuthStore();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    handleDeviceAuth();
  }, []);

  const handleDeviceAuth = async () => {
    setIsAuthenticating(true);
    try {
      await authenticateDevice();
      router.replace('/(app)/sessions');
    } catch (err) {
      console.error('Auth failed:', err);
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>360 Imaging</Text>

      {isAuthenticating || isLoading ? (
        <>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.status}>Authenticating device...</Text>
        </>
      ) : error ? (
        <>
          <Text style={styles.error}>{error}</Text>
          <Text style={styles.retry} onPress={handleDeviceAuth}>
            Tap to retry
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 40,
  },
  status: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
  error: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retry: {
    color: '#007AFF',
    fontSize: 16,
  },
});
