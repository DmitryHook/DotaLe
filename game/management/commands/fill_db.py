from pathlib import Path
import json
import re
from django.core.management.base import BaseCommand
from django.conf import settings
from django.db import transaction

from game.models import Hero, VoiceLine, Ability, LoadScreen


class Command(BaseCommand):
    help = 'Fill database with Dota 2 heroes data.'

    # ========================= UTILS =========================

    def _progress_bar(self, current, total, prefix='', length=40):
        fraction = current / total if total > 0 else 0

        filled_length = int(length * fraction)
        bar = '█' * filled_length + '-' * (length - filled_length)
        percent = int(fraction * 100)
        
        self.stdout.write(f'\r{prefix} |{bar}| {percent}%', ending='')

        if current >= total:
            self.stdout.write()

    def _log_result(self, label, created, updated):
        """Aligning result columns."""
        name_col = f'Finished {label}:'.ljust(29)

        self.stdout.write(self.style.SUCCESS(
            f'{name_col} Created: {created:<5} Updated: {updated:>4}'
        ))

    # ========================= Data maps =========================

    def _get_heroes_map(self, folder_names):
        """A unified method for hero caching."""
        return {h.name: h for h in Hero.objects.filter(name__in=folder_names)}

    def _get_image_map(self):
        """Creates a mapping of hero names to file paths."""
        heroes_dir = Path(settings.MEDIA_ROOT) / 'heroes'
        if not heroes_dir.is_dir():
            return {}

        return {f.stem: f'heroes/{f.name}' for f in heroes_dir.iterdir() if f.is_file()}

    # ========================= Fill =========================

    def fill_heroes(self):
        json_path = Path(__file__).parent / 'heroes_data.json'
        if not json_path.exists():
            self.stderr.write(f'File not found: {json_path}')
            return

        with open(json_path, 'r', encoding='utf-8') as f:
            heroes_data = json.load(f)

        image_map = self._get_image_map()
        total = len(heroes_data)
        created_count = updated_count = 0

        for i, (key, data) in enumerate(heroes_data.items(), 1):
            hero_name = data.get('name', key)
            hero, created = Hero.objects.update_or_create(
                name=hero_name,
                defaults={
                    'gender': data.get('gender'),
                    'species': data.get('species'),
                    'position': data.get('position'),
                    'attribute': data.get('attribute'),
                    'attack_type': data.get('attack_type'),
                    'complexity': data.get('complexity'),
                    'date': data.get('date'),
                    'image': image_map.get(hero_name),
                }
            )
            if created: created_count += 1
            else: updated_count += 1
            self._progress_bar(i, total, prefix='Heroes'.ljust(15))

        self._log_result('Heroes', created_count, updated_count)

    def _fill_related_data(self, model, sub_folder, glob_pattern, prefix, process_func):
        """A universal method for filling VoiceLines, Abilities, and LoadScreens."""
        base_folder = Path(settings.MEDIA_ROOT) / sub_folder
        if not base_folder.is_dir():
            return

        hero_folders = [d for d in base_folder.iterdir() if d.is_dir()]
        heroes_map = self._get_heroes_map([d.name for d in hero_folders])

        created_count = updated_count = 0
        total = len(hero_folders)

        for i, folder in enumerate(hero_folders, 1):
            hero = heroes_map.get(folder.name)
            if hero:
                for file_path in folder.glob(glob_pattern):
                    defaults, lookup_extra = process_func(file_path, folder)
                    if defaults is None: continue

                    obj, created = model.objects.update_or_create(
                        hero=hero,
                        **lookup_extra,
                        defaults=defaults
                    )
                    if created: created_count += 1
                    else: updated_count += 1

            self._progress_bar(i, total, prefix=prefix.ljust(15))

        self._log_result(prefix, created_count, updated_count)

    # ========================= Handlers =========================

    def fill_voice_line(self):
        json_path = Path(settings.MEDIA_ROOT) / 'voice_lines' / 'voice_lines.json'
        with open(json_path, 'r', encoding='utf-8') as f:
            voice_data = json.load(f)

        def process(file_path, folder):
            text = voice_data.get(file_path.stem)
            if not text: return None, None
            return {'text': text}, {'mp3_file': f'voice_lines/{folder.name}/{file_path.name}'}

        self._fill_related_data(VoiceLine, 'voice_lines', '*.mp3', 'Voice Lines', process)

    def fill_ability(self):
        name_pattern = re.compile(r'_[^_]+$')

        def process(file_path, folder):
            stem = file_path.stem
            clean_name = name_pattern.sub('', stem) if '_' in stem else stem
            return (
                {'text': f'{clean_name}'},
                {'png_file': f'abilities/{folder.name}/{file_path.name}'}
            )

        self._fill_related_data(Ability, 'abilities', '*.png', 'Abilities', process)

    def fill_load_screen(self):
        def process(file_path, folder):
            return {}, {'load_screen': f'loading_screens/{folder.name}/{file_path.name}'}

        self._fill_related_data(LoadScreen, 'loading_screens', '*.webp', 'Load Screens', process)

    # ========================= Entry point =========================

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING('\nStarting database filling...'))
        self.stdout.write('-' * 58)

        tasks = [
            ('Heroes', self.fill_heroes),
            ('Voice Lines', self.fill_voice_line),
            ('Abilities', self.fill_ability),
            ('Loading Screens', self.fill_load_screen),
        ]

        try:
            with transaction.atomic():
                for name, task in tasks:
                    task()
        except KeyboardInterrupt:
            self.stdout.write(self.style.ERROR('\nImport interrupted by user.'))
            return
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\nAn error occurred: {e}'))
            return

        self.stdout.write('-' * 58)
        self.stdout.write(self.style.SUCCESS(
            f'Full import completed.'
        ))
