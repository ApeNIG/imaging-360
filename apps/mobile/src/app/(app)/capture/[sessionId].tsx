import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '@/services/api';
import { uploadQueue } from '@/services/upload-queue';
import type { Session } from '@360-imaging/shared';

export default function CaptureScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [session, setSession] = useState<Session | null>(null);
  const [currentAngle, setCurrentAngle] = useState(0);
  const [capturedCount, setCapturedCount] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const totalFrames = session?.shotList?.studio360?.frameCount || 24;
  const angleStep = 360 / totalFrames;

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const loadSession = async () => {
    try {
      const data = await api.getSession(sessionId);
      setSession(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load session');
      router.back();
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        exif: true,
      });

      if (photo) {
        // Queue for upload
        await uploadQueue.add({
          sessionId,
          uri: photo.uri,
          angle: currentAngle,
          width: photo.width,
          height: photo.height,
        });

        setCapturedCount((c) => c + 1);

        // Advance to next angle
        if (capturedCount + 1 < totalFrames) {
          setCurrentAngle((a) => (a + angleStep) % 360);
        } else {
          // Session complete
          handleComplete();
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to capture image');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleComplete = async () => {
    try {
      await api.updateSession(sessionId, { status: 'complete' });
      Alert.alert('Complete', 'Session completed successfully', [
        { text: 'OK', onPress: () => router.replace('/sessions') },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to complete session');
    }
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Camera access is required</Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* Angle indicator overlay */}
        <View style={styles.overlay}>
          <View style={styles.angleIndicator}>
            <Text style={styles.angleText}>{currentAngle}°</Text>
          </View>

          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              {capturedCount} / {totalFrames}
            </Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>

          <Pressable
            style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
            onPress={handleCapture}
            disabled={isCapturing}
          >
            <View style={styles.captureButtonInner} />
          </Pressable>

          <Pressable style={styles.doneButton} onPress={handleComplete}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  permissionText: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
  },
  angleIndicator: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  angleText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  progressContainer: {
    alignSelf: 'center',
  },
  progressText: {
    color: '#fff',
    fontSize: 18,
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  cancelButton: {
    padding: 12,
  },
  cancelText: {
    color: '#fff',
    fontSize: 16,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  doneButton: {
    padding: 12,
  },
  doneText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
