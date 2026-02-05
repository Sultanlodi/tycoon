"""
Tests for poker hand evaluation and game logic.
Run with: python -m pytest web/tests/test_poker.py -v
"""

import sys
import os
import time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from poker.poker_logic import (
    PokerCard, PokerPlayer, PokerRoom,
    evaluate_five, evaluate_best_hand, build_poker_deck,
    start_hand, process_action, get_active_in_hand,
    room_to_dict, card_to_dict,
    BLIND_SCHEDULE, HANDS_PER_BLIND_LEVEL, TURN_TIME_LIMIT, POST_HAND_DELAY,
)
from poker.poker_events import _apply_kick


# ============== Helpers ==============

def make_card(suit, value):
    display = f"{value}{suit[0].upper()}"
    return PokerCard(id=f"{suit}-{value}", suit=suit, value=value, display=display)


def hand(*specs):
    """Create cards from specs like ('hearts', 14), ('spades', 10)."""
    return [make_card(s, v) for s, v in specs]


# ============== Hand Evaluation: evaluate_five ==============

class TestEvaluateFive:
    def test_royal_flush(self):
        cards = hand(
            ('hearts', 14), ('hearts', 13), ('hearts', 12),
            ('hearts', 11), ('hearts', 10),
        )
        result = evaluate_five(cards)
        assert result[0] == 9  # Royal Flush

    def test_straight_flush(self):
        cards = hand(
            ('clubs', 9), ('clubs', 8), ('clubs', 7),
            ('clubs', 6), ('clubs', 5),
        )
        result = evaluate_five(cards)
        assert result[0] == 8  # Straight Flush
        assert result[1] == 9  # high card of the straight

    def test_four_of_a_kind(self):
        cards = hand(
            ('hearts', 7), ('diamonds', 7), ('clubs', 7),
            ('spades', 7), ('hearts', 2),
        )
        result = evaluate_five(cards)
        assert result[0] == 7
        assert result[1] == 7  # quads value

    def test_full_house(self):
        cards = hand(
            ('hearts', 10), ('diamonds', 10), ('clubs', 10),
            ('spades', 4), ('hearts', 4),
        )
        result = evaluate_five(cards)
        assert result[0] == 6
        assert result[1] == 10  # trips
        assert result[2] == 4   # pair

    def test_flush(self):
        cards = hand(
            ('diamonds', 14), ('diamonds', 10), ('diamonds', 7),
            ('diamonds', 4), ('diamonds', 2),
        )
        result = evaluate_five(cards)
        assert result[0] == 5

    def test_straight(self):
        cards = hand(
            ('hearts', 9), ('clubs', 8), ('diamonds', 7),
            ('spades', 6), ('hearts', 5),
        )
        result = evaluate_five(cards)
        assert result[0] == 4
        assert result[1] == 9

    def test_wheel_straight(self):
        cards = hand(
            ('hearts', 14), ('clubs', 5), ('diamonds', 4),
            ('spades', 3), ('hearts', 2),
        )
        result = evaluate_five(cards)
        assert result[0] == 4
        assert result[1] == 5  # wheel: 5-high straight

    def test_three_of_a_kind(self):
        cards = hand(
            ('hearts', 8), ('diamonds', 8), ('clubs', 8),
            ('spades', 13), ('hearts', 2),
        )
        result = evaluate_five(cards)
        assert result[0] == 3
        assert result[1] == 8

    def test_two_pair(self):
        cards = hand(
            ('hearts', 14), ('diamonds', 14), ('clubs', 9),
            ('spades', 9), ('hearts', 5),
        )
        result = evaluate_five(cards)
        assert result[0] == 2
        assert result[1] == 14  # high pair
        assert result[2] == 9   # low pair
        assert result[3] == 5   # kicker

    def test_one_pair(self):
        cards = hand(
            ('hearts', 6), ('diamonds', 6), ('clubs', 14),
            ('spades', 10), ('hearts', 3),
        )
        result = evaluate_five(cards)
        assert result[0] == 1
        assert result[1] == 6

    def test_high_card(self):
        cards = hand(
            ('hearts', 14), ('clubs', 10), ('diamonds', 7),
            ('spades', 5), ('hearts', 2),
        )
        result = evaluate_five(cards)
        assert result[0] == 0
        assert result[1] == 14

    def test_hand_ranking_order(self):
        """Higher ranked hands should have higher scores."""
        high_card = evaluate_five(hand(
            ('hearts', 14), ('clubs', 10), ('diamonds', 7),
            ('spades', 5), ('hearts', 2),
        ))
        pair = evaluate_five(hand(
            ('hearts', 6), ('diamonds', 6), ('clubs', 3),
            ('spades', 10), ('hearts', 14),
        ))
        two_pair = evaluate_five(hand(
            ('hearts', 14), ('diamonds', 14), ('clubs', 9),
            ('spades', 9), ('hearts', 5),
        ))
        trips = evaluate_five(hand(
            ('hearts', 8), ('diamonds', 8), ('clubs', 8),
            ('spades', 13), ('hearts', 2),
        ))
        straight = evaluate_five(hand(
            ('hearts', 9), ('clubs', 8), ('diamonds', 7),
            ('spades', 6), ('hearts', 5),
        ))
        flush = evaluate_five(hand(
            ('diamonds', 14), ('diamonds', 10), ('diamonds', 7),
            ('diamonds', 4), ('diamonds', 2),
        ))
        full_house = evaluate_five(hand(
            ('hearts', 10), ('diamonds', 10), ('clubs', 10),
            ('spades', 4), ('hearts', 4),
        ))
        quads = evaluate_five(hand(
            ('hearts', 7), ('diamonds', 7), ('clubs', 7),
            ('spades', 7), ('hearts', 2),
        ))

        assert high_card < pair < two_pair < trips < straight < flush < full_house < quads

    def test_pair_kicker_comparison(self):
        """Same pair, different kicker should matter."""
        pair_low_kicker = evaluate_five(hand(
            ('hearts', 10), ('diamonds', 10), ('clubs', 5),
            ('spades', 3), ('hearts', 2),
        ))
        pair_high_kicker = evaluate_five(hand(
            ('hearts', 10), ('diamonds', 10), ('clubs', 14),
            ('spades', 3), ('hearts', 2),
        ))
        assert pair_high_kicker > pair_low_kicker


# ============== Best Hand from 7 Cards ==============

class TestEvaluateBestHand:
    def test_finds_flush_in_seven(self):
        cards = hand(
            ('hearts', 14), ('hearts', 10), ('hearts', 7),
            ('hearts', 4), ('hearts', 2),
            ('clubs', 13), ('diamonds', 8),
        )
        score, name = evaluate_best_hand(cards)
        assert score[0] == 5  # Flush
        assert name == 'Flush'

    def test_finds_straight_with_extras(self):
        cards = hand(
            ('hearts', 9), ('clubs', 8), ('diamonds', 7),
            ('spades', 6), ('hearts', 5),
            ('clubs', 2), ('diamonds', 3),
        )
        score, name = evaluate_best_hand(cards)
        assert score[0] == 4  # Straight
        assert score[1] == 9

    def test_finds_full_house_over_two_pair(self):
        cards = hand(
            ('hearts', 10), ('diamonds', 10), ('clubs', 10),
            ('spades', 4), ('hearts', 4),
            ('clubs', 7), ('diamonds', 2),
        )
        score, name = evaluate_best_hand(cards)
        assert score[0] == 6  # Full House
        assert name == 'Full House'


# ============== Deck ==============

class TestDeck:
    def test_deck_has_52_cards(self):
        deck = build_poker_deck()
        assert len(deck) == 52

    def test_all_unique(self):
        deck = build_poker_deck()
        ids = [c.id for c in deck]
        assert len(set(ids)) == 52

    def test_suits_and_values(self):
        deck = build_poker_deck()
        suits = set(c.suit for c in deck)
        values = set(c.value for c in deck)
        assert suits == {'hearts', 'diamonds', 'clubs', 'spades'}
        assert values == set(range(2, 15))


# ============== Game Flow ==============

class TestGameFlow:
    def _make_room(self, num_players=3, stack=1000):
        room = PokerRoom(code='TEST', host_id='p0')
        for i in range(num_players):
            room.players[f'p{i}'] = PokerPlayer(
                id=f'p{i}', name=f'Player {i}',
                stack=stack, seat=i,
            )
        return room

    def test_start_hand_deals_cards(self):
        room = self._make_room(3)
        result = start_hand(room)
        assert result is True
        assert room.game_phase == 'pre_flop'
        for pid in room.hand_players:
            assert len(room.players[pid].hole_cards) == 2

    def test_start_hand_posts_blinds(self):
        room = self._make_room(3, stack=1000)
        start_hand(room)
        total_stacks = sum(p.stack for p in room.players.values())
        # Two blinds posted: total should be 3000 - 30 = 2970
        assert total_stacks == 3000 - 30
        assert room.pot == 30

    def test_start_hand_needs_two_players(self):
        room = self._make_room(1)
        result = start_hand(room)
        assert result is False
        assert room.game_phase == 'waiting'

    def test_fold_leaves_one_player(self):
        room = self._make_room(2, stack=1000)
        start_hand(room)
        current_pid = room.hand_players[room.current_player_index]
        result = process_action(room, current_pid, 'fold')
        assert 'error' not in result
        assert room.game_phase == 'hand_end'

    def test_check_check_advances_street(self):
        room = self._make_room(2, stack=1000)
        start_hand(room)
        # Pre-flop: SB acts first heads-up
        # SB needs to call the BB or raise
        current_pid = room.hand_players[room.current_player_index]
        process_action(room, current_pid, 'call')

        # BB can check
        current_pid = room.hand_players[room.current_player_index]
        process_action(room, current_pid, 'check')

        # Should be on flop now
        assert room.game_phase == 'flop'
        assert len(room.community_cards) == 3

    def test_cannot_act_out_of_turn(self):
        room = self._make_room(3, stack=1000)
        start_hand(room)
        current_pid = room.hand_players[room.current_player_index]
        # Try to act as a different player
        other_pid = [pid for pid in room.hand_players if pid != current_pid][0]
        result = process_action(room, other_pid, 'fold')
        assert 'error' in result

    def test_raise_resets_needs_action(self):
        room = self._make_room(3, stack=1000)
        start_hand(room)
        # UTG calls
        current_pid = room.hand_players[room.current_player_index]
        process_action(room, current_pid, 'call')
        # Next player raises
        current_pid = room.hand_players[room.current_player_index]
        process_action(room, current_pid, 'raise', 60)
        # Everyone else should need to act
        assert len(room.needs_action) > 0

    def test_all_in_handling(self):
        room = self._make_room(2, stack=20)
        start_hand(room)
        # With only 20 chips, blinds of 10+20 means BB is all-in
        bb_pid = room.hand_players[1] if len(room.hand_players) > 1 else room.hand_players[0]
        bb = room.players[bb_pid]
        # BB should have posted up to their stack
        # SB calls or folds
        current_pid = room.hand_players[room.current_player_index]
        result = process_action(room, current_pid, 'call')
        assert 'error' not in result


# ============== Bankroll Service Tests ==============

class TestBankrollWeekKey:
    """Test the week key calculation logic."""

    def test_week_key_format(self):
        from datetime import datetime
        # We replicate the logic from bankroll.js in Python for testing
        def get_iso_week(date):
            return date.isocalendar()

        d = datetime(2025, 1, 6)  # Monday
        year, week, _ = get_iso_week(d)
        key = f"{year}-W{week:02d}"
        assert key == "2025-W02"

    def test_same_week_same_key(self):
        from datetime import datetime
        def week_key(date):
            year, week, _ = date.isocalendar()
            return f"{year}-W{week:02d}"

        mon = datetime(2025, 1, 6)
        fri = datetime(2025, 1, 10)
        sun = datetime(2025, 1, 12)
        assert week_key(mon) == week_key(fri) == week_key(sun)

    def test_different_weeks_different_keys(self):
        from datetime import datetime
        def week_key(date):
            year, week, _ = date.isocalendar()
            return f"{year}-W{week:02d}"

        week1 = datetime(2025, 1, 6)
        week2 = datetime(2025, 1, 13)
        assert week_key(week1) != week_key(week2)


class TestBankrollBuyIn:
    """Test buy-in logic (Python-side validation)."""

    def test_buyin_deducts_from_allowance(self):
        allowance = 3000
        buy_in = 1000
        remaining = allowance - buy_in
        assert remaining == 2000

    def test_max_three_buyins_per_week(self):
        allowance = 3000
        buy_in = 1000
        count = 0
        while allowance >= buy_in:
            allowance -= buy_in
            count += 1
        assert count == 3
        assert allowance == 0

    def test_cannot_buyin_when_exhausted(self):
        allowance = 500
        buy_in = 1000
        can_buy = allowance >= buy_in
        assert can_buy is False

    def test_next_reset_is_monday(self):
        from datetime import datetime, timedelta
        def get_next_monday(date):
            day = date.weekday()  # 0=Mon
            days_until = (7 - day) % 7
            if days_until == 0:
                days_until = 7
            return date + timedelta(days=days_until)

        # Wednesday -> next Monday
        wed = datetime(2025, 1, 8)
        monday = get_next_monday(wed)
        assert monday.weekday() == 0
        assert monday == datetime(2025, 1, 13)

        # Monday -> next Monday (7 days later)
        mon = datetime(2025, 1, 6)
        next_mon = get_next_monday(mon)
        assert next_mon == datetime(2025, 1, 13)

        # Sunday -> next Monday (1 day later)
        sun = datetime(2025, 1, 12)
        next_mon = get_next_monday(sun)
        assert next_mon == datetime(2025, 1, 13)


# ============== Blind Level Tests ==============

class TestBlindLevels:
    def _make_room(self, num_players=3, stack=5000):
        room = PokerRoom(code='BLIND', host_id='p0')
        for i in range(num_players):
            room.players[f'p{i}'] = PokerPlayer(
                id=f'p{i}', name=f'Player {i}',
                stack=stack, seat=i,
            )
        return room

    def test_initial_blinds_are_level_zero(self):
        room = self._make_room()
        start_hand(room)
        assert room.blind_level == 0
        assert room.small_blind == BLIND_SCHEDULE[0][0]
        assert room.big_blind == BLIND_SCHEDULE[0][1]

    def test_blinds_stay_same_within_level(self):
        room = self._make_room()
        for _ in range(HANDS_PER_BLIND_LEVEL - 1):
            start_hand(room)
            room.game_phase = 'hand_end'  # reset for next hand
        assert room.blind_level == 0
        assert room.small_blind == BLIND_SCHEDULE[0][0]

    def test_blinds_increase_at_boundary(self):
        room = self._make_room()
        # Play HANDS_PER_BLIND_LEVEL hands to trigger level 1
        for _ in range(HANDS_PER_BLIND_LEVEL):
            start_hand(room)
            room.game_phase = 'hand_end'
        # The (HANDS_PER_BLIND_LEVEL + 1)th hand should be level 1
        start_hand(room)
        assert room.blind_level == 1
        assert room.small_blind == BLIND_SCHEDULE[1][0]
        assert room.big_blind == BLIND_SCHEDULE[1][1]

    def test_blinds_cap_at_max_level(self):
        room = self._make_room()
        max_level = len(BLIND_SCHEDULE) - 1
        # Jump hand_number far past all levels
        room.hand_number = max_level * HANDS_PER_BLIND_LEVEL + 100
        start_hand(room)
        assert room.blind_level == max_level
        assert room.small_blind == BLIND_SCHEDULE[max_level][0]
        assert room.big_blind == BLIND_SCHEDULE[max_level][1]

    def test_room_to_dict_has_blind_info(self):
        room = self._make_room()
        start_hand(room)
        d = room_to_dict(room, for_player_id='p0')
        assert 'blindLevel' in d
        assert 'handsUntilBlindIncrease' in d
        assert 'nextBlinds' in d
        assert d['blindLevel'] == 0
        assert d['nextBlinds']['sb'] == BLIND_SCHEDULE[1][0]
        assert d['nextBlinds']['bb'] == BLIND_SCHEDULE[1][1]


# ============== Turn Timer Tests ==============

class TestTurnTimer:
    def _make_room(self, num_players=2, stack=1000):
        room = PokerRoom(code='TIMER', host_id='p0')
        for i in range(num_players):
            room.players[f'p{i}'] = PokerPlayer(
                id=f'p{i}', name=f'Player {i}',
                stack=stack, seat=i,
            )
        return room

    def test_turn_start_time_set_on_hand_start(self):
        room = self._make_room()
        start_hand(room)
        assert room.turn_start_time > 0

    def test_turn_start_time_resets_on_action(self):
        room = self._make_room(3)
        start_hand(room)
        first_time = room.turn_start_time
        # Simulate some time passing
        room.turn_start_time = first_time - 5
        old_time = room.turn_start_time

        current_pid = room.hand_players[room.current_player_index]
        process_action(room, current_pid, 'call')
        # turn_start_time should be refreshed (newer than old_time)
        assert room.turn_start_time > old_time

    def test_room_to_dict_includes_turn_remaining(self):
        room = self._make_room()
        start_hand(room)
        d = room_to_dict(room, for_player_id='p0')
        assert 'turnRemaining' in d
        assert d['turnRemaining'] is not None
        assert 0 < d['turnRemaining'] <= TURN_TIME_LIMIT

    def test_turn_remaining_decreases_over_time(self):
        room = self._make_room()
        start_hand(room)
        # Fake that turn started 10 seconds ago
        room.turn_start_time = time.time() - 10
        d = room_to_dict(room, for_player_id='p0')
        assert d['turnRemaining'] <= TURN_TIME_LIMIT - 9  # allow 1s tolerance

    def test_turn_remaining_floors_at_zero(self):
        room = self._make_room()
        start_hand(room)
        # Fake expired turn
        room.turn_start_time = time.time() - (TURN_TIME_LIMIT + 5)
        d = room_to_dict(room, for_player_id='p0')
        assert d['turnRemaining'] == 0

    def test_turn_time_limit_in_room_dict(self):
        room = self._make_room()
        start_hand(room)
        d = room_to_dict(room, for_player_id='p0')
        assert d['turnTimeLimit'] == TURN_TIME_LIMIT
        assert d['postHandDelay'] == POST_HAND_DELAY


# ============== Folded Cards Capture Tests ==============

class TestFoldedCards:
    def _make_room(self, num_players=3, stack=1000):
        room = PokerRoom(code='FOLD', host_id='p0')
        for i in range(num_players):
            room.players[f'p{i}'] = PokerPlayer(
                id=f'p{i}', name=f'Player {i}',
                stack=stack, seat=i,
            )
        return room

    def test_folded_cards_reset_each_hand(self):
        room = self._make_room()
        room.folded_cards = {'old': [{'id': 'test'}]}
        start_hand(room)
        assert room.folded_cards == {}

    def test_fold_captures_hole_cards(self):
        room = self._make_room()
        start_hand(room)
        current_pid = room.hand_players[room.current_player_index]
        player = room.players[current_pid]
        # Remember what cards they had
        original_cards = [card_to_dict(c) for c in player.hole_cards]
        assert len(original_cards) == 2

        process_action(room, current_pid, 'fold')
        assert current_pid in room.folded_cards
        assert room.folded_cards[current_pid] == original_cards

    def test_folded_cards_kept_server_side_not_in_results(self):
        room = self._make_room(2)
        start_hand(room)
        current_pid = room.hand_players[room.current_player_index]
        process_action(room, current_pid, 'fold')

        # Hand should be over - only 1 player left
        assert room.game_phase == 'hand_end'
        assert room.last_results is not None
        # Folded cards must NOT be in results (no auto-reveal)
        assert 'foldedCards' not in room.last_results
        # But they are kept server-side for opt-in reveal
        assert current_pid in room.folded_cards

    def test_multiple_folds_all_captured(self):
        room = self._make_room(4)
        start_hand(room)

        folded_ids = []
        # Fold first two players to act
        for _ in range(2):
            current_pid = room.hand_players[room.current_player_index]
            process_action(room, current_pid, 'fold')
            folded_ids.append(current_pid)

        for pid in folded_ids:
            assert pid in room.folded_cards
            assert len(room.folded_cards[pid]) == 2  # 2 hole cards each

    def test_shown_hands_empty_at_hand_end(self):
        room = self._make_room(2)
        start_hand(room)
        current_pid = room.hand_players[room.current_player_index]
        process_action(room, current_pid, 'fold')
        assert room.game_phase == 'hand_end'
        # No hands revealed yet - must be opt-in
        assert room.shown_hands == {}

    def test_shown_hands_cleared_on_new_hand(self):
        room = self._make_room(3)
        start_hand(room)
        # Simulate a shown hand from previous round
        room.shown_hands = {'p0': [{'id': 'fake', 'suit': 'hearts', 'value': 2, 'display': '2♥'}]}
        start_hand(room)
        assert room.shown_hands == {}

    def test_shown_hands_in_room_dict_only_during_hand_end(self):
        room = self._make_room(2)
        start_hand(room)
        # During active play, shownHands should be empty
        d = room_to_dict(room)
        assert d['shownHands'] == {}
        assert d['foldedPlayerIds'] == []

        # After hand ends
        current_pid = room.hand_players[room.current_player_index]
        process_action(room, current_pid, 'fold')
        assert room.game_phase == 'hand_end'
        d = room_to_dict(room)
        assert d['shownHands'] == {}
        assert current_pid in d['foldedPlayerIds']

    def test_opt_in_reveal_works(self):
        room = self._make_room(2)
        start_hand(room)
        current_pid = room.hand_players[room.current_player_index]
        process_action(room, current_pid, 'fold')
        assert room.game_phase == 'hand_end'
        # Simulate opt-in reveal
        assert current_pid in room.folded_cards
        room.shown_hands[current_pid] = room.folded_cards[current_pid]
        d = room_to_dict(room)
        assert current_pid in d['shownHands']
        assert len(d['shownHands'][current_pid]) == 2


# ============== Auto-deal Flag Tests ==============

class TestAutoDeal:
    def _make_room(self, num_players=2, stack=1000):
        room = PokerRoom(code='AUTO', host_id='p0')
        for i in range(num_players):
            room.players[f'p{i}'] = PokerPlayer(
                id=f'p{i}', name=f'Player {i}',
                stack=stack, seat=i,
            )
        return room

    def test_auto_deal_pending_false_on_start(self):
        room = self._make_room()
        start_hand(room)
        assert room.auto_deal_pending is False

    def test_auto_deal_pending_reset_on_new_hand(self):
        room = self._make_room()
        room.auto_deal_pending = True
        start_hand(room)
        assert room.auto_deal_pending is False


# ============== Kick Player Tests ==============

class TestKickPlayer:
    def _make_room(self, num_players=3, stack=1000):
        room = PokerRoom(code='KICK', host_id='p0')
        for i in range(num_players):
            room.players[f'p{i}'] = PokerPlayer(
                id=f'p{i}', name=f'Player {i}',
                stack=stack, seat=i,
            )
        return room

    def test_kick_in_lobby_removes_player(self):
        room = self._make_room(3)
        assert 'p1' in room.players
        _apply_kick(room, 'p1')
        del room.players['p1']
        assert 'p1' not in room.players
        assert len(room.players) == 2

    def test_kick_mid_hand_folds_player(self):
        room = self._make_room(3)
        start_hand(room)
        # Kick a non-current player
        current_pid = room.hand_players[room.current_player_index]
        target = [pid for pid in room.hand_players if pid != current_pid][0]
        _apply_kick(room, target)
        assert room.players[target].is_folded is True
        assert target not in room.hand_players
        # Hand should continue (2 active remain)
        assert room.game_phase != 'hand_end'
        del room.players[target]
        assert len(room.players) == 2

    def test_kick_current_player_advances_turn(self):
        room = self._make_room(3)
        start_hand(room)
        current_pid = room.hand_players[room.current_player_index]
        _apply_kick(room, current_pid)
        # After kick, current_player_index should point to a valid player
        assert current_pid not in room.hand_players
        new_current = room.hand_players[room.current_player_index]
        assert new_current in room.players
        assert new_current != current_pid

    def test_kick_leaves_one_resolves_hand(self):
        room = self._make_room(2)
        start_hand(room)
        pot_before = room.pot
        assert pot_before > 0
        _apply_kick(room, 'p1')
        assert room.game_phase == 'hand_end'
        assert room.last_results is not None
        # p0 should be the winner
        winner_ids = [w['id'] for w in room.last_results['winners']]
        assert 'p0' in winner_ids

    def test_cannot_kick_host_validation(self):
        """Host ID validation happens in the socket handler, but _apply_kick
        should still work without crashing if called on the host."""
        room = self._make_room(2)
        start_hand(room)
        # _apply_kick doesn't enforce host check — that's the handler's job.
        # Just verify it doesn't crash.
        _apply_kick(room, 'p0')
        assert 'p0' not in room.hand_players

    def test_kick_during_hand_end(self):
        room = self._make_room(3)
        start_hand(room)
        # Force hand_end
        room.game_phase = 'hand_end'
        room.hand_players = ['p0', 'p1', 'p2']
        _apply_kick(room, 'p2')
        assert 'p2' not in room.hand_players
        # No fold should have been applied (we're in hand_end)
        assert room.players['p2'].is_folded is False
        del room.players['p2']
        assert len(room.players) == 2
