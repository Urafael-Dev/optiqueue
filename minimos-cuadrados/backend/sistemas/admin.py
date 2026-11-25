from django.contrib import admin

from .models import Evaluacion, Resolucion


@admin.register(Evaluacion)
class EvaluacionAdmin(admin.ModelAdmin):
    list_display = ("nombre", "correo", "puntaje", "aciertos", "total", "actualizado")
    search_fields = ("nombre", "correo")


@admin.register(Resolucion)
class ResolucionAdmin(admin.ModelAdmin):
    list_display = ("tipo", "filas", "columnas", "forma", "metodo", "norma_residuo", "creado")
    list_filter = ("tipo", "forma", "metodo")
