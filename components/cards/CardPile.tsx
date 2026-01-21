import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from './Card';
import { Card as CardType } from '../../lib/game/types';

interface CardPileProps {
  cards: CardType[];
  lastPlayerName?: string;
}

export const CardPile: React.FC<CardPileProps> = ({ cards, lastPlayerName }) => {
  if (cards.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyPile}>
          <Text style={styles.emptyText}>Play Cards</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.pile}>
        {cards.map((card, index) => (
          <View
            key={card.id}
            style={[
              styles.cardWrapper,
              {
                transform: [
                  { rotate: `${(index - (cards.length - 1) / 2) * 8}deg` },
                  { translateX: (index - (cards.length - 1) / 2) * 15 },
                ],
                zIndex: index,
              },
            ]}
          >
            <Card card={card} size="medium" disabled />
          </View>
        ))}
      </View>
      {lastPlayerName && (
        <Text style={styles.playerName}>{lastPlayerName}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  pile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
  },
  cardWrapper: {
    position: 'absolute',
  },
  emptyPile: {
    width: 80,
    height: 100,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    textAlign: 'center',
  },
  playerName: {
    color: '#fff',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '500',
  },
});
