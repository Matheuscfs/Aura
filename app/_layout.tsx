import React from 'react';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * Root Layout
 * 
 * Configures the root navigation stack for the entire application.
 * Defines native-like screen transitions:
 * - slide_from_right on iOS
 * - fade_from_bottom on Android
 * - modal presentation with swipe-to-dismiss
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            // Native iOS-like background
            contentStyle: { backgroundColor: '#F2F2F7' },
            // Screen transitions
            animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade_from_bottom',
            // Swipe gesture for back navigation (native iOS behavior)
            gestureEnabled: true,
            gestureDirection: 'horizontal',
          }}
        >
          {/* Main Tabs Navigation */}
          <Stack.Screen 
            name="(tabs)" 
            options={{ 
              headerShown: false,
              animation: 'fade' 
            }} 
          />

          {/* Modal Screen Example (e.g., Camera or New Record) */}
          <Stack.Screen
            name="modal"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
              gestureEnabled: true,
              // Swipe-to-dismiss for modals
              gestureDirection: 'vertical',
            }}
          />

          {/* Detail Screen Example (e.g., Exam Detail) */}
          <Stack.Screen
            name="detalhe-exame"
            options={{
              headerShown: true,
              headerTitle: 'Detalhe do Exame',
              headerBackTitle: 'Voltar',
              headerStyle: { backgroundColor: '#FFFFFF' },
              headerShadowVisible: false,
              animation: 'slide_from_right',
            }}
          />
        </Stack>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
