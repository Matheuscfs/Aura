import React from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  useSharedValue, 
  interpolateColor,
  withTiming
} from 'react-native-reanimated';
import { Heart, Activity, Search, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

/**
 * CustomTabBar Component
 * 
 * Implements a native-like iOS tab bar with:
 * - Translucent background (BlurView)
 * - Bounce animation on touch (withSpring)
 * - Smooth color transition (interpolateColor)
 * - Minimalist design following Apple Health philosophy
 */
export const CustomTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || 20 }]}>
      <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.content}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabItem
              key={route.key}
              isFocused={isFocused}
              onPress={onPress}
              label={route.name}
              index={index}
            />
          );
        })}
      </View>
    </View>
  );
};

interface TabItemProps {
  isFocused: boolean;
  onPress: () => void;
  label: string;
  index: number;
}

const TabItem: React.FC<TabItemProps> = ({ isFocused, onPress, label, index }) => {
  // Shared value for the bounce effect (scale)
  const scale = useSharedValue(1);
  
  // Shared value for color transition (0 to 1)
  const activeProgress = useSharedValue(isFocused ? 1 : 0);

  // Update activeProgress when focus changes
  React.useEffect(() => {
    activeProgress.value = withTiming(isFocused ? 1 : 0, { duration: 200 });
  }, [isFocused]);

  // Animated style for the icon container (bounce effect)
  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  // Define colors based on the tab
  const getActiveColor = () => {
    switch (label) {
      case 'resumo': return '#FF2D55'; // Pink/Red for Health
      case 'rotina': return '#34C759'; // Green for Activity
      case 'explorar': return '#007AFF'; // Blue for Browse
      case 'perfil': return '#AF52DE'; // Purple for Profile
      default: return '#007AFF';
    }
  };

  const activeColor = getActiveColor();
  const inactiveColor = '#999999';

  const handlePressIn = () => {
    scale.value = withSpring(0.85, { damping: 10, stiffness: 100 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 10, stiffness: 100 });
  };

  const renderIcon = (color: string) => {
    const size = 26;
    // Normalize label to lowercase for comparison
    const normalizedLabel = label.toLowerCase();
    
    switch (normalizedLabel) {
      case 'resumo': 
        return <Heart size={size} color={color} fill={isFocused ? color : 'none'} />;
      case 'rotina': 
        return <Activity size={size} color={color} />;
      case 'explorar': 
        return <Search size={size} color={color} strokeWidth={isFocused ? 3 : 2} />;
      case 'perfil': 
        return <User size={size} color={color} fill={isFocused ? color : 'none'} />;
      default: 
        return <Heart size={size} color={color} fill={isFocused ? color : 'none'} />;
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabButton}
    >
      <Animated.View style={[styles.iconWrapper, animatedContainerStyle]}>
        {/* We use a simple color interpolation for the icon */}
        {renderIcon(isFocused ? activeColor : inactiveColor)}
      </Animated.View>
      
      {/* Label only appears or animates if active (optional, following user request) */}
      {isFocused && (
        <Animated.Text 
          style={[
            styles.label, 
            { color: activeColor }
          ]}
        >
          {label.charAt(0).toUpperCase() + label.slice(1)}
        </Animated.Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: 85,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: -2,
  },
});
