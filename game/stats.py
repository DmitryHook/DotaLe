import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from django.conf import settings


# =============== Stats helpers ===============

def _localtime() -> datetime:
    """Returns current time in the project's local timezone (from settings.TIME_ZONE)."""
    tz_name = getattr(settings, 'TIME_ZONE', 'UTC')
    try:
        return datetime.now(ZoneInfo(tz_name))
    except Exception:
        return datetime.now()

def _stats_dir() -> Path:
    return Path(settings.BASE_DIR) / 'game_stats'

# =============== Game Logic ===============

def build_stats(session, target_hero, hp_extra: dict = None) -> dict:
    now = _localtime()
    return {
        'result': 'victory' if (hp_extra is None) else hp_extra.get('session_result', 'victory'),
        'date': now.isoformat(timespec='seconds'),
        'hero': target_hero.name if target_hero else None,
        'attempts': session.attempt_count,
        **(({'total_score': hp_extra['total_score']}) if hp_extra else {}),
        **(({'level_separator': hp_extra['level_separator']}) if hp_extra and hp_extra.get('level_separator') else {}),
        'guesses': [
            {
                'name': guess['name'],
                'correct': guess['correct'],
                'fields': {
                    field: {'value': data['value'], 'status': data['status']}
                    for field, data in guess.get('fields', {}).items()
                },
            }
            for guess in session.guesses
        ],
    }

def save_stats(stats: dict) -> Path:
    now = datetime.fromisoformat(stats['date'])
    date_folder = now.strftime('%Y-%m-%d')
    file_name = now.strftime('%H-%M-%S') + '.json'
    save_dir = _stats_dir() / date_folder
    save_dir.mkdir(parents=True, exist_ok=True)
    file_path = save_dir / file_name
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=4)
    return file_path

def append_to_hp_session(stats: dict, session_path: Path) -> Path:
    if session_path.exists():
        try:
            existing = json.loads(session_path.read_text(encoding='utf-8'))
        except Exception:
            existing = None
    else:
        existing = None

    if existing is None:
        data = {
            'result': stats.get('result', 'in_progress'),
            'date': stats.get('date'),
            'hero': stats.get('hero'),
            'attempts': stats.get('attempts'),
            'total_score': stats.get('total_score', 0),
            'guesses': list(stats['guesses']),
        }
    else:
        data = existing
        sep = stats.get('level_separator')
        if sep:
            data['guesses'].append({'__level_separator__': True, **sep})
        data['guesses'].extend(stats['guesses'])
        data['result'] = stats.get('result', data.get('result'))
        data['hero'] = stats.get('hero')
        data['attempts'] = stats.get('attempts')
        data['total_score'] = stats.get('total_score', data.get('total_score', 0))

    session_path.parent.mkdir(parents=True, exist_ok=True)
    with open(session_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    return session_path
