"""
Texas Hold'em Poker - Game Logic
================================
- Standard 52-card deck
- Hand evaluation (all 10 hand types)
- Game state machine: waiting -> pre_flop -> flop -> turn -> river -> showdown -> hand_end
- Betting round management with proper position logic
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Set
from itertools import combinations
from collections import Counter
import random
import time

# ============== Card System ==============

POKER_SUITS = ['hearts', 'diamonds', 'clubs', 'spades']
POKER_VALUES = list(range(2, 15))  # 2 through 14 (Ace)

SUIT_SYMBOLS = {
    'hearts': '\u2665',
    'diamonds': '\u2666',
    'clubs': '\u2663',
    'spades': '\u2660',
}

VALUE_DISPLAY = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
    9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
}

HAND_RANK_NAMES = {
    9: 'Royal Flush',
    8: 'Straight Flush',
    7: 'Four of a Kind',
    6: 'Full House',
    5: 'Flush',
    4: 'Straight',
    3: 'Three of a Kind',
    2: 'Two Pair',
    1: 'One Pair',
    0: 'High Card',
}

# ============== Blind Schedule ==============

BLIND_SCHEDULE = [
    (10, 20),
    (15, 30),
    (25, 50),
    (50, 100),
    (75, 150),
    (100, 200),
    (150, 300),
    (200, 400),
    (300, 600),
    (500, 1000),
]

HANDS_PER_BLIND_LEVEL = 10
TURN_TIME_LIMIT = 30   # seconds
POST_HAND_DELAY = 10   # seconds – grace period after hand ends


# ============== Data Models ==============

@dataclass
class PokerCard:
    id: str
    suit: str
    value: int
    display: str


@dataclass
class PokerPlayer:
    id: str
    name: str
    stack: int = 0
    hole_cards: List[PokerCard] = field(default_factory=list)
    is_folded: bool = False
    current_bet: int = 0
    total_bet: int = 0
    is_all_in: bool = False
    is_sitting_out: bool = False
    seat: int = 0
    sid: Optional[str] = None
    is_bot: bool = False


@dataclass
class PokerRoom:
    code: str
    host_id: str
    game_type: str = 'poker'
    players: Dict[str, PokerPlayer] = field(default_factory=dict)
    community_cards: List[PokerCard] = field(default_factory=list)
    deck: List[PokerCard] = field(default_factory=list)
    pot: int = 0
    current_bet: int = 0
    dealer_seat: int = -1
    current_player_index: int = 0
    game_phase: str = 'waiting'
    small_blind: int = 10
    big_blind: int = 20
    hand_number: int = 0
    needs_action: Set[str] = field(default_factory=set)
    hand_players: List[str] = field(default_factory=list)
    last_results: Optional[dict] = None
    created_at: float = field(default_factory=time.time)
    # Blind levels
    blind_level: int = 0
    # Turn timer
    turn_start_time: float = 0.0
    # Folded cards (captured server-side, never auto-sent to clients)
    folded_cards: Dict[str, List] = field(default_factory=dict)
    # Hands that folded players have opted to reveal post-hand
    shown_hands: Dict[str, List] = field(default_factory=dict)
    # Auto-deal flag (prevents duplicate timers)
    auto_deal_pending: bool = False


# ============== Deck ==============

def build_poker_deck() -> List[PokerCard]:
    deck = []
    for suit in POKER_SUITS:
        for value in POKER_VALUES:
            card_id = f"{suit}-{value}"
            display = f"{VALUE_DISPLAY[value]}{SUIT_SYMBOLS[suit]}"
            deck.append(PokerCard(id=card_id, suit=suit, value=value, display=display))
    return deck


def shuffle_and_deal(room: PokerRoom):
    room.deck = build_poker_deck()
    random.shuffle(room.deck)


# ============== Hand Evaluation ==============

def evaluate_five(cards: List[PokerCard]) -> Tuple:
    """
    Evaluate exactly 5 cards. Returns a comparable tuple.
    Higher tuple = better hand.
    """
    values = sorted([c.value for c in cards], reverse=True)
    suits = [c.suit for c in cards]

    is_flush = len(set(suits)) == 1

    # Straight check
    unique_vals = sorted(set(values), reverse=True)
    is_straight = False
    straight_high = 0

    if len(unique_vals) == 5:
        if unique_vals[0] - unique_vals[4] == 4:
            is_straight = True
            straight_high = unique_vals[0]
        elif unique_vals == [14, 5, 4, 3, 2]:
            is_straight = True
            straight_high = 5  # wheel

    counts = Counter(values)
    # Sort by (count desc, value desc)
    grouped = sorted(counts.items(), key=lambda x: (x[1], x[0]), reverse=True)

    if is_flush and is_straight:
        if straight_high == 14:
            return (9, 14)  # Royal Flush
        return (8, straight_high)  # Straight Flush

    if grouped[0][1] == 4:
        return (7, grouped[0][0], grouped[1][0])

    if grouped[0][1] == 3 and grouped[1][1] == 2:
        return (6, grouped[0][0], grouped[1][0])

    if is_flush:
        return (5,) + tuple(values)

    if is_straight:
        return (4, straight_high)

    if grouped[0][1] == 3:
        kickers = sorted([v for v, c in grouped if c == 1], reverse=True)
        return (3, grouped[0][0]) + tuple(kickers)

    if grouped[0][1] == 2 and grouped[1][1] == 2:
        high_pair = max(grouped[0][0], grouped[1][0])
        low_pair = min(grouped[0][0], grouped[1][0])
        kicker = grouped[2][0]
        return (2, high_pair, low_pair, kicker)

    if grouped[0][1] == 2:
        kickers = sorted([v for v, c in grouped if c == 1], reverse=True)
        return (1, grouped[0][0]) + tuple(kickers)

    return (0,) + tuple(values)


def evaluate_best_hand(cards: List[PokerCard]) -> Tuple[Tuple, str]:
    """
    Find the best 5-card hand from any number of cards (typically 7).
    Returns (score_tuple, hand_name).
    """
    best_score = None
    for combo in combinations(cards, 5):
        score = evaluate_five(list(combo))
        if best_score is None or score > best_score:
            best_score = score
    hand_name = HAND_RANK_NAMES.get(best_score[0], 'Unknown') if best_score else 'Unknown'
    return best_score, hand_name


# ============== Game Flow ==============

def get_seated_players(room: PokerRoom) -> List[PokerPlayer]:
    """Players sorted by seat, excluding sitting-out."""
    players = [p for p in room.players.values() if not p.is_sitting_out]
    return sorted(players, key=lambda p: p.seat)


def get_active_in_hand(room: PokerRoom) -> List[PokerPlayer]:
    """Players still in the hand (not folded)."""
    return [
        room.players[pid] for pid in room.hand_players
        if pid in room.players and not room.players[pid].is_folded
    ]


def get_can_act(room: PokerRoom) -> List[PokerPlayer]:
    """Players who can still make decisions (not folded, not all-in)."""
    return [
        room.players[pid] for pid in room.hand_players
        if pid in room.players
        and not room.players[pid].is_folded
        and not room.players[pid].is_all_in
    ]


def start_hand(room: PokerRoom) -> bool:
    """Start a new hand. Returns False if not enough players."""
    seated = get_seated_players(room)
    eligible = [p for p in seated if p.stack > 0]

    if len(eligible) < 2:
        room.game_phase = 'waiting'
        return False

    room.hand_number += 1
    room.auto_deal_pending = False
    room.folded_cards = {}
    room.shown_hands = {}
    shuffle_and_deal(room)
    room.community_cards = []
    room.pot = 0
    room.current_bet = 0
    room.last_results = None

    # Update blind level every HANDS_PER_BLIND_LEVEL hands
    new_level = min((room.hand_number - 1) // HANDS_PER_BLIND_LEVEL, len(BLIND_SCHEDULE) - 1)
    if new_level != room.blind_level:
        room.blind_level = new_level
    sb, bb = BLIND_SCHEDULE[room.blind_level]
    room.small_blind = sb
    room.big_blind = bb

    # Rotate dealer
    seats = [p.seat for p in eligible]
    if room.dealer_seat < 0:
        room.dealer_seat = seats[0]
    else:
        # Find next eligible seat after current dealer
        found = False
        for s in seats:
            if s > room.dealer_seat:
                room.dealer_seat = s
                found = True
                break
        if not found:
            room.dealer_seat = seats[0]

    # Build hand_players in seat order starting from left of dealer
    dealer_idx = next((i for i, p in enumerate(eligible) if p.seat == room.dealer_seat), 0)
    ordered = []
    for i in range(len(eligible)):
        idx = (dealer_idx + 1 + i) % len(eligible)
        ordered.append(eligible[idx])

    room.hand_players = [p.id for p in ordered]
    num = len(room.hand_players)

    # Reset player hand state
    for pid in room.hand_players:
        p = room.players[pid]
        p.hole_cards = []
        p.is_folded = False
        p.current_bet = 0
        p.total_bet = 0
        p.is_all_in = False

    # Deal 2 hole cards
    for _ in range(2):
        for pid in room.hand_players:
            room.players[pid].hole_cards.append(room.deck.pop())

    # Blind positions
    if num == 2:
        sb_idx, bb_idx = 1, 0  # dealer=SB is last in ordered, BB is first
    else:
        sb_idx, bb_idx = 0, 1

    # Post small blind
    sb = room.players[room.hand_players[sb_idx]]
    sb_amt = min(room.small_blind, sb.stack)
    sb.stack -= sb_amt
    sb.current_bet = sb_amt
    sb.total_bet = sb_amt
    room.pot += sb_amt
    if sb.stack == 0:
        sb.is_all_in = True

    # Post big blind
    bb = room.players[room.hand_players[bb_idx]]
    bb_amt = min(room.big_blind, bb.stack)
    bb.stack -= bb_amt
    bb.current_bet = bb_amt
    bb.total_bet = bb_amt
    room.pot += bb_amt
    room.current_bet = bb_amt
    if bb.stack == 0:
        bb.is_all_in = True

    room.game_phase = 'pre_flop'

    # Who acts first pre-flop
    if num == 2:
        first = sb_idx  # SB acts first heads-up
    else:
        first = (bb_idx + 1) % num  # UTG

    # needs_action = everyone who can act
    room.needs_action = set()
    for pid in room.hand_players:
        p = room.players[pid]
        if not p.is_all_in:
            room.needs_action.add(pid)

    room.current_player_index = first

    # If first player is all-in, skip to next
    if room.players[room.hand_players[first]].is_all_in:
        _advance_to_next_active(room)

    room.turn_start_time = time.time()
    return True


def _advance_to_next_active(room: PokerRoom):
    """Move current_player_index to next player in needs_action."""
    n = len(room.hand_players)
    for _ in range(n):
        room.current_player_index = (room.current_player_index + 1) % n
        pid = room.hand_players[room.current_player_index]
        if pid in room.needs_action:
            return


def process_action(room: PokerRoom, player_id: str, action: str, amount: int = 0) -> dict:
    """
    Process a player action. Returns result dict.
    Actions: fold, check, call, bet, raise
    """
    if player_id not in room.players:
        return {'error': 'Player not in room'}

    player = room.players[player_id]

    if not room.hand_players:
        return {'error': 'No hand in progress'}

    current_pid = room.hand_players[room.current_player_index]
    if player_id != current_pid:
        return {'error': 'Not your turn'}

    if player.is_folded or player.is_all_in:
        return {'error': 'Cannot act'}

    result = {'player': player.name, 'playerId': player_id}

    if action == 'fold':
        # Capture hole cards for end-of-hand reveal
        if player.hole_cards:
            room.folded_cards[player_id] = [card_to_dict(c) for c in player.hole_cards]
        player.is_folded = True
        room.needs_action.discard(player_id)
        result['action'] = 'fold'

    elif action == 'check':
        if player.current_bet < room.current_bet:
            return {'error': 'Cannot check, must call or raise'}
        room.needs_action.discard(player_id)
        result['action'] = 'check'

    elif action == 'call':
        call_amount = room.current_bet - player.current_bet
        if call_amount <= 0:
            room.needs_action.discard(player_id)
            result['action'] = 'check'
        else:
            actual = min(call_amount, player.stack)
            player.stack -= actual
            player.current_bet += actual
            player.total_bet += actual
            room.pot += actual
            if player.stack == 0:
                player.is_all_in = True
            room.needs_action.discard(player_id)
            result['action'] = 'call'
            result['amount'] = actual

    elif action in ('bet', 'raise'):
        # amount = the total bet to raise TO
        min_raise = room.current_bet + room.big_blind
        if amount < min_raise and amount != player.stack + player.current_bet:
            return {'error': f'Minimum raise to {min_raise}'}

        additional = amount - player.current_bet
        actual = min(additional, player.stack)
        player.stack -= actual
        player.current_bet += actual
        player.total_bet += actual
        room.pot += actual
        room.current_bet = player.current_bet

        if player.stack == 0:
            player.is_all_in = True

        # Everyone else needs to act again
        room.needs_action = {
            pid for pid in room.hand_players
            if pid in room.players
            and not room.players[pid].is_folded
            and not room.players[pid].is_all_in
            and pid != player_id
        }

        result['action'] = 'raise' if action == 'raise' else 'bet'
        result['amount'] = player.current_bet
    else:
        return {'error': f'Unknown action: {action}'}

    # Check if hand ends (only one active)
    active = get_active_in_hand(room)
    if len(active) <= 1:
        _resolve_hand(room)
        return result

    # Check if betting round is over
    if not room.needs_action:
        _advance_street(room)
        return result

    # Move to next player
    _advance_to_next_active(room)
    room.turn_start_time = time.time()
    return result


def _advance_street(room: PokerRoom):
    """Deal next community cards or go to showdown."""
    # Reset per-street bets
    for pid in room.hand_players:
        if pid in room.players:
            room.players[pid].current_bet = 0
    room.current_bet = 0

    if room.game_phase == 'pre_flop':
        room.deck.pop()  # burn
        room.community_cards.extend([room.deck.pop() for _ in range(3)])
        room.game_phase = 'flop'
    elif room.game_phase == 'flop':
        room.deck.pop()
        room.community_cards.append(room.deck.pop())
        room.game_phase = 'turn'
    elif room.game_phase == 'turn':
        room.deck.pop()
        room.community_cards.append(room.deck.pop())
        room.game_phase = 'river'
    elif room.game_phase == 'river':
        _resolve_hand(room)
        return

    # Check if a real betting round is possible
    can_act = get_can_act(room)
    if len(can_act) < 2:
        # Run out remaining cards
        while len(room.community_cards) < 5:
            room.deck.pop()
            room.community_cards.append(room.deck.pop())
        _resolve_hand(room)
        return

    # Setup new betting round -- first active player in hand order
    room.needs_action = set()
    for pid in room.hand_players:
        p = room.players[pid]
        if not p.is_folded and not p.is_all_in:
            room.needs_action.add(pid)

    for i, pid in enumerate(room.hand_players):
        p = room.players[pid]
        if not p.is_folded and not p.is_all_in:
            room.current_player_index = i
            break

    room.turn_start_time = time.time()


def _resolve_hand(room: PokerRoom):
    """Determine winners and award pot."""
    active = get_active_in_hand(room)

    results = {
        'winners': [],
        'hands': {},
        'pot': room.pot,
        'communityCards': [card_to_dict(c) for c in room.community_cards],
    }

    if len(active) <= 1:
        winner = active[0] if active else None
        if winner:
            winner.stack += room.pot
            results['winners'] = [{'id': winner.id, 'name': winner.name, 'amount': room.pot}]
    else:
        # Showdown
        player_scores = []
        for p in active:
            all_cards = p.hole_cards + room.community_cards
            score, hand_name = evaluate_best_hand(all_cards)
            player_scores.append((p, score, hand_name))
            results['hands'][p.id] = {
                'cards': [card_to_dict(c) for c in p.hole_cards],
                'handName': hand_name,
            }

        player_scores.sort(key=lambda x: x[1], reverse=True)
        best_score = player_scores[0][1]
        winners = [(p, name) for p, score, name in player_scores if score == best_score]

        share = room.pot // len(winners)
        remainder = room.pot % len(winners)

        for i, (winner, hand_name) in enumerate(winners):
            award = share + (1 if i < remainder else 0)
            winner.stack += award
            results['winners'].append({
                'id': winner.id, 'name': winner.name,
                'amount': award, 'handName': hand_name,
            })

    room.pot = 0
    room.game_phase = 'hand_end'
    room.last_results = results


# ============== Serialization ==============

def card_to_dict(card: PokerCard) -> dict:
    return {'id': card.id, 'suit': card.suit, 'value': card.value, 'display': card.display}


def player_to_dict(player: PokerPlayer, hide_cards: bool = False) -> dict:
    return {
        'id': player.id,
        'name': player.name,
        'stack': player.stack,
        'holeCards': [] if hide_cards else [card_to_dict(c) for c in player.hole_cards],
        'cardCount': len(player.hole_cards),
        'isFolded': player.is_folded,
        'currentBet': player.current_bet,
        'totalBet': player.total_bet,
        'isAllIn': player.is_all_in,
        'isSittingOut': player.is_sitting_out,
        'seat': player.seat,
        'isBot': player.is_bot,
    }


# ============== Bot AI ==============

POKER_BOT_NAMES = [
    'Ace Bot', 'Bluff Bot', 'Call Bot', 'Deal Bot',
    'Flop Bot', 'Grind Bot', 'Hit Bot', 'Jam Bot',
]


def make_poker_bot_decision(player: PokerPlayer, room) -> Tuple[str, int]:
    """
    Simple poker bot AI. Returns (action, amount).
    Actions: fold, check, call, bet, raise
    """
    call_amount = room.current_bet - player.current_bet
    can_check = call_amount <= 0
    stack = player.stack

    if stack <= 0:
        return ('check', 0) if can_check else ('fold', 0)

    # Evaluate hand strength (simple heuristic based on hole cards)
    strength = _evaluate_bot_strength(player, room)

    # Pre-flop decisions
    if room.game_phase == 'pre_flop':
        if strength >= 0.8:
            # Strong hand - raise
            raise_to = room.current_bet + room.big_blind * 3
            raise_to = min(raise_to, player.current_bet + stack)
            return ('raise', raise_to)
        elif strength >= 0.5:
            # Decent hand - call
            if can_check:
                return ('check', 0)
            if call_amount <= stack:
                return ('call', 0)
            return ('fold', 0)
        elif strength >= 0.3:
            # Marginal - call small bets, fold big ones
            if can_check:
                return ('check', 0)
            if call_amount <= room.big_blind * 2 and call_amount <= stack:
                return ('call', 0)
            return ('fold', 0)
        else:
            # Weak - check or fold
            if can_check:
                return ('check', 0)
            return ('fold', 0)

    # Post-flop decisions
    if strength >= 0.7:
        # Strong - bet or raise
        if can_check:
            bet_amount = max(room.big_blind, room.pot // 2)
            bet_amount = min(bet_amount, stack)
            bet_to = player.current_bet + bet_amount
            return ('bet', bet_to)
        else:
            raise_to = room.current_bet + max(room.big_blind, call_amount)
            raise_to = min(raise_to, player.current_bet + stack)
            if raise_to > room.current_bet:
                return ('raise', raise_to)
            if call_amount <= stack:
                return ('call', 0)
            return ('fold', 0)
    elif strength >= 0.4:
        # Medium - check/call
        if can_check:
            return ('check', 0)
        if call_amount <= room.big_blind * 3 and call_amount <= stack:
            return ('call', 0)
        return ('fold', 0)
    else:
        # Weak - check or fold
        if can_check:
            return ('check', 0)
        # Bluff occasionally (10%)
        if random.random() < 0.1 and call_amount <= room.big_blind * 2 and call_amount <= stack:
            return ('call', 0)
        return ('fold', 0)


def _evaluate_bot_strength(player: PokerPlayer, room) -> float:
    """
    Simple hand strength evaluation (0.0 to 1.0).
    Pre-flop: based on hole card values.
    Post-flop: based on best hand evaluation.
    """
    cards = player.hole_cards
    if len(cards) < 2:
        return 0.3

    v1, v2 = cards[0].value, cards[1].value
    paired = v1 == v2
    suited = cards[0].suit == cards[1].suit
    high = max(v1, v2)

    if not room.community_cards:
        # Pre-flop heuristic
        if paired:
            if high >= 10:
                return 0.9
            if high >= 7:
                return 0.7
            return 0.55
        score = (high / 14.0) * 0.6
        if suited:
            score += 0.1
        if abs(v1 - v2) <= 2:
            score += 0.05
        return min(score, 1.0)

    # Post-flop: evaluate best hand
    all_cards = cards + room.community_cards
    best_score, _ = evaluate_best_hand(all_cards)
    if not best_score:
        return 0.2
    hand_rank = best_score[0]
    # Map hand rank (0-9) to strength
    return min(0.2 + hand_rank * 0.09, 1.0)


def room_to_dict(room: PokerRoom, for_player_id: Optional[str] = None) -> dict:
    players_list = sorted(room.players.values(), key=lambda p: p.seat)

    show_all = room.game_phase in ('hand_end',)

    current_pid = None
    if room.hand_players and room.game_phase not in ('waiting', 'hand_end'):
        current_pid = room.hand_players[room.current_player_index]

    # Calculate turn timer remaining
    turn_remaining = None
    if current_pid and room.turn_start_time > 0:
        elapsed = time.time() - room.turn_start_time
        turn_remaining = max(0, TURN_TIME_LIMIT - elapsed)

    # Next blind level info
    hands_until_blind_increase = HANDS_PER_BLIND_LEVEL - ((room.hand_number - 1) % HANDS_PER_BLIND_LEVEL) if room.hand_number > 0 else HANDS_PER_BLIND_LEVEL
    next_level = min(room.blind_level + 1, len(BLIND_SCHEDULE) - 1)
    next_sb, next_bb = BLIND_SCHEDULE[next_level]

    return {
        'code': room.code,
        'hostId': room.host_id,
        'gameType': 'poker',
        'players': [
            player_to_dict(p, hide_cards=(p.id != for_player_id and not show_all))
            for p in players_list
        ],
        'communityCards': [card_to_dict(c) for c in room.community_cards],
        'pot': room.pot,
        'currentBet': room.current_bet,
        'dealerSeat': room.dealer_seat,
        'currentPlayerId': current_pid,
        'gamePhase': room.game_phase,
        'smallBlind': room.small_blind,
        'bigBlind': room.big_blind,
        'handNumber': room.hand_number,
        'handPlayers': room.hand_players,
        'lastResults': room.last_results,
        'blindLevel': room.blind_level,
        'handsUntilBlindIncrease': hands_until_blind_increase,
        'nextBlinds': {'sb': next_sb, 'bb': next_bb},
        'turnRemaining': turn_remaining,
        'turnTimeLimit': TURN_TIME_LIMIT,
        'postHandDelay': POST_HAND_DELAY,
        'shownHands': dict(room.shown_hands) if room.game_phase == 'hand_end' else {},
        'foldedPlayerIds': list(room.folded_cards.keys()) if room.game_phase == 'hand_end' else [],
    }
