import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGameStore } from '../../stores/gameStore';
import { BotDifficulty } from '../../lib/game/bot';

export default function HomeScreen() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('medium');
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('Player');

  const { initializeGame, createRoom, joinRoom } = useGameStore();

  const handlePlayOffline = () => {
    // Start a game with 3 bots
    initializeGame(playerName || 'Player', 'player-1', botDifficulty);
    router.push('/game/offline');
  };

  const handleCreateRoom = () => {
    // Create room and go to waiting room
    const code = createRoom(playerName || 'Player', 'player-1', botDifficulty);
    setShowCreateModal(false);
    router.push(`/game/${code}`);
  };

  const handleJoinRoom = () => {
    if (!roomCode || roomCode.length < 4) return;
    // Join room and go to waiting room
    joinRoom(roomCode, playerName || 'Player', 'player-1');
    setShowJoinModal(false);
    router.push(`/game/${roomCode}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>TYCOON</Text>
          <Text style={styles.subtitle}>Ready to play?</Text>
        </View>

        {/* Player Name */}
        <View style={styles.nameSection}>
          <Text style={styles.sectionLabel}>Your Name</Text>
          <TextInput
            style={styles.nameInput}
            value={playerName}
            onChangeText={setPlayerName}
            placeholder="Enter your name"
            placeholderTextColor="rgba(255,255,255,0.4)"
            maxLength={15}
          />
        </View>

        {/* Bot Difficulty */}
        <View style={styles.difficultySection}>
          <Text style={styles.sectionLabel}>Bot Difficulty</Text>
          <View style={styles.difficultyButtons}>
            {(['easy', 'medium', 'hard'] as BotDifficulty[]).map((diff) => (
              <TouchableOpacity
                key={diff}
                style={[
                  styles.difficultyButton,
                  botDifficulty === diff && styles.difficultyButtonActive,
                ]}
                onPress={() => setBotDifficulty(diff)}
              >
                <Text
                  style={[
                    styles.difficultyText,
                    botDifficulty === diff && styles.difficultyTextActive,
                  ]}
                >
                  {diff.charAt(0).toUpperCase() + diff.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Game Options */}
        <View style={styles.gameOptions}>
          <TouchableOpacity
            style={[styles.gameButton, styles.offlineButton]}
            onPress={handlePlayOffline}
          >
            <Text style={styles.gameButtonIcon}>🤖</Text>
            <Text style={styles.gameButtonTitle}>Play vs Bots</Text>
            <Text style={styles.gameButtonDesc}>Practice offline with AI opponents</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.gameButton, styles.createButton]}
            onPress={() => setShowCreateModal(true)}
          >
            <Text style={styles.gameButtonIcon}>🎯</Text>
            <Text style={styles.gameButtonTitle}>Create Room</Text>
            <Text style={styles.gameButtonDesc}>Host a game for friends to join</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.gameButton, styles.joinButton]}
            onPress={() => setShowJoinModal(true)}
          >
            <Text style={styles.gameButtonIcon}>🔗</Text>
            <Text style={styles.gameButtonTitle}>Join Room</Text>
            <Text style={styles.gameButtonDesc}>Enter a room code to join</Text>
          </TouchableOpacity>
        </View>

        {/* How to Play */}
        <TouchableOpacity style={styles.howToPlay}>
          <Text style={styles.howToPlayText}>📖 How to Play</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Create Room Modal */}
      <Modal visible={showCreateModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Create Game Room</Text>

            <Text style={styles.modalText}>
              A room code will be generated for your friends to join.
              Bots will fill empty spots when the game starts.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirm]}
                onPress={handleCreateRoom}
              >
                <Text style={styles.modalButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Join Room Modal */}
      <Modal visible={showJoinModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Join Game Room</Text>

            <TextInput
              style={styles.codeInput}
              value={roomCode}
              onChangeText={(text) => setRoomCode(text.toUpperCase())}
              placeholder="Enter room code"
              placeholderTextColor="rgba(255,255,255,0.4)"
              maxLength={6}
              autoCapitalize="characters"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => {
                  setShowJoinModal(false);
                  setRoomCode('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalConfirm,
                  roomCode.length < 4 && styles.modalButtonDisabled,
                ]}
                onPress={handleJoinRoom}
                disabled={roomCode.length < 4}
              >
                <Text style={styles.modalButtonText}>Join</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#f1c40f',
    letterSpacing: 6,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 8,
  },
  nameSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  difficultySection: {
    marginBottom: 32,
  },
  difficultyButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  difficultyButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  difficultyButtonActive: {
    borderColor: '#3498db',
    backgroundColor: 'rgba(52, 152, 219, 0.2)',
  },
  difficultyText: {
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  difficultyTextActive: {
    color: '#3498db',
  },
  gameOptions: {
    gap: 16,
  },
  gameButton: {
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
  },
  offlineButton: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    borderColor: '#2ecc71',
  },
  createButton: {
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    borderColor: '#3498db',
  },
  joinButton: {
    backgroundColor: 'rgba(155, 89, 182, 0.1)',
    borderColor: '#9b59b6',
  },
  gameButtonIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  gameButtonTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  gameButtonDesc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  howToPlay: {
    marginTop: 24,
    alignItems: 'center',
  },
  howToPlayText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
    textAlign: 'center',
  },
  codeInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 16,
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancel: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  modalConfirm: {
    backgroundColor: '#3498db',
  },
  modalButtonDisabled: {
    opacity: 0.5,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
