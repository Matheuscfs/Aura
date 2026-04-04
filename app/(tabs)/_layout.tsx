import React from 'react';
import { Tabs } from 'expo-router';
import { CustomTabBar } from '../../src/components/CustomTabBar';

/**
 * (tabs)/_layout.tsx
 * 
 * Configures the bottom tab navigation using Expo Router.
 * Integrates the CustomTabBar for native iOS-like animations and micro-interactions.
 */
export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Native-like transitions for tabs
        animation: 'fade',
      }}
    >
      {/* Resumo Tab */}
      <Tabs.Screen
        name="resumo"
        options={{
          title: 'Resumo',
        }}
      />

      {/* Rotina Tab */}
      <Tabs.Screen
        name="rotina"
        options={{
          title: 'Rotina',
        }}
      />

      {/* Explorar Tab */}
      <Tabs.Screen
        name="explorar"
        options={{
          title: 'Explorar',
        }}
      />

      {/* Perfil Tab */}
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
        }}
      />

      {/* Hide other screens from the tab bar */}
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      
      {/* Example of a sub-screen hidden from tabs */}
      <Tabs.Screen
        name="detalhes"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
