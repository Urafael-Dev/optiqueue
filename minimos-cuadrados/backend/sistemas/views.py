import json

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from . import contenido
from .models import Evaluacion, Resolucion
from .solver import ErrorEntrada, ajustar_curva, resolver_sistema


def _error(mensaje, estado=400):
    return JsonResponse({"error": mensaje}, status=estado)


def _json(request):
    try:
        datos = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ErrorEntrada("El cuerpo de la petición no es JSON válido.") from None
    if not isinstance(datos, dict):
        raise ErrorEntrada("Se esperaba un objeto JSON.")
    return datos


def _api(vista):
    """Convierte errores de entrada en respuestas 400 con mensaje legible."""

    def envoltura(request, *args, **kwargs):
        try:
            return vista(request, *args, **kwargs)
        except ErrorEntrada as e:
            return _error(str(e))

    envoltura.__name__ = vista.__name__
    return envoltura


@require_GET
def estado(request):
    return JsonResponse({
        "estado": "en línea",
        "tema": "Resolución de sistemas no cuadrados · Método de mínimos cuadrados",
        "rutas": {
            "POST /api/sistemas/resolver/": "Resuelve A x = b (m × n) por mínimos cuadrados",
            "POST /api/ajuste/": "Ajuste de curvas (polinomial, exponencial, potencia, logarítmico)",
            "GET /api/ejemplos/": "Sistemas de ejemplo",
            "GET /api/quiz/preguntas/": "Preguntas del cuestionario",
            "POST /api/quiz/enviar/": "Califica y guarda las respuestas",
            "GET /api/quiz/ranking/": "Top 10",
            "GET /api/historial/": "Últimas resoluciones",
        },
    })


@require_GET
def ejemplos(request):
    return JsonResponse({"ejemplos": contenido.EJEMPLOS})


@csrf_exempt
@require_POST
@_api
def resolver(request):
    datos = _json(request)
    resultado = resolver_sistema(datos.get("A"), datos.get("b"))
    Resolucion.objects.create(
        tipo="sistema", filas=resultado["m"], columnas=resultado["n"],
        forma=resultado["forma"], metodo=resultado["metodo"],
        entrada={"A": datos["A"], "b": datos["b"]},
        norma_residuo=resultado["norma_residuo"],
    )
    return JsonResponse(resultado)


@csrf_exempt
@require_POST
@_api
def ajuste(request):
    datos = _json(request)
    resultado = ajustar_curva(
        datos.get("x"), datos.get("y"),
        modelo=datos.get("modelo", "polinomial"), grado=datos.get("grado", 1),
    )
    Resolucion.objects.create(
        tipo="ajuste", filas=resultado["puntos"], columnas=resultado["parametros"],
        forma=resultado["sistema"]["forma"], metodo=resultado["modelo"],
        entrada={k: datos.get(k) for k in ("x", "y", "modelo", "grado")},
        norma_residuo=resultado["sistema"]["norma_residuo"],
    )
    return JsonResponse(resultado)


@require_GET
def historial(request):
    filas = Resolucion.objects.all()[:15]
    return JsonResponse({"historial": [
        {"tipo": r.tipo, "tamano": f"{r.filas}×{r.columnas}", "forma": r.forma,
         "metodo": r.metodo, "norma_residuo": r.norma_residuo, "creado": r.creado.isoformat()}
        for r in filas
    ]})


@require_GET
def preguntas(request):
    return JsonResponse({"preguntas": contenido.preguntas_publicas()})


@csrf_exempt
@require_POST
@_api
def enviar_quiz(request):
    datos = _json(request)
    nombre = str(datos.get("nombre", "")).strip()[:120]
    correo = str(datos.get("correo", "")).strip().lower()
    respuestas = datos.get("respuestas")
    if not nombre:
        raise ErrorEntrada("Escribe tu nombre.")
    try:
        validate_email(correo)
    except ValidationError:
        raise ErrorEntrada("El correo no es válido.") from None
    if not isinstance(respuestas, dict):
        raise ErrorEntrada("Faltan las respuestas.")

    nota = contenido.calificar(respuestas)
    Evaluacion.objects.update_or_create(
        correo=correo,
        defaults={"nombre": nombre, "puntaje": nota["puntaje"], "aciertos": nota["aciertos"],
                  "total": nota["total"], "respuestas": respuestas},
    )
    return JsonResponse(nota)


@require_GET
def ranking(request):
    top = Evaluacion.objects.all()[:10]
    return JsonResponse({"ranking": [
        {"nombre": e.nombre, "puntaje": e.puntaje, "aciertos": e.aciertos, "total": e.total}
        for e in top
    ]})
