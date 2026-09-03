import '../lib/polyfills'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Incantly Mobile' }} />
        <Stack.Screen name="playground/index" options={{ title: 'Native RN Playground' }} />
        <Stack.Screen name="playground/headless" options={{ headerShown: false }} />
        <Stack.Screen name="playground/markdown" options={{ headerShown: false }} />
        <Stack.Screen name="playground/document" options={{ headerShown: false }} />
        <Stack.Screen name="playground/pages" options={{ headerShown: false }} />
        <Stack.Screen name="playground/store-bridge" options={{ headerShown: false }} />
        <Stack.Screen name="playground/storage" options={{ headerShown: false }} />
        <Stack.Screen name="playground/versions" options={{ headerShown: false }} />
        <Stack.Screen name="playground/ink" options={{ headerShown: false }} />
        <Stack.Screen name="playground/shapes" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  )
}
