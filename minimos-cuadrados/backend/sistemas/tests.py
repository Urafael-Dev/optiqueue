import json

import numpy as np
from django.test import TestCase

from . import contenido
from .solver import ErrorEntrada, ajustar_curva, resolver_sistema


class SolverTests(TestCase):
    def test_recta_sobredeterminada(self):
        r = resolver_sistema([[1, 1], [1, 2], [1, 3], [1, 4]], [2, 3, 5, 6])
        self.assertEqual(r["forma"], "sobredeterminado")
        self.assertEqual(r["metodo"], "ecuaciones_normales")
        self.assertFalse(r["consistente"])
        np.testing.assert_allclose(r["AtA"], [[4, 10], [10, 30]])
        np.testing.assert_allclose(r["Atb"], [16, 47])
        np.testing.assert_allclose(r["x"], [0.5, 1.4], atol=1e-12)
        self.assertAlmostEqual(r["suma_cuadrados"], 0.2, places=12)
        np.testing.assert_allclose(r["ortogonalidad"], [0, 0], atol=1e-12)
        np.testing.assert_allclose(r["x_qr"], r["x"], atol=1e-12)

    def test_inconsistente_3x2(self):
        r = resolver_sistema([[1, 0], [0, 1], [1, 1]], [1, 1, 0])
        np.testing.assert_allclose(r["x"], [1 / 3, 1 / 3], atol=1e-12)
        self.assertEqual(r["rango_aumentado"], 3)

    def test_subdeterminado_norma_minima(self):
        A, b = [[1, 1, 1], [1, 2, 3]], [6, 14]
        r = resolver_sistema(A, b)
        self.assertEqual(r["forma"], "subdeterminado")
        self.assertEqual(r["metodo"], "norma_minima")
        self.assertEqual(r["soluciones"], "infinitas")
        np.testing.assert_allclose(r["x"], np.linalg.pinv(A) @ b, atol=1e-10)
        self.assertLess(r["norma_residuo"], 1e-10)
        self.assertEqual(len(r["base_nucleo"]), 1)
        np.testing.assert_allclose(np.array(A) @ r["base_nucleo"][0], [0, 0], atol=1e-10)

    def test_rango_deficiente_usa_svd(self):
        A, b = [[1, 2, 3], [2, 1, 3], [1, 1, 2], [3, 0, 3]], [6, 5, 4, 4]
        r = resolver_sistema(A, b)
        self.assertEqual(r["rango"], 2)
        self.assertEqual(r["metodo"], "pseudoinversa")
        np.testing.assert_allclose(r["x"], np.linalg.pinv(A) @ b, atol=1e-10)

    def test_cuadrado_directo(self):
        r = resolver_sistema([[2, 1], [1, 3]], [3, 5])
        self.assertEqual(r["metodo"], "gauss_directo")
        np.testing.assert_allclose(r["x"], [0.8, 1.4], atol=1e-12)

    def test_coincide_con_numpy_aleatorio(self):
        rng = np.random.default_rng(7)
        for m, n in [(8, 3), (3, 7), (12, 5), (5, 5), (2, 9)]:
            A = rng.normal(size=(m, n))
            b = rng.normal(size=m)
            r = resolver_sistema(A.tolist(), b.tolist())
            np.testing.assert_allclose(r["x"], np.linalg.lstsq(A, b, rcond=None)[0], atol=1e-9)

    def test_pivoteo_registrado(self):
        r = resolver_sistema([[0, 1], [1, 0], [1, 1]], [1, 2, 2])
        self.assertTrue(any(p["tipo"] == "sustitucion" for p in r["pasos"]))

    def test_validacion(self):
        for A, b in [([], []), ([[1, 2], [3]], [1, 2]), ([[1, "a"]], [1]),
                     ([[1, 2]], [1, 2]), ([[float("nan")]], [1]), ([[True]], [1])]:
            with self.assertRaises(ErrorEntrada):
                resolver_sistema(A, b)


class AjusteTests(TestCase):
    def test_recta(self):
        r = ajustar_curva([1, 2, 3, 4], [2, 3, 5, 6])
        self.assertAlmostEqual(r["coeficientes"]["c0"], 0.5)
        self.assertAlmostEqual(r["coeficientes"]["c1"], 1.4)
        self.assertAlmostEqual(r["r2"], 1 - 0.2 / 10)

    def test_exponencial_exacta(self):
        x = [0, 1, 2, 3]
        y = [2 * np.exp(0.5 * t) for t in x]
        r = ajustar_curva(x, y, modelo="exponencial")
        self.assertAlmostEqual(r["coeficientes"]["a"], 2, places=10)
        self.assertAlmostEqual(r["coeficientes"]["b"], 0.5, places=10)
        self.assertAlmostEqual(r["r2"], 1, places=10)

    def test_potencia_y_log(self):
        x = [1, 2, 4, 8]
        r = ajustar_curva(x, [3 * t ** 1.5 for t in x], modelo="potencia")
        self.assertAlmostEqual(r["coeficientes"]["b"], 1.5, places=10)
        r = ajustar_curva(x, [1 + 2 * np.log(t) for t in x], modelo="logaritmico")
        self.assertAlmostEqual(r["coeficientes"]["b"], 2, places=10)

    def test_errores(self):
        with self.assertRaises(ErrorEntrada):
            ajustar_curva([1, 2], [1, 2], grado=2)  # 3 parámetros, 2 puntos
        with self.assertRaises(ErrorEntrada):
            ajustar_curva([1, 2, 3], [1, -2, 3], modelo="exponencial")
        with self.assertRaises(ErrorEntrada):
            ajustar_curva([1, 2, 3], [1, 2, 3], modelo="otro")


class ApiTests(TestCase):
    def post(self, url, datos):
        return self.client.post(url, json.dumps(datos), content_type="application/json")

    def test_resolver_y_historial(self):
        res = self.post("/api/sistemas/resolver/", {"A": [[1, 1], [1, 2], [1, 3]], "b": [1, 2, 2]})
        self.assertEqual(res.status_code, 200)
        self.assertIn("x", res.json())
        hist = self.client.get("/api/historial/").json()["historial"]
        self.assertEqual(len(hist), 1)

    def test_resolver_error_400(self):
        res = self.post("/api/sistemas/resolver/", {"A": [[1, 2]], "b": []})
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.json())
        res = self.client.post("/api/sistemas/resolver/", "no-json", content_type="application/json")
        self.assertEqual(res.status_code, 400)

    def test_ajuste(self):
        res = self.post("/api/ajuste/", {"x": [0, 1, 2, 3], "y": [1, 2, 5, 10], "modelo": "polinomial", "grado": 2})
        self.assertEqual(res.status_code, 200)
        self.assertAlmostEqual(res.json()["r2"], 1.0)

    def test_quiz_sin_respuestas_en_preguntas(self):
        preguntas = self.client.get("/api/quiz/preguntas/").json()["preguntas"]
        self.assertTrue(all("correcta" not in p for p in preguntas))

    def test_quiz_y_ranking(self):
        perfectas = {p["id"]: p["correcta"] for p in contenido.PREGUNTAS}
        res = self.post("/api/quiz/enviar/", {"nombre": "Ana", "correo": "ana@ejemplo.com",
                                              "respuestas": perfectas})
        self.assertEqual(res.json()["puntaje"], 100)
        self.post("/api/quiz/enviar/", {"nombre": "Luis", "correo": "luis@ejemplo.com",
                                        "respuestas": {"p1": 1}})
        # Reenviar con el mismo correo actualiza, no duplica.
        self.post("/api/quiz/enviar/", {"nombre": "Luis", "correo": "LUIS@ejemplo.com",
                                        "respuestas": {"p1": 1, "p2": 2}})
        ranking = self.client.get("/api/quiz/ranking/").json()["ranking"]
        self.assertEqual([r["nombre"] for r in ranking], ["Ana", "Luis"])
        self.assertEqual(ranking[1]["aciertos"], 2)

    def test_quiz_correo_invalido(self):
        res = self.post("/api/quiz/enviar/", {"nombre": "X", "correo": "no", "respuestas": {}})
        self.assertEqual(res.status_code, 400)

    def test_metodo_no_permitido(self):
        self.assertEqual(self.client.get("/api/sistemas/resolver/").status_code, 405)
