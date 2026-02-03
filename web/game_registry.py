"""
Central Game Registry
=====================
To add a new game:
  1. Add an entry to GAMES below.
  2. Create the game's server module (e.g. web/blackjack/).
  3. Create the game's client JS (e.g. web/static/js/blackjack.js).
  4. Register the game's socket events in app.py.

The game picker UI and room system read from this registry automatically.
No hardcoded if/else per game in the hub layer.
"""

GAMES = {
    'tycoon': {
        'id': 'tycoon',
        'display_name': 'Tycoon',
        'subtitle': 'Take Your Heart',
        'description': 'A 4-player climbing card game. Race to empty your hand and climb the social ranks!',
        'icon': 'T',
        'max_players': 4,
        'min_players': 2,
        'supports_rooms': True,
        'supports_bots': True,
        'fills_with_bots': True,
        'supports_bankroll': False,
        'buy_in_rules': None,
        'color': '#ff0a0a',
        'entry_route': '/tycoon',
    },
    'poker': {
        'id': 'poker',
        'display_name': 'Poker',
        'subtitle': 'Texas Hold\'em',
        'description': 'No-limit Texas Hold\'em for 2-8 players. Weekly bankroll system included.',
        'icon': 'P',
        'max_players': 8,
        'min_players': 2,
        'supports_rooms': True,
        'supports_bots': True,
        'fills_with_bots': False,
        'supports_bankroll': True,
        'buy_in_rules': {
            'weekly_allowance': 3000,
            'buy_in_amount': 1000,
        },
        'color': '#1a8f3f',
        'entry_route': '/poker',
    },
}


def get_game(game_id: str) -> dict:
    """Get game config by ID. Returns None if not found."""
    return GAMES.get(game_id)


def get_max_players(game_id: str) -> int:
    """Get max players for a game type."""
    game = GAMES.get(game_id)
    return game['max_players'] if game else 4


def list_games() -> list:
    """Return all games as a list for the game picker UI."""
    return list(GAMES.values())
