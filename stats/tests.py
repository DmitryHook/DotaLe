import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock, PropertyMock

from django.test import TestCase, RequestFactory
from django.urls import reverse


# =============== Helpers ===============

def _write_game(date_dir: Path, filename: str, data: dict) -> Path:
    """Write a JSON game file into *date_dir* and return its path."""
    date_dir.mkdir(parents=True, exist_ok=True)
    f = date_dir / filename
    f.write_text(json.dumps(data), encoding="utf-8")
    return f


SAMPLE_GAME = {
    "hero": "Anti-Mage",
    "result": "win",
    "attempts": 3,
    "guesses": [
        {"name": "Axe", "correct": False},
        {"name": "Invoker", "correct": False},
        {"name": "Anti-Mage", "correct": True},
    ],
}

# =============== Helper / private function tests ===============

class StatsHelpersTests(TestCase):

    def test_parse_game_file_valid_json(self):
        from stats.views import _parse_game_file

        with tempfile.NamedTemporaryFile(suffix=".json", mode="w",
                                        delete=False, encoding="utf-8") as fh:
            json.dump(SAMPLE_GAME, fh)
            path = Path(fh.name)

        result = _parse_game_file(path)
        self.assertEqual(result["hero"], "Anti-Mage")
        self.assertEqual(result["result"], "win")
        path.unlink(missing_ok=True)

    def test_parse_game_file_invalid_json(self):
        from stats.views import _parse_game_file

        with tempfile.NamedTemporaryFile(suffix=".json", mode="w",
                                        delete=False, encoding="utf-8") as fh:
            fh.write("not-json{{{")
            path = Path(fh.name)

        self.assertIsNone(_parse_game_file(path))
        path.unlink(missing_ok=True)

    def test_parse_game_file_missing_file(self):
        from stats.views import _parse_game_file

        self.assertIsNone(_parse_game_file(Path("/nonexistent/file.json")))

    def test_stats_dir_points_to_game_stats(self):
        from stats.views import _stats_dir
        from django.conf import settings

        expected = Path(settings.BASE_DIR) / "game_stats"
        self.assertEqual(_stats_dir(), expected)

# =============== Stats (index) view ===============

class StatsIndexViewTests(TestCase):

    def test_renders_200(self):
        response = self.client.get(reverse("stats:index"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "stats/stats.html")

    def test_only_get_allowed(self):
        response = self.client.post(reverse("stats:index"))
        # Django's default: POST to a view that only handles GET → 405 or redirect
        self.assertIn(response.status_code, [200, 405])

# =============== Stats dates view ===============

class StatsDatesViewTests(TestCase):

    def _url(self):
        return reverse("stats:stats_dates")

    @patch("stats.views._stats_dir")
    def test_returns_empty_list_when_dir_missing(self, mock_dir):
        mock_dir.return_value = Path("/nonexistent/path/game_stats")
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["dates"], [])

    @patch("stats.views._stats_dir")
    def test_returns_sorted_dates_newest_first(self, mock_dir):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / "2024-01-01").mkdir()
            (tmp_path / "2024-03-15").mkdir()
            (tmp_path / "2023-12-31").mkdir()
            # hidden dir – should be ignored
            (tmp_path / ".hidden").mkdir()

            mock_dir.return_value = tmp_path
            response = self.client.get(self._url())

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["dates"], ["2024-03-15", "2024-01-01", "2023-12-31"])

    @patch("stats.views._stats_dir")
    def test_ignores_files_in_stats_dir(self, mock_dir):
        """Only directories should appear, not stray files."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / "2024-01-01").mkdir()
            (tmp_path / "readme.txt").write_text("ignore me")

            mock_dir.return_value = tmp_path
            response = self.client.get(self._url())

        data = response.json()
        self.assertEqual(data["dates"], ["2024-01-01"])

    def test_only_get_allowed(self):
        response = self.client.post(self._url())
        self.assertEqual(response.status_code, 405)


# =============== Stats games view ===============

class StatsGamesViewTests(TestCase):

    def _url(self, date="2024-03-15"):
        return reverse("stats:stats_games", kwargs={"date": date})

    @patch("stats.views._stats_dir")
    def test_404_for_unknown_date(self, mock_dir):
        mock_dir.return_value = Path("/nonexistent/path/game_stats")
        response = self.client.get(self._url("2099-01-01"))
        self.assertEqual(response.status_code, 404)
        self.assertIn("error", response.json())

    @patch("stats.views._stats_dir")
    def test_returns_games_list(self, mock_dir):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            date_dir = tmp_path / "2024-03-15"
            _write_game(date_dir, "14-30-00.json", SAMPLE_GAME)

            mock_dir.return_value = tmp_path
            response = self.client.get(self._url("2024-03-15"))

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["date"], "2024-03-15")
        self.assertEqual(len(data["games"]), 1)
        game = data["games"][0]
        self.assertEqual(game["filename"], "14-30-00.json")
        self.assertEqual(game["hero"], "Anti-Mage")
        self.assertEqual(game["result"], "win")
        self.assertEqual(game["attempts"], 3)

    @patch("stats.views._stats_dir")
    def test_time_derived_from_stem(self, mock_dir):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            date_dir = tmp_path / "2024-03-15"
            _write_game(date_dir, "09-05-42.json", SAMPLE_GAME)

            mock_dir.return_value = tmp_path
            response = self.client.get(self._url("2024-03-15"))

        game = response.json()["games"][0]
        self.assertEqual(game["time"], "09:05:42")

    @patch("stats.views._stats_dir")
    def test_skips_unreadable_files(self, mock_dir):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            date_dir = tmp_path / "2024-03-15"
            date_dir.mkdir(parents=True)
            # valid
            _write_game(date_dir, "10-00-00.json", SAMPLE_GAME)
            # invalid JSON
            (date_dir / "broken.json").write_text("!!!bad!!!")

            mock_dir.return_value = tmp_path
            response = self.client.get(self._url("2024-03-15"))

        data = response.json()
        self.assertEqual(len(data["games"]), 1)

    @patch("stats.views._stats_dir")
    def test_games_sorted_newest_first(self, mock_dir):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            date_dir = tmp_path / "2024-03-15"
            _write_game(date_dir, "08-00-00.json", {**SAMPLE_GAME, "result": "early"})
            _write_game(date_dir, "22-00-00.json", {**SAMPLE_GAME, "result": "late"})

            mock_dir.return_value = tmp_path
            response = self.client.get(self._url("2024-03-15"))

        games = response.json()["games"]
        self.assertEqual(games[0]["result"], "late")
        self.assertEqual(games[1]["result"], "early")

    def test_only_get_allowed(self):
        response = self.client.post(self._url())
        self.assertEqual(response.status_code, 405)


# =============== Stats game view ===============

class StatsGameViewTests(TestCase):

    def _url(self, date="2024-03-15", filename="14-30-00.json"):
        return reverse("stats:stats_game", kwargs={"date": date, "filename": filename})

    @patch("stats.views._stats_dir")
    def test_404_for_missing_file(self, mock_dir):
        mock_dir.return_value = Path("/nonexistent/path/game_stats")
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 404)
        self.assertIn("error", response.json())

    @patch("stats.views.Hero")
    @patch("stats.views._stats_dir")
    def test_returns_game_data_with_images(self, mock_dir, mock_hero_model):
        # Build a fake Hero queryset
        fake_hero = MagicMock()
        fake_hero.name = "Anti-Mage"
        fake_hero.image.url = "/media/heroes/antimage.jpg"

        mock_qs = MagicMock()
        mock_qs.__iter__ = MagicMock(return_value=iter([fake_hero]))
        mock_hero_model.objects.filter.return_value.only.return_value = mock_qs

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            date_dir = tmp_path / "2024-03-15"
            _write_game(date_dir, "14-30-00.json", SAMPLE_GAME)

            mock_dir.return_value = tmp_path
            response = self.client.get(self._url())

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["hero"], "Anti-Mage")

        # Find the winning guess and check image was attached
        winning = next(g for g in data["guesses"] if g["name"] == "Anti-Mage")
        self.assertEqual(winning["image"], "/media/heroes/antimage.jpg")

    @patch("stats.views.Hero")
    @patch("stats.views._stats_dir")
    def test_json_extension_auto_appended(self, mock_dir, mock_hero_model):
        """Requesting filename without .json should still find the file."""
        mock_qs = MagicMock()
        mock_qs.__iter__ = MagicMock(return_value=iter([]))
        mock_hero_model.objects.filter.return_value.only.return_value = mock_qs

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            date_dir = tmp_path / "2024-03-15"
            _write_game(date_dir, "14-30-00.json", SAMPLE_GAME)

            mock_dir.return_value = tmp_path
            # pass filename WITHOUT .json
            url = reverse("stats:stats_game",
                          kwargs={"date": "2024-03-15", "filename": "14-30-00"})
            response = self.client.get(url)

        self.assertEqual(response.status_code, 200)

    @patch("stats.views.Hero")
    @patch("stats.views._stats_dir")
    def test_image_none_when_hero_has_no_image(self, mock_dir, mock_hero_model):
        fake_hero = MagicMock()
        fake_hero.name = "Axe"
        fake_hero.image = None # no image field

        mock_qs = MagicMock()
        mock_qs.__iter__ = MagicMock(return_value=iter([fake_hero]))
        mock_hero_model.objects.filter.return_value.only.return_value = mock_qs

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            date_dir = tmp_path / "2024-03-15"
            _write_game(date_dir, "14-30-00.json", SAMPLE_GAME)

            mock_dir.return_value = tmp_path
            response = self.client.get(self._url())

        data = response.json()
        axe_guess = next(g for g in data["guesses"] if g["name"] == "Axe")
        self.assertIsNone(axe_guess["image"])

    @patch("stats.views.Hero")
    @patch("stats.views._stats_dir")
    def test_image_none_when_hero_image_url_raises(self, mock_dir, mock_hero_model):
        """If accessing .url raises, image should fall back to None."""
        fake_hero = MagicMock()
        fake_hero.name = "Invoker"
        type(fake_hero.image).url = PropertyMock(side_effect=ValueError("no file"))

        mock_qs = MagicMock()
        mock_qs.__iter__ = MagicMock(return_value=iter([fake_hero]))
        mock_hero_model.objects.filter.return_value.only.return_value = mock_qs

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            date_dir = tmp_path / "2024-03-15"
            _write_game(date_dir, "14-30-00.json", SAMPLE_GAME)

            mock_dir.return_value = tmp_path
            response = self.client.get(self._url())

        data = response.json()
        invoker_guess = next(g for g in data["guesses"] if g["name"] == "Invoker")
        self.assertIsNone(invoker_guess["image"])

    @patch("stats.views._stats_dir")
    def test_500_on_corrupt_json(self, mock_dir):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            date_dir = tmp_path / "2024-03-15"
            date_dir.mkdir(parents=True)
            (date_dir / "14-30-00.json").write_text("CORRUPT", encoding="utf-8")

            mock_dir.return_value = tmp_path
            response = self.client.get(self._url())

        self.assertEqual(response.status_code, 500)
        self.assertIn("error", response.json())

    def test_only_get_allowed(self):
        response = self.client.post(self._url())
        self.assertEqual(response.status_code, 405)


# =============== URL routing sanity checks ===============

class StatsUrlsTests(TestCase):

    def test_index_url_resolves(self):
        url = reverse("stats:index")
        self.assertEqual(url, "/stats/") # adjust prefix if needed

    def test_dates_url_resolves(self):
        url = reverse("stats:stats_dates")
        self.assertEqual(url, "/stats/api/dates/")

    def test_games_url_resolves(self):
        url = reverse("stats:stats_games", kwargs={"date": "2024-03-15"})
        self.assertEqual(url, "/stats/api/games/2024-03-15/")

    def test_game_url_resolves(self):
        url = reverse("stats:stats_game",
                      kwargs={"date": "2024-03-15", "filename": "14-30-00.json"})
        self.assertEqual(url, "/stats/api/game/2024-03-15/14-30-00.json")
        