import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { api } from '@/services/api';
import type { CaptureMode } from '@360-imaging/shared';

export default function NewSessionScreen() {
  const [vin, setVin] = useState('');
  const [stock, setStock] = useState('');
  const [mode, setMode] = useState<CaptureMode>('studio360');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!vin && !stock) {
      Alert.alert('Error', 'Please enter either VIN or Stock number');
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await api.createSession({
        siteId: process.env.EXPO_PUBLIC_DEFAULT_SITE_ID || '',
        vehicle: { vin: vin || undefined, stock: stock || undefined },
        mode,
      });

      router.replace(`/capture/${session.id}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to create session');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>VIN</Text>
      <TextInput
        style={styles.input}
        value={vin}
        onChangeText={setVin}
        placeholder="Enter VIN (optional)"
        autoCapitalize="characters"
        maxLength={17}
      />

      <Text style={styles.label}>Stock Number</Text>
      <TextInput
        style={styles.input}
        value={stock}
        onChangeText={setStock}
        placeholder="Enter Stock Number (optional)"
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Capture Mode</Text>
      <View style={styles.modeContainer}>
        <Pressable
          style={[styles.modeButton, mode === 'studio360' && styles.modeButtonActive]}
          onPress={() => setMode('studio360')}
        >
          <Text style={[styles.modeText, mode === 'studio360' && styles.modeTextActive]}>
            Studio 360
          </Text>
          <Text style={styles.modeSubtext}>24 frames</Text>
        </Pressable>

        <Pressable
          style={[styles.modeButton, mode === 'stills' && styles.modeButtonActive]}
          onPress={() => setMode('stills')}
        >
          <Text style={[styles.modeText, mode === 'stills' && styles.modeTextActive]}>
            Stills
          </Text>
          <Text style={styles.modeSubtext}>Shot list</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.createButton, isSubmitting && styles.createButtonDisabled]}
        onPress={handleCreate}
        disabled={isSubmitting}
      >
        <Text style={styles.createButtonText}>
          {isSubmitting ? 'Creating...' : 'Start Capture'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  modeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  modeButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  modeButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#f0f8ff',
  },
  modeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  modeTextActive: {
    color: '#007AFF',
  },
  modeSubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  createButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  createButtonDisabled: {
    backgroundColor: '#ccc',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
