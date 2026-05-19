from django.urls import path
from stats import views

app_name = 'stats'

urlpatterns = [
    path('', views.stats, name='index'),
    path('api/dates/', views.stats_dates, name='stats_dates'),
    path('api/games/<str:date>/', views.stats_games, name='stats_games'),
    path('api/game/<str:date>/<str:filename>', views.stats_game, name='stats_game'),
]
