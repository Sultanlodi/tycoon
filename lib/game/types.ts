// Card suits
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

// Card values: 3-10, then J(11), Q(12), K(13), A(14), 2(15), Joker(16)
export type CardValue = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

export interface Card {
  id: string;
  suit: Suit | 'joker';
  value: CardValue;
  display: string;
}

export type PlayerRank = 'tycoon' | 'rich' | 'poor' | 'beggar' | 'none';

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
  hand: Card[];
  rank: PlayerRank;
  points: number;
  hasFinished: boolean;
  finishOrder: number | null;
  seatPosition: number;
  passedThisTurn: boolean;
}

// Player in waiting room (before game starts)
export interface WaitingPlayer {
  id: string;
  name: string;
  isBot: boolean;
  isReady: boolean;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  currentPile: Card[];
  currentPilePlayerId: string | null;
  discardPile: Card[];
  currentRound: number;
  totalRounds: number;
  isRevolution: boolean;
  passCount: number;
  gamePhase: 'waiting' | 'card_exchange' | 'playing' | 'round_end' | 'game_end';
  finishOrder: string[];
  lastPlayedCards: Card[];
  turnHistory: TurnAction[];
}

export interface TurnAction {
  playerId: string;
  playerName: string;
  action: 'play' | 'pass';
  cards?: Card[];
  triggeredRevolution?: boolean;
  timestamp: number;
}

// Points awarded based on rank
export const RANK_POINTS: Record<PlayerRank, number> = {
  tycoon: 20,
  rich: 10,
  poor: 5,
  beggar: 0,
  none: 0,
};

// Card value display names
export const VALUE_DISPLAY: Record<CardValue, string> = {
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
  15: '2',
  16: 'Joker',
};

// Suit symbols for display
export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

// Suit colors
export const SUIT_COLORS: Record<Suit | 'joker', string> = {
  hearts: '#e74c3c',
  diamonds: '#e74c3c',
  clubs: '#2c3e50',
  spades: '#2c3e50',
  joker: '#9b59b6',
};
