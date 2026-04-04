import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ExplorarScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Explorar</Text>
      <Text style={styles.subtitle}>Descubra mais sobre sua saúde.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 17,
    color: '#999999',
  },
});
