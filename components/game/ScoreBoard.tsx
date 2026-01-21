import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Player, PlayerRank } from '../../lib/game/types';

interface ScoreBoardProps {
  players: Player[];
  currentRound: number;
  totalRounds: number;
  visible: boolean;
  onClose: () => void;
  isGameEnd?: boolean;
}

const RANK_COLORS: Record<PlayerRank, string> = {
  tycoon: '#f1c40f',
  rich: '#3498db',
  poor: '#95a5a6',
  beggar: '#e74c3c',
  none: '#7f8c8d',
};

export const ScoreBoard: React.FC<ScoreBoardProps> = ({
  players,
  currentRound,
  totalRounds,
  visible,
  onClose,
  isGameEnd = false,
}) => {
  const sortedPlayers = [...players].sort((a, b) => b.points - a.points);
  const winner = isGameEnd ? sortedPlayers[0] : null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>
            {isGameEnd ? 'Game Over!' : `Round ${currentRound} Complete`}
          </Text>

          {winner && (
            <View style={styles.winnerSection}>
              <Text style={styles.winnerLabel}>Winner</Text>
              <Text style={styles.winnerName}>{winner.name}</Text>
              <Text style={styles.winnerPoints}>{winner.points} points</Text>
            </View>
          )}

          <View style={styles.table}>
            <View style={styles.headerRow}>
              <Text style={[styles.headerCell, styles.rankCell]}>#</Text>
              <Text style={[styles.headerCell, styles.nameCell]}>Player</Text>
              <Text style={[styles.headerCell, styles.pointsCell]}>Points</Text>
              <Text style={[styles.headerCell, styles.statusCell]}>Rank</Text>
            </View>

            {sortedPlayers.map((player, index) => (
              <View
                key={player.id}
                style={[
                  styles.row,
                  index === 0 && isGameEnd && styles.winnerRow,
                ]}
              >
                <Text style={[styles.cell, styles.rankCell]}>{index + 1}</Text>
                <View style={[styles.nameCell, styles.nameContent]}>
                  <Text style={styles.playerName}>{player.name}</Text>
                  {player.isBot && <Text style={styles.botBadge}>Bot</Text>}
                </View>
                <Text style={[styles.cell, styles.pointsCell, styles.pointsText]}>
                  {player.points}
                </Text>
                <View style={[styles.statusCell]}>
                  {player.rank !== 'none' && (
                    <View
                      style={[
                        styles.rankBadge,
                        { backgroundColor: RANK_COLORS[player.rank] },
                      ]}
                    >
                      <Text style={styles.rankText}>
                        {player.rank.charAt(0).toUpperCase() + player.rank.slice(1)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>

          <View style={styles.roundInfo}>
            <Text style={styles.roundText}>
              Round {currentRound} of {totalRounds}
            </Text>
          </View>

          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>
              {isGameEnd ? 'Play Again' : 'Next Round'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  winnerSection: {
    alignItems: 'center',
    marginBottom: 20,
    padding: 16,
    backgroundColor: 'rgba(241, 196, 15, 0.2)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#f1c40f',
  },
  winnerLabel: {
    color: '#f1c40f',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  winnerName: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 4,
  },
  winnerPoints: {
    color: '#f1c40f',
    fontSize: 18,
    fontWeight: '600',
  },
  table: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    paddingBottom: 8,
    marginBottom: 8,
  },
  headerCell: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  winnerRow: {
    backgroundColor: 'rgba(241, 196, 15, 0.1)',
    borderRadius: 8,
  },
  cell: {
    color: '#fff',
    fontSize: 14,
  },
  rankCell: {
    width: 30,
  },
  nameCell: {
    flex: 1,
  },
  nameContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  botBadge: {
    backgroundColor: 'rgba(155, 89, 182, 0.3)',
    color: '#9b59b6',
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  pointsCell: {
    width: 60,
    textAlign: 'right',
  },
  pointsText: {
    fontWeight: 'bold',
    color: '#f1c40f',
  },
  statusCell: {
    width: 70,
    alignItems: 'flex-end',
  },
  rankBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  rankText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  roundInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  roundText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#3498db',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
