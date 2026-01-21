import { Card, CardValue, Player, GameState } from './types';
import { getValidPlays, canPlayCards, checkRevolution } from './rules';
import { groupCardsByValue, sortHand } from './deck';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

interface BotDecision {
  action: 'play' | 'pass';
  cards?: Card[];
}

/**
 * Main bot decision function
 */
export const makeBotDecision = (
  player: Player,
  gameState: GameState,
  difficulty: BotDifficulty
): BotDecision => {
  const validPlays = getValidPlays(
    player.hand,
    gameState.currentPile,
    gameState.isRevolution
  );

  // No valid plays - must pass
  if (validPlays.length === 0) {
    return { action: 'pass' };
  }

  switch (difficulty) {
    case 'easy':
      return makeEasyDecision(player, gameState, validPlays);
    case 'medium':
      return makeMediumDecision(player, gameState, validPlays);
    case 'hard':
      return makeHardDecision(player, gameState, validPlays);
    default:
      return makeEasyDecision(player, gameState, validPlays);
  }
};

/**
 * Easy bot: Plays lowest valid cards, passes often
 */
const makeEasyDecision = (
  player: Player,
  gameState: GameState,
  validPlays: Card[][]
): BotDecision => {
  // 30% chance to pass even if can play (unless starting turn)
  if (gameState.currentPile.length > 0 && Math.random() < 0.3) {
    return { action: 'pass' };
  }

  // Sort plays by value and pick the lowest
  const sortedPlays = [...validPlays].sort((a, b) => {
    const valueA = a[0].value;
    const valueB = b[0].value;
    if (gameState.isRevolution) {
      return valueB - valueA; // Higher value is weaker in revolution
    }
    return valueA - valueB; // Lower value is weaker normally
  });

  return {
    action: 'play',
    cards: sortedPlays[0],
  };
};

/**
 * Medium bot: Basic strategy, considers card conservation
 */
const makeMediumDecision = (
  player: Player,
  gameState: GameState,
  validPlays: Card[][]
): BotDecision => {
  const groups = groupCardsByValue(player.hand);

  // If we only have a few cards left, play aggressively
  if (player.hand.length <= 4) {
    return playBestAvailable(validPlays, gameState.isRevolution);
  }

  // Check if we have potential 4-of-a-kind to protect
  const fourOfAKinds = Array.from(groups.entries()).filter(([_, cards]) => cards.length === 4);

  // If starting a turn, prefer playing singles of isolated cards
  if (gameState.currentPile.length === 0) {
    const singlePlays = validPlays.filter(p => p.length === 1);
    if (singlePlays.length > 0) {
      // Prefer playing from groups that don't form part of a larger set
      const isolatedPlays = singlePlays.filter(play => {
        const value = play[0].value;
        const group = groups.get(value);
        return group && group.length <= 2;
      });

      if (isolatedPlays.length > 0) {
        return {
          action: 'play',
          cards: isolatedPlays[Math.floor(Math.random() * isolatedPlays.length)],
        };
      }
    }
  }

  // 15% chance to pass to conserve cards
  if (gameState.currentPile.length > 0 && Math.random() < 0.15) {
    return { action: 'pass' };
  }

  // Play the lowest valid option
  return playLowestAvailable(validPlays, gameState.isRevolution);
};

/**
 * Hard bot: Strategic play, analyzes game state
 */
const makeHardDecision = (
  player: Player,
  gameState: GameState,
  validPlays: Card[][]
): BotDecision => {
  const groups = groupCardsByValue(player.hand);
  const playersRemaining = gameState.players.filter(p => !p.hasFinished && p.hand.length > 0);
  const isLastPlayer = playersRemaining.length <= 2;

  // Check for 4-of-a-kind opportunities
  const fourOfAKindPlays = validPlays.filter(p => p.length === 4);

  // Strategic revolution triggering
  if (fourOfAKindPlays.length > 0 && !gameState.isRevolution) {
    // Trigger revolution if we have many low cards
    const lowCards = player.hand.filter(c => c.value <= 6);
    if (lowCards.length >= player.hand.length * 0.6) {
      return {
        action: 'play',
        cards: fourOfAKindPlays[0],
      };
    }
  }

  // Cancel revolution if we have many high cards
  if (fourOfAKindPlays.length > 0 && gameState.isRevolution) {
    const highCards = player.hand.filter(c => c.value >= 13);
    if (highCards.length >= player.hand.length * 0.5) {
      return {
        action: 'play',
        cards: fourOfAKindPlays[0],
      };
    }
  }

  // If close to winning, play aggressively
  if (player.hand.length <= 3) {
    return playBestAvailable(validPlays, gameState.isRevolution);
  }

  // Starting a new turn - be strategic
  if (gameState.currentPile.length === 0) {
    return startTurnStrategically(player, validPlays, groups, gameState.isRevolution);
  }

  // Consider the current pile value
  const pileValue = gameState.currentPile[0]?.value || 3;

  // If pile value is very high (close to 2 or Joker), consider passing
  if (!gameState.isRevolution && pileValue >= 14) {
    // Only play if we have Joker or 2
    const strongPlays = validPlays.filter(p => p[0].value >= 15);
    if (strongPlays.length === 0 && Math.random() < 0.7) {
      return { action: 'pass' };
    }
    if (strongPlays.length > 0) {
      return {
        action: 'play',
        cards: strongPlays[0],
      };
    }
  }

  // In revolution with low pile value, be more conservative
  if (gameState.isRevolution && pileValue <= 6) {
    const strongPlays = validPlays.filter(p => p[0].value <= 5);
    if (strongPlays.length === 0 && Math.random() < 0.6) {
      return { action: 'pass' };
    }
  }

  // Default: play lowest that beats the pile
  return playLowestAvailable(validPlays, gameState.isRevolution);
};

/**
 * Helper: Play the lowest valid cards
 */
const playLowestAvailable = (validPlays: Card[][], isRevolution: boolean): BotDecision => {
  const sorted = [...validPlays].sort((a, b) => {
    if (isRevolution) {
      return b[0].value - a[0].value;
    }
    return a[0].value - b[0].value;
  });

  return {
    action: 'play',
    cards: sorted[0],
  };
};

/**
 * Helper: Play the best valid cards
 */
const playBestAvailable = (validPlays: Card[][], isRevolution: boolean): BotDecision => {
  const sorted = [...validPlays].sort((a, b) => {
    if (isRevolution) {
      return a[0].value - b[0].value;
    }
    return b[0].value - a[0].value;
  });

  return {
    action: 'play',
    cards: sorted[0],
  };
};

/**
 * Helper: Strategic turn starting
 */
const startTurnStrategically = (
  player: Player,
  validPlays: Card[][],
  groups: Map<CardValue, Card[]>,
  isRevolution: boolean
): BotDecision => {
  // Prefer playing pairs/triples to get rid of cards faster
  const multiPlays = validPlays.filter(p => p.length >= 2);
  if (multiPlays.length > 0) {
    // Pick the lowest multi-play
    const sorted = [...multiPlays].sort((a, b) => {
      if (isRevolution) {
        return b[0].value - a[0].value;
      }
      return a[0].value - b[0].value;
    });
    return {
      action: 'play',
      cards: sorted[0],
    };
  }

  // If only singles, play isolated cards first
  const singlePlays = validPlays.filter(p => p.length === 1);
  const isolatedPlays = singlePlays.filter(play => {
    const value = play[0].value;
    const group = groups.get(value);
    return group && group.length === 1;
  });

  if (isolatedPlays.length > 0) {
    const sorted = [...isolatedPlays].sort((a, b) => {
      if (isRevolution) {
        return b[0].value - a[0].value;
      }
      return a[0].value - b[0].value;
    });
    return {
      action: 'play',
      cards: sorted[0],
    };
  }

  return playLowestAvailable(validPlays, isRevolution);
};

/**
 * Bot card exchange for rounds 2 & 3
 * Returns cards to give (tycoon/rich choosing cards to give)
 */
export const chooseBotExchangeCards = (
  hand: Card[],
  count: number,
  isGivingBest: boolean,
  isRevolution: boolean,
  difficulty: BotDifficulty
): Card[] => {
  const sorted = sortHand(hand, isRevolution);

  if (isGivingBest) {
    // Must give best cards (beggar/poor giving tribute)
    if (isRevolution) {
      return sorted.slice(0, count); // Lowest values are best in revolution
    }
    return sorted.slice(-count); // Highest values are best normally
  }

  // Giving worst cards (tycoon/rich returning cards)
  // Hard bots might give strategically bad cards
  if (difficulty === 'hard') {
    // Give isolated low cards
    const groups = groupCardsByValue(hand);
    const isolatedCards = hand.filter(c => {
      const group = groups.get(c.value);
      return group && group.length === 1;
    });

    if (isolatedCards.length >= count) {
      const sortedIsolated = sortHand(isolatedCards, isRevolution);
      return sortedIsolated.slice(0, count);
    }
  }

  // Default: give worst cards
  if (isRevolution) {
    return sorted.slice(-count); // Highest values are worst in revolution
  }
  return sorted.slice(0, count); // Lowest values are worst normally
};

// Bot names for fun
export const BOT_NAMES = [
  'Robo-Rick',
  'AI-lexis',
  'Bot-sworth',
  'Circuit-Sara',
  'Data-Dan',
  'Logic-Lucy',
  'Byte-Brian',
  'Algo-Amy',
];

export const getRandomBotName = (usedNames: string[] = []): string => {
  const available = BOT_NAMES.filter(n => !usedNames.includes(n));
  if (available.length === 0) {
    return `Bot-${Math.floor(Math.random() * 1000)}`;
  }
  return available[Math.floor(Math.random() * available.length)];
};
