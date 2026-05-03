from django.contrib import admin
from django.contrib.auth.models import Group, User
from django.utils.safestring import mark_safe

from .models import Ability, Hero, LoadScreen, VoiceLine


# ========================= Site Configuration =========================

ORDERING = {
    "Hero": 1,
    "VoiceLine": 2,
    "Ability": 3,
    "LoadScreen": 4,
}

def get_app_list(self, request, app_label=None):
    app_dict = self._build_app_dict(request, app_label)

    if not app_dict:
        return []

    for app in app_dict.values():
        app['models'].sort(key=lambda x: ORDERING.get(x['object_name'], 99))

    return list(app_dict.values())

admin.AdminSite.get_app_list = get_app_list
admin.site.unregister(Group)
admin.site.unregister(User)

admin.site.site_header = "DotaLe Admin Panel"
admin.site.site_title = "DotaLe Admin"


# ========================= Helpers =========================

def admin_image_preview(url, width=None, height=None, clickable=True):
    style = f"object-fit: cover; border-radius: 5px; width: {width}px; height: {height}px;"

    img_html = f'<img src="{url}" style="{style}">'
    if clickable:
        return mark_safe(f'<a href="{url}" target="_blank">{img_html}</a>')
    return mark_safe(img_html)

def admin_audio_player(url, width=300):
    return mark_safe(
        f'<audio controls preload="none" '
        f'style="height: 36px; width: {width}px; vertical-align: middle; display: block;">'
        f'<source src="{url}" type="audio/mpeg">'
        f'</audio>'
    )

# ========================= Base Class =========================

class ReadOnlyAdmin(admin.ModelAdmin):

    class Media:
        css = {
            'all': ('admin/css/custom_admin.css',)
        }

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

# ========================= Hero =========================

@admin.register(Hero)
class HeroAdmin(ReadOnlyAdmin):
    list_display = ['name', 'gender', 'species', 'position', 'attribute', 'attack_type', 'complexity', 'date']
    list_filter  = ['gender', 'attribute', 'attack_type', 'complexity']
    search_fields = ['name']
    ordering = ['name']

    fields = ['name', 'get_image', 'gender', 'get_species', 'get_position', 'attribute', 'attack_type', 'complexity', 'date']
    readonly_fields = ['get_image', 'get_species', 'get_position']

    @admin.display(description='Image')
    def get_image(self, obj):
        if obj.image:
            return admin_image_preview(obj.image.url, height=128)
        return "—"

    @admin.display(description='Species')
    def get_species(self, obj):
        if obj.species:
            return ', '.join(obj.species) if isinstance(obj.species, list) else obj.species
        return '—'

    @admin.display(description='Role')
    def get_position(self, obj):
        if obj.position:
            return ', '.join(obj.position) if isinstance(obj.position, list) else obj.position
        return '—'

# ========================= VoiceLine =========================

@admin.register(VoiceLine)
class VoiceLineAdmin(ReadOnlyAdmin):
    list_display = ['hero', 'text', 'get_audio_list']
    search_fields = ['hero__name', 'text']
    list_filter = ['hero']
    ordering = ['hero']

    fields = ['hero', 'text', 'get_audio_form']
    readonly_fields = ['get_audio_form']

    @admin.display(description='Voice phrase')
    def get_audio_list(self, obj):
        if obj.mp3_file:
            return admin_audio_player(obj.mp3_file.url, width=300)
        return "—"

    @admin.display(description='Voice phrase')
    def get_audio_form(self, obj):
        if obj.mp3_file:
            return admin_audio_player(obj.mp3_file.url, width=450)
        return "—"

# ========================= Ability =========================

@admin.register(Ability)
class AbilityAdmin(ReadOnlyAdmin):
    list_display = ['hero', 'text', 'get_icon_list']
    fields = ['hero', 'text', 'get_icon_form']
    readonly_fields = ['get_icon_form']

    ordering = ['hero']

    @admin.display(description='Icon')
    def get_icon_list(self, obj):
        if obj.png_file:
            return admin_image_preview(obj.png_file.url, width=32, height=32, clickable=False)
        return "—"

    @admin.display(description='Icon')
    def get_icon_form(self, obj):
        if obj.png_file:
            return admin_image_preview(obj.png_file.url, width=96, height=96)
        return "—"

# ========================= LoadScreen =========================

@admin.register(LoadScreen)
class LoadScreenAdmin(ReadOnlyAdmin):
    list_display = ['hero', 'get_screen_list']
    fields = ['hero', 'get_screen_form']
    readonly_fields = ['get_screen_form']

    ordering = ['hero']

    @admin.display(description='Loading Screen')
    def get_screen_list(self, obj):
        if obj.load_screen:
            return admin_image_preview(obj.load_screen.url, width=256, height=128, clickable=False)
        return "—"

    @admin.display(description='Loading Screen')
    def get_screen_form(self, obj):
        if obj.load_screen:
            return admin_image_preview(obj.load_screen.url, width=768, height=384)
        return "—"
