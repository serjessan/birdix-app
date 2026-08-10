# Birdix — Brief para `/design-consultation` (núcleo pulido)

Preparado el 10 de agosto de 2026 en Cowork, para llevar al pipeline de diseño de gstack en Claude Code (`/design-consultation` → `DESIGN.md` → `/design-shotgun` → `/design-html`).

## Qué es Birdix, en una frase

Golf competitivo con progresión tipo videojuego (Rango Birdix, no hándicap) y 12→10 cartas estratégicas jugadas durante partidas reales, sin azar. Ver `CLAUDE.md` para el documento completo del proyecto.

## Qué se diseña ahora: el "núcleo pulido"

Decisión de alcance (10 ago 2026): el primer lanzamiento no es la app completa, es solo la experiencia de **una partida 1vs1 de principio a fin**, bien terminada. Todo lo demás viene después, una vez haya señal real de que el grupo repite.

### Dentro de esta fase

- Selección de cartas antes de empezar la partida: 2 de las 10 disponibles si son 9 hoyos, 4 si son 18.
- Uso de una carta durante la ronda: activarla, ver su efecto aplicado, feedback claro de que se jugó (y de que el rival gastó la suya si corresponde).
- Registro del resultado hoyo a hoyo (Stableford neto con golpes de hándicap aplicados).
- Pantalla de resultado final de la partida, con la actualización del Rango Birdix bien visible — este es el momento que más tiene que "pegar" visualmente, es el pago emocional de toda la partida.

### Fuera de esta fase (explícitamente no se diseña todavía)

Historial de partidas pasadas, progresión visual del Rango a lo largo del tiempo, perfiles, ligas/temporadas, más de un formato que 1vs1, onboarding para gente fuera del grupo del fundador.

## Reglamento completo de referencia

Ver `BIRDIX_REGLAMENTO.md` — sistema de puntos (Stableford neto), divisiones del Rango, y el detalle de las 10 cartas con sus reglas de mazo (cerrado el 10 de agosto de 2026).

## Público objetivo de este primer lanzamiento

No es diseño para público general todavía. Es para el propio grupo de golf del fundador: 5-6 jugadores de hándicap mixto (hasta hcp 6; el fundador juega hcp 19). Ya han preguntado por iniciativa propia cuándo estará lista.

## Principios de diseño no negociables (de `CLAUDE.md`)

- El Rango Birdix es el protagonista absoluto, nunca el hándicap.
- Cada acción debe transmitir progreso — especialmente la pantalla de resultado.
- Simplicidad real: debe funcionar igual de bien para alguien de 18 años que de 75. Pocos clics, botones grandes, jerarquía clara. Cada pantalla responde a una única pregunta: ¿qué necesita hacer el usuario ahora mismo?
- Referencias de calidad: Apple, Nike, Strava, Garmin, Spotify, Notion, Linear, Chess.com.
- Personalidad de marca: competitiva, moderna, cercana, elegante, innovadora, divertida, premium. Nunca infantil, nunca agresiva, nunca recargada.
- Las cartas son el gran diferenciador — su momento de juego debe sentirse memorable, no un trámite de checkbox.

## Contexto de negocio a tener en cuenta

Pre-producto, sin validación externa todavía. Este lanzamiento a un grupo de 5-6 personas *es* la validación, no una demo — por eso tiene que sentirse terminado y no "en pruebas". Aprovecha la ventana de verano (más luz, más actividad en clubes) para las primeras partidas.
