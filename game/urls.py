from django.urls import include, path

from game import views

app_name = 'game'

api_patterns = [
    path('search/', views.search_heroes, name='search_heroes'),
    path('guess/', views.make_guess, name='make_guess'),
]

urlpatterns = [
    path('', views.index, name='index'),
    path('reset/', views.reset_game, name='reset_game'),
    path('api/search/', views.search_heroes, name='search_heroes'),
    path('api/', include(api_patterns)),
]
