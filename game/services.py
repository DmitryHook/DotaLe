import random
from game.models import Hero


# ========================= Field Config =========================

MULTIVALUE_FIELDS = {'species', 'position'}

FIELD_ORDER = ['gender', 'species', 'position', 'attribute', 'attack_type', 'complexity', 'date']

# ========================= Comparison =========================

def _compare_field(field_name: str, guess_hero: Hero, target_hero: Hero) -> dict:
    guess_value  = getattr(guess_hero,  field_name)
    target_value = getattr(target_hero, field_name)

    if field_name in MULTIVALUE_FIELDS:
        guess_set = set(guess_value) if isinstance(guess_value, (list, set)) else {guess_value}
        target_set = set(target_value) if isinstance(target_value, (list, set)) else {target_value}

        if guess_set == target_set:
            status = 'correct'
        elif guess_set & target_set:
            status = 'partial'
        else:
            status = 'wrong'

        display_value = ', '.join(guess_value) if isinstance(guess_value, list) else guess_value
        return {'value': display_value, 'status': status}

    return {
        'value':  guess_value,
        'status': 'correct' if guess_value == target_value else 'wrong',
    }

def compare_hero(guess_hero: Hero, target_hero: Hero) -> dict:
    """Compares the guessed hero to the target hero."""

    return {
        'name':    guess_hero.name,
        'image':   guess_hero.image.url if guess_hero.image else None,
        'correct': guess_hero.id == target_hero.id,
        'fields':  {
            field: _compare_field(field, guess_hero, target_hero)
            for field in FIELD_ORDER
        },
    }

# ========================= Hints Builder =========================

def _get_stable_hint_item(items: list, session_key: str, session_data: dict):
    """Returns a list item consistently linked to the session by ID."""
    if not items:
        return None, {}

    saved_id = session_data.get(session_key)
    selected_item = next((item for item in items if item.id == saved_id), None)
    if selected_item is None:
        selected_item = random.choice(items)
    return selected_item, {session_key: selected_item.id}

def build_hints(attempt_count: int, target_hero: Hero, session_data: dict) -> tuple[dict, dict]:
    hints: dict = {}
    session_updates: dict = {}

    if attempt_count >= 4:
        voiceline, updates = _get_stable_hint_item(
            list(target_hero.voiceline_set.all()),
            'hint_voice_id', 
            session_data
        )
        session_updates.update(updates)
        if voiceline:
            try:
                audio_url = voiceline.mp3_file.url if voiceline.mp3_file else None
            except Exception:
                audio_url = None
            hints['quote'] = {'text': voiceline.text, 'mp3': audio_url}

    if attempt_count >= 8:
        ability, updates = _get_stable_hint_item(
            list(target_hero.ability_set.all()),
            'hint_ability_id', 
            session_data
        )
        session_updates.update(updates)
        if ability:
            try:
                icon_url = ability.png_file.url if ability.png_file else None
            except Exception:
                icon_url = None
            hints['ability'] = {'name': ability.text, 'icon': icon_url}

    if attempt_count >= 12:
        loading_screen, updates = _get_stable_hint_item(
            list(target_hero.loadscreen_set.all()),
            'hint_screen_id', 
            session_data
        )
        session_updates.update(updates)
        if loading_screen:
            try:
                image_url = loading_screen.load_screen.url if loading_screen.load_screen else None
            except Exception:
                image_url = None
            hints['loading_screen'] = {'image': image_url}

    return hints, session_updates
