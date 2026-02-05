"""
Poker Socket Event Handlers
============================
Registers all poker-specific socket events.
Room creation/join/disconnect are handled by app.py and dispatched here.
"""

from flask import request
from flask_socketio import join_room, leave_room
from typing import Dict
import time
import random

from .poker_logic import (
    PokerRoom, PokerPlayer, start_hand, process_action,
    room_to_dict, get_seated_players, make_poker_bot_decision,
    POKER_BOT_NAMES, TURN_TIME_LIMIT, POST_HAND_DELAY, card_to_dict,
    get_active_in_hand, _resolve_hand, _advance_to_next_active, _advance_street,
)

# Module-level references, set during register()
_socketio = None
_socket_to_player = None

# Poker rooms keyed by room code
poker_rooms: Dict[str, PokerRoom] = {}

# Track disconnected poker players for timeout
poker_disconnected: Dict[str, Dict[str, float]] = {}

DISCONNECT_TIMEOUT = 60


def register(socketio, socket_to_player):
    """Register all poker socket events. Called once from app.py."""
    global _socketio, _socket_to_player
    _socketio = socketio
    _socket_to_player = socket_to_player

    @socketio.on('poker_action')
    def handle_poker_action(data):
        code = data.get('code')
        player_id = data.get('playerId')
        action = data.get('action')
        amount = data.get('amount', 0)

        if code not in poker_rooms:
            socketio.emit('error', {'message': 'Room not found'}, room=request.sid)
            return

        room = poker_rooms[code]

        if room.game_phase in ('waiting', 'hand_end'):
            socketio.emit('error', {'message': 'No active hand'}, room=request.sid)
            return

        result = process_action(room, player_id, action, amount)

        if 'error' in result:
            socketio.emit('error', {'message': result['error']}, room=request.sid)
            return

        # Broadcast action to all players
        _broadcast_action(room, result)
        _broadcast_poker_state(room)
        if room.game_phase == 'hand_end':
            _schedule_auto_deal(room)
        else:
            _maybe_process_bots(room)
            _start_turn_timer(room)

    @socketio.on('poker_buy_in')
    def handle_poker_buy_in(data):
        code = data.get('code')
        player_id = data.get('playerId')
        amount = data.get('amount', 1000)

        if code not in poker_rooms:
            socketio.emit('error', {'message': 'Room not found'}, room=request.sid)
            return

        room = poker_rooms[code]

        if player_id not in room.players:
            socketio.emit('error', {'message': 'Player not found'}, room=request.sid)
            return

        # Only allow buy-in when waiting or between hands
        if room.game_phase not in ('waiting', 'hand_end'):
            socketio.emit('error', {'message': 'Can only buy in between hands'}, room=request.sid)
            return

        player = room.players[player_id]
        player.stack += amount

        socketio.emit('poker_buy_in_success', {
            'playerId': player_id,
            'amount': amount,
            'newStack': player.stack,
        }, room=request.sid)

        _broadcast_poker_state(room)

    @socketio.on('poker_start_game')
    def handle_poker_start(data):
        code = data.get('code')
        player_id = data.get('playerId')

        if code not in poker_rooms:
            socketio.emit('error', {'message': 'Room not found'}, room=request.sid)
            return

        room = poker_rooms[code]

        if room.host_id != player_id:
            socketio.emit('error', {'message': 'Only host can start'}, room=request.sid)
            return

        if room.game_phase not in ('waiting', 'hand_end'):
            socketio.emit('error', {'message': 'Game already in progress'}, room=request.sid)
            return

        # Need at least 2 players with chips
        ready = [p for p in room.players.values() if p.stack > 0 and not p.is_sitting_out]
        if len(ready) < 2:
            socketio.emit('error', {'message': 'Need at least 2 players with chips'}, room=request.sid)
            return

        success = start_hand(room)
        if not success:
            socketio.emit('error', {'message': 'Could not start hand'}, room=request.sid)
            return

        _broadcast_poker_state(room)
        _maybe_process_bots(room)
        _start_turn_timer(room)

    @socketio.on('poker_next_hand')
    def handle_next_hand(data):
        code = data.get('code')
        player_id = data.get('playerId')

        if code not in poker_rooms:
            return

        room = poker_rooms[code]

        if room.host_id != player_id:
            socketio.emit('error', {'message': 'Only host can deal next hand'}, room=request.sid)
            return

        if room.game_phase != 'hand_end':
            return

        _deal_next_hand(room)

    @socketio.on('poker_add_bot')
    def handle_add_bot(data):
        code = data.get('code')
        player_id = data.get('playerId')
        difficulty = data.get('difficulty', 'normal')  # 'normal' or 'hard'

        if code not in poker_rooms:
            socketio.emit('error', {'message': 'Room not found'}, room=request.sid)
            return

        room = poker_rooms[code]

        if room.host_id != player_id:
            socketio.emit('error', {'message': 'Only host can add bots'}, room=request.sid)
            return

        from game_registry import get_max_players
        max_p = get_max_players('poker')
        if len(room.players) >= max_p:
            socketio.emit('error', {'message': 'Room is full'}, room=request.sid)
            return

        # Pick a random bot name, avoiding duplicates if possible
        used_names = {p.name for p in room.players.values()}
        available_names = [n for n in POKER_BOT_NAMES if n not in used_names]
        if available_names:
            bot_name = random.choice(available_names)
        elif POKER_BOT_NAMES:
            # All names exhausted, allow reuse
            bot_name = random.choice(POKER_BOT_NAMES)
        else:
            bot_name = f'Bot {len(room.players) + 1}'

        bot_id = f'poker-bot-{len(room.players)}-{int(time.time())}'
        bot = PokerPlayer(
            id=bot_id,
            name=bot_name,
            seat=len(room.players),
            stack=1000,
            is_bot=True,
            bot_difficulty=difficulty,
        )
        room.players[bot_id] = bot

        socketio.emit('player_joined', {'player': {
            'id': bot.id, 'name': bot.name, 'stack': bot.stack,
            'seat': bot.seat, 'isBot': True, 'botDifficulty': bot.bot_difficulty,
        }}, room=code)

        _broadcast_poker_state(room)

    @socketio.on('poker_show_hand')
    def handle_show_hand(data):
        code = data.get('code')
        player_id = data.get('playerId')

        if code not in poker_rooms:
            return

        room = poker_rooms[code]

        # Only allowed during hand_end (post-hand reveal window)
        if room.game_phase != 'hand_end':
            return

        # Only players who folded and have captured cards
        if player_id not in room.folded_cards:
            return

        # Don't allow double-show
        if player_id in room.shown_hands:
            return

        room.shown_hands[player_id] = room.folded_cards[player_id]

        # Broadcast the reveal to all players
        player = room.players.get(player_id)
        player_name = player.name if player else 'Unknown'
        socketio.emit('poker_hand_shown', {
            'playerId': player_id,
            'playerName': player_name,
            'cards': room.folded_cards[player_id],
        }, room=code)

        _broadcast_poker_state(room)

    @socketio.on('poker_kick_player')
    def handle_kick_player(data):
        code = data.get('code')
        player_id = data.get('playerId')
        target_id = data.get('targetPlayerId')

        if code not in poker_rooms:
            socketio.emit('error', {'message': 'Room not found'}, room=request.sid)
            return

        room = poker_rooms[code]

        if room.host_id != player_id:
            socketio.emit('error', {'message': 'Only the host can remove players'}, room=request.sid)
            return

        if target_id == player_id:
            socketio.emit('error', {'message': 'Cannot remove yourself'}, room=request.sid)
            return

        if target_id not in room.players:
            socketio.emit('error', {'message': 'Player not found'}, room=request.sid)
            return

        target = room.players[target_id]
        target_name = target.name
        target_is_bot = target.is_bot
        target_sid = target.sid
        target_stack = target.stack

        # Apply the kick (fold if mid-hand, remove from hand_players, fix index)
        _apply_kick(room, target_id)

        # Remove from room
        del room.players[target_id]

        # Clean up disconnect tracking
        if code in poker_disconnected and target_id in poker_disconnected[code]:
            del poker_disconnected[code][target_id]

        # Leave socket room
        if target_sid:
            leave_room(code, sid=target_sid)

        # Notify kicked human
        if not target_is_bot and target_sid:
            socketio.emit('kicked_from_room', {
                'reason': 'You were removed by the host',
                'stack': target_stack,
            }, room=target_sid)

        # Notify remaining players
        socketio.emit('player_kicked', {
            'playerId': target_id,
            'playerName': target_name,
        }, room=code)

        # Clean up empty room
        if not room.players:
            del poker_rooms[code]
            return

        _broadcast_poker_state(room)

        # Post-kick: trigger auto-deal or bot processing
        if room.game_phase == 'hand_end':
            _schedule_auto_deal(room)
        elif room.game_phase not in ('waiting', 'hand_end'):
            _maybe_process_bots(room)
            _start_turn_timer(room)


def _apply_kick(room: PokerRoom, target_id: str):
    """
    Core kick logic: fold if mid-hand, fix hand_players and current_player_index.
    Separated for testability.
    """
    target = room.players[target_id]

    # Handle mid-hand kick
    if room.game_phase not in ('waiting', 'hand_end') and target_id in room.hand_players:
        was_current = (
            room.hand_players[room.current_player_index] == target_id
        )

        if not target.is_folded:
            if target.hole_cards:
                room.folded_cards[target_id] = [card_to_dict(c) for c in target.hole_cards]
            target.is_folded = True
            room.needs_action.discard(target_id)

        # Check if hand should end
        active = get_active_in_hand(room)
        if len(active) <= 1:
            _resolve_hand(room)
        elif was_current:
            # Advance turn before removing from hand_players
            _advance_to_next_active(room)
            room.turn_start_time = time.time()

        # Remove from hand_players and fix index
        if target_id in room.hand_players:
            removed_idx = room.hand_players.index(target_id)
            room.hand_players.remove(target_id)
            if room.hand_players:
                if room.current_player_index >= len(room.hand_players):
                    room.current_player_index = room.current_player_index % len(room.hand_players)
                elif removed_idx < room.current_player_index:
                    room.current_player_index -= 1
    elif target_id in room.hand_players:
        # hand_end phase: just clean up the list
        room.hand_players.remove(target_id)


# ============== Room Lifecycle (called from app.py) ==============

def create_room(code: str, player_id: str, player_name: str, sid: str) -> PokerRoom:
    """Create a new poker room. Returns the room."""
    room = PokerRoom(code=code, host_id=player_id)

    player = PokerPlayer(
        id=player_id,
        name=player_name,
        seat=0,
        sid=sid,
    )
    room.players[player_id] = player
    poker_rooms[code] = room

    _socket_to_player[sid] = (code, player_id)
    join_room(code)

    _socketio.emit('room_created', {
        'code': code,
        'room': room_to_dict(room, player_id),
    }, room=sid)

    return room


def join_room_handler(code: str, player_id: str, player_name: str, sid: str, max_players: int):
    """Handle a player joining a poker room."""
    if code not in poker_rooms:
        _socketio.emit('error', {'message': 'Room not found'}, room=sid)
        return

    room = poker_rooms[code]

    # Rejoin check
    if player_id in room.players:
        player = room.players[player_id]
        player.sid = sid
        _socket_to_player[sid] = (code, player_id)

        if code in poker_disconnected and player_id in poker_disconnected[code]:
            del poker_disconnected[code][player_id]

        join_room(code)

        _socketio.emit('player_reconnected', {
            'playerId': player_id, 'playerName': player.name,
        }, room=code, include_self=False)

        if room.game_phase == 'waiting':
            _socketio.emit('room_joined', {'code': code, 'room': room_to_dict(room, player_id)}, room=sid)
        else:
            _socketio.emit('poker_rejoined', {'code': code, 'room': room_to_dict(room, player_id)}, room=sid)
        return

    # New player
    if room.game_phase not in ('waiting', 'hand_end'):
        _socketio.emit('error', {'message': 'Game in progress, wait for next hand'}, room=sid)
        return

    if len(room.players) >= max_players:
        _socketio.emit('error', {'message': 'Room is full'}, room=sid)
        return

    player = PokerPlayer(
        id=player_id,
        name=player_name,
        seat=len(room.players),
        sid=sid,
    )
    room.players[player_id] = player

    _socket_to_player[sid] = (code, player_id)
    join_room(code)

    _socketio.emit('room_joined', {'code': code, 'room': room_to_dict(room, player_id)}, room=sid)
    _socketio.emit('player_joined', {'player': {
        'id': player.id, 'name': player.name, 'stack': player.stack, 'seat': player.seat,
    }}, room=code, include_self=False)


def handle_disconnect(room_code: str, player_id: str):
    """Handle a poker player disconnecting."""
    if room_code not in poker_rooms:
        return

    room = poker_rooms[room_code]
    if player_id not in room.players:
        return

    player = room.players[player_id]
    player.sid = None

    if room.game_phase == 'waiting':
        del room.players[player_id]
        _socketio.emit('player_left', {'playerId': player_id}, room=room_code)
        if not room.players:
            del poker_rooms[room_code]
        return

    # Track disconnect
    if room_code not in poker_disconnected:
        poker_disconnected[room_code] = {}
    poker_disconnected[room_code][player_id] = time.time()

    _socketio.emit('player_disconnected', {
        'playerId': player_id, 'playerName': player.name,
    }, room=room_code)

    # If it's this player's turn, auto-fold after timeout
    if room.hand_players and room.game_phase not in ('waiting', 'hand_end'):
        current_pid = room.hand_players[room.current_player_index]
        if current_pid == player_id:
            _socketio.start_background_task(_auto_fold_timeout, room_code, player_id)


def handle_leave(room_code: str, player_id: str):
    """Handle a player intentionally leaving."""
    if room_code not in poker_rooms:
        return

    room = poker_rooms[room_code]
    if player_id not in room.players:
        return

    # Host leaving ends session
    if player_id == room.host_id:
        _socketio.emit('session_ended', {'reason': 'Host has ended the session'}, room=room_code)
        del poker_rooms[room_code]
        if room_code in poker_disconnected:
            del poker_disconnected[room_code]
        return

    player = room.players[player_id]

    # If hand in progress, fold them
    if room.game_phase not in ('waiting', 'hand_end') and player_id in room.hand_players:
        if not player.is_folded:
            player.is_folded = True
            room.needs_action.discard(player_id)

            active = [room.players[pid] for pid in room.hand_players
                      if pid in room.players and not room.players[pid].is_folded]
            if len(active) <= 1:
                _resolve_hand(room)

    # Remove player
    del room.players[player_id]
    _socketio.emit('player_left', {'playerId': player_id}, room=room_code)

    if not room.players:
        del poker_rooms[room_code]
        return

    _broadcast_poker_state(room)


def _auto_fold_timeout(room_code: str, player_id: str):
    """Auto-fold a disconnected player after timeout."""
    _socketio.sleep(DISCONNECT_TIMEOUT)

    if room_code not in poker_disconnected:
        return
    if player_id not in poker_disconnected.get(room_code, {}):
        return  # reconnected
    if room_code not in poker_rooms:
        return

    room = poker_rooms[room_code]
    if player_id not in room.players:
        return

    player = room.players[player_id]
    if player.sid is not None:
        return  # reconnected

    # Auto-fold if it's still their turn
    if room.hand_players and room.game_phase not in ('waiting', 'hand_end'):
        current_pid = room.hand_players[room.current_player_index]
        if current_pid == player_id and not player.is_folded:
            result = process_action(room, player_id, 'fold')
            _broadcast_poker_state(room)


# ============== Broadcasting ==============

def _broadcast_poker_state(room: PokerRoom):
    """Send poker state to all connected players."""
    for pid, player in room.players.items():
        if player.sid:
            _socketio.emit('poker_update', {
                'room': room_to_dict(room, pid),
            }, room=player.sid)


def _broadcast_action(room: PokerRoom, result: dict):
    """Broadcast an action to all players."""
    for pid, player in room.players.items():
        if player.sid:
            _socketio.emit('poker_action_broadcast', result, room=player.sid)


def _deal_next_hand(room: PokerRoom):
    """Start the next hand if enough players are ready."""
    ready = [p for p in room.players.values() if p.stack > 0 and not p.is_sitting_out]
    if len(ready) < 2:
        room.game_phase = 'waiting'
        _broadcast_poker_state(room)
        return

    old_level = room.blind_level
    start_hand(room)

    # Notify if blinds increased
    if room.blind_level > old_level:
        _socketio.emit('poker_blinds_up', {
            'level': room.blind_level,
            'smallBlind': room.small_blind,
            'bigBlind': room.big_blind,
        }, room=room.code)

    _broadcast_poker_state(room)
    _maybe_process_bots(room)
    _start_turn_timer(room)


def _schedule_auto_deal(room: PokerRoom):
    """Schedule automatic dealing of next hand after delay."""
    if room.auto_deal_pending:
        return
    room.auto_deal_pending = True

    # Bots may reveal their folded hands (20% chance per bot)
    _socketio.start_background_task(_bot_post_hand_reveals, room.code, room.hand_number)

    _socketio.start_background_task(_auto_deal_task, room.code, room.hand_number)


def _bot_post_hand_reveals(room_code: str, hand_number: int):
    """Bots randomly reveal folded hands after a short delay in post-hand phase."""
    _socketio.sleep(1.5)  # Wait a moment after hand ends

    if room_code not in poker_rooms:
        return
    room = poker_rooms[room_code]
    if room.game_phase != 'hand_end' or room.hand_number != hand_number:
        return

    for pid, cards in list(room.folded_cards.items()):
        if pid in room.shown_hands:
            continue
        player = room.players.get(pid)
        if not player or not player.is_bot:
            continue
        # 20% chance to reveal
        if random.random() < 0.20:
            room.shown_hands[pid] = cards
            _socketio.emit('poker_hand_shown', {
                'playerId': pid,
                'playerName': player.name,
                'cards': cards,
            }, room=room_code)

    _broadcast_poker_state(room)


def _auto_deal_task(room_code: str, hand_number: int):
    """Background task that auto-deals next hand after delay."""
    _socketio.sleep(POST_HAND_DELAY)

    if room_code not in poker_rooms:
        return
    room = poker_rooms[room_code]

    # Only deal if still on the same hand_end (someone may have manually dealt)
    if room.game_phase != 'hand_end' or room.hand_number != hand_number:
        return

    _deal_next_hand(room)


def _maybe_process_bots(room: PokerRoom):
    """Kick off bot processing if the current player is a bot."""
    if room.game_phase in ('waiting', 'hand_end'):
        return
    if not room.hand_players:
        return
    current_pid = room.hand_players[room.current_player_index]
    if current_pid in room.players and room.players[current_pid].is_bot:
        _socketio.start_background_task(_process_poker_bot_turns, room.code)


def _start_turn_timer(room: PokerRoom):
    """Start turn timer for current player (auto-fold after TURN_TIME_LIMIT)."""
    if room.game_phase in ('waiting', 'hand_end'):
        return
    if not room.hand_players:
        return
    current_pid = room.hand_players[room.current_player_index]
    if current_pid in room.players and room.players[current_pid].is_bot:
        return  # Bots handle their own timing
    _socketio.start_background_task(
        _turn_timer_task, room.code, room.hand_number, current_pid, room.turn_start_time
    )


def _turn_timer_task(room_code: str, hand_number: int, player_id: str, turn_start: float):
    """Auto-fold a player if they don't act within TURN_TIME_LIMIT."""
    _socketio.sleep(TURN_TIME_LIMIT + 1)

    if room_code not in poker_rooms:
        return
    room = poker_rooms[room_code]

    # Verify same hand and same turn
    if room.hand_number != hand_number:
        return
    if room.game_phase in ('waiting', 'hand_end'):
        return
    if room.turn_start_time != turn_start:
        return  # Turn has moved on

    current_pid = room.hand_players[room.current_player_index]
    if current_pid != player_id:
        return

    player = room.players.get(player_id)
    if not player or player.is_folded or player.is_all_in:
        return

    # Auto-fold
    result = process_action(room, player_id, 'fold', 0)
    if 'error' not in result:
        _broadcast_action(room, result)
        _broadcast_poker_state(room)
        if room.game_phase == 'hand_end':
            _schedule_auto_deal(room)
        else:
            _maybe_process_bots(room)
            _start_turn_timer(room)


def _process_poker_bot_turns(room_code: str):
    """Process bot turns until a human player's turn or hand ends."""
    while True:
        if room_code not in poker_rooms:
            return

        room = poker_rooms[room_code]

        if room.game_phase in ('waiting', 'hand_end'):
            if room.game_phase == 'hand_end':
                _schedule_auto_deal(room)
            return
        if not room.hand_players:
            return

        current_pid = room.hand_players[room.current_player_index]
        if current_pid not in room.players:
            return

        player = room.players[current_pid]
        if not player.is_bot:
            _start_turn_timer(room)
            return  # Human's turn, stop

        # Hard bots act faster (0.3-0.9s), normal bots (0.8-1.5s)
        if player.bot_difficulty == 'hard':
            _socketio.sleep(0.3 + (hash(current_pid) % 7) * 0.085)
        else:
            _socketio.sleep(0.8 + (hash(current_pid) % 7) * 0.1)

        # Re-check room still exists after sleep
        if room_code not in poker_rooms:
            return
        room = poker_rooms[room_code]
        if room.game_phase in ('waiting', 'hand_end'):
            if room.game_phase == 'hand_end':
                _schedule_auto_deal(room)
            return

        # Bot decides
        action, amount = make_poker_bot_decision(player, room)
        result = process_action(room, current_pid, action, amount)

        if 'error' in result:
            # Fallback: fold on error
            result = process_action(room, current_pid, 'fold', 0)
            if 'error' in result:
                return

        _broadcast_action(room, result)
        _broadcast_poker_state(room)
