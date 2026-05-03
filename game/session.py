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

    def get_hints(self, target_hero: Hero) -> dict:
        hints, updates = build_hints(self.attempt_count, target_hero, self._data)
        if updates:
            self._data.update(updates)
            self.save()
        return hints

    # ========================= Helpers =========================

    def already_guessed_names(self) -> list[str]:
        return [guess['name'] for guess in self.guesses]
