from django.db import models


class Hero(models.Model):
    name = models.CharField(max_length=32, unique=True, verbose_name='Name')
    image = models.ImageField(upload_to='heroes/', null = True, blank = True, verbose_name='Image')
    gender = models.CharField(max_length=8, verbose_name='Gender')
    species = models.JSONField(verbose_name='Species')
    position = models.JSONField(verbose_name='Role')
    attribute = models.CharField(max_length=16, verbose_name='Attribute')
    attack_type = models.CharField(max_length=8, verbose_name='Attack Type')
    complexity = models.CharField(max_length=8, verbose_name='Complexity')
    date = models.PositiveSmallIntegerField(verbose_name='Release Year')

    class Meta:
        verbose_name = 'Hero'
        verbose_name_plural = 'Heroes'
        ordering = ['name']

    def __str__(self):
        return self.name

class VoiceLine(models.Model):
    hero = models.ForeignKey(Hero, on_delete=models.CASCADE, verbose_name='Hero')
    mp3_file = models.FileField(max_length=256, upload_to='voice_lines/', null = True, blank = True, verbose_name='Voice phrase')
    text = models.CharField(max_length=256, verbose_name='Text phrase')

    class Meta:
        verbose_name = 'Voice phrase'
        verbose_name_plural = 'Voice phrases'

    def __str__(self):
        return str(self.mp3_file).rsplit('/', maxsplit=1)[-1]

class Ability(models.Model):
    hero = models.ForeignKey(Hero, on_delete=models.CASCADE, verbose_name='Hero')
    png_file = models.FileField(max_length=256, verbose_name='Ability image')
    text = models.CharField(max_length=128, verbose_name='Ability name')

    class Meta:
        verbose_name = 'Ability'
        verbose_name_plural = 'Abilities'

    def __str__(self):
        return self.text

class LoadScreen(models.Model):
    hero = models.ForeignKey(Hero, on_delete=models.CASCADE, verbose_name='Hero')
    load_screen = models.ImageField(upload_to='loading_screens/', null = True, blank = True, verbose_name='Loading screen')

    class Meta:
        verbose_name = 'Loading screen'
        verbose_name_plural = 'Loading screens'

    def __str__(self):
        return f'{self.hero} loading screen'
