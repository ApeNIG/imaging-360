import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { api } from '@/services/api';
import type { SessionWithDetails } from '@360-imaging/shared';

export default function SessionsScreen() {
  const [sessions, setSessions] = useState<SessionWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const response = await api.getSessions();
      setSessions(response.data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadSessions();
  };

  const renderSession = ({ item }: { item: SessionWithDetails }) => (
    <Pressable
      style={styles.sessionCard}
      onPress={() => router.push(`/capture/${item.id}`)}
    >
      <View style={styles.sessionHeader}>
        <Text style={styles.vehicleId}>
          {item.vehicle?.vin || item.vehicle?.stock || 'Unknown'}
        </Text>
        <View style={[styles.statusBadge, styles[`status_${item.status}`]]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.sessionMode}>{item.mode}</Text>
      <Text style={styles.sessionMeta}>
        {item.imageCount || 0} images • {new Date(item.startedAt).toLocaleDateString()}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={sessions}
        renderItem={renderSession}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No sessions yet</Text>
          </View>
        }
      />

      <Pressable
        style={styles.newButton}
        onPress={() => router.push('/sessions/new')}
      >
        <Text style={styles.newButtonText}>+ New Session</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  list: {
    padding: 16,
  },
  sessionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  vehicleId: {
    fontSize: 18,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  status_active: {
    backgroundColor: '#e8f5e9',
  },
  status_complete: {
    backgroundColor: '#e3f2fd',
  },
  status_abandoned: {
    backgroundColor: '#fff3e0',
  },
  status_failed: {
    backgroundColor: '#ffebee',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  sessionMode: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  sessionMeta: {
    fontSize: 12,
    color: '#999',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  newButton: {
    backgroundColor: '#007AFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  newButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
