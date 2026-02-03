"""
Tycoon Card Game - Python Flask Server
Real-time multiplayer using Flask-SocketIO
"""

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import random
import string
import time
import json
import os
from typing import Dict, List, Optional
from dataclasses import dataclass, field, asdict
from enum import Enum
from dotenv import load_dotenv

from game_registry import GAMES, get_game, get_max_players, list_games
from poker import poker_events

# Load .env from project root (one level up from web/)
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

SUPABASE_URL = os.getenv('EXPO_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('EXPO_PUBLIC_SUPABASE_ANON_KEY', '')

app = Flask(__name__)
app.config['SECRET_KEY'] = 'tycoon-secret-key-change-in-production'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# ============== Game Data Structures ==============

class Suit(str, Enum):
    HEARTS = 'hearts'
    DIAMONDS = 'diamonds'
    CLUBS = 'clubs'
    SPADES = 'spades'
    JOKER = 'joker'

class PlayerRank(str, Enum):
    TYCOON = 'tycoon'
    RICH = 'rich'
    POOR = 'poor'
    BEGGAR = 'beggar'
    NONE = 'none'

RANK_POINTS = {
    PlayerRank.TYCOON: 20,
    PlayerRank.RICH: 10,
    PlayerRank.POOR: 5,
    PlayerRank.BEGGAR: 0,
    PlayerRank.NONE: 0,
}

SUIT_SYMBOLS = {
    'hearts': '♥',
    'diamonds': '♦',
    'clubs': '♣',
    'spades': '♠',
}

VALUE_DISPLAY = {
    3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: 'Joker'
}

@dataclass
class Card:
    id: str
    suit: str
    value: int
    display: str

@dataclass
class Player:
    id: str
    name: str
    is_bot: bool
    hand: List[Card] = field(default_factory=list)
    rank: str = 'none'
    points: int = 0
    has_finished: bool = False
    finish_order: Optional[int] = None
    seat_position: int = 0
    passed_this_turn: bool = False
    sid: Optional[str] = None  # Socket ID for real players

@dataclass
class GameRoom:
    code: str
    host_id: str
    players: Dict[str, Player] = field(default_factory=dict)
    current_player_index: int = 0
    current_pile: List[Card] = field(default_factory=list)
    current_pile_player_id: Optional[str] = None
    discard_pile: List[Card] = field(default_factory=list)
    current_round: int = 1
    total_rounds: int = 3
    is_revolution: bool = False
    pass_count: int = 0
    game_phase: str = 'waiting'  # waiting, playing, round_end, game_end, card_selection
    finish_order: List[str] = field(default_factory=list)
    bot_difficulty: str = 'medium'
    created_at: float = field(default_factory=time.time)
    # Card exchange state
    pending_selections: Dict[str, List[str]] = field(default_factory=dict)  # player_id -> card_ids

# In-memory storage for rooms
rooms: Dict[str, GameRoom] = {}

# Track socket ID to (room_code, player_id) for disconnect handling
socket_to_player: Dict[str, tuple] = {}  # sid -> (room_code, player_id)

# Track disconnected players for reconnection (room_code -> {player_id -> disconnect_time})
disconnected_players: Dict[str, Dict[str, float]] = {}

# Timeout before replacing disconnected player with bot (seconds)
DISCONNECT_TIMEOUT = 60

# ============== Deck Functions ==============

def build_deck() -> List[Card]:
    """54-card deck (52 standard + 2 jokers)"""
    deck = []
    suits = ['hearts', 'diamonds', 'clubs', 'spades']
    values = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]  # 3 through 2

    for suit in suits:
        for value in values:
            card_id = f"{suit}-{value}"
            display = f"{SUIT_SYMBOLS[suit]} {VALUE_DISPLAY[value]}"
            deck.append(Card(id=card_id, suit=suit, value=value, display=display))

    # Add two jokers
    deck.append(Card(id='joker-1', suit='joker', value=16, display='Joker'))
    deck.append(Card(id='joker-2', suit='joker', value=16, display='Joker'))

    return deck

def shuffle_deck(deck: List[Card]) -> List[Card]:
    """Fisher-Yates shuffle"""
    shuffled = deck.copy()
    random.shuffle(shuffled)
    return shuffled

def deal_cards(deck: List[Card], num_players: int) -> List[List[Card]]:
    """Deal cards to players"""
    hands = [[] for _ in range(num_players)]
    shuffled = shuffle_deck(deck)

    for i, card in enumerate(shuffled):
        hands[i % num_players].append(card)

    # Sort each hand
    for hand in hands:
        hand.sort(key=lambda c: c.value)

    return hands

def sort_hand(hand: List[Card], is_revolution: bool = False) -> List[Card]:
    """Sort hand by value"""
    return sorted(hand, key=lambda c: -c.value if is_revolution else c.value)

# ============== Game Logic Functions ==============

def get_effective_value(cards: List[Card]) -> int:
    """Get the effective value of played cards (excluding jokers)"""
    non_jokers = [c for c in cards if c.value != 16]
    if not non_jokers:
        return 16  # All jokers
    return non_jokers[0].value

def all_same_value(cards: List[Card]) -> bool:
    """Check if all cards have the same value (jokers are wild)"""
    if not cards:
        return True
    non_jokers = [c for c in cards if c.value != 16]
    if not non_jokers:
        return True  # All jokers
    first_value = non_jokers[0].value
    return all(c.value == first_value for c in non_jokers)

def compare_card_values(value_a: int, value_b: int, is_revolution: bool) -> int:
    """Compare card values, returns positive if a > b"""
    if is_revolution:
        # In revolution, lower values beat higher values
        revolution_order = [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3]
        index_a = revolution_order.index(value_a)
        index_b = revolution_order.index(value_b)
        return index_a - index_b
    return value_a - value_b

def can_play_cards(current_pile: List[Card], selected_cards: List[Card], is_revolution: bool) -> tuple[bool, str]:
    """Check if selected cards can be played"""
    if not selected_cards:
        return False, "Must select at least one card"

    if not all_same_value(selected_cards):
        return False, "All cards must have the same value"

    if not current_pile:
        return True, ""

    pile_value = get_effective_value(current_pile)
    play_value = get_effective_value(selected_cards)

    # 3 counters joker (any number of 3s)
    if pile_value == 16 and play_value == 3:
        return True, ""

    # Must play same number of cards
    if len(selected_cards) != len(current_pile):
        return False, f"Must play {len(current_pile)} card(s)"

    comparison = compare_card_values(play_value, pile_value, is_revolution)
    if comparison <= 0:
        return False, "Must play higher value cards"

    return True, ""

def check_revolution(cards: List[Card]) -> bool:
    """Check if 4 of a kind triggers revolution"""
    return len(cards) == 4 and all_same_value(cards)

def check_eight_played(cards: List[Card]) -> bool:
    """Check if an 8 was played"""
    return get_effective_value(cards) == 8

def check_three_counters_joker(pile: List[Card], played: List[Card]) -> bool:
    """Check if 3 counters a joker"""
    if not pile:
        return False
    return get_effective_value(pile) == 16 and get_effective_value(played) == 3

def get_best_cards(hand: List[Card], count: int, is_revolution: bool = False) -> List[Card]:
    """Get the best cards from a hand"""
    sorted_hand = sorted(hand, key=lambda c: c.value, reverse=not is_revolution)
    return sorted_hand[:count]

def get_worst_cards(hand: List[Card], count: int, is_revolution: bool = False) -> List[Card]:
    """Get the worst cards from a hand"""
    sorted_hand = sorted(hand, key=lambda c: c.value, reverse=is_revolution)
    return sorted_hand[:count]

# ============== Bot AI ==============

BOT_NAMES = ['Ehsan Bot', 'Justin Bot', 'Sultan Bot', 'Denise Bot', 'Amer Bot', 'Zak Bot', 'Josh Bot', 'Reese Bot', 'Horacio Bot']

def make_bot_decision(player: Player, room: GameRoom) -> tuple[str, Optional[List[Card]]]:
    """Bot AI decision making - smarter bots that play pairs, triples, quads"""
    hand = player.hand
    pile = room.current_pile
    is_revolution = room.is_revolution
    difficulty = room.bot_difficulty

    if not hand:
        return 'pass', None

    # Group cards by value
    value_groups = {}
    for card in hand:
        if card.value not in value_groups:
            value_groups[card.value] = []
        value_groups[card.value].append(card)

    # Sort values by strength (weakest first in normal, strongest first in revolution)
    sorted_values = sorted(value_groups.keys(), reverse=is_revolution)

    if not pile:
        # Starting a new turn - choose what to lead with
        return bot_choose_lead(value_groups, sorted_values, is_revolution, difficulty, hand)

    # Responding to existing pile
    pile_count = len(pile)
    pile_value = get_effective_value(pile)

    return bot_choose_response(value_groups, pile_count, pile_value, is_revolution, difficulty)


def bot_choose_lead(value_groups: dict, sorted_values: list, is_revolution: bool, difficulty: str, hand: list) -> tuple[str, Optional[List[Card]]]:
    """Bot chooses what to lead with when pile is empty"""

    # Find all possible plays (singles, pairs, triples, quads)
    possible_plays = []

    for value in sorted_values:
        cards = value_groups[value]
        # Add all possible group sizes for this value
        for count in range(1, len(cards) + 1):
            possible_plays.append((value, cards[:count], count))

    if not possible_plays:
        return 'pass', None

    # Strategy based on difficulty
    if difficulty == 'easy':
        # Easy: Just play single lowest cards
        for value in sorted_values:
            cards = value_groups[value]
            return 'play', cards[:1]

    elif difficulty == 'medium':
        # Medium: Prefer pairs/triples of low cards, but not always
        # Try to get rid of multiples of weak cards first
        for value in sorted_values:
            cards = value_groups[value]
            if len(cards) >= 2:
                # Play pair or triple of weak cards
                play_count = min(len(cards), 3)
                return 'play', cards[:play_count]
        # Fallback to single
        for value in sorted_values:
            return 'play', value_groups[value][:1]

    else:  # hard
        # Hard: Strategic play - consider hand composition
        # If we have 4 of a kind, consider playing it for revolution
        for value in sorted_values:
            cards = value_groups[value]
            if len(cards) == 4 and value not in [8, 15, 16]:  # Save 8s, 2s, jokers
                # Play 4 of a kind to trigger revolution if beneficial
                if is_revolution and value <= 7:  # In revolution, low cards are strong
                    return 'play', cards[:4]
                elif not is_revolution and value >= 10:
                    return 'play', cards[:4]

        # Play pairs/triples of medium-low cards to control the game
        for value in sorted_values:
            cards = value_groups[value]
            if len(cards) >= 2 and value not in [8, 15, 16]:
                return 'play', cards[:len(cards)]  # Play all of same value

        # Play single low card
        for value in sorted_values:
            if value not in [8, 15, 16]:  # Save special cards
                return 'play', value_groups[value][:1]

        # Fallback: play anything
        for value in sorted_values:
            return 'play', value_groups[value][:1]

    return 'pass', None


def bot_choose_response(value_groups: dict, pile_count: int, pile_value: int, is_revolution: bool, difficulty: str) -> tuple[str, Optional[List[Card]]]:
    """Bot chooses how to respond to existing pile"""

    # Find playable groups that can beat the pile
    playable = []

    for value, cards in value_groups.items():
        if len(cards) >= pile_count:
            # Check if this value beats the pile
            if compare_card_values(value, pile_value, is_revolution) > 0:
                playable.append((value, cards[:pile_count]))
            # Check 3 counters joker
            elif pile_value == 16 and value == 3 and len(cards) >= pile_count:
                playable.append((value, cards[:pile_count]))

    if not playable:
        return 'pass', None

    # Sort playable options by value
    playable.sort(key=lambda x: x[0], reverse=is_revolution)

    if difficulty == 'easy':
        # Easy: Always play lowest possible
        return 'play', playable[0][1]

    elif difficulty == 'medium':
        # Medium: Usually play lowest, sometimes pass to conserve cards
        # Pass 20% of the time if we have other options
        import random
        if len(playable) > 1 and random.random() < 0.2:
            return 'pass', None
        return 'play', playable[0][1]

    else:  # hard
        # Hard: Strategic decisions
        import random

        # If pile is 8, we must play (or pass and lose control)
        if pile_value == 8:
            return 'play', playable[0][1]

        # Consider passing to let others fight
        # Pass more often if we're in a good position (fewer cards)
        hand_size = sum(len(cards) for cards in value_groups.values())
        if hand_size <= 5 and random.random() < 0.3:
            return 'pass', None

        # If we have an 8 that can be played, prefer it (clears pile, we go again)
        for value, cards in playable:
            if value == 8:
                return 'play', cards

        # Otherwise play lowest to conserve strong cards
        return 'play', playable[0][1]

    return 'pass', None

# ============== Room Management ==============

def generate_room_code() -> str:
    """Generate a random 6-character room code (unique across all game types)"""
    chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    while True:
        code = ''.join(random.choice(chars) for _ in range(6))
        if code not in rooms and code not in poker_events.poker_rooms:
            return code

def card_to_dict(card: Card) -> dict:
    """Convert card to dictionary"""
    return {'id': card.id, 'suit': card.suit, 'value': card.value, 'display': card.display}

def player_to_dict(player: Player, hide_hand: bool = False) -> dict:
    """Convert player to dictionary"""
    return {
        'id': player.id,
        'name': player.name,
        'isBot': player.is_bot,
        'hand': [] if hide_hand else [card_to_dict(c) for c in player.hand],
        'handCount': len(player.hand),
        'rank': player.rank,
        'points': player.points,
        'hasFinished': player.has_finished,
        'finishOrder': player.finish_order,
        'seatPosition': player.seat_position,
        'passedThisTurn': player.passed_this_turn,
    }

def room_to_dict(room: GameRoom, for_player_id: Optional[str] = None) -> dict:
    """Convert room to dictionary for client"""
    players_list = list(room.players.values())
    players_list.sort(key=lambda p: p.seat_position)

    return {
        'code': room.code,
        'hostId': room.host_id,
        'players': [player_to_dict(p, hide_hand=(p.id != for_player_id and not p.is_bot))
                    for p in players_list],
        'currentPlayerIndex': room.current_player_index,
        'currentPile': [card_to_dict(c) for c in room.current_pile],
        'currentPilePlayerId': room.current_pile_player_id,
        'currentRound': room.current_round,
        'totalRounds': room.total_rounds,
        'isRevolution': room.is_revolution,
        'gamePhase': room.game_phase,
        'finishOrder': room.finish_order,
    }

def add_bots_to_room(room: GameRoom, count: int):
    """Add bot players to fill the room"""
    used_names = [p.name for p in room.players.values()]
    available_names = [n for n in BOT_NAMES if n not in used_names]

    # Randomize bot names
    random.shuffle(available_names)

    current_seat = len(room.players)
    for i in range(count):
        bot_id = f"bot-{current_seat + i}"
        bot_name = available_names[i] if i < len(available_names) else f"Bot {i+1}"
        room.players[bot_id] = Player(
            id=bot_id,
            name=bot_name,
            is_bot=True,
            seat_position=current_seat + i
        )

def start_game(room: GameRoom):
    """Start the game - deal cards and begin"""
    # Add bots to fill empty slots
    human_count = len([p for p in room.players.values() if not p.is_bot])
    if human_count < 4:
        add_bots_to_room(room, 4 - len(room.players))

    # Deal cards
    deck = build_deck()
    hands = deal_cards(deck, 4)

    players_list = list(room.players.values())
    players_list.sort(key=lambda p: p.seat_position)

    for i, player in enumerate(players_list):
        player.hand = hands[i]
        player.has_finished = False
        player.finish_order = None
        player.passed_this_turn = False

    # Find player with most cards or random
    max_cards = max(len(p.hand) for p in players_list)
    starters = [i for i, p in enumerate(players_list) if len(p.hand) == max_cards]
    room.current_player_index = random.choice(starters)

    room.game_phase = 'playing'
    room.current_pile = []
    room.current_pile_player_id = None
    room.finish_order = []
    room.is_revolution = False

# ============== Socket Events ==============

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    print(f"Client disconnected: {sid}")

    # Find the player associated with this socket
    if sid not in socket_to_player:
        return

    room_code, player_id = socket_to_player[sid]
    del socket_to_player[sid]

    # Dispatch to poker if it's a poker room
    if room_code in poker_events.poker_rooms:
        poker_events.handle_disconnect(room_code, player_id)
        return

    if room_code not in rooms:
        return

    room = rooms[room_code]

    if player_id not in room.players:
        return

    player = room.players[player_id]

    # If game hasn't started, just remove the player
    if room.game_phase == 'waiting':
        del room.players[player_id]
        socketio.emit('player_left', {'playerId': player_id}, room=room_code)
        return

    # Game is in progress - mark player as disconnected
    player.sid = None

    # Track disconnection time for timeout
    if room_code not in disconnected_players:
        disconnected_players[room_code] = {}
    disconnected_players[room_code][player_id] = time.time()

    # Notify other players
    socketio.emit('player_disconnected', {
        'playerId': player_id,
        'playerName': player.name
    }, room=room_code)

    # Start a background task to check for timeout
    socketio.start_background_task(check_disconnect_timeout, room_code, player_id)


def check_disconnect_timeout(room_code: str, player_id: str):
    """Background task to replace disconnected player with bot after timeout"""
    # Wait for the timeout period
    socketio.sleep(DISCONNECT_TIMEOUT)

    # Check if player is still disconnected
    if room_code not in disconnected_players:
        return
    if player_id not in disconnected_players[room_code]:
        return  # Player reconnected

    # Player is still disconnected - replace with bot
    if room_code not in rooms:
        return

    room = rooms[room_code]
    if player_id not in room.players:
        return

    player = room.players[player_id]

    # Skip if player already reconnected (has sid)
    if player.sid is not None:
        return

    # Convert player to bot
    print(f"Replacing disconnected player {player.name} with bot")
    player.is_bot = True
    player.name = f"{player.name} (Bot)"

    # Remove from disconnected tracking
    del disconnected_players[room_code][player_id]

    # Notify remaining players
    socketio.emit('player_replaced', {
        'playerId': player_id,
        'playerName': player.name
    }, room=room_code)

    # If it was this player's turn to select cards, auto-select for them
    if room.game_phase == 'card_selection' and player_id not in room.pending_selections:
        if player.rank == 'tycoon':
            worst_cards = get_worst_cards(player.hand, 2)
            room.pending_selections[player_id] = [c.id for c in worst_cards]
        elif player.rank == 'rich':
            worst_cards = get_worst_cards(player.hand, 1)
            room.pending_selections[player_id] = [c.id for c in worst_cards]

        # Check if exchange can now proceed
        check_selections_complete(room)

    # If it's this player's turn in the game, process bot turn
    if room.game_phase == 'playing':
        players_list = list(room.players.values())
        players_list.sort(key=lambda p: p.seat_position)
        current_player = players_list[room.current_player_index]

        if current_player.id == player_id:
            process_bot_turns(room)


@socketio.on('create_room')
def handle_create_room(data):
    """Create a new game room (dispatches by gameType)"""
    player_name = data.get('playerName', 'Player')
    player_id = data.get('playerId', request.sid)
    game_type = data.get('gameType', 'tycoon')
    difficulty = data.get('difficulty', 'medium')

    code = generate_room_code()

    # Dispatch to game-specific handler
    if game_type != 'tycoon' and game_type in GAMES:
        if game_type == 'poker':
            poker_events.create_room(code, player_id, player_name, request.sid)
        return

    # Tycoon room creation (existing behavior)
    room = GameRoom(
        code=code,
        host_id=player_id,
        bot_difficulty=difficulty
    )

    player = Player(
        id=player_id,
        name=player_name,
        is_bot=False,
        seat_position=0,
        sid=request.sid
    )
    room.players[player_id] = player
    rooms[code] = room

    # Track socket to player mapping
    socket_to_player[request.sid] = (code, player_id)

    join_room(code)
    emit('room_created', {'code': code, 'room': room_to_dict(room, player_id)})

@socketio.on('join_room')
def handle_join_room(data):
    """Join an existing room (auto-detects game type)"""
    code = data.get('code', '').upper()
    player_name = data.get('playerName', 'Player')
    player_id = data.get('playerId', request.sid)

    # Check poker rooms first
    if code in poker_events.poker_rooms:
        game_cfg = get_game('poker')
        poker_events.join_room_handler(code, player_id, player_name, request.sid, game_cfg['max_players'])
        return

    if code not in rooms:
        emit('error', {'message': 'Room not found'})
        return

    room = rooms[code]

    # Check if this is a rejoin (player already exists in room)
    if player_id in room.players:
        player = room.players[player_id]

        # If player is a bot now (was replaced), can't rejoin
        if player.is_bot:
            emit('error', {'message': 'You were replaced by a bot'})
            return

        # Reconnect the player
        player.sid = request.sid
        socket_to_player[request.sid] = (code, player_id)

        # Remove from disconnected tracking
        if code in disconnected_players and player_id in disconnected_players[code]:
            del disconnected_players[code][player_id]

        join_room(code)

        # Notify others that player reconnected
        socketio.emit('player_reconnected', {
            'playerId': player_id,
            'playerName': player.name
        }, room=code, include_self=False)

        # Send current game state to rejoining player
        if room.game_phase == 'waiting':
            emit('room_joined', {'code': code, 'room': room_to_dict(room, player_id)})
        else:
            emit('rejoined_game', {'code': code, 'room': room_to_dict(room, player_id)})

            # If it's their turn and they're selecting cards, resend the selection request
            if room.game_phase == 'card_selection' and player_id not in room.pending_selections:
                if player.rank == 'tycoon':
                    emit('select_cards_to_give', {
                        'rank': 'tycoon',
                        'requiredCount': 2,
                        'hand': [card_to_dict(c) for c in player.hand]
                    })
                elif player.rank == 'rich':
                    emit('select_cards_to_give', {
                        'rank': 'rich',
                        'requiredCount': 1,
                        'hand': [card_to_dict(c) for c in player.hand]
                    })
        return

    # New player joining
    if room.game_phase != 'waiting':
        emit('error', {'message': 'Game already started'})
        return

    if len([p for p in room.players.values() if not p.is_bot]) >= 4:
        emit('error', {'message': 'Room is full'})
        return

    player = Player(
        id=player_id,
        name=player_name,
        is_bot=False,
        seat_position=len(room.players),
        sid=request.sid
    )
    room.players[player_id] = player

    # Track socket to player mapping
    socket_to_player[request.sid] = (code, player_id)

    join_room(code)
    emit('room_joined', {'code': code, 'room': room_to_dict(room, player_id)})
    emit('player_joined', {'player': player_to_dict(player)}, room=code, include_self=False)

@socketio.on('start_game')
def handle_start_game(data):
    """Start the game (host only)"""
    code = data.get('code')
    player_id = data.get('playerId')

    if code not in rooms:
        emit('error', {'message': 'Room not found'})
        return

    room = rooms[code]

    if room.host_id != player_id:
        emit('error', {'message': 'Only host can start the game'})
        return

    start_game(room)

    # Send game state to each player (with their own hand visible)
    for pid, player in room.players.items():
        if player.sid:
            socketio.emit('game_started', {'room': room_to_dict(room, pid)}, room=player.sid)

    # Process bot turn if first player is a bot
    process_bot_turns(room)

@socketio.on('play_cards')
def handle_play_cards(data):
    """Handle a player playing cards"""
    code = data.get('code')
    player_id = data.get('playerId')
    card_ids = data.get('cardIds', [])

    if code not in rooms:
        emit('error', {'message': 'Room not found'})
        return

    room = rooms[code]
    players_list = list(room.players.values())
    players_list.sort(key=lambda p: p.seat_position)

    current_player = players_list[room.current_player_index]

    if current_player.id != player_id:
        emit('error', {'message': 'Not your turn'})
        return

    # Find selected cards
    selected_cards = [c for c in current_player.hand if c.id in card_ids]

    if len(selected_cards) != len(card_ids):
        emit('error', {'message': 'Invalid cards'})
        return

    # Validate play
    valid, reason = can_play_cards(room.current_pile, selected_cards, room.is_revolution)
    if not valid:
        emit('error', {'message': reason})
        return

    # Process the play
    process_play(room, current_player, selected_cards)

    # Broadcast updated state
    broadcast_game_state(room)

    # Process bot turns
    process_bot_turns(room)

@socketio.on('pass_turn')
def handle_pass_turn(data):
    """Handle a player passing"""
    code = data.get('code')
    player_id = data.get('playerId')

    if code not in rooms:
        emit('error', {'message': 'Room not found'})
        return

    room = rooms[code]
    players_list = list(room.players.values())
    players_list.sort(key=lambda p: p.seat_position)

    current_player = players_list[room.current_player_index]

    if current_player.id != player_id:
        emit('error', {'message': 'Not your turn'})
        return

    # Process pass
    process_pass(room, current_player)

    # Broadcast updated state
    broadcast_game_state(room)

    # Process bot turns
    process_bot_turns(room)

@socketio.on('next_round')
def handle_next_round(data):
    """Start the next round"""
    code = data.get('code')

    if code not in rooms:
        return

    room = rooms[code]
    start_next_round(room)
    # Note: broadcast_game_state and process_bot_turns are called by finalize_round_start


@socketio.on('leave_game')
def handle_leave_game(data):
    """Handle player intentionally leaving the game"""
    code = data.get('code')
    player_id = data.get('playerId')

    # Dispatch to poker if it's a poker room
    if code in poker_events.poker_rooms:
        poker_events.handle_leave(code, player_id)
        return

    if code not in rooms:
        return

    room = rooms[code]

    if player_id not in room.players:
        return

    player = room.players[player_id]
    sid = request.sid

    # Remove socket tracking
    if sid in socket_to_player:
        del socket_to_player[sid]

    # Remove from disconnected tracking if present
    if code in disconnected_players and player_id in disconnected_players[code]:
        del disconnected_players[code][player_id]

    # Check if this is the host
    if player_id == room.host_id:
        # Host is leaving - end the entire session
        socketio.emit('session_ended', {
            'reason': 'Host has ended the session'
        }, room=code)

        # Clean up the room
        del rooms[code]
        if code in disconnected_players:
            del disconnected_players[code]
        return

    # Non-host player leaving
    if room.game_phase == 'waiting':
        # Game hasn't started - just remove the player
        del room.players[player_id]
        socketio.emit('player_left', {'playerId': player_id}, room=code)
    else:
        # Game in progress - replace with bot immediately
        player.is_bot = True
        player.name = f"{player.name} (Bot)"
        player.sid = None

        socketio.emit('player_replaced', {
            'playerId': player_id,
            'playerName': player.name
        }, room=code)

        # If it was this player's turn to select cards, auto-select
        if room.game_phase == 'card_selection' and player_id not in room.pending_selections:
            if player.rank == 'tycoon':
                worst_cards = get_worst_cards(player.hand, 2)
                room.pending_selections[player_id] = [c.id for c in worst_cards]
            elif player.rank == 'rich':
                worst_cards = get_worst_cards(player.hand, 1)
                room.pending_selections[player_id] = [c.id for c in worst_cards]
            check_selections_complete(room)

        # If it's this player's turn, process bot turn
        if room.game_phase == 'playing':
            players_list = list(room.players.values())
            players_list.sort(key=lambda p: p.seat_position)
            current_player = players_list[room.current_player_index]

            if current_player.id == player_id:
                process_bot_turns(room)


@socketio.on('submit_card_selection')
def handle_submit_card_selection(data):
    """Handle player submitting their card selection for exchange"""
    code = data.get('code')
    player_id = data.get('playerId')
    card_ids = data.get('cardIds', [])

    if code not in rooms:
        emit('error', {'message': 'Room not found'})
        return

    room = rooms[code]

    if room.game_phase != 'card_selection':
        emit('error', {'message': 'Not in card selection phase'})
        return

    if player_id not in room.players:
        emit('error', {'message': 'Player not found'})
        return

    player = room.players[player_id]

    # Validate the player is Tycoon or Rich
    if player.rank not in ['tycoon', 'rich']:
        emit('error', {'message': 'Only Tycoon and Rich select cards'})
        return

    # Validate card count
    required_count = 2 if player.rank == 'tycoon' else 1
    if len(card_ids) != required_count:
        emit('error', {'message': f'Must select {required_count} card(s)'})
        return

    # Validate cards are in player's hand
    hand_ids = {c.id for c in player.hand}
    if not all(cid in hand_ids for cid in card_ids):
        emit('error', {'message': 'Invalid cards selected'})
        return

    # Store selection
    room.pending_selections[player_id] = card_ids

    # Check if all selections are complete
    check_selections_complete(room)

# ============== Game Processing ==============

def process_play(room: GameRoom, player: Player, cards: List[Card]):
    """Process a card play"""
    # Check for special effects
    triggers_revolution = check_revolution(cards)
    eight_played = check_eight_played(cards)
    three_counters = check_three_counters_joker(room.current_pile, cards)

    # Remove cards from hand
    card_ids = {c.id for c in cards}
    player.hand = [c for c in player.hand if c.id not in card_ids]

    # Update revolution state
    if triggers_revolution:
        room.is_revolution = not room.is_revolution
        # Emit revolution cutscene event
        for pid, p in room.players.items():
            if p.sid:
                socketio.emit('revolution_triggered', {'player': player.name}, room=p.sid)

    # Check if player finished
    if not player.hand:
        player.has_finished = True
        room.finish_order.append(player.id)
        player.finish_order = len(room.finish_order)

        # Tycoon demotion rule: If someone other than Tycoon finishes first in rounds 2+
        if player.finish_order == 1 and room.current_round > 1:
            players_list = list(room.players.values())
            previous_tycoon = next((p for p in players_list if p.rank == 'tycoon'), None)

            if previous_tycoon and previous_tycoon.id != player.id:
                # Demote Tycoon to last place instantly
                previous_tycoon.has_finished = True
                room.finish_order.append(previous_tycoon.id)
                previous_tycoon.finish_order = len(room.finish_order)

                # Emit demotion animation
                for pid, p in room.players.items():
                    if p.sid:
                        socketio.emit('tycoon_demoted', {
                            'tycoonName': previous_tycoon.name,
                            'newTycoonName': player.name
                        }, room=p.sid)

    # Reset pass states
    players_list = list(room.players.values())
    for p in players_list:
        p.passed_this_turn = False

    # Handle 8 or 3 counters joker - same player goes again
    if eight_played or three_counters:
        room.discard_pile.extend(room.current_pile)
        room.discard_pile.extend(cards)
        room.current_pile = []
        room.current_pile_player_id = None

        # Emit cutscene events
        if eight_played:
            for pid, p in room.players.items():
                if p.sid:
                    socketio.emit('eight_played', {'player': player.name}, room=p.sid)

        if three_counters:
            for pid, p in room.players.items():
                if p.sid:
                    socketio.emit('joker_countered', {'player': player.name}, room=p.sid)

        # If player finished, move to next
        if player.has_finished:
            move_to_next_player(room)
        # Otherwise same player plays again
        return

    # Normal play
    room.discard_pile.extend(room.current_pile)
    room.current_pile = cards
    room.current_pile_player_id = player.id
    room.pass_count = 0

    # Check for round end
    check_round_end(room)

    # Move to next player
    if room.game_phase == 'playing':
        move_to_next_player(room)

def process_pass(room: GameRoom, player: Player):
    """Process a pass"""
    player.passed_this_turn = True
    room.pass_count += 1

    # Check if turn ends (all others passed)
    players_list = list(room.players.values())
    active_players = [p for p in players_list if not p.has_finished]
    passed_count = sum(1 for p in active_players if p.passed_this_turn and p.id != room.current_pile_player_id)

    if passed_count >= len(active_players) - 1 and room.current_pile:
        # Turn ends - pile owner starts new turn
        room.discard_pile.extend(room.current_pile)
        room.current_pile = []

        # Find pile owner's index
        players_list.sort(key=lambda p: p.seat_position)
        pile_owner_index = next((i for i, p in enumerate(players_list) if p.id == room.current_pile_player_id), 0)

        # Reset passes
        for p in players_list:
            p.passed_this_turn = False

        # Set next player
        room.current_player_index = pile_owner_index
        room.current_pile_player_id = None

        # Skip finished players
        while players_list[room.current_player_index].has_finished:
            room.current_player_index = (room.current_player_index + 1) % 4
    else:
        move_to_next_player(room)

    check_round_end(room)

def move_to_next_player(room: GameRoom):
    """Move to the next active player"""
    players_list = list(room.players.values())
    players_list.sort(key=lambda p: p.seat_position)

    for _ in range(4):
        room.current_player_index = (room.current_player_index + 1) % 4
        if not players_list[room.current_player_index].has_finished:
            break

def check_round_end(room: GameRoom):
    """Check if the round has ended"""
    players_list = list(room.players.values())
    active_players = [p for p in players_list if not p.has_finished]

    if len(active_players) <= 1:
        # Add remaining player to finish order
        if active_players:
            p = active_players[0]
            p.has_finished = True
            room.finish_order.append(p.id)
            p.finish_order = len(room.finish_order)

        # Assign rankings
        assign_rankings(room)

        # Check if game is over
        if room.current_round >= room.total_rounds:
            room.game_phase = 'game_end'
        else:
            room.game_phase = 'round_end'

def assign_rankings(room: GameRoom):
    """Assign rankings based on finish order"""
    ranks = [PlayerRank.TYCOON, PlayerRank.RICH, PlayerRank.POOR, PlayerRank.BEGGAR]

    for i, player_id in enumerate(room.finish_order):
        if player_id in room.players and i < len(ranks):
            player = room.players[player_id]
            player.rank = ranks[i].value
            player.points += RANK_POINTS[ranks[i]]

def start_next_round(room: GameRoom):
    """Start the next round with card exchange"""
    # Deal new cards
    deck = build_deck()
    hands = deal_cards(deck, 4)

    players_list = list(room.players.values())
    players_list.sort(key=lambda p: p.seat_position)

    for i, player in enumerate(players_list):
        player.hand = hands[i]
        player.has_finished = False
        player.finish_order = None
        player.passed_this_turn = False

    # Request card selections from Tycoon and Rich (bots auto-select)
    room.game_phase = 'card_selection'
    room.pending_selections = {}

    request_card_selections(room)

def request_card_selections(room: GameRoom):
    """Request card selections from Tycoon and Rich (bots auto-select)"""
    players_list = list(room.players.values())

    tycoon = next((p for p in players_list if p.rank == 'tycoon'), None)
    rich = next((p for p in players_list if p.rank == 'rich'), None)

    if not tycoon or not rich:
        # Can't do exchange, start round directly
        finalize_round_start(room)
        return

    # Tycoon needs to select 2 cards
    if tycoon.is_bot:
        # Bot auto-selects worst 2 cards
        tycoon_worst = get_worst_cards(tycoon.hand, 2)
        room.pending_selections[tycoon.id] = [c.id for c in tycoon_worst]
    else:
        # Request human to select
        socketio.emit('select_cards_to_give', {
            'rank': 'tycoon',
            'requiredCount': 2,
            'hand': [card_to_dict(c) for c in tycoon.hand]
        }, room=tycoon.sid)

    # Rich needs to select 1 card
    if rich.is_bot:
        # Bot auto-selects worst 1 card
        rich_worst = get_worst_cards(rich.hand, 1)
        room.pending_selections[rich.id] = [c.id for c in rich_worst]
    else:
        # Request human to select
        socketio.emit('select_cards_to_give', {
            'rank': 'rich',
            'requiredCount': 1,
            'hand': [card_to_dict(c) for c in rich.hand]
        }, room=rich.sid)

    # Check if all selections are ready (both bots)
    check_selections_complete(room)


def check_selections_complete(room: GameRoom):
    """Check if all card selections are complete and perform exchange"""
    players_list = list(room.players.values())

    tycoon = next((p for p in players_list if p.rank == 'tycoon'), None)
    rich = next((p for p in players_list if p.rank == 'rich'), None)

    if not tycoon or not rich:
        return

    # Check if both have submitted selections
    if tycoon.id not in room.pending_selections or rich.id not in room.pending_selections:
        return

    # Both selections are in, perform the exchange
    perform_card_exchange(room)


def perform_card_exchange(room: GameRoom):
    """Perform card exchange between ranks using selected cards"""
    players_list = list(room.players.values())

    tycoon = next((p for p in players_list if p.rank == 'tycoon'), None)
    rich = next((p for p in players_list if p.rank == 'rich'), None)
    poor = next((p for p in players_list if p.rank == 'poor'), None)
    beggar = next((p for p in players_list if p.rank == 'beggar'), None)

    if not all([tycoon, rich, poor, beggar]):
        finalize_round_start(room)
        return

    # Beggar gives 2 best to Tycoon (auto-selected)
    beggar_best = get_best_cards(beggar.hand, 2)
    beggar.hand = [c for c in beggar.hand if c not in beggar_best]
    tycoon.hand.extend(beggar_best)

    # Tycoon gives their selected cards to Beggar
    tycoon_selected_ids = room.pending_selections.get(tycoon.id, [])
    tycoon_gives = [c for c in tycoon.hand if c.id in tycoon_selected_ids]
    tycoon.hand = [c for c in tycoon.hand if c.id not in tycoon_selected_ids]
    beggar.hand.extend(tycoon_gives)

    # Poor gives 1 best to Rich (auto-selected)
    poor_best = get_best_cards(poor.hand, 1)
    poor.hand = [c for c in poor.hand if c not in poor_best]
    rich.hand.extend(poor_best)

    # Rich gives their selected card to Poor
    rich_selected_ids = room.pending_selections.get(rich.id, [])
    rich_gives = [c for c in rich.hand if c.id in rich_selected_ids]
    rich.hand = [c for c in rich.hand if c.id not in rich_selected_ids]
    poor.hand.extend(rich_gives)

    # Clear pending selections
    room.pending_selections = {}

    # Emit card exchange event to all players
    exchange_data = {
        'beggarGives': [card_to_dict(c) for c in beggar_best],
        'tycoonGives': [card_to_dict(c) for c in tycoon_gives],
        'poorGives': [card_to_dict(c) for c in poor_best],
        'richGives': [card_to_dict(c) for c in rich_gives]
    }

    for pid, p in room.players.items():
        if p.sid:
            socketio.emit('card_exchange', exchange_data, room=p.sid)

    # Finalize round start after a brief delay for animation
    socketio.sleep(0.5)
    finalize_round_start(room)


def finalize_round_start(room: GameRoom):
    """Finalize round start after card exchange"""
    players_list = list(room.players.values())
    players_list.sort(key=lambda p: p.seat_position)

    # Sort hands
    for player in players_list:
        player.hand = sort_hand(player.hand, room.is_revolution)

    # Beggar goes first in rounds 2+
    beggar_index = next((i for i, p in enumerate(players_list) if p.rank == 'beggar'), 0)
    room.current_player_index = beggar_index

    room.current_round += 1
    room.game_phase = 'playing'
    room.current_pile = []
    room.current_pile_player_id = None
    room.finish_order = []
    room.is_revolution = False

    # Broadcast game state
    broadcast_game_state(room)

    # Process bot turns
    process_bot_turns(room)

def process_bot_turns(room: GameRoom):
    """Process bot turns until a human player's turn"""
    if room.game_phase != 'playing':
        return

    players_list = list(room.players.values())
    players_list.sort(key=lambda p: p.seat_position)

    # Keep processing while current player is a bot
    while True:
        current = players_list[room.current_player_index]

        if not current.is_bot or current.has_finished:
            break

        # Check if any human players are still playing
        humans_still_playing = [p for p in players_list if not p.is_bot and not p.has_finished]

        # Use slower delay when humans are playing, faster when only bots remain
        if humans_still_playing:
            bot_delay = 1.2  # Slow so humans can follow the action
        else:
            bot_delay = 0.2  # Fast when only bots are left

        # Bot makes decision
        action, cards = make_bot_decision(current, room)

        if action == 'play' and cards:
            process_play(room, current, cards)
        else:
            process_pass(room, current)

        # Broadcast after each bot action
        broadcast_game_state(room)

        if room.game_phase != 'playing':
            break

        # Delay between bot turns
        socketio.sleep(bot_delay)

def broadcast_game_state(room: GameRoom):
    """Send game state to all players"""
    for pid, player in room.players.items():
        if player.sid:
            socketio.emit('game_update', {'room': room_to_dict(room, pid)}, room=player.sid)

# ============== HTTP Routes ==============

@app.route('/')
def index():
    return render_template('picker.html', game_registry_json=json.dumps(list_games()))

@app.route('/tycoon')
def tycoon_page():
    return render_template('tycoon.html')

@app.route('/poker')
def poker_page():
    return render_template('poker.html',
        supabase_url=SUPABASE_URL,
        supabase_key=SUPABASE_KEY)

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

@app.route('/api/games')
def api_games():
    return jsonify(list_games())

# ============== Register Game Modules ==============

poker_events.register(socketio, socket_to_player)

# ============== Run Server ==============

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5001, debug=True)
