import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGameStore } from '../../stores/gameStore';
import { CardHand } from '../cards/CardHand';
import { CardPile } from '../cards/CardPile';
import { PlayerSlot } from './PlayerSlot';
import { RevolutionBanner } from './RevolutionBanner';
import { ScoreBoard } from './ScoreBoard';
import { CardExchangeModal } from './CardExchangeModal';
import { canPlayCards } from '../../lib/game/rules';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const GameBoard: React.FC = () => {
  const [showScoreBoard, setShowScoreBoard] = useState(false);

  const {
    players,
    currentPlayerIndex,
    currentPile,
    currentPilePlayerId,
    isRevolution,
    currentRound,
    totalRounds,
    gamePhase,
    selectedCards,
    isProcessingTurn,
    showExchangeModal,
    exchangeCards,
    exchangeTarget,
    cardsToGive,
    selectCard,
    deselectCard,
    playSelectedCards,
    passTurn,
    startNextRound,
    resetGame,
    selectExchangeCard,
    confirmExchange,
  } = useGameStore();

  // Get the main player (index 0) and opponents
  const mainPlayer = players[0];
  const opponents = [players[1], players[2], players[3]]; // left, top, right

  // Check if it's the main player's turn
  const isMainPlayerTurn = currentPlayerIndex === 0 && !mainPlayer?.hasFinished;

  // Get the player who played the current pile
  const pilePlayer = currentPilePlayerId
    ? players.find((p) => p.id === currentPilePlayerId)
    : null;

  // Check if selected cards can be played
  const canPlay =
    selectedCards.length > 0 &&
    canPlayCards(currentPile, selectedCards, isRevolution).valid;

  // Get target name for exchange
  const exchangeTargetPlayer = players.find(
    (p) => p.rank === (exchangeTarget === 'beggar' ? 'beggar' : 'poor')
  );

  // Handle card press
  const handleCardPress = (card: any) => {
    if (selectedCards.some((c) => c.id === card.id)) {
      deselectCard(card);
    } else {
      selectCard(card);
    }
  };

  // Handle play button
  const handlePlay = async () => {
    if (!canPlay || isProcessingTurn) return;
    await playSelectedCards();
  };

  // Handle pass button
  const handlePass = () => {
    if (isProcessingTurn || currentPile.length === 0) return;
    passTurn();
  };

  // Handle round/game end
  const handleScoreBoardClose = () => {
    setShowScoreBoard(false);
    if (gamePhase === 'game_end') {
      resetGame();
    } else {
      startNextRound();
    }
  };

  // Show scoreboard when round or game ends
  React.useEffect(() => {
    if (gamePhase === 'round_end' || gamePhase === 'game_end') {
      setShowScoreBoard(true);
    }
  }, [gamePhase]);

  if (!mainPlayer) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading game...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Revolution Banner */}
      <RevolutionBanner isActive={isRevolution} />

      {/* Round indicator */}
      <View style={styles.roundIndicator}>
        <Text style={styles.roundText}>
          Round {currentRound}/{totalRounds}
        </Text>
      </View>

      {/* Turn indicator */}
      {!isMainPlayerTurn && !mainPlayer.hasFinished && (
        <View style={styles.waitingIndicator}>
          <Text style={styles.waitingText}>
            {players[currentPlayerIndex]?.name}'s turn...
          </Text>
        </View>
      )}

      {/* Opponents */}
      {opponents[0] && (
        <PlayerSlot
          player={opponents[0]}
          isCurrentTurn={currentPlayerIndex === 1}
          position="left"
        />
      )}

      {opponents[1] && (
        <PlayerSlot
          player={opponents[1]}
          isCurrentTurn={currentPlayerIndex === 2}
          position="top"
        />
      )}

      {opponents[2] && (
        <PlayerSlot
          player={opponents[2]}
          isCurrentTurn={currentPlayerIndex === 3}
          position="right"
        />
      )}

      {/* Center pile */}
      <View style={styles.centerArea}>
        <CardPile cards={currentPile} lastPlayerName={pilePlayer?.name} />
      </View>

      {/* Main player area - ALWAYS visible */}
      <View style={styles.mainPlayerArea}>
        {/* Player info */}
        <View style={styles.mainPlayerInfo}>
          <View
            style={[
              styles.playerBadge,
              isMainPlayerTurn && styles.playerBadgeActive,
            ]}
          >
            <Text style={styles.playerName}>{mainPlayer.name}</Text>
            <Text style={styles.playerPoints}>{mainPlayer.points} pts</Text>
          </View>

          {mainPlayer.hasFinished && (
            <View style={styles.finishedBadge}>
              <Text style={styles.finishedText}>Finished!</Text>
            </View>
          )}

          {mainPlayer.rank !== 'none' && (
            <View style={[styles.rankBadge, styles[`rank_${mainPlayer.rank}`]]}>
              <Text style={styles.rankText}>
                {mainPlayer.rank.charAt(0).toUpperCase() + mainPlayer.rank.slice(1)}
              </Text>
            </View>
          )}
        </View>

        {/* Action buttons - only show on player's turn */}
        {isMainPlayerTurn && !mainPlayer.hasFinished && gamePhase === 'playing' && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.passButton,
                (currentPile.length === 0 || isProcessingTurn) && styles.disabledButton,
              ]}
              onPress={handlePass}
              disabled={currentPile.length === 0 || isProcessingTurn}
            >
              <Text style={styles.actionButtonText}>Pass</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.playButton,
                (!canPlay || isProcessingTurn) && styles.disabledButton,
              ]}
              onPress={handlePlay}
              disabled={!canPlay || isProcessingTurn}
            >
              <Text style={styles.actionButtonText}>
                Play {selectedCards.length > 0 ? `(${selectedCards.length})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Main player's hand - ALWAYS visible */}
        <CardHand
          cards={mainPlayer.hand}
          selectedCards={selectedCards}
          onCardPress={handleCardPress}
          disabled={!isMainPlayerTurn || isProcessingTurn || gamePhase !== 'playing'}
          isCurrentPlayer={isMainPlayerTurn && gamePhase === 'playing'}
        />
      </View>

      {/* Scoreboard modal */}
      <ScoreBoard
        players={players}
        currentRound={currentRound}
        totalRounds={totalRounds}
        visible={showScoreBoard}
        onClose={handleScoreBoardClose}
        isGameEnd={gamePhase === 'game_end'}
      />

      {/* Card exchange modal */}
      <CardExchangeModal
        visible={showExchangeModal}
        hand={mainPlayer.hand}
        selectedCards={exchangeCards}
        cardsToGive={cardsToGive}
        targetName={exchangeTargetPlayer?.name || 'Player'}
        onSelectCard={selectExchangeCard}
        onConfirm={confirmExchange}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
  },
  roundIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    zIndex: 10,
  },
  roundText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  waitingIndicator: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(52, 152, 219, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    zIndex: 10,
  },
  waitingText: {
    color: '#3498db',
    fontSize: 14,
    fontWeight: '600',
  },
  centerArea: {
    position: 'absolute',
    top: '35%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainPlayerArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 20,
  },
  mainPlayerInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 20,
    gap: 10,
  },
  playerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  playerBadgeActive: {
    backgroundColor: 'rgba(52, 152, 219, 0.3)',
    borderWidth: 2,
    borderColor: '#3498db',
  },
  playerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 12,
  },
  playerPoints: {
    color: '#f1c40f',
    fontSize: 14,
    fontWeight: 'bold',
  },
  finishedBadge: {
    backgroundColor: '#2ecc71',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  finishedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  rankBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  rank_tycoon: {
    backgroundColor: '#f1c40f',
  },
  rank_rich: {
    backgroundColor: '#3498db',
  },
  rank_poor: {
    backgroundColor: '#95a5a6',
  },
  rank_beggar: {
    backgroundColor: '#e74c3c',
  },
  rank_none: {
    backgroundColor: 'transparent',
  },
  rankText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10,
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  passButton: {
    backgroundColor: '#e74c3c',
  },
  playButton: {
    backgroundColor: '#2ecc71',
  },
  disabledButton: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
