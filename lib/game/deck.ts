import { Card, Suit, CardValue, VALUE_DISPLAY, SUIT_SYMBOLS } from './types';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const VALUES: CardValue[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]; // 3 through 2

/**
 * Creates a unique ID for a card
 */
const createCardId = (suit: Suit | 'joker', value: CardValue): string => {
  return `${suit}-${value}`;
};

/**
 * Creates a display string for a card
 */
const createCardDisplay = (suit: Suit | 'joker', value: CardValue): string => {
  if (suit === 'joker') {
    return 'Joker';
  }
  return `${SUIT_SYMBOLS[suit]} ${VALUE_DISPLAY[value]}`;
};

/**
 * Builds a full 54-card deck (52 standard + 2 jokers)
 */
export const buildDeck = (): Card[] => {
  const deck: Card[] = [];

  // Add all standard cards
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({
        id: createCardId(suit, value),
        suit,
        value,
        display: createCardDisplay(suit, value),
      });
    }
  }

  // Add two jokers
  deck.push({
    id: 'joker-1',
    suit: 'joker',
    value: 16,
    display: 'Joker',
  });

  deck.push({
    id: 'joker-2',
    suit: 'joker',
    value: 16,
    display: 'Joker',
  });

  return deck;
};

/**
 * Fisher-Yates shuffle algorithm
 */
export const shuffleDeck = (deck: Card[]): Card[] => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Deals cards to players
 * Returns an array of hands, one for each player
 */
export const dealCards = (deck: Card[], numPlayers: number): Card[][] => {
  const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
  const shuffled = shuffleDeck(deck);

  // Deal cards one at a time to each player
  shuffled.forEach((card, index) => {
    const playerIndex = index % numPlayers;
    hands[playerIndex].push(card);
  });

  // Sort each hand by value
  hands.forEach(hand => {
    hand.sort((a, b) => a.value - b.value);
  });

  return hands;
};

/**
 * Sorts a hand of cards by value (ascending in normal, descending in revolution)
 */
export const sortHand = (hand: Card[], isRevolution: boolean = false): Card[] => {
  const sorted = [...hand];
  sorted.sort((a, b) => {
    if (isRevolution) {
      return b.value - a.value; // Descending for revolution
    }
    return a.value - b.value; // Ascending for normal
  });
  return sorted;
};

/**
 * Groups cards by value for easier play selection
 */
export const groupCardsByValue = (hand: Card[]): Map<CardValue, Card[]> => {
  const groups = new Map<CardValue, Card[]>();

  for (const card of hand) {
    const existing = groups.get(card.value) || [];
    existing.push(card);
    groups.set(card.value, existing);
  }

  return groups;
};

/**
 * Finds the player with 14 cards (they start first in round 1)
 */
export const findStartingPlayer = (hands: Card[][]): number => {
  // Players with 14 cards go first (if there are any)
  const playersWithFourteen = hands
    .map((hand, index) => ({ index, count: hand.length }))
    .filter(p => p.count === 14);

  if (playersWithFourteen.length > 0) {
    // Random choice among those with 14 cards
    return playersWithFourteen[Math.floor(Math.random() * playersWithFourteen.length)].index;
  }

  // Otherwise random player starts
  return Math.floor(Math.random() * hands.length);
};

/**
 * Gets the best cards from a hand (highest value in normal, lowest in revolution)
 */
export const getBestCards = (hand: Card[], count: number, isRevolution: boolean = false): Card[] => {
  const sorted = sortHand(hand, !isRevolution); // Reverse sort to get best cards first
  return sorted.slice(0, count);
};

/**
 * Gets the worst cards from a hand (lowest value in normal, highest in revolution)
 */
export const getWorstCards = (hand: Card[], count: number, isRevolution: boolean = false): Card[] => {
  const sorted = sortHand(hand, isRevolution);
  return sorted.slice(0, count);
};
