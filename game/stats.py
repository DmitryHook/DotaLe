import json
from datetime import datetime
from pathlib import Path

from django.conf import settings


def build_stats(session, target_hero) -> dict:
    now = datetime.now()
    return {
        'result': 'victory',
        'date': now.isoformat(timespec='seconds'),
        'hero': target_hero.name if target_hero else None,
        'attempts': session.attempt_count,
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

    save_dir = Path(settings.BASE_DIR) / 'game_stats' / date_folder
    save_dir.mkdir(parents=True, exist_ok=True)

    file_path = save_dir / file_name

    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=4)

    return file_path
