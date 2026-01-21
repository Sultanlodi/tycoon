import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../../lib/hooks/useAuth';
import { supabase } from '../../lib/supabase';

interface UserStats {
  totalGames: number;
  wins: number;
  totalPoints: number;
  winRate: number;
}

export default function ProfileScreen() {
  const { user, signOut, loading } = useAuth();
  const [stats, setStats] = useState<UserStats>({
    totalGames: 0,
    wins: 0,
    totalPoints: 0,
    winRate: 0,
  });
  const [username, setUsername] = useState('Guest');

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) {
        setUsername(data.username);
        setStats({
          totalGames: data.total_games,
          wins: data.wins,
          totalPoints: data.total_points,
          winRate: data.total_games > 0
            ? Math.round((data.wins / data.total_games) * 100)
            : 0,
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const handleSignIn = () => {
    router.push('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {username[0].toUpperCase()}
            </Text>
          </View>
          <Text style={styles.username}>{username}</Text>
          {user && (
            <Text style={styles.email}>{user.email}</Text>
          )}
        </View>

        {/* Stats */}
        {user ? (
          <View style={styles.statsContainer}>
            <Text style={styles.sectionTitle}>Your Stats</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.totalGames}</Text>
                <Text style={styles.statLabel}>Games Played</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.wins}</Text>
                <Text style={styles.statLabel}>Wins</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.winRate}%</Text>
                <Text style={styles.statLabel}>Win Rate</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, styles.pointsValue]}>
                  {stats.totalPoints}
                </Text>
                <Text style={styles.statLabel}>Total Points</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.signInPrompt}>
            <Text style={styles.signInIcon}>📊</Text>
            <Text style={styles.signInTitle}>Track Your Progress</Text>
            <Text style={styles.signInText}>
              Sign in to save your stats, add friends, and play online!
            </Text>
            <TouchableOpacity
              style={styles.signInButton}
              onPress={handleSignIn}
            >
              <Text style={styles.signInButtonText}>Sign In / Sign Up</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Achievements */}
        <View style={styles.achievementsContainer}>
          <Text style={styles.sectionTitle}>Achievements</Text>
          <View style={styles.achievementsList}>
            <AchievementItem
              icon="👑"
              title="First Victory"
              description="Win your first game"
              unlocked={stats.wins >= 1}
            />
            <AchievementItem
              icon="🎯"
              title="Sharp Shooter"
              description="Win 10 games"
              unlocked={stats.wins >= 10}
            />
            <AchievementItem
              icon="🔥"
              title="Revolution Master"
              description="Trigger 50 revolutions"
              unlocked={false}
            />
            <AchievementItem
              icon="💯"
              title="Perfect Game"
              description="Win without anyone passing"
              unlocked={false}
            />
            <AchievementItem
              icon="🏆"
              title="Tycoon Legend"
              description="Win 100 games"
              unlocked={stats.wins >= 100}
            />
          </View>
        </View>

        {/* Settings */}
        <View style={styles.settingsContainer}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <TouchableOpacity style={styles.settingItem}>
            <Text style={styles.settingIcon}>🔔</Text>
            <Text style={styles.settingText}>Notifications</Text>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem}>
            <Text style={styles.settingIcon}>🔊</Text>
            <Text style={styles.settingText}>Sound Effects</Text>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem}>
            <Text style={styles.settingIcon}>📖</Text>
            <Text style={styles.settingText}>How to Play</Text>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem}>
            <Text style={styles.settingIcon}>❓</Text>
            <Text style={styles.settingText}>Help & Support</Text>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Sign Out */}
        {user && (
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            disabled={loading}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        )}

        {/* Version */}
        <Text style={styles.version}>Version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const AchievementItem = ({
  icon,
  title,
  description,
  unlocked,
}: {
  icon: string;
  title: string;
  description: string;
  unlocked: boolean;
}) => (
  <View style={[styles.achievementItem, !unlocked && styles.achievementLocked]}>
    <Text style={[styles.achievementIcon, !unlocked && styles.achievementIconLocked]}>
      {icon}
    </Text>
    <View style={styles.achievementInfo}>
      <Text style={[styles.achievementTitle, !unlocked && styles.achievementTitleLocked]}>
        {title}
      </Text>
      <Text style={styles.achievementDesc}>{description}</Text>
    </View>
    {unlocked && (
      <Text style={styles.achievementCheck}>✓</Text>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 24,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3498db',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  username: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  email: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 4,
  },
  statsContainer: {
    marginBottom: 32,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  pointsValue: {
    color: '#f1c40f',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 4,
  },
  signInPrompt: {
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 2,
    borderColor: '#3498db',
  },
  signInIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  signInTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  signInText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  signInButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  achievementsContainer: {
    marginBottom: 32,
  },
  achievementsList: {
    gap: 12,
  },
  achievementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
  },
  achievementLocked: {
    opacity: 0.5,
  },
  achievementIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  achievementIconLocked: {
    opacity: 0.5,
  },
  achievementInfo: {
    flex: 1,
  },
  achievementTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  achievementTitleLocked: {
    color: 'rgba(255,255,255,0.6)',
  },
  achievementDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  achievementCheck: {
    color: '#2ecc71',
    fontSize: 20,
    fontWeight: 'bold',
  },
  settingsContainer: {
    marginBottom: 32,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  settingIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  settingText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  settingArrow: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 20,
  },
  signOutButton: {
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e74c3c',
    marginBottom: 24,
  },
  signOutText: {
    color: '#e74c3c',
    fontSize: 16,
    fontWeight: 'bold',
  },
  version: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    textAlign: 'center',
  },
});
