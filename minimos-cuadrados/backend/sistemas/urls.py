from django.urls import path

from . import views

urlpatterns = [
    path("", views.estado, name="estado"),
    path("ejemplos/", views.ejemplos, name="ejemplos"),
    path("sistemas/resolver/", views.resolver, name="resolver"),
    path("ajuste/", views.ajuste, name="ajuste"),
    path("historial/", views.historial, name="historial"),
    path("quiz/preguntas/", views.preguntas, name="preguntas"),
    path("quiz/enviar/", views.enviar_quiz, name="enviar_quiz"),
    path("quiz/ranking/", views.ranking, name="ranking"),
]
