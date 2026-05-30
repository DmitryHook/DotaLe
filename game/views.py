import json
from pathlib import Path
from datetime import datetime, timezone as dt_timezone
from zoneinfo import ZoneInfo
from django.http import JsonResponse
from django.shortcuts import render, redirect
from django.views.decorators.http import require_POST, require_GET
from django.conf import settings

from game.models import Hero
from game.services import compare_hero
from game.session import GameSession
from game.stats import build_stats, save_stats, append_to_hp_session
import game.settings


# =============== Index ===============

def index(request):
    session = GameSession(request)
    target_hero = session.get_target()
    hints = session.get_hints(target_hero) if target_hero else {}
    return render(request, 'game/index.html', {
        'guesses': list(reversed(session.guesses)),
        'won': session.won,
        'attempt_count': session.attempt_count,
        'hints': hints,
        'revealed_name': target_hero.name if (session.won and target_hero) else None,
        'hint_params': session.get_hint_params(),
    })

@require_GET
def search_heroes(request):
    search_query = request.GET.get('q', '').strip()
    if not search_query:
        return JsonResponse({'results': []})

    session = GameSession(request)
    heroes = Hero.objects.filter(name__istartswith=search_query).exclude(
        name__in=session.already_guessed_names()
    )

    results = []
    for hero in heroes:
        try:
            image = hero.image.url if hero.image else None
        except Exception:
            image = None
        results.append({'id': hero.id, 'name': hero.name, 'image': image})

    return JsonResponse({'results': results})

@require_POST
def make_guess(request):
    try:
        data = json.loads(request.body)
        hero_name = data.get('hero_name', '').strip()
    except Exception:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    if not hero_name:
        return JsonResponse({'error': 'Hero name is required'}, status=400)

    session = GameSession(request)

    if session.won:
        return JsonResponse({'error': 'Game is already finished'}, status=400)

    try:
        guess_hero = Hero.objects.get(name=hero_name)
    except Hero.DoesNotExist:
        return JsonResponse({'error': 'Hero not found'}, status=404)

    target_hero = session.get_target()
    if not target_hero:
        return JsonResponse({'error': 'Heroes not loaded'}, status=500)

    comparison_result = compare_hero(guess_hero, target_hero)
    session.add_guess(comparison_result)

    if comparison_result['correct']:
        hp_active = data.get('hp_mode_active', False)
        if not hp_active:
            save_stats(build_stats(session, target_hero))

    hints = session.get_hints(target_hero)

    return JsonResponse({
        'result': comparison_result,
        'attempt_count': session.attempt_count,
        'hints': hints,
        'hint_params': session.get_hint_params(),
        'won': session.won,
        'revealed_name': target_hero.name if session.won else None,
    })

# =============== Challenge Mode ===============

def _hp_session_path(session_start_iso: str) -> Path:
    """Convert UTC ISO string from frontend to local time for file path."""
    try:
        tz_name = getattr(settings, 'TIME_ZONE', 'UTC')
        local_tz = ZoneInfo(tz_name)
        iso = session_start_iso.rstrip('Z')
        dt_utc = datetime.fromisoformat(iso).replace(tzinfo=dt_timezone.utc)
        dt = dt_utc.astimezone(local_tz)
    except Exception:
        dt = datetime.now()
    save_dir = Path(settings.BASE_DIR) / 'game_stats' / dt.strftime('%Y-%m-%d')
    return save_dir / (dt.strftime('%H-%M-%S') + '.json')

@require_POST
def hp_save_level(request):
    """Saves completed level to HP file."""
    try:
        data = json.loads(request.body)
        hp_session_start = data.get('hp_session_start')
        hp_level = int(data.get('hp_level', 1))
        hp_score_earned = int(data.get('hp_score_earned', 0))
        hp_total_score = int(data.get('hp_total_score', 0))
    except Exception:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    if not hp_session_start:
        return JsonResponse({'error': 'hp_session_start required'}, status=400)

    session = GameSession(request)
    target_hero: Hero | None = session.get_target()

    MAX_LEVELS = game.settings.MAX_LEVELS

    is_run_complete = (hp_level >= MAX_LEVELS)
    session_result = 'victory' if is_run_complete else 'in_progress'

    hp_extra = {
        'session_result': session_result,
        'total_score': hp_total_score,
        'level_separator': {
            'level': hp_level,
            'hero': target_hero.name if target_hero else None,
            'score': hp_score_earned,
            'result': 'victory',
        } if _hp_session_path(hp_session_start).exists() else None,
    }
    stats = build_stats(session, target_hero, hp_extra=hp_extra)
    file_path = _hp_session_path(hp_session_start)
    append_to_hp_session(stats, file_path)

    # Save the active HP file path to the Django session to delete it upon reset
    if not is_run_complete:
        request.session['hp_active_file'] = str(file_path)
        # Flag: the next /reset/ advances to the next level, it is not a game reset
        request.session['hp_next_level'] = True
    else:
        request.session.pop('hp_active_file', None)
        request.session.pop('hp_next_level', None)
    request.session.modified = True

    return JsonResponse({'ok': True})

@require_POST
def hp_mode_complete(request):
    """Finalizes the HP session as a victory — all levels have been completed."""
    try:
        body = json.loads(request.body)
        hp_session_start = body.get('hp_session_start')
        hp_total_score = int(body.get('hp_total_score', 0))
    except Exception:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    if not hp_session_start:
        return JsonResponse({'error': 'hp_session_start required'}, status=400)

    file_path = _hp_session_path(hp_session_start)
    if file_path.exists():
        try:
            data = json.loads(file_path.read_text(encoding='utf-8'))
        except Exception:
            data = {}
        data['result'] = 'victory'
        data['total_score'] = hp_total_score
        data['finished'] = datetime.now().isoformat(timespec='seconds')
        file_path.write_text(json.dumps(data, ensure_ascii=False, indent=4), encoding='utf-8')

    request.session.pop('hp_active_file', None)
    request.session.modified = True
    return JsonResponse({'ok': True})


@require_POST
def hp_mode_defeat(request):
    """Finalizes the HP session upon defeat — appends guesses as a defeat."""
    try:
        body = json.loads(request.body)
        hp_session_start = body.get('hp_session_start')
        hp_total_score = int(body.get('hp_total_score', 0))
        hp_level = int(body.get('hp_level', 1))
    except Exception:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    if not hp_session_start:
        return JsonResponse({'error': 'hp_session_start required'}, status=400)

    session = GameSession(request)
    target_hero = session.get_target()

    hp_extra = {
        'session_result': 'defeat',
        'total_score': hp_total_score,
        'level_separator': {
            'level': hp_level,
            'hero': target_hero.name if target_hero else None,
            'score': 0,
            'result': 'defeat',
        } if _hp_session_path(hp_session_start).exists() else None,
    }
    stats = build_stats(session, target_hero=target_hero, hp_extra=hp_extra)
    append_to_hp_session(stats, _hp_session_path(hp_session_start))
    request.session.pop('hp_active_file', None)
    request.session.modified = True
    return JsonResponse({'ok': True})

@require_POST
def hp_cancel(request):
    """Deletes the in_progress HP file when the game is reset."""
    try:
        body = json.loads(request.body)
        hp_session_start = body.get('hp_session_start')
    except Exception:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    if not hp_session_start:
        return JsonResponse({'ok': True})

    file_path: Path = _hp_session_path(hp_session_start)
    if file_path.exists():
        try:
            data = json.loads(file_path.read_text(encoding='utf-8'))
            if data.get('result') in ('in_progress', None):
                file_path.unlink()
        except Exception:
            pass

    return JsonResponse({'ok': True})

# =============== Reset ===============

def reset_game(request):
    is_hard_reset = request.GET.get('hp_reset') == '1'
    is_next_level = request.GET.get('hp_nl') == '1' or (
                        not is_hard_reset and request.session.get('hp_next_level', False))

    # Transitioning to the next level — leave the file untouched
    if is_next_level and not is_hard_reset:
        request.session.pop('hp_next_level', None)
        request.session.modified = True
        GameSession(request).reset()
        return redirect('game:index')

    # Actual reset — clear both flags and delete the in_progress file
    request.session.pop('hp_next_level', None)

    # Приоритет: hp_active_file из сессии
    hp_file_str = request.session.pop('hp_active_file', None)

    # Fallback: sessionStart из query string
    if not hp_file_str:
        hp_session_start = request.GET.get('hp_ss')
        if hp_session_start:
            try:
                hp_file_str = str(_hp_session_path(hp_session_start))
            except Exception:
                pass

    if hp_file_str:
        try:
            hp_file = Path(hp_file_str)
            if hp_file.exists():
                data = json.loads(hp_file.read_text(encoding='utf-8'))
                if data.get('result') == 'in_progress':
                    hp_file.unlink()
        except Exception:
            pass
    request.session.modified = True

    GameSession(request).reset()
    return redirect('game:index')

# =============== About ===============

def about(request):
    return render(request, 'game/about.html')

# =============== Encyclopedia ===============

@require_GET
def encyclopedia_heroes(request):
    heroes = Hero.objects.all().order_by('name')
    results = []
    for hero in heroes:
        try:
            image = hero.image.url if hero.image else None
        except Exception:
            image = None
        results.append({
            'id': hero.id,
            'name': hero.name,
            'image': image,
            'gender': hero.gender,
            'species': hero.species,
            'position': hero.position,
            'attribute': hero.attribute,
            'attack_type': hero.attack_type,
            'complexity': hero.complexity,
            'date': hero.date,
        })
    return JsonResponse({'heroes': results})