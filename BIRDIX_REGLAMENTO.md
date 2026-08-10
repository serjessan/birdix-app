# Birdix — Reglamento: sistema de puntos y las 10 cartas

Extraído directamente de la lógica ya implementada en `src/App.jsx` (no son propuestas nuevas, es el reglamento tal como existe hoy en el prototipo). Pensado para que cualquiera que no haya visto el código entienda el sistema completo.

## 1. Filosofía del sistema

Birdix mide dos cosas distintas, en capas separadas, que no se pisan entre sí:

- **El hándicap** nivela la partida en sí — hace que jugar contra alguien de nivel muy distinto siga siendo competitivo de verdad, hoyo a hoyo.
- **El Rango Birdix** nivela la señal a lo largo del tiempo — no premia jugar contra rivales "fáciles" ni castiga jugar contra "difíciles". Lo que mueve el rango es si superaste o no lo que se esperaba de ti, ya con el golpe de hándicap aplicado. Por eso alguien con más rango puede perder igualmente si el rival de menos rango juega mejor que su hándicap ese día — el sistema nunca asume que ganar es automático solo por tener más rango.

## 2. Puntos por hoyo — Stableford neto

Cada hoyo se puntúa comparando el resultado neto (golpes brutos menos los golpes de hándicap que te tocan en ese hoyo) contra el par del hoyo — es el Stableford modificado estándar:

| Golpes netos vs. par | Puntos |
|---|---|
| 3 bajo par o mejor | 5 |
| 2 bajo par | 4 |
| 1 bajo par (birdie neto) | 3 |
| Igual al par | 2 |
| 1 sobre par (bogey neto) | 1 |
| 2 o más sobre par | 0 |

## 3. Golpes de hándicap por hoyo

Cada campo de golf tiene un "índice de dificultad" (1 a 18) por hoyo — el hoyo 1 es el más difícil, el 18 el más fácil. Birdix reparte golpes extra según la diferencia de hándicap entre los dos jugadores:

- Se calcula la diferencia de hándicap entre los dos rivales.
- El jugador con hándicap más alto recibe 1 golpe extra en cada uno de los hoyos más difíciles, tantos hoyos como indique esa diferencia (por ejemplo, una diferencia de 13 golpes da 1 golpe extra en los 13 hoyos de índice de dificultad 1 a 13).
- Si la diferencia supera 18, el reparto empieza una segunda vuelta completa (2 golpes extra en los hoyos más difíciles).
- El jugador con hándicap más bajo no recibe ningún golpe extra.

## 4. El Rango Birdix — divisiones

El Rango es un número de puntos (empieza en 1000 para todo jugador nuevo) que sube o baja con cada partida. Las divisiones, de menor a mayor:

| División | Rango de puntos |
|---|---|
| Bronce | 0 – 399 |
| Plata | 400 – 799 |
| Oro | 800 – 1199 |
| Platino | 1200 – 1599 |
| Élite | 1600 – 1999 |
| Leyenda | 2000 en adelante |

Todo jugador nuevo empieza en Oro (1000 pts, dentro del rango 800-1199).

**Cómo se mueve el número tras cada partida** (recomendación validada hoy con simulación — pendiente de implementar): funciona como el sistema de ajedrez/Chess.com. Antes de la partida, el sistema calcula la probabilidad esperada de que ganes según la diferencia de rango con tu rival. Si ganas y eras el favorito, ganas pocos puntos (se esperaba). Si ganas y eras el "underdog", ganas muchos puntos (sorpresa). Si pierdes contra alguien mejor, pierdes pocos puntos (no sorprende). Si pierdes contra alguien peor, pierdes muchos puntos (si duele). El sistema es de suma cero entre los dos rivales: lo que gana uno es exactamente lo que pierde el otro.

## 5. El hándicap Birdix (`birdix_hcp`)

Es un número propio de Birdix, **distinto del hándicap oficial de la federación** (ese solo lo mueve la competición federativa oficial, fuera de la app). El hándicap Birdix sí evoluciona con los resultados de las partidas jugadas dentro de la app — más despacio que el Rango, pero no se queda fijo en el valor con el que entraste. Ganar lo baja, perder lo sube, dentro de un rango de 0 a 36.

## 6. Las 10 cartas

Reglas que cumple toda carta: sencilla de entender, rápida de usar, divertida, equilibrada, estratégica, visualmente espectacular. Nunca injustas, nunca rompen la partida, **nunca dependen del azar** — la habilidad está en decidir *cuándo* jugarla, no en la suerte.

### Cómo se juegan

Antes de empezar la partida, cada jugador elige 2 cartas del mazo de 10 si se juegan 9 hoyos, o 4 si se juegan 18. Cada carta elegida se puede jugar una única vez en toda la partida — al usarla, queda gastada.

Un jugador solo puede jugar 1 carta por hoyo, sin excepción — el límite incluye también a las cartas de reacción (Segundo Golpe, Bloqueo): si ya usaste tu carta del hoyo, no puedes reaccionar aunque el rival te ataque.

Si un jugador no juega ninguna carta en un hoyo, ese hoyo se juega como golf real, sin ningún efecto añadido.

### Ofensivas (suman puntos si se dan las condiciones)

**Todo o Nada** — Antes de empezar el hoyo. Duplica los puntos Stableford netos que hagas en ese hoyo. Alto riesgo, alta recompensa: si el hoyo te sale mal, no hay downside extra, pero si sale bien, el premio es doble.

**Roba Punto** — Antes de empezar el hoyo. Si en ese hoyo haces más puntos que tu rival, le robas 1 punto a él además de sumar los tuyos.

**Premio Birdix** — Antes de empezar el hoyo. +2 puntos si haces birdie neto, +3 si haces águila neta o mejor.

**Remontada** — Antes de empezar el hoyo, solo se puede jugar si vas perdiendo en puntos Stableford acumulados hasta ese hoyo. Si ganas ese hoyo concreto al rival, +2 puntos extra.

### Defensivas (protegen puntos o evitan perderlos)

**Escudo** — Antes de empezar el hoyo. Cualquier carta que el rival juegue contra ti durante ese hoyo no tiene efecto — él la gasta igual, pero no te afecta.

**Hoyo Seguro** — Antes de empezar el hoyo. Si acabas haciendo 0 puntos en ese hoyo, recibes 1 punto de compensación. Si ya sumas más de 0, no añade nada extra.

### De reacción (se juegan en el momento, no se planean antes)

**Segundo Golpe** — Justo después de hacer un golpe, puedes repetirlo. El segundo golpe cuenta como definitivo, aunque salga peor que el primero. Es un "mulligan" con riesgo real.

**Bloqueo** — Inmediatamente después de que el rival revele una carta, la anulas. Solo cancela esa carta concreta, nada más.

### De sabotaje (afectan al rival)

**Driver Prohibido** — Se juega justo antes del golpe de salida del rival. Le prohíbe usar el driver en ese golpe concreto — solo afecta a su primer golpe del hoyo.

**Palo Prohibido** — Antes de empezar el hoyo, eliges un palo que el rival no puede usar durante ese hoyo entero (nunca se le puede prohibir el putter). Dura solo ese hoyo.

---

*Documento generado el 9 de agosto de 2026 a partir del código real de `src/App.jsx`, para servir de referencia completa a cualquier persona o herramienta que necesite conocer el reglamento de Birdix sin acceso al código. Actualizado el mismo día: se eliminaron Punto Limpio y Bajo Presión (quedan 10 cartas), y se cerraron las reglas de mazo (2 cartas en 9 hoyos / 4 en 18), límite de 1 carta por hoyo sin excepción, y la redacción de Escudo y Remontada — pendiente de reflejar en `src/App.jsx`.*
