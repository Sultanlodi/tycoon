import { Card, CardValue, Player, PlayerRank, RANK_POINTS } from './types';
import { getBestCards, getWorstCards } from './deck';

/**
 * Compares card values considering revolution state
 * Returns positive if a > b, negative if a < b, 0 if equal
 */
export const compareCardValues = (
  valueA: CardValue,
  valueB: CardValue,
  isRevolution: boolean
): number => {
  if (isRevolution) {
    // In revolution, lower values beat higher values
    // 3 becomes strongest, Joker becomes weakest
    // Higher index in this array = stronger card
    const revolutionOrder = [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3];
    const indexA = revolutionOrder.indexOf(valueA);
    const indexB = revolutionOrder.indexOf(valueB);
    // Return positive if A is stronger (higher index), negative if B is stronger
    return indexA - indexB;
  }
  // Normal order: 3 < 4 < ... < 2 < Joker
  return valueA - valueB;
};

/**
 * Checks if all cards in the array have the same value (or include jokers as wild)
 */
export const allSameValue = (cards: Card[]): boolean => {
  if (cards.length === 0) return true;

  // Get non-joker cards
  const nonJokers = cards.filter(c => c.value !== 16);

  // If all jokers, that's valid
  if (nonJokers.length === 0) return true;

  // All non-jokers must have the same value
  const firstValue = nonJokers[0].value;
  return nonJokers.every(card => card.value === firstValue);
};

/**
 * Gets the effective value of a play (excluding jokers which are wild)
 */
export const getEffectiveValue = (cards: Card[]): CardValue => {
  const nonJokers = cards.filter(c => c.value !== 16);
  if (nonJokers.length === 0) {
    return 16; // All jokers
  }
  return nonJokers[0].value;
};

/**
 * Checks if the selected cards can be played on the current pile
 */
export const canPlayCards = (
  currentPile: Card[],
  selectedCards: Card[],
  isRevolution: boolean
): { valid: boolean; reason?: string } => {
  // Must play at least one card
  if (selectedCards.length === 0) {
    return { valid: false, reason: 'Must select at least one card' };
  }

  // All selected cards must have the same value (jokers are wild)
  if (!allSameValue(selectedCards)) {
    return { valid: false, reason: 'All cards must have the same value (jokers are wild)' };
  }

  // If pile is empty, any valid play is allowed
  if (currentPile.length === 0) {
    return { valid: true };
  }

  const pileValue = getEffectiveValue(currentPile);
  const playValue = getEffectiveValue(selectedCards);

  // Special case: 3 can counter a Joker (ends the turn) - any number of 3s works
  if (pileValue === 16 && playValue === 3) {
    return { valid: true };
  }

  // Must play the same number of cards as the pile
  if (selectedCards.length !== currentPile.length) {
    return {
      valid: false,
      reason: `Must play ${currentPile.length} card(s)`,
    };
  }

  const comparison = compareCardValues(playValue, pileValue, isRevolution);
  if (comparison <= 0) {
    return {
      valid: false,
      reason: 'Must play cards with higher value',
    };
  }

  return { valid: true };
};

/**
 * Checks if playing these cards triggers a revolution (4 of a kind)
 */
export const checkRevolution = (cards: Card[]): boolean => {
  return cards.length === 4 && allSameValue(cards);
};

/**
 * Checks if an 8 was played (ends round instantly)
 */
export const checkEightPlayed = (cards: Card[]): boolean => {
  const effectiveValue = getEffectiveValue(cards);
  return effectiveValue === 8;
};

/**
 * Checks if a 3 was played against a joker (ends turn, player starts next)
 */
export const checkThreeCountersJoker = (pileCards: Card[], playedCards: Card[]): boolean => {
  if (pileCards.length === 0) return false;
  const pileValue = getEffectiveValue(pileCards);
  const playValue = getEffectiveValue(playedCards);
  return pileValue === 16 && playValue === 3;
};

/**
 * Determines rankings based on finish order
 */
export const getRankings = (finishOrder: string[]): Map<string, PlayerRank> => {
  const rankings = new Map<string, PlayerRank>();

  if (finishOrder.length >= 1) rankings.set(finishOrder[0], 'tycoon');
  if (finishOrder.length >= 2) rankings.set(finishOrder[1], 'rich');
  if (finishOrder.length >= 3) rankings.set(finishOrder[2], 'poor');
  if (finishOrder.length >= 4) rankings.set(finishOrder[3], 'beggar');

  return rankings;
};

/**
 * Awards points based on rank
 */
export const getPointsForRank = (rank: PlayerRank): number => {
  return RANK_POINTS[rank];
};

/**
 * Performs card exchange at the start of rounds 2 and 3
 * Beggar gives 2 best cards to Tycoon
 * Poor gives 1 best card to Rich
 * Tycoon/Rich give cards back (bots auto-select worst, humans choose via modal)
 */
export const performBotCardExchange = (
  players: Player[],
  isRevolution: boolean
): { players: Player[]; exchanges: CardExchange[] } => {
  // Create deep copies of players with their hands
  const updatedPlayers = players.map(p => ({
    ...p,
    hand: [...p.hand],
  }));

  const exchanges: CardExchange[] = [];

  const tycoon = updatedPlayers.find(p => p.rank === 'tycoon');
  const rich = updatedPlayers.find(p => p.rank === 'rich');
  const poor = updatedPlayers.find(p => p.rank === 'poor');
  const beggar = updatedPlayers.find(p => p.rank === 'beggar');

  // If ranks aren't set (round 1), skip exchange
  if (!tycoon || !rich || !poor || !beggar) {
    console.log('Skipping exchange - missing ranks:', {
      hasTycoon: !!tycoon, hasRich: !!rich, hasPoor: !!poor, hasBeggar: !!beggar
    });
    return { players: updatedPlayers, exchanges };
  }

  console.log('Performing card exchange...');
  console.log('Beggar hand before:', beggar.hand.map(c => c.display));
  console.log('Tycoon hand before:', tycoon.hand.map(c => c.display));

  // Beggar MUST give 2 best cards to Tycoon
  const beggarBestCards = getBestCards(beggar.hand, 2, isRevolution);
  console.log('Beggar giving:', beggarBestCards.map(c => c.display));
  beggar.hand = beggar.hand.filter(c => !beggarBestCards.some(bc => bc.id === c.id));
  tycoon.hand.push(...beggarBestCards);

  console.log('Beggar hand after:', beggar.hand.map(c => c.display));
  console.log('Tycoon hand after:', tycoon.hand.map(c => c.display));

  exchanges.push({
    from: beggar.id,
    to: tycoon.id,
    cards: beggarBestCards,
    type: 'tribute',
  });

  // Tycoon gives 2 cards to Beggar (bot chooses worst)
  if (tycoon.isBot) {
    const tycoonWorstCards = getWorstCards(tycoon.hand, 2, isRevolution);
    tycoon.hand = tycoon.hand.filter(c => !tycoonWorstCards.some(tc => tc.id === c.id));
    beggar.hand.push(...tycoonWorstCards);
    exchanges.push({
      from: tycoon.id,
      to: beggar.id,
      cards: tycoonWorstCards,
      type: 'return',
    });
  }

  // Poor MUST give 1 best card to Rich
  console.log('Poor hand before:', poor.hand.map(c => c.display));
  console.log('Rich hand before:', rich.hand.map(c => c.display));

  const poorBestCards = getBestCards(poor.hand, 1, isRevolution);
  console.log('Poor giving:', poorBestCards.map(c => c.display));
  poor.hand = poor.hand.filter(c => !poorBestCards.some(pc => pc.id === c.id));
  rich.hand.push(...poorBestCards);

  console.log('Poor hand after:', poor.hand.map(c => c.display));
  console.log('Rich hand after:', rich.hand.map(c => c.display));

  exchanges.push({
    from: poor.id,
    to: rich.id,
    cards: poorBestCards,
    type: 'tribute',
  });

  // Rich gives 1 card to Poor (bot chooses worst)
  if (rich.isBot) {
    const richWorstCards = getWorstCards(rich.hand, 1, isRevolution);
    rich.hand = rich.hand.filter(c => !richWorstCards.some(rc => rc.id === c.id));
    poor.hand.push(...richWorstCards);
    exchanges.push({
      from: rich.id,
      to: poor.id,
      cards: richWorstCards,
      type: 'return',
    });
  }

  return { players: updatedPlayers, exchanges };
};

export interface CardExchange {
  from: string;
  to: string;
  cards: Card[];
  type: 'tribute' | 'return';
}

/**
 * Gets valid plays for a hand given the current pile
 */
export const getValidPlays = (
  hand: Card[],
  currentPile: Card[],
  isRevolution: boolean
): Card[][] => {
  const validPlays: Card[][] = [];

  // Group cards by value
  const groups = new Map<CardValue, Card[]>();
  for (const card of hand) {
    const existing = groups.get(card.value) || [];
    existing.push(card);
    groups.set(card.value, existing);
  }

  const requiredCount = currentPile.length || 1;
  const jokers = groups.get(16) || [];

  // Check each group (including combinations with jokers)
  for (const [value, cards] of groups) {
    if (value === 16) continue; // Handle jokers separately

    // Check if we can make the required count with jokers
    for (let jokerCount = 0; jokerCount <= Math.min(jokers.length, requiredCount); jokerCount++) {
      const regularCount = requiredCount - jokerCount;

      if (cards.length < regularCount) continue;

      // Get combinations of regular cards
      const regularCombos = getCombinations(cards, regularCount);
      const jokerCombos = jokerCount > 0 ? getCombinations(jokers, jokerCount) : [[]];

      for (const regularCombo of regularCombos) {
        for (const jokerCombo of jokerCombos) {
          const play = [...regularCombo, ...jokerCombo];
          if (play.length === requiredCount && canPlayCards(currentPile, play, isRevolution).valid) {
            // Avoid duplicates
            if (!validPlays.some(vp =>
              vp.length === play.length &&
              vp.every(c => play.some(p => p.id === c.id))
            )) {
              validPlays.push(play);
            }
          }
        }
      }
    }
  }

  // Pure joker plays (if pile is empty or all jokers beat current)
  if (jokers.length >= requiredCount) {
    const jokerCombos = getCombinations(jokers, requiredCount);
    for (const combo of jokerCombos) {
      if (canPlayCards(currentPile, combo, isRevolution).valid) {
        if (!validPlays.some(vp =>
          vp.length === combo.length &&
          vp.every(c => combo.some(p => p.id === c.id))
        )) {
          validPlays.push(combo);
        }
      }
    }
  }

  return validPlays;
};

/**
 * Helper to get all combinations of size k from an array
 */
const getCombinations = <T>(arr: T[], k: number): T[][] => {
  if (k === 0) return [[]];
  if (k === 1) return arr.map(item => [item]);
  if (k === arr.length) return [arr];
  if (k > arr.length) return [];

  const result: T[][] = [];

  const combine = (start: number, combo: T[]) => {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }

    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  };

  combine(0, []);
  return result;
};

/**
 * Checks if previous tycoon lost their title
 */
export const checkTycoonDemotion = (
  previousTycoonId: string | null,
  finishOrder: string[]
): boolean => {
  if (!previousTycoonId) return false;
  // If the previous tycoon is not first in finish order, they get demoted
  return finishOrder.length > 0 && finishOrder[0] !== previousTycoonId;
};

/**
 * Determines the starting player for a round
 */
export const getStartingPlayer = (
  players: Player[],
  round: number
): number => {
  if (round === 1) {
    // Random player with 14 cards, or random if equal
    const playersWithFourteen = players.filter(p => p.hand.length === 14);
    if (playersWithFourteen.length > 0) {
      const starter = playersWithFourteen[Math.floor(Math.random() * playersWithFourteen.length)];
      return players.findIndex(p => p.id === starter.id);
    }
    return Math.floor(Math.random() * players.length);
  }

  // Rounds 2 and 3: Beggar starts
  const beggarIndex = players.findIndex(p => p.rank === 'beggar');
  return beggarIndex >= 0 ? beggarIndex : 0;
};

/**
 * Check if all human players have finished (for speed mode)
 * Bots speed up only when no humans are actively playing
 */
export const shouldSpeedUpBots = (players: Player[]): boolean => {
  const humansStillPlaying = players.filter(p => !p.isBot && !p.hasFinished);
  return humansStillPlaying.length === 0;
};

/**
 * Get bot delay based on whether speed mode is active
 * - Normal speed when human is still playing (so they can watch)
 * - Fast speed once all humans finish (just bots remaining)
 */
export const getBotDelay = (players: Player[]): number => {
  if (shouldSpeedUpBots(players)) {
    return 200; // Fast: 200ms when only bots remain
  }
  return 1200; // Normal: 1.2s when human is watching
};
