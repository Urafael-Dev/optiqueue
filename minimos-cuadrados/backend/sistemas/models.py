from django.db import models


class Evaluacion(models.Model):
    """Resultado del cuestionario de un estudiante (uno por correo)."""

    nombre = models.CharField(max_length=120)
    correo = models.EmailField(unique=True)
    puntaje = models.PositiveIntegerField(default=0)
    aciertos = models.PositiveIntegerField(default=0)
    total = models.PositiveIntegerField(default=0)
    respuestas = models.JSONField(default=dict)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-puntaje", "actualizado"]
        verbose_name = "evaluación"
        verbose_name_plural = "evaluaciones"

    def __str__(self):
        return f"{self.nombre} · {self.puntaje}"


class Resolucion(models.Model):
    """Historial de sistemas resueltos desde la calculadora."""

    TIPOS = [("sistema", "Sistema A x = b"), ("ajuste", "Ajuste de curvas")]

    tipo = models.CharField(max_length=10, choices=TIPOS)
    filas = models.PositiveIntegerField()
    columnas = models.PositiveIntegerField()
    forma = models.CharField(max_length=20)
    metodo = models.CharField(max_length=30)
    entrada = models.JSONField()
    norma_residuo = models.FloatField()
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-creado"]
        verbose_name = "resolución"
        verbose_name_plural = "resoluciones"

    def __str__(self):
        return f"{self.get_tipo_display()} {self.filas}x{self.columnas} ({self.metodo})"
