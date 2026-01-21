import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { GameBoard } from '../../components/game/GameBoard';
import { WaitingRoom } from '../../components/game/WaitingRoom';
import { useGameStore } from '../../stores/gameStore';
import { supabase } from '../../lib/supabase';

export default function GameScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    gamePhase,
    players,
    roomCode,
    isHost,
    waitingPlayers,
    initializeGame,
    botDifficulty,
    createRoom,
    startGameFromWaitingRoom,
    leaveRoom,
  } = useGameStore();

  useEffect(() => {
    setupGame();
  }, [roomId]);

  const setupGame = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (roomId === 'offline') {
        // Offline game - initialize immediately with bots
        if (players.length === 0) {
          initializeGame('Player', 'player-1', botDifficulty);
        }
      } else if (roomId === 'create') {
        // Creating a new online room - show waiting room
        if (!roomCode) {
          createRoom('Player', 'player-1', botDifficulty);
        }
      } else {
        // Joining an existing room
        // TODO: Implement Supabase realtime connection
        // For now, just create a room for testing
        if (!roomCode) {
          createRoom('Player', 'player-1', botDifficulty);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to join game');
    }

    setIsLoading(false);
  };

  const handleLeaveGame = () => {
    leaveRoom();
    router.back();
  };

  const handleStartGame = () => {
    startGameFromWaitingRoom();
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Loading game...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={setupGame}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={handleLeaveGame}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Show waiting room for online games in waiting phase
  if (roomId !== 'offline' && gamePhase === 'waiting' && roomCode) {
    return (
      <WaitingRoom
        roomCode={roomCode}
        players={waitingPlayers}
        isHost={isHost}
        onStartGame={handleStartGame}
        onLeave={handleLeaveGame}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Room code display for online games */}
      {roomId !== 'offline' && roomCode && (
        <View style={styles.roomCodeContainer}>
          <Text style={styles.roomCodeLabel}>Room Code:</Text>
          <Text style={styles.roomCode}>{roomCode}</Text>
        </View>
      )}

      {/* Leave button */}
      <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveGame}>
        <Text style={styles.leaveButtonText}>✕</Text>
      </TouchableOpacity>

      {/* Game board */}
      <GameBoard />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  backButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  roomCodeContainer: {
    position: 'absolute',
    top: 50,
    left: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
  },
  roomCodeLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginRight: 8,
  },
  roomCode: {
    color: '#f1c40f',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  leaveButton: {
    position: 'absolute',
    top: 50,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  leaveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
