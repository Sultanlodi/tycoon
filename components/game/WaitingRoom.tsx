import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Player {
  id: string;
  name: string;
  isBot: boolean;
  isReady: boolean;
}

interface WaitingRoomProps {
  roomCode: string;
  players: Player[];
  isHost: boolean;
  onStartGame: () => void;
  onLeave: () => void;
}

export const WaitingRoom: React.FC<WaitingRoomProps> = ({
  roomCode,
  players,
  isHost,
  onStartGame,
  onLeave,
}) => {
  const playerSlots = [0, 1, 2, 3];
  const canStart = players.length >= 1; // Host can start with bots filling empty slots

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my Tycoon game! Room code: ${roomCode}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Waiting Room</Text>
        <View style={styles.codeContainer}>
          <Text style={styles.codeLabel}>Room Code</Text>
          <Text style={styles.code}>{roomCode}</Text>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareButtonText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.playersSection}>
        <Text style={styles.sectionTitle}>Players (4 needed)</Text>
        <View style={styles.playerSlots}>
          {playerSlots.map((slot) => {
            const player = players[slot];
            return (
              <View
                key={slot}
                style={[
                  styles.playerSlot,
                  player && styles.playerSlotFilled,
                  player?.isBot && styles.playerSlotBot,
                ]}
              >
                {player ? (
                  <>
                    <View style={styles.playerAvatar}>
                      <Text style={styles.avatarText}>
                        {player.isBot ? '🤖' : player.name[0].toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.playerName}>{player.name}</Text>
                    {slot === 0 && (
                      <View style={styles.hostBadge}>
                        <Text style={styles.hostBadgeText}>Host</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <View style={styles.emptySlot}>
                      <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" />
                    </View>
                    <Text style={styles.waitingText}>Waiting...</Text>
                  </>
                )}
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.infoText}>
          Empty slots will be filled with bots when the game starts
        </Text>
      </View>

      <View style={styles.actions}>
        {isHost ? (
          <TouchableOpacity
            style={[styles.startButton, !canStart && styles.buttonDisabled]}
            onPress={onStartGame}
            disabled={!canStart}
          >
            <Text style={styles.startButtonText}>Start Game</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingForHost}>
            <ActivityIndicator size="small" color="#3498db" />
            <Text style={styles.waitingForHostText}>
              Waiting for host to start...
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.leaveButton} onPress={onLeave}>
          <Text style={styles.leaveButtonText}>Leave Room</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  codeContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 20,
    width: '100%',
  },
  codeLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  code: {
    color: '#f1c40f',
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 8,
    marginBottom: 12,
  },
  shareButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  playersSection: {
    flex: 1,
  },
  sectionTitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  playerSlots: {
    gap: 12,
  },
  playerSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    borderStyle: 'dashed',
  },
  playerSlotFilled: {
    borderColor: '#2ecc71',
    borderStyle: 'solid',
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
  },
  playerSlotBot: {
    borderColor: '#9b59b6',
    backgroundColor: 'rgba(155, 89, 182, 0.1)',
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3498db',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  playerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  hostBadge: {
    backgroundColor: '#f1c40f',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  hostBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  emptySlot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  waitingText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14,
  },
  infoSection: {
    marginBottom: 24,
  },
  infoText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    textAlign: 'center',
  },
  actions: {
    gap: 12,
  },
  startButton: {
    backgroundColor: '#2ecc71',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  waitingForHost: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  waitingForHostText: {
    color: '#3498db',
    fontSize: 16,
  },
  leaveButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  leaveButtonText: {
    color: '#e74c3c',
    fontSize: 14,
    fontWeight: '600',
  },
});
