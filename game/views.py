import json
from django.http import JsonResponse
from django.shortcuts import render, redirect
from django.views.decorators.http import require_POST, require_GET

from game.models import Hero
from game.services import compare_hero
from game.session import GameSession


# ========================= Views =========================

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
    except (json.JSONDecodeError, AttributeError):
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

    hints = session.get_hints(target_hero)

    return JsonResponse({
        'result':        comparison_result,
        'attempt_count': session.attempt_count,
        'hints':         hints,
        'won':           session.won,
        'revealed_name': target_hero.name if session.won else None,
    })

def reset_game(request):
    GameSession(request).reset()
    return redirect('game:index')
