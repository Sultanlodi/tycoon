import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Card } from '../cards/Card';
import { Card as CardType } from '../../lib/game/types';

interface CardExchangeModalProps {
  visible: boolean;
  hand: CardType[];
  selectedCards: CardType[];
  cardsToGive: number;
  targetName: string;
  onSelectCard: (card: CardType) => void;
  onConfirm: () => void;
}

export const CardExchangeModal: React.FC<CardExchangeModalProps> = ({
  visible,
  hand,
  selectedCards,
  cardsToGive,
  targetName,
  onSelectCard,
  onConfirm,
}) => {
  const selectedIds = new Set(selectedCards.map((c) => c.id));
  const canConfirm = selectedCards.length === cardsToGive;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Card Exchange</Text>
          <Text style={styles.subtitle}>
            Select {cardsToGive} card{cardsToGive > 1 ? 's' : ''} to give to {targetName}
          </Text>

          <Text style={styles.hint}>
            You can choose any cards from your hand
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardContainer}
          >
            {hand.map((card) => (
              <View
                key={card.id}
                style={[
                  styles.cardWrapper,
                  selectedIds.has(card.id) && styles.cardSelected,
                ]}
              >
                <Card
                  card={card}
                  selected={selectedIds.has(card.id)}
                  onPress={() => onSelectCard(card)}
                  size="medium"
                />
              </View>
            ))}
          </ScrollView>

          <View style={styles.selectionInfo}>
            <Text style={styles.selectionText}>
              Selected: {selectedCards.length} / {cardsToGive}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.confirmButton, !canConfirm && styles.confirmButtonDisabled]}
            onPress={onConfirm}
            disabled={!canConfirm}
          >
            <Text style={styles.confirmButtonText}>
              {canConfirm ? 'Confirm Exchange' : `Select ${cardsToGive - selectedCards.length} more`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    width: '95%',
    maxWidth: 500,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    color: '#f1c40f',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  hint: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
  },
  cardContainer: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: 120,
  },
  cardWrapper: {
    marginHorizontal: 5,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: '#3498db',
    transform: [{ scale: 1.05 }],
  },
  selectionInfo: {
    alignItems: 'center',
    marginVertical: 16,
  },
  selectionText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
  },
  confirmButton: {
    backgroundColor: '#2ecc71',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
