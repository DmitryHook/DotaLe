from game.models import Hero


# =============== Game ===============

TOTAL_HEROES = Hero.objects.count()

def game_settings(request):
    return {
        "GAME_SETTINGS": {
            "TOTAL_HEROES": TOTAL_HEROES,
        }
    }

# =============== Challenge Mode ===============

HP_MAX_HP = 100
HP_INITIAL_HP = 100
MAX_LEVELS = 5

# HP per action (base for lvl 1; negative = HP loss)
HP_BASE_HP = {
    "hp_for_level": 25,
    "guess_input": -2,
    "wrong": -1,
    "partial": 1,
    "correct_fld": 3,
    "hint_quote": -5,
    "hint_ability": -10,
    "hint_screen": -15,
}

# Score (base for lvl 1)
HP_BASE_SCORE = {
    "level_clear": 100,
    "unused_hero": 2,
    "hint_quote_unused": 10,
    "hint_abil_unused": 20,
    "hint_scrn_unused": 30,
    "cell_correct": 2,
    "cell_partial": 1,
    "cell_wrong": -1,
}

# Level scaling multipliers
HP_SCALE_HP_NEG = 1.2
HP_SCALE_HP_POS = 1.05
HP_SCALE_SCORE = 1.1

def hp_mode_settings(request):
    return {
        "HP_SETTINGS": {
            "MAX_HP": HP_MAX_HP,
            "INITIAL_HP": HP_INITIAL_HP,
            "MAX_LEVELS": MAX_LEVELS,
            "SCALE_HP_NEG": HP_SCALE_HP_NEG,
            "SCALE_HP_POS": HP_SCALE_HP_POS,
            "SCALE_SCORE": HP_SCALE_SCORE,
            "BASE_HP": {
                "HP_FOR_LEVEL": HP_BASE_HP["hp_for_level"],
                "GUESS_INPUT": HP_BASE_HP["guess_input"],
                "WRONG": HP_BASE_HP["wrong"],
                "PARTIAL": HP_BASE_HP["partial"],
                "CORRECT_FLD": HP_BASE_HP["correct_fld"],
                "HINT_QUOTE": HP_BASE_HP["hint_quote"],
                "HINT_ABILITY": HP_BASE_HP["hint_ability"],
                "HINT_SCREEN": HP_BASE_HP["hint_screen"],
            },
            "BASE_SCORE": {
                "LEVEL_CLEAR": HP_BASE_SCORE["level_clear"],
                "UNUSED_HERO": HP_BASE_SCORE["unused_hero"],
                "HINT_QUOTE_UNUSED": HP_BASE_SCORE["hint_quote_unused"],
                "HINT_ABIL_UNUSED": HP_BASE_SCORE["hint_abil_unused"],
                "HINT_SCRN_UNUSED": HP_BASE_SCORE["hint_scrn_unused"],
                "CELL_CORRECT": HP_BASE_SCORE["cell_correct"],
                "CELL_PARTIAL": HP_BASE_SCORE["cell_partial"],
                "CELL_WRONG": HP_BASE_SCORE["cell_wrong"],
            },
        }
    }
