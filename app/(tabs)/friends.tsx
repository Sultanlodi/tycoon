import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';

interface Friend {
  id: string;
  username: string;
  status: 'pending' | 'accepted';
  isOnline?: boolean;
}

export default function FriendsScreen() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'friends' | 'pending' | 'search'>('friends');

  useEffect(() => {
    if (user) {
      loadFriends();
    }
  }, [user]);

  const loadFriends = async () => {
    if (!user) return;

    try {
      // Load accepted friends
      const { data: friendsData } = await supabase
        .from('friends')
        .select(`
          id,
          friend:friend_id(id, username),
          status
        `)
        .eq('user_id', user.id)
        .eq('status', 'accepted');

      if (friendsData) {
        setFriends(
          friendsData.map((f: any) => ({
            id: f.friend.id,
            username: f.friend.username,
            status: 'accepted',
          }))
        );
      }

      // Load pending requests (received)
      const { data: pendingData } = await supabase
        .from('friends')
        .select(`
          id,
          friend:user_id(id, username),
          status
        `)
        .eq('friend_id', user.id)
        .eq('status', 'pending');

      if (pendingData) {
        setPendingRequests(
          pendingData.map((f: any) => ({
            id: f.friend.id,
            username: f.friend.username,
            status: 'pending',
          }))
        );
      }
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !user) return;

    setIsSearching(true);
    try {
      const { data } = await supabase
        .from('users')
        .select('id, username')
        .ilike('username', `%${searchQuery}%`)
        .neq('id', user.id)
        .limit(10);

      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching:', error);
    }
    setIsSearching(false);
  };

  const sendFriendRequest = async (friendId: string) => {
    if (!user) return;

    try {
      await supabase.from('friends').insert({
        user_id: user.id,
        friend_id: friendId,
        status: 'pending',
      });

      // Remove from search results
      setSearchResults((prev) => prev.filter((r) => r.id !== friendId));
    } catch (error) {
      console.error('Error sending request:', error);
    }
  };

  const acceptRequest = async (friendId: string) => {
    if (!user) return;

    try {
      // Update the existing request
      await supabase
        .from('friends')
        .update({ status: 'accepted' })
        .eq('user_id', friendId)
        .eq('friend_id', user.id);

      // Create reverse friendship
      await supabase.from('friends').insert({
        user_id: user.id,
        friend_id: friendId,
        status: 'accepted',
      });

      loadFriends();
    } catch (error) {
      console.error('Error accepting request:', error);
    }
  };

  const inviteToGame = (friendId: string) => {
    // TODO: Implement game invitation
    console.log('Invite to game:', friendId);
  };

  const renderFriend = ({ item }: { item: Friend }) => (
    <View style={styles.friendItem}>
      <View style={styles.friendAvatar}>
        <Text style={styles.avatarText}>
          {item.username[0].toUpperCase()}
        </Text>
      </View>
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{item.username}</Text>
        <Text style={styles.friendStatus}>
          {item.isOnline ? 'Online' : 'Offline'}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.inviteButton}
        onPress={() => inviteToGame(item.id)}
      >
        <Text style={styles.inviteButtonText}>Invite</Text>
      </TouchableOpacity>
    </View>
  );

  const renderPending = ({ item }: { item: Friend }) => (
    <View style={styles.friendItem}>
      <View style={styles.friendAvatar}>
        <Text style={styles.avatarText}>
          {item.username[0].toUpperCase()}
        </Text>
      </View>
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{item.username}</Text>
        <Text style={styles.friendStatus}>Wants to be friends</Text>
      </View>
      <TouchableOpacity
        style={styles.acceptButton}
        onPress={() => acceptRequest(item.id)}
      >
        <Text style={styles.acceptButtonText}>Accept</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSearchResult = ({ item }: { item: any }) => (
    <View style={styles.friendItem}>
      <View style={styles.friendAvatar}>
        <Text style={styles.avatarText}>
          {item.username[0].toUpperCase()}
        </Text>
      </View>
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{item.username}</Text>
      </View>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => sendFriendRequest(item.id)}
      >
        <Text style={styles.addButtonText}>Add</Text>
      </TouchableOpacity>
    </View>
  );

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔒</Text>
          <Text style={styles.emptyTitle}>Sign In Required</Text>
          <Text style={styles.emptyText}>
            Create an account to add friends and play together online.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Friends</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
          onPress={() => setActiveTab('friends')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'friends' && styles.tabTextActive,
            ]}
          >
            Friends ({friends.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
          onPress={() => setActiveTab('pending')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'pending' && styles.tabTextActive,
            ]}
          >
            Requests ({pendingRequests.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'search' && styles.tabActive]}
          onPress={() => setActiveTab('search')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'search' && styles.tabTextActive,
            ]}
          >
            Search
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'search' && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by username..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={handleSearch}
            disabled={isSearching}
          >
            {isSearching ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.searchButtonText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'friends' && (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={renderFriend}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyTitle}>No Friends Yet</Text>
              <Text style={styles.emptyText}>
                Search for players to add as friends!
              </Text>
            </View>
          }
        />
      )}

      {activeTab === 'pending' && (
        <FlatList
          data={pendingRequests}
          keyExtractor={(item) => item.id}
          renderItem={renderPending}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📬</Text>
              <Text style={styles.emptyTitle}>No Pending Requests</Text>
              <Text style={styles.emptyText}>
                Friend requests will appear here.
              </Text>
            </View>
          }
        />
      )}

      {activeTab === 'search' && (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={renderSearchResult}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            searchQuery ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>No Results</Text>
                <Text style={styles.emptyText}>
                  Try a different search term.
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#3498db',
  },
  tabText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  list: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  friendAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3498db',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  friendStatus: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  inviteButton: {
    backgroundColor: '#2ecc71',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  inviteButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  acceptButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  acceptButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  addButton: {
    backgroundColor: '#9b59b6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
