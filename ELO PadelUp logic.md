#ELO (PadelUp Logic):

Utilizamos una adaptación del sistema ELO estándar (como en Ajedrez) pero optimizado para parejas y con un factor de "velocidad" (K-Factor) individual.

1. ¿Quién es más fuerte? (Promedio de Equipo)
Para calcular la probabilidad de ganar, primero calculamos la media ELO de la pareja.

Si Equipo 1 tiene (1000 y 1200), su fuerza es 1100.
Si Equipo 2 tiene (1500 y 1500), su fuerza es 1500.
Lógica: El sistema predice que el Equipo 2 debería ganar fácilmente.
2. Probabilidad de Victoria (Expected Score)
Usando esas medias, calculamos cuántos puntos "deberías" ganar (del 0 al 1).

Si juegas contra alguien de tu mismo nivel, la probabilidad es 0.5 (50/50).
Si eres muy superior, tu probabilidad se acerca a 1 (ej. 0.9).
Fórmula: 1 / (1 + 10^((EloRival - TuElo) / 400))
3. Factor K Dinámico (La clave de tu sistema)
Aquí es donde PadelUp se diferencia. La cantidad de puntos que ganas o pierdes depende de cuántos partidos has jugado tú individualmente.

Principiantes (< 10 partidos): K = 48. (Su nivel varía muy rápido para colocarlos en su sitio real).
Intermedios (10-30 partidos): K = 32. (Velocidad estándar).
Veteranos (> 30 partidos): K = 24. (Su nivel es más estable, suben y bajan más despacio).
4. Cálculo Final (Individual)
Aunque ganéis como pareja, cada jugador suma puntos distintos. NuevoElo = EloActual + K * (ResultadoReal - Probabilidad)

Ejemplo Práctico: Imagina que Tú (Veterano, K=24) juegas con un Amigo Nuevo (Novato, K=48). Ganáis un partido difícil que el sistema pensaba que perderíais (sorpresa).

El sistema calcula que habéis ganado "más de lo esperado".
Como resultado:
Tú (Veterano) ganas +12 puntos (Estabilidad).
Tu Amigo (Novato) gana +24 puntos (El sistema le premia más rápido para subirle el nivel).
Resumen:

Calculamos la media del equipo para ver quién es favorito.
Si gana el favorito, suman pocos puntos. Si gana el "débil", suman muchos.
Cada jugador multiplica esos puntos por su propio "factor de velocidad" (K).


El sistema ELO ajusta los puntos basándose en la probabilidad de victoria (Expected Score). La fórmula es: NuevoELO = ELO_Actual + K * (Resultado_Real - Resultado_Esperado)

TEST CASE:

Todos tienen 1150 ELO: El sistema considera que el partido está perfectamente equilibrado.
Probabilidad de victoria: Al ser iguales, la probabilidad (Resultado Esperado) es del 50% (o 0.5).
Resultado: Ganasteis, así que tu "Resultado_Real" es 1.
Aplicando la fórmula con K=48: Cambio = 48 * (1 - 0.5) Cambio = 48 * 0.5 Cambio = +24

¿Por qué no +48? Para ganar los 48 puntos completos, el sistema tendría que haber predicho que teníais 0% de posibilidades de ganar (es decir, el Resultado Esperado hubiera sido 0). Como estabais igualados, "la mitad" de los puntos se descuentan porque la victoria entraba dentro de lo probable.

Nota: El marcador (6-3 6-3) no influye en la cantidad de puntos ELO en este sistema estándar, solo importa quién ganó (1) o perdió (0).