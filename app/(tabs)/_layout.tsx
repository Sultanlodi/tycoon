import { Tabs } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#3498db',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Play',
          tabBarIcon: ({ color }) => (
            <TabIcon icon="🎮" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color }) => (
            <TabIcon icon="👥" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <TabIcon icon="👤" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const TabIcon = ({ icon, color }: { icon: string; color: string }) => (
  <View style={styles.iconContainer}>
    <Text style={[styles.icon, { opacity: color === '#3498db' ? 1 : 0.5 }]}>
      {icon}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#16213e',
    borderTopColor: 'rgba(255,255,255,0.1)',
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 8,
    height: 65,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  iconContainer: {
    marginBottom: 4,
  },
  icon: {
    fontSize: 24,
  },
});
