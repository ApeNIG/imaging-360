import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useState, useMemo } from 'react';
import { router } from 'expo-router';
import { api } from '@/services/api';
import { DEFAULT_SHOT_LIST, isValidVIN } from '@360-imaging/shared';
import type { CaptureMode } from '@360-imaging/shared';

const SHOT_LIST_PREVIEW = DEFAULT_SHOT_LIST.stills.slice(0, 6);

export default function NewSessionScreen() {
  const [vin, setVin] = useState('');
  const [stock, setStock] = useState('');
  const [mode, setMode] = useState<CaptureMode>('studio360');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vinError, setVinError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!vin && !stock) return false;
    if (vin && vin.length > 0 && vin.length !== 17) return false;
    if (vinError) return false;
    return true;
  }, [vin, stock, vinError]);

  const handleVinChange = (text: string) => {
    const cleaned = text.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    setVin(cleaned);

    if (cleaned.length === 0) {
      setVinError(null);
    } else if (cleaned.length === 17) {
      if (!isValidVIN(cleaned)) {
        setVinError('Invalid VIN format');
      } else {
        setVinError(null);
      }
    } else if (cleaned.length > 0) {
      setVinError(`VIN must be 17 characters (${cleaned.length}/17)`);
    }
  };

  const handleCreate = async () => {
    if (!canSubmit) {
      if (!vin && !stock) {
        Alert.alert('Required', 'Please enter either VIN or Stock number');
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const siteId = process.env.EXPO_PUBLIC_DEFAULT_SITE_ID;
      if (!siteId) {
        throw new Error('Site not configured');
      }

      const session = await api.createSession({
        siteId,
        vehicle: {
          vin: vin.length === 17 ? vin : undefined,
          stock: stock || undefined,
        },
        mode,
      });

      // Navigate to capture screen
      router.replace(`/capture/${session.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create session';
      Alert.alert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Vehicle Information</Text>

      <Text style={styles.label}>VIN</Text>
      <TextInput
        style={[styles.input, vinError && styles.inputError]}
        value={vin}
        onChangeText={handleVinChange}
        placeholder="17-character VIN"
        autoCapitalize="characters"
        maxLength={17}
        autoCorrect={false}
      />
      {vinError && <Text style={styles.errorText}>{vinError}</Text>}

      <Text style={styles.orText}>- or -</Text>

      <Text style={styles.label}>Stock Number</Text>
      <TextInput
        style={styles.input}
        value={stock}
        onChangeText={setStock}
        placeholder="Enter Stock Number"
        autoCapitalize="characters"
        autoCorrect={false}
      />

      <Text style={styles.sectionTitle}>Capture Mode</Text>
      <View style={styles.modeContainer}>
        <Pressable
          style={[styles.modeButton, mode === 'studio360' && styles.modeButtonActive]}
          onPress={() => setMode('studio360')}
        >
          <Text style={[styles.modeText, mode === 'studio360' && styles.modeTextActive]}>
            Studio 360
          </Text>
          <Text style={styles.modeSubtext}>24 frames at 15° intervals</Text>
        </Pressable>

        <Pressable
          style={[styles.modeButton, mode === 'stills' && styles.modeButtonActive]}
          onPress={() => setMode('stills')}
        >
          <Text style={[styles.modeText, mode === 'stills' && styles.modeTextActive]}>
            Stills
          </Text>
          <Text style={styles.modeSubtext}>Checklist-based shots</Text>
        </Pressable>
      </View>

      {/* Shot list preview */}
      <View style={styles.previewContainer}>
        <Text style={styles.previewTitle}>
          {mode === 'studio360' ? 'Capture Preview' : 'Shot List'}
        </Text>
        {mode === 'studio360' ? (
          <View style={styles.angleGrid}>
            {[0, 15, 30, 45, 60, 75].map((angle) => (
              <View key={angle} style={styles.angleItem}>
                <Text style={styles.angleText}>{angle}°</Text>
              </View>
            ))}
            <View style={styles.angleItem}>
              <Text style={styles.angleMore}>...+18</Text>
            </View>
          </View>
        ) : (
          <View style={styles.shotList}>
            {SHOT_LIST_PREVIEW.map((shot) => (
              <View key={shot.name} style={styles.shotItem}>
                <View style={[styles.shotDot, shot.required && styles.shotDotRequired]} />
                <Text style={styles.shotName}>
                  {shot.name.replace(/_/g, ' ')}
                </Text>
                {shot.required && <Text style={styles.requiredBadge}>Required</Text>}
              </View>
            ))}
            <Text style={styles.moreShots}>
              +{DEFAULT_SHOT_LIST.stills.length - 6} more shots
            </Text>
          </View>
        )}
      </View>

      <Pressable
        style={[styles.createButton, (!canSubmit || isSubmitting) && styles.createButtonDisabled]}
        onPress={handleCreate}
        disabled={!canSubmit || isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.createButtonText}>Start Capture</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginTop: 24,
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  inputError: {
    borderColor: '#ff3b30',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 12,
    marginTop: 4,
  },
  orText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    marginVertical: 12,
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
  previewContainer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  angleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  angleItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  angleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  angleMore: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
  },
  shotList: {
    gap: 8,
  },
  shotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shotDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ccc',
  },
  shotDotRequired: {
    backgroundColor: '#007AFF',
  },
  shotName: {
    fontSize: 14,
    color: '#333',
    textTransform: 'capitalize',
    flex: 1,
  },
  requiredBadge: {
    fontSize: 10,
    color: '#007AFF',
    fontWeight: '600',
  },
  moreShots: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  createButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
    height: 52,
    justifyContent: 'center',
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
