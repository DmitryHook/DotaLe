import random

from game.models import Hero
from game.services import build_hints


# ========================= GameSession =========================

class GameSession:

    SESSION_KEY = 'game'

    def __init__(self, request):
        self._request = request
        self._data: dict = request.session.get(self.SESSION_KEY, {})

    # ========================= Persistence =========================

    def save(self) -> None:
        self._request.session[self.SESSION_KEY] = self._data
        self._request.session.modified = True

    def reset(self) -> None:
        self._data = {}
        self.save()

    # ========================= Target Hero =========================

    def get_target(self) -> Hero | None:
        target_id = self._data.get('target_id')
        if target_id:
            try:
                return Hero.objects.get(id=target_id)
            except Hero.DoesNotExist:
                pass

        target_hero = self._pick_random_hero()
        if target_hero:
            self._data['target_id'] = target_hero.id
            self._generate_hint_params()
            self.save()
        return target_hero

    @staticmethod
    def _pick_random_hero() -> Hero | None:
        return Hero.objects.order_by('?').first()

    # ========================= Guesses =========================

    @property
    def guesses(self) -> list[dict]:
        return self._data.get('guesses', [])

    @property
    def attempt_count(self) -> int:
        return len(self.guesses)

    @property
    def won(self) -> bool:
        return self._data.get('won', False)

    def add_guess(self, comparison_result: dict) -> None:
        all_guesses = self.guesses
        all_guesses.append(comparison_result)
        self._data['guesses'] = all_guesses

        if comparison_result['correct']:
            self._data['won'] = True
        self.save()

    # ========================= Hints =========================

    PUZZLE_GRIDS = [
        (  2,   1),
        (  2,   2),
        (  4,   2),
        (  4,   4),
        (  8,   4),
        (  8,   8),
        ( 16,   8),
        ( 16,  16),
    ]

    def _generate_hint_params(self) -> None:
        """Generates parameters for all grid sizes on startup. Each size gets a fixed shuffle
        that remains unchanged when switching between them."""
        existing = self._data.get('hint_params', {})
        rotation = existing.get('ability_rotation') or random.choice([90, 180, 270])

        grids = {}
        for cols, rows in self.PUZZLE_GRIDS:
            key = f'{cols}x{rows}'
            if key in existing.get('grids', {}):
                grids[key] = existing['grids'][key]
            else:
                tile_order = list(range(cols * rows))
                random.shuffle(tile_order)
                grids[key] = tile_order

        self._data['hint_params'] = {
            'ability_rotation': rotation,
            'grids':            grids,
        }

    def get_hint_params(self) -> dict:
        """Returns all effect params. Generates fallback if session is null."""
        if 'hint_params' not in self._data:
            self._generate_hint_params()
            self.save()
        return self._data['hint_params']

    def get_hints(self, target_hero: Hero) -> dict:
        hints, updates = build_hints(self.attempt_count, target_hero, self._data)
        if updates:
            self._data.update(updates)
            self.save()
        return hints

    # ========================= Helpers =========================

    def already_guessed_names(self) -> list[str]:
        return [guess['name'] for guess in self.guesses]
    