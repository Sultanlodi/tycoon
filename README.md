# Tycoon

A mobile card game based on the classic Japanese game Daifugo (also known as President, Rich Man Poor Man, or Asshole).

## Game Rules

### Overview
- 54 cards including two jokers
- 4 players
- Each player gets 13 or 14 cards (player with 14 cards starts)
- 3 rounds total
- Person with most points after 3 rounds wins!

### Card Hierarchy (lowest to highest)
```
3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → J → Q → K → A → 2 → Joker
```

### Points Per Round
| Rank | Points |
|------|--------|
| Tycoon (1st) | 20 |
| Rich (2nd) | 10 |
| Poor (3rd) | 5 |
| Beggar (4th) | 0 |

### Round 1
1. Cards are shuffled and distributed
2. Random player starts (preference to players with 14 cards)
3. Turn player plays 1-4 cards of the same value
4. Next player must play the same NUMBER of cards with a HIGHER value
5. If a player can't or doesn't want to play, they pass
6. Turn ends when 3 players pass - cards go to discard pile
7. Round ends when all cards are played
8. Rankings: 1st out = Tycoon, 2nd = Rich, 3rd = Poor, 4th = Beggar

### Rounds 2 and 3
1. Cards are reshuffled and dealt
2. **Card Exchange:**
   - Beggar MUST give their 2 BEST cards to Tycoon
   - Tycoon chooses any 2 cards to give to Beggar
   - Poor MUST give their BEST card to Rich
   - Rich chooses any 1 card to give to Poor
3. Beggar goes first, then clockwise
4. **Tycoon Demotion:** If previous Tycoon doesn't finish 1st, they become Beggar and are out of the round

### Special Rules
- **8 Rule:** Playing an 8 clears the pile, and you get to play again (any cards you want)
- **3 Counters Joker:** If a Joker is played, a 3 can be played to end the turn instantly, and you go again
- **Joker is Wild:** Joker can substitute for any card. Example: 3 sevens + 1 joker = four 7s
- **Revolution:** Playing 4 of a kind (including with jokers) reverses the card hierarchy for the rest of the round:
  - Normal: `3 → 4 → 5 → ... → 2 → Joker` (3 weakest, Joker strongest)
  - Revolution: `Joker → 2 → ... → 5 → 4 → 3` (Joker weakest, 3 strongest)
  - A second 4-of-a-kind cancels the revolution (back to normal)

### Multiplayer
- Create a room to get a room code
- Share code with friends to join
- Host starts the game when ready
- Empty slots are filled with bots

## Tech Stack

- React Native (Expo)
- TypeScript
- Zustand (state management)
