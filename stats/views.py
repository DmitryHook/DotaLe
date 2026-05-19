from pathlib import Path
import json

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET

from game.models import Hero


# =============== Stats helpers ===============

def _stats_dir() -> Path:
    return Path(settings.BASE_DIR) / 'game_stats'

def _parse_game_file(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return None

# =============== Stats views ===============

def stats(request):
    return render(request, 'stats/stats.html')

@require_GET
def stats_dates(request):
    stats_dir = _stats_dir()
    if not stats_dir.exists():
        return JsonResponse({'dates': []})
    dates = sorted(
        [d.name for d in stats_dir.iterdir()
         if d.is_dir() and not d.name.startswith('.')],
        reverse=True,
    )
    return JsonResponse({'dates': dates})

@require_GET
def stats_games(request, date):
    date_dir = _stats_dir() / date
    if not date_dir.exists():
        return JsonResponse({'error': 'Date not found'}, status=404)
    games = []
    for f in sorted(date_dir.glob('*.json'), reverse=True):
        data = _parse_game_file(f)
        if data is None:
            continue
        games.append({
            'filename': f.name,
            'time': f.stem.replace('-', ':'),
            'hero': data.get('hero'),
            'result': data.get('result'),
            'attempts': data.get('attempts'),
        })
    return JsonResponse({'date': date, 'games': games})

@require_GET
def stats_game(request, date, filename):
    if not filename.endswith('.json'):
        filename += '.json'
    game_file = _stats_dir() / date / filename
    if not game_file.exists():
        return JsonResponse({'error': 'File not found'}, status=404)
    data = _parse_game_file(game_file)
    if data is None:
        return JsonResponse({'error': 'File read error'}, status=500)
    names = [g['name'] for g in data.get('guesses', []) if g.get('name')]
    heroes_qs = Hero.objects.filter(name__in=names).only('name', 'image')
    image_map = {}
    for hero in heroes_qs:
        try:
            image_map[hero.name] = hero.image.url if hero.image else None
        except Exception:
            image_map[hero.name] = None
    for guess in data.get('guesses', []):
        guess['image'] = image_map.get(guess.get('name'))
    return JsonResponse(data)