import { create } from 'zustand';
import {
  Card,
  Player,
  PlayerRank,
  GameState,
  TurnAction,
  RANK_POINTS,
  WaitingPlayer,
} from '../lib/game/types';
import { buildDeck, dealCards, sortHand } from '../lib/game/deck';
import {
  canPlayCards,
  checkRevolution,
  checkEightPlayed,
  checkThreeCountersJoker,
  getRankings,
  performBotCardExchange,
  getStartingPlayer,
  checkTycoonDemotion,
  getBotDelay,
  getEffectiveValue,
} from '../lib/game/rules';
import { makeBotDecision, getRandomBotName, BotDifficulty } from '../lib/game/bot';

interface GameStore extends GameState {
  // Room/multiplayer state
  roomId: string | null;
  roomCode: string | null;
  isHost: boolean;
  botDifficulty: BotDifficulty;
  previousTycoonId: string | null;
  waitingPlayers: WaitingPlayer[];

  // UI state
  selectedCards: Card[];
  isProcessingTurn: boolean;
  showExchangeModal: boolean;
  exchangeCards: Card[];
  exchangeTarget: 'beggar' | 'poor' | null;
  cardsToGive: number;
  pendingExchangeCards: Card[];

  // Actions
  initializeGame: (
    playerName: string,
    playerId: string,
    botDifficulty: BotDifficulty,
    otherPlayers?: { id: string; name: string; isBot: boolean }[]
  ) => void;
  selectCard: (card: Card) => void;
  deselectCard: (card: Card) => void;
  clearSelection: () => void;
  playSelectedCards: () => Promise<boolean>;
  passTurn: () => void;
  processNextTurn: () => Promise<void>;
  startNextRound: () => void;
  resetGame: () => void;

  // Card exchange actions
  selectExchangeCard: (card: Card) => void;
  confirmExchange: () => void;

  // Multiplayer/Waiting room actions
  setRoomInfo: (roomId: string, roomCode: string, isHost: boolean) => void;
  syncGameState: (state: Partial<GameState>) => void;
  createRoom: (playerName: string, playerId: string, difficulty: BotDifficulty) => string;
  joinRoom: (roomCode: string, playerName: string, playerId: string) => boolean;
  leaveRoom: () => void;
  startGameFromWaitingRoom: () => void;
  addPlayerToWaitingRoom: (player: WaitingPlayer) => void;
  removePlayerFromWaitingRoom: (playerId: string) => void;
}

const initialState: GameState = {
  players: [],
  currentPlayerIndex: 0,
  currentPile: [],
  currentPilePlayerId: null,
  discardPile: [],
  currentRound: 1,
  totalRounds: 3,
  isRevolution: false,
  passCount: 0,
  gamePhase: 'waiting',
  finishOrder: [],
  lastPlayedCards: [],
  turnHistory: [],
};

// Generate a random 6-character room code
const generateRoomCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,
  roomId: null,
  roomCode: null,
  isHost: false,
  botDifficulty: 'medium',
  previousTycoonId: null,
  waitingPlayers: [],
  selectedCards: [],
  isProcessingTurn: false,
  showExchangeModal: false,
  exchangeCards: [],
  exchangeTarget: null,
  cardsToGive: 0,
  pendingExchangeCards: [],

  initializeGame: (playerName, playerId, botDifficulty, otherPlayers) => {
    const deck = buildDeck();
    const hands = dealCards(deck, 4);

    // Create players
    const usedBotNames: string[] = [];
    const players: Player[] = [];

    // Add the main player at position 0
    players.push({
      id: playerId,
      name: playerName,
      isBot: false,
      hand: sortHand(hands[0]),
      rank: 'none',
      points: 0,
      hasFinished: false,
      finishOrder: null,
      seatPosition: 0,
      passedThisTurn: false,
    });

    // Add other players or bots
    for (let i = 1; i < 4; i++) {
      const otherPlayer = otherPlayers?.[i - 1];

      if (otherPlayer && !otherPlayer.isBot) {
        players.push({
          id: otherPlayer.id,
          name: otherPlayer.name,
          isBot: false,
          hand: sortHand(hands[i]),
          rank: 'none',
          points: 0,
          hasFinished: false,
          finishOrder: null,
          seatPosition: i,
          passedThisTurn: false,
        });
      } else {
        // Add a bot
        const botName = getRandomBotName(usedBotNames);
        usedBotNames.push(botName);

        players.push({
          id: `bot-${i}`,
          name: botName,
          isBot: true,
          botDifficulty,
          hand: sortHand(hands[i]),
          rank: 'none',
          points: 0,
          hasFinished: false,
          finishOrder: null,
          seatPosition: i,
          passedThisTurn: false,
        });
      }
    }

    const startingPlayer = getStartingPlayer(players, 1);

    set({
      players,
      currentPlayerIndex: startingPlayer,
      currentPile: [],
      currentPilePlayerId: null,
      discardPile: [],
      currentRound: 1,
      totalRounds: 3,
      isRevolution: false,
      passCount: 0,
      gamePhase: 'playing',
      finishOrder: [],
      lastPlayedCards: [],
      turnHistory: [],
      botDifficulty,
      previousTycoonId: null,
      selectedCards: [],
      isProcessingTurn: false,
    });

    // If the starting player is a bot, process their turn
    if (players[startingPlayer].isBot) {
      const delay = getBotDelay(players);
      setTimeout(() => get().processNextTurn(), delay);
    }
  },

  selectCard: (card) => {
    const { selectedCards, currentPile } = get();

    // Can select cards of the same value OR jokers (wild)
    if (selectedCards.length > 0) {
      const selectedValue = getEffectiveValue(selectedCards);
      const cardValue = card.value;

      // Allow if: same value, or one is joker, or both are jokers
      if (cardValue !== 16 && selectedValue !== 16 && cardValue !== selectedValue) {
        // Clear and select new card
        set({ selectedCards: [card] });
        return;
      }
    }

    // Check if we're at max selection (based on pile or 4 for starting)
    const maxCards = currentPile.length || 4;
    if (selectedCards.length >= maxCards) {
      return;
    }

    set({ selectedCards: [...selectedCards, card] });
  },

  deselectCard: (card) => {
    const { selectedCards } = get();
    set({
      selectedCards: selectedCards.filter((c) => c.id !== card.id),
    });
  },

  clearSelection: () => {
    set({ selectedCards: [] });
  },

  playSelectedCards: async () => {
    const state = get();
    const { players, currentPlayerIndex, selectedCards, currentPile, isRevolution } = state;

    const currentPlayer = players[currentPlayerIndex];
    if (currentPlayer.isBot) return false;

    // Validate play
    const validation = canPlayCards(currentPile, selectedCards, isRevolution);
    if (!validation.valid) {
      return false;
    }

    // Check for special card effects
    const triggersRevolution = checkRevolution(selectedCards);
    const eightPlayed = checkEightPlayed(selectedCards);
    const threeCountersJoker = checkThreeCountersJoker(currentPile, selectedCards);
    const newRevolutionState = triggersRevolution ? !isRevolution : isRevolution;

    // Remove cards from player's hand
    const updatedPlayers = players.map((p, i) => {
      if (i !== currentPlayerIndex) return p;
      return {
        ...p,
        hand: p.hand.filter((c) => !selectedCards.some((sc) => sc.id === c.id)),
        passedThisTurn: false,
      };
    });

    // Reset pass count for other players
    const resetPassPlayers = updatedPlayers.map((p) => ({
      ...p,
      passedThisTurn: false,
    }));

    // Check if player finished
    const playerFinished = resetPassPlayers[currentPlayerIndex].hand.length === 0;
    let newFinishOrder = [...state.finishOrder];

    if (playerFinished) {
      newFinishOrder.push(currentPlayer.id);
      resetPassPlayers[currentPlayerIndex].hasFinished = true;
      resetPassPlayers[currentPlayerIndex].finishOrder = newFinishOrder.length;
    }

    // Add to turn history
    const turnAction: TurnAction = {
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      action: 'play',
      cards: selectedCards,
      triggeredRevolution: triggersRevolution,
      timestamp: Date.now(),
    };

    // Move old pile to discard
    const newDiscardPile = [...state.discardPile, ...currentPile];

    // Handle 8 played - ends turn immediately, same player starts fresh
    if (eightPlayed) {
      set({
        players: resetPassPlayers,
        currentPile: [],
        currentPilePlayerId: null,
        discardPile: [...newDiscardPile, ...selectedCards],
        isRevolution: newRevolutionState,
        passCount: 0,
        lastPlayedCards: selectedCards,
        finishOrder: newFinishOrder,
        turnHistory: [...state.turnHistory, turnAction],
        selectedCards: [],
        isProcessingTurn: false,
        // currentPlayerIndex stays the same - player who played 8 goes again
      });

      // If player finished, find next player
      if (playerFinished) {
        await get().processNextTurn();
      }
      // Otherwise, same player plays again (pile is empty, they can play anything)
      return true;
    }

    // Handle 3 counters joker - ends turn, same player starts fresh
    if (threeCountersJoker) {
      set({
        players: resetPassPlayers,
        currentPile: [],
        currentPilePlayerId: null,
        discardPile: [...newDiscardPile, ...selectedCards],
        isRevolution: newRevolutionState,
        passCount: 0,
        lastPlayedCards: selectedCards,
        finishOrder: newFinishOrder,
        turnHistory: [...state.turnHistory, turnAction],
        selectedCards: [],
        isProcessingTurn: false,
        // currentPlayerIndex stays the same - player who played 3 goes again
      });

      // If player finished, find next player
      if (playerFinished) {
        await get().processNextTurn();
      }
      // Otherwise, same player plays again
      return true;
    }

    set({
      players: resetPassPlayers,
      currentPile: selectedCards,
      currentPilePlayerId: currentPlayer.id,
      discardPile: newDiscardPile,
      isRevolution: newRevolutionState,
      passCount: 0,
      lastPlayedCards: selectedCards,
      finishOrder: newFinishOrder,
      turnHistory: [...state.turnHistory, turnAction],
      selectedCards: [],
    });

    // Check for round/game end
    await get().processNextTurn();
    return true;
  },

  passTurn: () => {
    const state = get();
    const { players, currentPlayerIndex, passCount } = state;

    const currentPlayer = players[currentPlayerIndex];

    // Add to turn history
    const turnAction: TurnAction = {
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      action: 'pass',
      timestamp: Date.now(),
    };

    // Mark player as passed
    const updatedPlayers = players.map((p, i) => {
      if (i !== currentPlayerIndex) return p;
      return { ...p, passedThisTurn: true };
    });

    set({
      players: updatedPlayers,
      passCount: passCount + 1,
      turnHistory: [...state.turnHistory, turnAction],
      selectedCards: [],
    });

    // Process next turn
    get().processNextTurn();
  },

  processNextTurn: async () => {
    const state = get();
    let { players, currentPlayerIndex, passCount, finishOrder, currentPile, currentPilePlayerId } =
      state;

    set({ isProcessingTurn: true });

    // Count active players (not finished)
    const activePlayers = players.filter((p) => !p.hasFinished);

    // Check if round is over (only one player left with cards)
    if (activePlayers.length <= 1) {
      // Add remaining player to finish order
      if (activePlayers.length === 1) {
        finishOrder = [...finishOrder, activePlayers[0].id];
      }

      // Assign rankings
      const rankings = getRankings(finishOrder);
      const rankedPlayers = players.map((p) => {
        const rank = rankings.get(p.id) || 'none';
        return {
          ...p,
          rank,
          points: p.points + RANK_POINTS[rank],
        };
      });

      // Check for tycoon demotion (rounds 2 & 3)
      const { previousTycoonId, currentRound } = state;
      if (currentRound > 1 && previousTycoonId) {
        const demoted = checkTycoonDemotion(previousTycoonId, finishOrder);
        if (demoted) {
          // Previous tycoon becomes beggar
          const demotedIndex = rankedPlayers.findIndex(p => p.id === previousTycoonId);
          if (demotedIndex >= 0) {
            rankedPlayers[demotedIndex].rank = 'beggar';
            rankedPlayers[demotedIndex].points -= RANK_POINTS['tycoon']; // Remove tycoon points
            // They're already finished, just update rank
          }
        }
      }

      // Check if game is over
      if (state.currentRound >= state.totalRounds) {
        set({
          players: rankedPlayers,
          gamePhase: 'game_end',
          finishOrder,
          isProcessingTurn: false,
        });
        return;
      }

      // Round ended
      set({
        players: rankedPlayers,
        gamePhase: 'round_end',
        finishOrder,
        isProcessingTurn: false,
      });
      return;
    }

    // Check if turn ends (everyone passed except pile owner)
    const nonFinishedPlayers = players.filter((p) => !p.hasFinished);
    const passedCount = nonFinishedPlayers.filter(
      (p) => p.passedThisTurn && p.id !== currentPilePlayerId
    ).length;

    if (
      passedCount >= nonFinishedPlayers.length - 1 &&
      currentPile.length > 0 &&
      currentPilePlayerId
    ) {
      // Turn ends - pile owner starts new turn
      const pileOwnerIndex = players.findIndex((p) => p.id === currentPilePlayerId);

      // Add current pile to discard
      const newDiscardPile = [...state.discardPile, ...currentPile];

      // Reset all players' passed state
      const resetPlayers = players.map((p) => ({ ...p, passedThisTurn: false }));

      // If pile owner has finished, find next player
      let nextIndex = pileOwnerIndex;
      if (resetPlayers[nextIndex].hasFinished) {
        do {
          nextIndex = (nextIndex + 1) % 4;
        } while (resetPlayers[nextIndex].hasFinished && nextIndex !== pileOwnerIndex);
      }

      set({
        players: resetPlayers,
        currentPlayerIndex: nextIndex,
        currentPile: [],
        currentPilePlayerId: null,
        discardPile: newDiscardPile,
        passCount: 0,
        isProcessingTurn: false,
      });

      // If next player is a bot, process their turn
      if (resetPlayers[nextIndex].isBot && !resetPlayers[nextIndex].hasFinished) {
        const delay = getBotDelay(resetPlayers);
        await new Promise((resolve) => setTimeout(resolve, delay));
        await processBotTurn(get, set);
      }
      return;
    }

    // Move to next player
    let nextIndex = (currentPlayerIndex + 1) % 4;
    while (players[nextIndex].hasFinished) {
      nextIndex = (nextIndex + 1) % 4;
    }

    set({
      currentPlayerIndex: nextIndex,
      isProcessingTurn: false,
    });

    // If next player is a bot, process their turn
    if (players[nextIndex].isBot) {
      const delay = getBotDelay(players);
      await new Promise((resolve) => setTimeout(resolve, delay));
      await processBotTurn(get, set);
    }
  },

  startNextRound: () => {
    const state = get();
    const { players, currentRound, isRevolution } = state;

    // Save previous tycoon for demotion check
    const previousTycoon = players.find(p => p.rank === 'tycoon');

    // Build new deck and deal
    const deck = buildDeck();
    const hands = dealCards(deck, 4);

    // Create a copy and sort by seat position (don't mutate original)
    const sortedPlayers = [...players].sort((a, b) => a.seatPosition - b.seatPosition);

    // Assign hands to players
    let newPlayers: Player[] = sortedPlayers.map((p, i) => ({
      ...p,
      hand: sortHand(hands[i]),
      hasFinished: false,
      finishOrder: null as number | null,
      passedThisTurn: false,
    }));

    // Only perform card exchange in rounds 2 and 3 (when ranks exist)
    // Use normal card hierarchy (false) since revolution resets each round
    if (currentRound >= 1) {
      const { players: exchangedPlayers } = performBotCardExchange(newPlayers, false);
      newPlayers = exchangedPlayers;
    }

    // Sort hands after exchange
    newPlayers = newPlayers.map((p) => ({
      ...p,
      hand: sortHand(p.hand, isRevolution),
    }));

    // Check if human player needs to select exchange cards
    const humanTycoon = newPlayers.find(p => p.rank === 'tycoon' && !p.isBot);
    const humanRich = newPlayers.find(p => p.rank === 'rich' && !p.isBot);

    const startingIndex = getStartingPlayer(newPlayers, currentRound + 1);

    set({
      players: newPlayers,
      currentPlayerIndex: startingIndex,
      currentPile: [],
      currentPilePlayerId: null,
      discardPile: [],
      currentRound: currentRound + 1,
      isRevolution: false, // Reset revolution each round
      passCount: 0,
      gamePhase: humanTycoon || humanRich ? 'card_exchange' : 'playing',
      finishOrder: [],
      lastPlayedCards: [],
      selectedCards: [],
      isProcessingTurn: false,
      previousTycoonId: previousTycoon?.id || null,
      showExchangeModal: !!(humanTycoon || humanRich),
      exchangeTarget: humanTycoon ? 'beggar' : humanRich ? 'poor' : null,
      cardsToGive: humanTycoon ? 2 : humanRich ? 1 : 0,
    });

    // If starting player is a bot and no exchange needed, process their turn
    if (!humanTycoon && !humanRich && newPlayers[startingIndex].isBot) {
      const delay = getBotDelay(newPlayers);
      setTimeout(() => get().processNextTurn(), delay);
    }
  },

  resetGame: () => {
    set({
      ...initialState,
      roomId: null,
      roomCode: null,
      isHost: false,
      botDifficulty: 'medium',
      previousTycoonId: null,
      waitingPlayers: [],
      selectedCards: [],
      isProcessingTurn: false,
      showExchangeModal: false,
      exchangeCards: [],
      exchangeTarget: null,
      cardsToGive: 0,
      pendingExchangeCards: [],
    });
  },

  selectExchangeCard: (card) => {
    const { exchangeCards, cardsToGive } = get();
    if (exchangeCards.some((c) => c.id === card.id)) {
      set({ exchangeCards: exchangeCards.filter((c) => c.id !== card.id) });
    } else if (exchangeCards.length < cardsToGive) {
      set({ exchangeCards: [...exchangeCards, card] });
    }
  },

  confirmExchange: () => {
    const state = get();
    const { players, exchangeCards, exchangeTarget } = state;

    if (!exchangeTarget) return;

    const targetRank = exchangeTarget === 'beggar' ? 'beggar' : 'poor';
    const giverRank = exchangeTarget === 'beggar' ? 'tycoon' : 'rich';

    const updatedPlayers = players.map(p => {
      if (p.rank === giverRank && !p.isBot) {
        // Remove selected cards from giver
        return {
          ...p,
          hand: p.hand.filter(c => !exchangeCards.some(ec => ec.id === c.id)),
        };
      }
      if (p.rank === targetRank) {
        // Add selected cards to receiver
        return {
          ...p,
          hand: sortHand([...p.hand, ...exchangeCards]),
        };
      }
      return p;
    });

    // Check if there's another exchange needed (rich after tycoon)
    const humanRich = updatedPlayers.find(p => p.rank === 'rich' && !p.isBot);
    const wasExchangingAsTycoon = exchangeTarget === 'beggar';

    if (wasExchangingAsTycoon && humanRich) {
      set({
        players: updatedPlayers,
        exchangeCards: [],
        exchangeTarget: 'poor',
        cardsToGive: 1,
      });
    } else {
      const startingIndex = getStartingPlayer(updatedPlayers, state.currentRound);

      set({
        players: updatedPlayers,
        showExchangeModal: false,
        exchangeCards: [],
        exchangeTarget: null,
        cardsToGive: 0,
        gamePhase: 'playing',
        currentPlayerIndex: startingIndex,
      });

      // If starting player is a bot, process their turn
      if (updatedPlayers[startingIndex].isBot) {
        const delay = getBotDelay(updatedPlayers);
        setTimeout(() => get().processNextTurn(), delay);
      }
    }
  },

  setRoomInfo: (roomId, roomCode, isHost) => {
    set({ roomId, roomCode, isHost });
  },

  syncGameState: (newState) => {
    set((state) => ({ ...state, ...newState }));
  },

  createRoom: (playerName, playerId, difficulty) => {
    const roomCode = generateRoomCode();
    const hostPlayer: WaitingPlayer = {
      id: playerId,
      name: playerName,
      isBot: false,
      isReady: true,
    };

    set({
      roomId: roomCode,
      roomCode,
      isHost: true,
      botDifficulty: difficulty,
      waitingPlayers: [hostPlayer],
      gamePhase: 'waiting',
    });

    return roomCode;
  },

  joinRoom: (roomCode, playerName, playerId) => {
    const { waitingPlayers } = get();

    // Check if room is full
    if (waitingPlayers.length >= 4) {
      return false;
    }

    const newPlayer: WaitingPlayer = {
      id: playerId,
      name: playerName,
      isBot: false,
      isReady: true,
    };

    set({
      roomCode,
      roomId: roomCode,
      isHost: false,
      waitingPlayers: [...waitingPlayers, newPlayer],
      gamePhase: 'waiting',
    });

    return true;
  },

  leaveRoom: () => {
    set({
      ...initialState,
      roomId: null,
      roomCode: null,
      isHost: false,
      waitingPlayers: [],
      selectedCards: [],
      isProcessingTurn: false,
    });
  },

  addPlayerToWaitingRoom: (player) => {
    const { waitingPlayers } = get();
    if (waitingPlayers.length < 4 && !waitingPlayers.some(p => p.id === player.id)) {
      set({ waitingPlayers: [...waitingPlayers, player] });
    }
  },

  removePlayerFromWaitingRoom: (playerId) => {
    const { waitingPlayers, isHost } = get();
    const updatedPlayers = waitingPlayers.filter(p => p.id !== playerId);

    // If host left, assign new host
    let newIsHost = isHost;
    if (waitingPlayers[0]?.id === playerId && updatedPlayers.length > 0) {
      // First remaining player becomes host
      newIsHost = updatedPlayers[0].id === get().roomId;
    }

    set({ waitingPlayers: updatedPlayers, isHost: newIsHost });
  },

  startGameFromWaitingRoom: () => {
    const { waitingPlayers, botDifficulty } = get();

    if (waitingPlayers.length === 0) return;

    // Convert waiting players to game format
    const humanPlayers = waitingPlayers.map((wp, index) => ({
      id: wp.id,
      name: wp.name,
      isBot: wp.isBot,
    }));

    // First player is the one who calls initializeGame
    const mainPlayer = humanPlayers[0];
    const otherHumanPlayers = humanPlayers.slice(1);

    // Initialize game - bots will fill remaining slots
    get().initializeGame(
      mainPlayer.name,
      mainPlayer.id,
      botDifficulty,
      otherHumanPlayers
    );
  },
}));

// Helper function to process bot turns
async function processBotTurn(
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void
): Promise<void> {
  const state = get();
  const { players, currentPlayerIndex, currentPile, isRevolution, botDifficulty } = state;

  const currentPlayer = players[currentPlayerIndex];
  if (!currentPlayer.isBot || currentPlayer.hasFinished) return;

  set({ isProcessingTurn: true });

  const decision = makeBotDecision(
    currentPlayer,
    state,
    currentPlayer.botDifficulty || botDifficulty
  );

  if (decision.action === 'pass') {
    // Bot passes
    const turnAction: TurnAction = {
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      action: 'pass',
      timestamp: Date.now(),
    };

    const updatedPlayers = players.map((p, i) => {
      if (i !== currentPlayerIndex) return p;
      return { ...p, passedThisTurn: true };
    });

    set({
      players: updatedPlayers,
      passCount: state.passCount + 1,
      turnHistory: [...state.turnHistory, turnAction],
    });
  } else if (decision.cards) {
    // Bot plays cards
    const triggersRevolution = checkRevolution(decision.cards);
    const eightPlayed = checkEightPlayed(decision.cards);
    const threeCountersJoker = checkThreeCountersJoker(currentPile, decision.cards);
    const newRevolutionState = triggersRevolution ? !isRevolution : isRevolution;

    const updatedPlayers = players.map((p, i) => {
      if (i !== currentPlayerIndex) return p;
      return {
        ...p,
        hand: p.hand.filter((c) => !decision.cards!.some((dc) => dc.id === c.id)),
        passedThisTurn: false,
      };
    });

    // Reset pass count for other players
    const resetPassPlayers = updatedPlayers.map((p) => ({
      ...p,
      passedThisTurn: false,
    }));

    // Check if bot finished
    const botFinished = resetPassPlayers[currentPlayerIndex].hand.length === 0;
    let newFinishOrder = [...state.finishOrder];

    if (botFinished) {
      newFinishOrder.push(currentPlayer.id);
      resetPassPlayers[currentPlayerIndex].hasFinished = true;
      resetPassPlayers[currentPlayerIndex].finishOrder = newFinishOrder.length;
    }

    const turnAction: TurnAction = {
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      action: 'play',
      cards: decision.cards,
      triggeredRevolution: triggersRevolution,
      timestamp: Date.now(),
    };

    const newDiscardPile = [...state.discardPile, ...currentPile];

    // Handle 8 or 3 counters joker - same player goes again
    if (eightPlayed || threeCountersJoker) {
      set({
        players: resetPassPlayers,
        currentPile: [],
        currentPilePlayerId: null,
        discardPile: [...newDiscardPile, ...decision.cards],
        isRevolution: newRevolutionState,
        passCount: 0,
        lastPlayedCards: decision.cards,
        finishOrder: newFinishOrder,
        turnHistory: [...state.turnHistory, turnAction],
        isProcessingTurn: false,
      });

      // If bot finished, move to next player; otherwise bot plays again
      if (botFinished) {
        await get().processNextTurn();
      } else {
        // Bot plays again - add delay then process another bot turn
        const delay = getBotDelay(resetPassPlayers);
        await new Promise((resolve) => setTimeout(resolve, delay));
        await processBotTurn(get, set);
      }
      return;
    } else {
      set({
        players: resetPassPlayers,
        currentPile: decision.cards,
        currentPilePlayerId: currentPlayer.id,
        discardPile: newDiscardPile,
        isRevolution: newRevolutionState,
        passCount: 0,
        lastPlayedCards: decision.cards,
        finishOrder: newFinishOrder,
        turnHistory: [...state.turnHistory, turnAction],
      });
    }
  }

  set({ isProcessingTurn: false });

  // Continue to next turn
  await get().processNextTurn();
}
