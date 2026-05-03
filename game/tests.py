import json

from django.test import TestCase, Client
from django.urls import reverse

from game.models import Hero, VoiceLine, Ability, LoadScreen
from game.services import compare_hero, build_hints, _compare_field
from game.session import GameSession


# ========================= Helpers =========================


def make_hero(**kwargs) -> Hero:
    """Creates a test hero with sensible defaults."""
    defaults = {
        "name": "Test Hero",
        "gender": "Male",
        "species": ["Human"],
        "position": ["Carry"],
        "attribute": "Strength",
        "attack_type": "Melee",
        "complexity": "Simple",
        "date": 2013,
    }
    defaults.update(kwargs)
    return Hero.objects.create(**defaults)


# ========================= Model Tests =========================


class HeroModelTest(TestCase):

    def test_string_representation(self):
        hero_instance = make_hero(name="Axe")
        self.assertEqual(str(hero_instance), "Axe")

    def test_unique_hero_name_constraint(self):
        make_hero(name="Axe")
        from django.db import IntegrityError

        with self.assertRaises(IntegrityError):
            make_hero(name="Axe")

    def test_default_ordering_by_name(self):
        make_hero(name="Zeus")
        make_hero(name="Axe")
        make_hero(name="Lina")
        hero_names_list = list(Hero.objects.values_list("name", flat=True))
        self.assertEqual(hero_names_list, ["Axe", "Lina", "Zeus"])


class VoiceLineModelTest(TestCase):

    def setUp(self):
        self.test_hero = make_hero(name="Axe")

    def test_create_voiceline_instance(self):
        voice_line_instance = VoiceLine.objects.create(
            hero=self.test_hero, text="I am Axe!"
        )
        self.assertEqual(voice_line_instance.hero, self.test_hero)
        self.assertEqual(voice_line_instance.text, "I am Axe!")

    def test_cascade_deletion_on_hero_delete(self):
        VoiceLine.objects.create(hero=self.test_hero, text="I am Axe!")
        self.test_hero.delete()
        self.assertEqual(VoiceLine.objects.count(), 0)


class AbilityModelTest(TestCase):

    def setUp(self):
        self.test_hero = make_hero(name="Axe")

    def test_create_ability_instance(self):
        ability_instance = Ability.objects.create(
            hero=self.test_hero,
            png_file="abilities/Axe/berserkers_call.png",
            text="Berserker's Call",
        )
        self.assertEqual(str(ability_instance), "Berserker's Call")

    def test_cascade_deletion_on_hero_delete(self):
        Ability.objects.create(
            hero=self.test_hero,
            png_file="abilities/Axe/berserkers_call.png",
            text="Berserker's Call",
        )
        self.test_hero.delete()
        self.assertEqual(Ability.objects.count(), 0)


# ========================= Services Tests =========================


class CompareFieldTest(TestCase):

    def setUp(self):
        self.first_hero = make_hero(
            name="Hero A",
            gender="Male",
            species=["Human", "Demon"],
            position=["Carry", "Mid"],
            attribute="Strength",
            attack_type="Melee",
            complexity="Simple",
            date=2013,
        )
        self.second_hero = make_hero(
            name="Hero B",
            gender="Female",
            species=["Human"],
            position=["Support"],
            attribute="Intelligence",
            attack_type="Ranged",
            complexity="Complex",
            date=2018,
        )

    # ========================= Scalar fields =========================

    def test_correct_match_for_scalar_field(self):
        comparison_result = _compare_field("gender", self.first_hero, self.first_hero)
        self.assertEqual(comparison_result["status"], "correct")
        self.assertEqual(comparison_result["value"], "Male")

    def test_wrong_match_for_scalar_field(self):
        comparison_result = _compare_field("gender", self.first_hero, self.second_hero)
        self.assertEqual(comparison_result["status"], "wrong")

    def test_correct_match_for_date_field(self):
        comparison_result = _compare_field("date", self.first_hero, self.first_hero)
        self.assertEqual(comparison_result["status"], "correct")

    def test_wrong_match_for_date_field(self):
        comparison_result = _compare_field("date", self.first_hero, self.second_hero)
        self.assertEqual(comparison_result["status"], "wrong")

    # ========================= Multivalue fields =========================

    def test_species_comparison_is_correct(self):
        comparison_result = _compare_field("species", self.first_hero, self.first_hero)
        self.assertEqual(comparison_result["status"], "correct")

    def test_species_comparison_is_partial(self):
        comparison_result = _compare_field("species", self.first_hero, self.second_hero)
        self.assertEqual(comparison_result["status"], "partial")

    def test_species_comparison_is_wrong(self):
        third_hero = make_hero(name="Hero C", species=["Beast"])
        comparison_result = _compare_field("species", self.first_hero, third_hero)
        self.assertEqual(comparison_result["status"], "wrong")

    def test_position_comparison_is_partial(self):
        third_hero = make_hero(name="Hero C", position=["Carry", "Support"])
        comparison_result = _compare_field("position", self.first_hero, third_hero)
        self.assertEqual(comparison_result["status"], "partial")

    def test_multivalue_display_uses_joined_string(self):
        comparison_result = _compare_field("species", self.first_hero, self.second_hero)
        self.assertIn("Human", comparison_result["value"])


class CompareHeroTest(TestCase):

    def setUp(self):
        self.target_hero = make_hero(name="Axe", gender="Male", attribute="Strength")
        self.guessed_hero = make_hero(
            name="Lina", gender="Female", attribute="Intelligence"
        )

    def test_perfect_hero_match(self):
        comparison_result = compare_hero(self.target_hero, self.target_hero)
        self.assertTrue(comparison_result["correct"])
        self.assertEqual(comparison_result["name"], "Axe")

    def test_incorrect_hero_match(self):
        comparison_result = compare_hero(self.guessed_hero, self.target_hero)
        self.assertFalse(comparison_result["correct"])

    def test_comparison_result_contains_all_game_fields(self):
        comparison_result = compare_hero(self.guessed_hero, self.target_hero)
        expected_fields_set = {
            "gender",
            "species",
            "position",
            "attribute",
            "attack_type",
            "complexity",
            "date",
        }
        self.assertEqual(set(comparison_result["fields"].keys()), expected_fields_set)

    def test_comparison_result_includes_hero_name_and_image(self):
        comparison_result = compare_hero(self.guessed_hero, self.target_hero)
        self.assertIn("name", comparison_result)
        self.assertIn("image", comparison_result)


# ========================= Hints Tests =========================


class BuildHintsTest(TestCase):

    def setUp(self):
        self.target_hero = make_hero(name="Axe")
        VoiceLine.objects.create(hero=self.target_hero, text="I am Axe!")
        Ability.objects.create(
            hero=self.target_hero,
            png_file="abilities/Axe/berserkers_call.png",
            text="Berserker's Call",
        )
        LoadScreen.objects.create(
            hero=self.target_hero,
            load_screen="loading_screens/Axe/axe_full.webp",
        )

    def test_no_hints_are_available_before_four_attempts(self):
        current_hints, _ = build_hints(0, self.target_hero, {})
        self.assertEqual(current_hints, {})

        current_hints, _ = build_hints(3, self.target_hero, {})
        self.assertEqual(current_hints, {})

    def test_voice_quote_hint_appears_at_four_attempts(self):
        current_hints, session_updates = build_hints(4, self.target_hero, {})
        self.assertIn("quote", current_hints)
        self.assertEqual(current_hints["quote"]["text"], "I am Axe!")
        self.assertIn("hint_voice_id", session_updates)

    def test_ability_hint_appears_at_eight_attempts(self):
        current_hints, _ = build_hints(8, self.target_hero, {})
        self.assertIn("quote", current_hints)
        self.assertIn("ability", current_hints)

    def test_loading_screen_hint_appears_at_twelve_attempts(self):
        current_hints, _ = build_hints(12, self.target_hero, {})
        self.assertIn("quote", current_hints)
        self.assertIn("ability", current_hints)
        self.assertIn("loading_screen", current_hints)

    def test_hint_content_remains_stable_on_repeated_calls(self):
        """Проверяет, что один и тот же элемент подсказки возвращается при повторных вызовах с теми же данными сессии."""
        _, session_updates = build_hints(4, self.target_hero, {})

        first_hints_generation, _ = build_hints(4, self.target_hero, session_updates)
        second_hints_generation, _ = build_hints(4, self.target_hero, session_updates)

        self.assertEqual(
            first_hints_generation["quote"]["text"],
            second_hints_generation["quote"]["text"],
        )

    def test_no_hints_returned_if_hero_has_no_related_objects(self):
        hero_without_assets = make_hero(name="Empty Hero")
        current_hints, _ = build_hints(12, hero_without_assets, {})
        self.assertEqual(current_hints, {})


# ========================= Тесты Представлений (View Tests) =========================


class IndexViewTest(TestCase):

    def setUp(self):
        self.client = Client()
        self.target_hero = make_hero(name="Axe")

    def test_index_page_returns_success_status_code(self):
        http_response = self.client.get(reverse("game:index"))
        self.assertEqual(http_response.status_code, 200)

    def test_index_page_context_contains_all_required_keys(self):
        http_response = self.client.get(reverse("game:index"))
        required_context_keys = ("guesses", "won", "attempt_count", "hints")
        for expected_key in required_context_keys:
            self.assertIn(expected_key, http_response.context)

    def test_new_game_index_starts_with_zero_attempts_and_no_victory(self):
        http_response = self.client.get(reverse("game:index"))
        self.assertEqual(http_response.context["attempt_count"], 0)
        self.assertFalse(http_response.context["won"])


class SearchViewTest(TestCase):

    def setUp(self):
        self.client = Client()
        make_hero(name="Axe")
        make_hero(name="Ancient Apparition")
        make_hero(name="Anti-Mage")

    def test_empty_search_query_returns_empty_results_list(self):
        http_response = self.client.get(reverse("game:search_heroes"))

        self.assertEqual(http_response.status_code, 200)
        response_json_content = http_response.json()
        self.assertEqual(response_json_content["results"], [])

    def test_search_correctly_finds_heroes_by_name_prefix(self):
        http_response = self.client.get(reverse("game:search_heroes"), {"q": "An"})
        response_json_content = http_response.json()

        hero_names_found = [
            result["name"] for result in response_json_content["results"]
        ]

        self.assertIn("Ancient Apparition", hero_names_found)
        self.assertIn("Anti-Mage", hero_names_found)
        self.assertNotIn("Axe", hero_names_found)

    def test_search_functionality_is_case_insensitive(self):
        http_response = self.client.get(reverse("game:search_heroes"), {"q": "ax"})
        response_json_content = http_response.json()

        hero_names_found = [
            result["name"] for result in response_json_content["results"]
        ]
        self.assertIn("Axe", hero_names_found)

    def test_search_results_exclude_already_guessed_heroes(self):
        session_instance = self.client.session
        session_instance["game"] = {"guesses": [{"name": "Axe"}], "target_id": 1}
        session_instance.save()

        http_response = self.client.get(reverse("game:search_heroes"), {"q": "Ax"})
        response_json_content = http_response.json()

        hero_names_found = [
            result["name"] for result in response_json_content["results"]
        ]
        self.assertNotIn("Axe", hero_names_found)

    def test_search_endpoint_only_accepts_get_http_method(self):
        http_response = self.client.post(reverse("game:search_heroes"), {"q": "Axe"})
        self.assertEqual(http_response.status_code, 405)


class MakeGuessViewTest(TestCase):

    def setUp(self):
        self.client = Client()
        self.axe_hero = make_hero(name="Axe")
        self.lina_hero = make_hero(
            name="Lina",
            gender="Female",
            attribute="Intelligence",
            attack_type="Ranged",
            complexity="Moderate",
        )

    def _set_target_hero_in_session(self, hero_object):
        session_instance = self.client.session
        session_instance["game"] = {"target_id": hero_object.id}
        session_instance.save()

    def _perform_guess_request(self, hero_name_string):
        return self.client.post(
            reverse("game:make_guess"),
            data=json.dumps({"hero_name": hero_name_string}),
            content_type="application/json",
        )

    def test_correct_guess_marks_game_as_won(self):
        self._set_target_hero_in_session(self.axe_hero)
        http_response = self._perform_guess_request("Axe")

        self.assertEqual(http_response.status_code, 200)
        response_json_content = http_response.json()

        self.assertTrue(response_json_content["won"])
        self.assertTrue(response_json_content["result"]["correct"])

    def test_wrong_guess_does_not_result_in_victory(self):
        self._set_target_hero_in_session(self.axe_hero)
        http_response = self._perform_guess_request("Lina")

        response_json_content = http_response.json()
        self.assertFalse(response_json_content["won"])
        self.assertFalse(response_json_content["result"]["correct"])

    def test_attempt_count_increments_correctly(self):
        self._set_target_hero_in_session(self.axe_hero)
        self._perform_guess_request("Lina")

        http_response = self._perform_guess_request("Lina")
        response_json_content = http_response.json()

        self.assertEqual(response_json_content["attempt_count"], 2)

    def test_cannot_make_guess_after_victory_is_achieved(self):
        self._set_target_hero_in_session(self.axe_hero)
        self._perform_guess_request("Axe")

        http_response = self._perform_guess_request("Lina")
        self.assertEqual(http_response.status_code, 400)

    def test_unknown_hero_name_returns_not_found_status(self):
        self._set_target_hero_in_session(self.axe_hero)
        http_response = self._perform_guess_request("NonExistentHero")
        self.assertEqual(http_response.status_code, 404)

    def test_empty_request_body_returns_bad_request_status(self):
        self._set_target_hero_in_session(self.axe_hero)
        http_response = self.client.post(
            reverse("game:make_guess"),
            data="not a valid json string",
            content_type="application/json",
        )
        self.assertEqual(http_response.status_code, 400)

    def test_missing_hero_name_parameter_returns_bad_request_status(self):
        self._set_target_hero_in_session(self.axe_hero)
        http_response = self.client.post(
            reverse("game:make_guess"),
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(http_response.status_code, 400)

    def test_endpoint_only_accepts_post_http_method(self):
        http_response = self.client.get(reverse("game:make_guess"))
        self.assertEqual(http_response.status_code, 405)

    def test_response_contains_game_hints(self):
        self._set_target_hero_in_session(self.axe_hero)
        http_response = self._perform_guess_request("Lina")

        response_json_content = http_response.json()
        self.assertIn("hints", response_json_content)

    def test_revealed_name_is_only_visible_on_victory(self):
        self._set_target_hero_in_session(self.axe_hero)

        wrong_guess_response = self._perform_guess_request("Lina")
        self.assertIsNone(wrong_guess_response.json()["revealed_name"])

        correct_guess_response = self._perform_guess_request("Axe")
        self.assertEqual(correct_guess_response.json()["revealed_name"], "Axe")


class ResetViewTest(TestCase):

    def setUp(self):
        self.client = Client()
        self.target_hero = make_hero(name="Axe")

    def test_reset_action_redirects_to_game_index_page(self):
        http_response = self.client.get(reverse("game:reset_game"))
        self.assertRedirects(http_response, reverse("game:index"))

    def test_reset_action_clears_all_session_data(self):
        session_instance = self.client.session
        session_instance["game"] = {
            "target_id": self.target_hero.id,
            "victory_status": True,
        }
        session_instance.save()

        self.client.get(reverse("game:reset_game"))

        index_page_response = self.client.get(reverse("game:index"))
        self.assertFalse(index_page_response.context["won"])
        self.assertEqual(index_page_response.context["attempt_count"], 0)


# ========================= Session Tests =========================


class GameSessionTest(TestCase):

    def setUp(self):
        self.client = Client()
        # Предполагается, что make_hero — это вспомогательный метод или фабрика
        self.hero = make_hero(name="Axe")

    def _get_game_session_instance(self):
        request = self.client.get(reverse("game:index")).wsgi_request
        return GameSession(request)

    def test_get_target_correctly_picks_hero_identifier(self):
        self.client.get(reverse("game:index"))
        game_data_in_session = self.client.session.get("game", {})
        self.assertIn("target_id", game_data_in_session)

    def test_target_hero_remains_the_same_on_repeated_requests(self):
        """Проверяет, что один и тот же целевой герой сохраняется при повторных запросах."""
        self.client.get(reverse("game:index"))
        first_target_identifier = self.client.session["game"]["target_id"]

        self.client.get(reverse("game:index"))
        second_target_identifier = self.client.session["game"]["target_id"]

        self.assertEqual(first_target_identifier, second_target_identifier)

    def test_retrieving_already_guessed_hero_names(self):
        session = self.client.session
        session["game"] = {
            "target_id": self.hero.id,
            "guesses": [{"name": "Axe"}, {"name": "Lina"}],
        }
        session.save()

        request = self.client.get(reverse("game:index")).wsgi_request
        game_session = GameSession(request)

        guessed_names_list = game_session.already_guessed_names()
        self.assertEqual(guessed_names_list, ["Axe", "Lina"])

    def test_victory_status_is_false_by_default(self):
        request = self.client.get(reverse("game:index")).wsgi_request
        game_session = GameSession(request)
        self.assertFalse(game_session.won)

    def test_attempt_count_matches_number_of_guesses(self):
        session = self.client.session
        session["game"] = {
            "target_id": self.hero.id,
            "guesses": [{"name": "Lina"}, {"name": "Zeus"}],
        }
        session.save()

        request = self.client.get(reverse("game:index")).wsgi_request
        game_session = GameSession(request)
        self.assertEqual(game_session.attempt_count, 2)
