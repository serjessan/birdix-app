# Design System — Birdix (núcleo pulido)

Generado por `/design-consultation` el 10 de agosto de 2026. Cubre las 7 pantallas del primer lanzamiento real (grupo del fundador): Inicio, Selección de mazo, Hoyo N, Marcador, Resultado, Perfil, Clasificación. No es un sistema nuevo desde cero — extiende lo ya documentado en [`branding/sistema-visual.md`](branding/sistema-visual.md) y lo ya construido en `src/App.jsx` (paleta `BX`, componentes base), y añade lo que faltaba para que el núcleo pulido tenga su propia voz en los momentos que importan.

## Product Context
- **Qué es:** Golf competitivo con progresión tipo videojuego — el Rango Birdix protagoniza sobre el hándicap — y 10 cartas estratégicas sin azar jugadas durante partidas reales.
- **Para quién, en este lanzamiento:** el grupo de golf del fundador, 5-6 jugadores de hándicap mixto (hasta hcp 6; el fundador juega hcp 19). Diseño pensado para 18-70 años a largo plazo, pero este primer lanzamiento es un círculo cerrado, no público general.
- **Espacio/referencias:** golf competitivo amateur. Calidad de referencia: Apple, Nike, Strava, Garmin, Spotify, Notion, Linear, Chess.com. Convención de categoría (mobile-first en campo): Golfshot, Arccos.
- **Tipo de proyecto:** app móvil-first (React + Vite + Tailwind), jugada con el móvil en la mano entre golpes, con sol directo. Backend Supabase todavía no conectado — `Perfil` y `Clasificación` usan datos de ejemplo hasta que exista.
- **Investigación externa:** no se hizo esta vez, a petición explícita — el sistema parte del manual de marca ya existente y del criterio de diseño aplicado en esta consulta.

## Aesthetic Direction
- **Dirección:** contención deportivo-premium con un pico de energía de juego controlado. Base minimalista y funcional (Apple/Strava) en ~90% de la interfaz; expresividad solo en los 2 momentos emocionales — revelar una carta, ver subir el Rango.
- **Nivel de decoración:** intencional como base (sutil, sin ruido), expresivo únicamente en esos 2 momentos.
- **Mood:** competitiva, moderna, cercana, elegante, innovadora, divertida, premium. Nunca infantil, nunca agresiva, nunca recargada — sin cambios respecto al manual de marca existente.
- **Por qué funciona:** si todo tuviera personalidad, nada destacaría. La contención en el resto es lo que hace que los 2 momentos clave se noten.

## Typography
- **Display / momentos clave únicamente** (número de Rango, "Oro III", nombre de carta al revelarse): **Big Shoulders**, peso 900. Elegida tras descartar varias rondas de candidatas más neutras (General Sans, Cabinet Grotesk, Fraunces, Clash Grotesk, Satoshi) por sentirse "de ordenador" — Big Shoulders tiene herencia real de señalética deportiva de estadio, mucho más "marcador/dorsal".
  - Carga: `https://fonts.googleapis.com/css2?family=Big+Shoulders:wght@700;900&display=swap`
- **Cuerpo / UI (todo lo demás, sin cambios):** Open Sans, pesos 400/600/700/800 — se queda exactamente como está hoy en `src/App.jsx`, sin tocar lo ya construido.
  - Carga: Fontsource vía jsdelivr (ya implementado — `useBirdixFont` en `App.jsx`).
- **Regla:** Big Shoulders NUNCA se filtra a texto operativo (listas, formularios, labels). Es la segunda voz tipográfica reservada a 2 momentos, no una sustitución general.
- **Escala aproximada:**
  - Número de Rango (Resultado, Perfil): 46–56px, Big Shoulders 900
  - División ("Oro III"): 13–24px, Big Shoulders 900
  - Nombre de carta en revelación: 15–16px, Big Shoulders 900
  - Título de sección (body): 17–20px, Open Sans 800
  - Cuerpo de texto: 13–15px, Open Sans 400/600
  - Botones: 13–15px, Open Sans 700
  - Labels/eyebrows: 9–11px mayúsculas, tracking amplio, Open Sans 700/800

## Color
Sin cambios respecto a [`branding/sistema-visual.md`](branding/sistema-visual.md) — se reutiliza tal cual el objeto `BX` ya implementado.

- **Primario:** verde Birdix `#00703a` (`greenDark #014F2A`, `greenLight #2D8E5C`, `greenFill #E6F4ED`)
- **Secundario:** coral `#D67560` (`coralDark #A8543F`, `coralFill #FBEAE3`) — nunca compite con el verde como acción principal
- **Neutros:** ink `#111827`, graphite `#1F2937`, slate `#6B7280`, mist `#9CA3AF`, border `#E5E7EB`, surface `#FFFFFF`, bg `#F9FAFB`, bgStrong `#F3F4F6`
- **Divisiones del Rango:** Bronce `#92400E` · Plata `#6B7280` · Oro `#CA8A04` · Platino `#0E7490` · Élite `#7C3AED` · Leyenda `#00703a` (cierra el círculo volviendo al verde de marca)
- **Pendiente técnico (no de diseño):** los anillos de división en el código (`DIVISIONS` en `App.jsx`) usan degradados Tailwind stock (`from-amber-700...`) que no coinciden con estos hex — alinear ambos al implementar.
- **Dark mode:** definido en esta consulta (nuevo) — no invierte planamente los tonos; verde se aclara ligeramente (`#1F9E63`) para mantener contraste sobre fondos oscuros (`bg #0B120E`, `surface #14201A`).

## Profundidad (nuevo en esta consulta)
Objetivo: romper la sensación de interfaz plana sin sobrecargar — el propio manual de marca exige "nunca recargada".

- **Sombra de superficie (por defecto en toda tarjeta/control):** dos capas — un filo de luz interior arriba (`inset 0 1px 0 rgba(255,255,255,.7)` en claro) + una sombra difusa suave abajo. Sustituye cualquier sombra plana de una sola capa.
- **Resplandor de color:** un halo difuminado, muy tenue, colocado **solo detrás de 3 elementos protagonistas**: el CTA principal de Inicio, la carta revelada, el anillo de división en Resultado. En ningún otro sitio.
- **Fondo:** un resplandor radial de marca casi imperceptible + grano fotográfico al 3.5% de opacidad, fijo, sin interacción.
- **Botones:** gradiente sutil claro→base→oscuro en vez de relleno plano, manteniendo la regla ya existente de sombra teñida de color (nunca gris genérica).

## Uso del logo (nuevo en esta consulta)
- **Isotipo únicamente** (marca cuadrada "iX"), en exactamente 3 sitios: barra superior de la app, cabecera de Inicio, sello pequeño en Resultado (como un sello de torneo que certifica el logro).
- **El wordmark completo nunca aparece dentro de las pantallas de la app** — el manual de marca ya lo reserva para cabeceras y contexto de marketing, no para "avatar de app, espacios reducidos" (eso es trabajo del isotipo). Regla existente, respetada sin cambios.

## Iconografía y emoji (nuevo en esta consulta — "camino intermedio")
- **Identidad de cada carta:** icono custom `lucide-react` + color de acento, consistente — se ve igual en iPhone y Android. El grupo del fundador no es 100% iPhone, así que esto no es opcional.
- **Emoji reales:** permitidos, pero solo en momentos de calidez — saludo, confirmaciones, tag de victoria, iconos de navegación. Nunca como identidad estructural de una carta.
- **Ilustración propia por carta:** fuera de alcance de esta consulta, explícitamente pospuesta por decisión del propio equipo — ver Fase 4 del roadmap en `CLAUDE.md` (skill "Birdix Card Designer" pendiente de crear). El marco que la va a contener (icono, tipografía, animación de revelación) ya queda cerrado aquí.

## Layout
- **Enfoque:** grid-disciplined, mobile-first a una columna, ancho de referencia 390px.
- **Densidad:** espaciado generoso, especialmente en Hoyo N y Selección de mazo — se usan al aire libre, a una mano, entre golpes.
- **Radios de esquina:** sin cambios — `rounded-xl`/`rounded-2xl` controles y botones, `rounded-3xl` tarjetas, `rounded-full` pills/avatares/anillos.

## Navegación (nuevo en esta consulta)
- **Un único menú fijo abajo** (Inicio / Perfil / Ranking), presente en las 7 pantallas, sin excepciones ni patrón alternativo — decisión explícita de simplicidad sobre personalización por pantalla.
- **Guardrail sin UI nueva:** si el jugador toca una pestaña estando a mitad de un hoyo (partida en curso), se pide confirmación ("¿Seguro? Perderás el progreso de esta partida") antes de navegar fuera. Protege lo único que de verdad se puede perder, sin añadir ningún elemento visual permanente.

## Motion
- **Base:** minimal-functional — solo transiciones que ayudan a entender, nunca distraen (importante para el rango de edad 18-75).
- **Picos coreografiados, solo en 2 momentos:**
  - **Revelar carta:** un flip seco y con peso — la carta ya estaba elegida, solo se revela. **Nunca** una animación de barajar, ruleta o brillo aleatorio: el reglamento es explícito en que las cartas nunca dependen del azar, y la animación tiene que decirlo sin palabras.
  - **Resultado:** el anillo de división se rellena y el número de Rango cuenta hacia su valor final.

## Las 7 pantallas
| # | Pantalla | Rol |
|---|----------|-----|
| 0 | Inicio | Entrada — CTA "Crear partida" + accesos a Perfil/Clasificación |
| 1 | Selección de mazo | Elegir 2 cartas (9 hoyos) o 4 (18 hoyos) de las 10 |
| 2 | Hoyo N | Plantilla que se repite por hoyo — golpes + jugar carta + revelación, fusionados en una sola pantalla |
| 3 | Marcador | Vista de apoyo, accesible desde el hoyo — no el centro de la interacción |
| 4 | Resultado | El pago emocional — Rango actualizado, protagonista absoluto |
| 5 | Perfil | Añadida en esta consulta (ver nota de alcance) — datos de ejemplo |
| 6 | Clasificación | Añadida en esta consulta (ver nota de alcance) — datos de ejemplo |

## Nota de alcance
Perfil y Clasificación quedaban explícitamente fuera de lo que cerró `BIRDIX_DESIGN_BRIEF.md` el 10 de agosto de 2026 para este primer lanzamiento. A petición del equipo se diseñan ya, con contenido de ejemplo porque Supabase aún no está conectado. `BIRDIX_DESIGN_BRIEF.md` se actualiza en el mismo commit que este documento para reflejarlo.

## Decisions Log
| Fecha | Decisión | Motivo |
|---|---|---|
| 10 ago 2026 | Sistema de diseño inicial propuesto (Cabinet Grotesk + General Sans, profundidad plana) | Primera pasada de `/design-consultation`, partiendo del manual de marca existente |
| 10 ago 2026 | Se añaden Inicio, Hoyo N (golpes+carta fusionados) y se amplía a Perfil/Clasificación | Feedback directo: faltaba puerta de entrada y pantalla de golpes; alcance ampliado a petición expresa pese a exceder `BIRDIX_DESIGN_BRIEF.md` |
| 10 ago 2026 | Camino intermedio en iconos/emoji + tipografía más cálida (General Sans) | Riesgo de inconsistencia emoji entre iPhone/Android (grupo mixto) + límite de marca "nunca infantil" |
| 10 ago 2026 | Profundidad de 2 capas + resplandor contenido + logo real (isotipo) en 3 sitios | Feedback: "diseño muy plano", quería el logo integrado |
| 10 ago 2026 | Tipografía de momentos clave → Big Shoulders 900 (tras descartar General Sans, Cabinet Grotesk, Fraunces, Clash Grotesk, Satoshi) | Feedback repetido: las anteriores se sentían "de ordenador"; dirección pedida explícitamente: bold deportivo tipo marcador/dorsal |
| 10 ago 2026 | Navegación: un único menú fijo abajo en las 7 pantallas, sin excepción | Simplificación explícita sobre la propuesta híbrida inicial (tab bar + botón atrás) |
| 10 ago 2026 | Ilustración propia por carta queda fuera de esta consulta | Decisión propia del equipo, ya marcada como "más adelante" — fase 4 del roadmap |
