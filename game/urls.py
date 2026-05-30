from django.urls import include, path
from game import views

app_name = 'game'

api_patterns = [
    path('search/', views.search_heroes, name='search_heroes'),
    path('guess/', views.make_guess, name='make_guess'),
    path('hp-complete/', views.hp_mode_complete, name='hp_mode_complete'),
    path('hp-defeat/', views.hp_mode_defeat, name='hp_mode_defeat'),
    path('hp-save-level/', views.hp_save_level, name='hp_save_level'),
]

urlpatterns = [
    path('', views.index, name='index'),
    path('about/', views.about, name='about'),
    path('reset/', views.reset_game, name='reset_game'),

    path('api/', include(api_patterns)),

    path('stats/', include('stats.urls', namespace='stats')),

    path('encyclopedia/', views.encyclopedia_heroes, name='encyclopedia_heroes'),
]
