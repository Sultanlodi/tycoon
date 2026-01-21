import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Card as CardType, Suit, SUIT_SYMBOLS, SUIT_COLORS, VALUE_DISPLAY } from '../../lib/game/types';

interface CardProps {
  card: CardType;
  onPress?: () => void;
  selected?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export const Card: React.FC<CardProps> = ({
  card,
  onPress,
  selected = false,
  disabled = false,
  faceDown = false,
  size = 'medium',
}) => {
  const dimensions = SIZE_DIMENSIONS[size];
  const color = SUIT_COLORS[card.suit];
  const isJoker = card.suit === 'joker';

  if (faceDown) {
    return (
      <View style={[styles.card, styles.faceDown, dimensions]}>
        <View style={styles.backPattern}>
          <Text style={styles.backText}>T</Text>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[
        styles.card,
        dimensions,
        selected && styles.selected,
        disabled && styles.disabled,
      ]}
    >
      {/* Top left corner */}
      <View style={styles.corner}>
        <Text style={[styles.value, { color }]}>{VALUE_DISPLAY[card.value]}</Text>
        {!isJoker && (
          <Text style={[styles.suit, { color }]}>{SUIT_SYMBOLS[card.suit as Suit]}</Text>
        )}
      </View>

      {/* Center */}
      <View style={styles.center}>
        {isJoker ? (
          <Text style={[styles.jokerText, { fontSize: dimensions.centerFontSize }]}>
            JOKER
          </Text>
        ) : (
          <Text style={[styles.centerSuit, { color, fontSize: dimensions.centerFontSize }]}>
            {SUIT_SYMBOLS[card.suit as Suit]}
          </Text>
        )}
      </View>

      {/* Bottom right corner (rotated) */}
      <View style={[styles.corner, styles.bottomCorner]}>
        <Text style={[styles.value, { color }]}>{VALUE_DISPLAY[card.value]}</Text>
        {!isJoker && (
          <Text style={[styles.suit, { color }]}>{SUIT_SYMBOLS[card.suit as Suit]}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const SIZE_DIMENSIONS = {
  small: {
    width: 45,
    height: 65,
    borderRadius: 4,
    centerFontSize: 20,
  },
  medium: {
    width: 60,
    height: 85,
    borderRadius: 6,
    centerFontSize: 28,
  },
  large: {
    width: 80,
    height: 115,
    borderRadius: 8,
    centerFontSize: 36,
  },
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    padding: 4,
    justifyContent: 'space-between',
  },
  selected: {
    borderColor: '#3498db',
    borderWidth: 2,
    transform: [{ translateY: -10 }],
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  disabled: {
    opacity: 0.5,
  },
  faceDown: {
    backgroundColor: '#1a1a2e',
    borderColor: '#16213e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backPattern: {
    width: '80%',
    height: '80%',
    backgroundColor: '#16213e',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e94560',
  },
  backText: {
    color: '#e94560',
    fontSize: 24,
    fontWeight: 'bold',
  },
  corner: {
    alignItems: 'center',
  },
  bottomCorner: {
    alignSelf: 'flex-end',
    transform: [{ rotate: '180deg' }],
  },
  value: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  suit: {
    fontSize: 12,
    marginTop: -2,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerSuit: {
    fontWeight: 'bold',
  },
  jokerText: {
    color: '#9b59b6',
    fontWeight: 'bold',
    transform: [{ rotate: '-15deg' }],
  },
});
