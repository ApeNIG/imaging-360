import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="sessions/index"
        options={{ title: 'Sessions', headerLargeTitle: true }}
      />
      <Stack.Screen
        name="sessions/new"
        options={{ title: 'New Session', presentation: 'modal' }}
      />
      <Stack.Screen
        name="capture/[sessionId]"
        options={{ headerShown: false }}
      />
    </Stack>
  );
}
