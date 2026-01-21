import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Card } from './Card';
import { Card as CardType } from '../../lib/game/types';

interface CardHandProps {
  cards: CardType[];
  selectedCards: CardType[];
  onCardPress: (card: CardType) => void;
  disabled?: boolean;
  isCurrentPlayer?: boolean;
}

export const CardHand: React.FC<CardHandProps> = ({
  cards,
  selectedCards,
  onCardPress,
  disabled = false,
  isCurrentPlayer = false,
}) => {
  const selectedIds = new Set(selectedCards.map((c) => c.id));

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.hand}>
          {cards.map((card, index) => (
            <View
              key={card.id}
              style={[
                styles.cardWrapper,
                { marginLeft: index === 0 ? 0 : -30 },
                { zIndex: index },
              ]}
            >
              <Card
                card={card}
                selected={selectedIds.has(card.id)}
                onPress={() => onCardPress(card)}
                disabled={disabled || !isCurrentPlayer}
                size="medium"
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

interface OpponentHandProps {
  cardCount: number;
  position: 'left' | 'top' | 'right';
}

export const OpponentHand: React.FC<OpponentHandProps> = ({
  cardCount,
  position,
}) => {
  const isHorizontal = position === 'top';
  const maxVisible = isHorizontal ? 10 : 6;
  const visibleCards = Math.min(cardCount, maxVisible);

  return (
    <View
      style={[
        styles.opponentHand,
        isHorizontal ? styles.horizontal : styles.vertical,
      ]}
    >
      {Array.from({ length: visibleCards }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.opponentCardWrapper,
            isHorizontal
              ? { marginLeft: index === 0 ? 0 : -25 }
              : { marginTop: index === 0 ? 0 : -45 },
            { zIndex: index },
            !isHorizontal && { transform: [{ rotate: position === 'left' ? '90deg' : '-90deg' }] },
          ]}
        >
          <Card
            card={{ id: `hidden-${index}`, suit: 'hearts', value: 3, display: '' }}
            faceDown
            size="small"
          />
        </View>
      ))}
      {cardCount > maxVisible && (
        <View style={styles.moreIndicator}>
          <View style={styles.moreText}>
            {/* Text component would go here showing +X more */}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 10,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  hand: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 15, // Space for selected card to pop up
  },
  cardWrapper: {
    // Individual card positioning handled inline
  },
  opponentHand: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizontal: {
    flexDirection: 'row',
  },
  vertical: {
    flexDirection: 'column',
  },
  opponentCardWrapper: {
    // Positioning handled inline
  },
  moreIndicator: {
    marginLeft: 5,
  },
  moreText: {
    // Style for +X indicator
  },
});
