import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Player, PlayerRank } from '../../lib/game/types';
import { OpponentHand } from '../cards/CardHand';

interface PlayerSlotProps {
  player: Player;
  isCurrentTurn: boolean;
  position: 'left' | 'top' | 'right' | 'bottom';
  isMainPlayer?: boolean;
}

const RANK_COLORS: Record<PlayerRank, string> = {
  tycoon: '#f1c40f',
  rich: '#3498db',
  poor: '#95a5a6',
  beggar: '#e74c3c',
  none: '#7f8c8d',
};

const RANK_LABELS: Record<PlayerRank, string> = {
  tycoon: 'Tycoon',
  rich: 'Rich',
  poor: 'Poor',
  beggar: 'Beggar',
  none: '',
};

export const PlayerSlot: React.FC<PlayerSlotProps> = ({
  player,
  isCurrentTurn,
  position,
  isMainPlayer = false,
}) => {
  const isHorizontal = position === 'top' || position === 'bottom';

  return (
    <View style={[styles.container, styles[position]]}>
      {/* Player info */}
      <View
        style={[
          styles.playerInfo,
          isCurrentTurn && styles.currentTurn,
          player.hasFinished && styles.finished,
        ]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {player.isBot ? '🤖' : player.name[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.nameContainer}>
          <Text style={styles.name} numberOfLines={1}>
            {player.name}
          </Text>
          {player.rank !== 'none' && (
            <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[player.rank] }]}>
              <Text style={styles.rankText}>{RANK_LABELS[player.rank]}</Text>
            </View>
          )}
        </View>
        <View style={styles.statsContainer}>
          <Text style={styles.cardCount}>
            {player.hasFinished ? 'Done!' : `${player.hand.length} cards`}
          </Text>
          <Text style={styles.points}>{player.points} pts</Text>
        </View>
      </View>

      {/* Opponent cards (hidden) - only for non-main players */}
      {!isMainPlayer && !player.hasFinished && (
        <View style={styles.cardsContainer}>
          <OpponentHand
            cardCount={player.hand.length}
            position={position as 'left' | 'top' | 'right'}
          />
        </View>
      )}

      {/* Turn indicator */}
      {isCurrentTurn && (
        <View style={styles.turnIndicator}>
          <Text style={styles.turnText}>Playing...</Text>
        </View>
      )}

      {/* Pass indicator */}
      {player.passedThisTurn && !player.hasFinished && (
        <View style={styles.passIndicator}>
          <Text style={styles.passText}>Passed</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  left: {
    position: 'absolute',
    left: 10,
    top: '35%',
  },
  top: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
  },
  right: {
    position: 'absolute',
    right: 10,
    top: '35%',
  },
  bottom: {
    // Main player - positioned by parent
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 100,
  },
  currentTurn: {
    backgroundColor: 'rgba(52, 152, 219, 0.3)',
    borderWidth: 2,
    borderColor: '#3498db',
  },
  finished: {
    backgroundColor: 'rgba(46, 204, 113, 0.2)',
    borderWidth: 1,
    borderColor: '#2ecc71',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2c3e50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: 'bold',
  },
  nameContainer: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  rankBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  rankText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  statsContainer: {
    alignItems: 'flex-end',
  },
  cardCount: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
  },
  points: {
    color: '#f1c40f',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardsContainer: {
    marginTop: 8,
  },
  turnIndicator: {
    position: 'absolute',
    bottom: -20,
    backgroundColor: '#3498db',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  turnText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  passIndicator: {
    position: 'absolute',
    bottom: -20,
    backgroundColor: '#e74c3c',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  passText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
