# Design System — Birdix (núcleo pulido)

Generado por `/design-consultation` el 10 de agosto de 2026, actualizado el 19 de agosto de 2026. Cubre las 8 pantallas del primer lanzamiento real (grupo del fundador): Login/Registro, Inicio, Selección de mazo, Hoyo N, Marcador, Resultado, Perfil, Clasificación. No es un sistema nuevo desde cero — extiende lo ya documentado en [`branding/sistema-visual.md`](branding/sistema-visual.md) y lo ya construido en `src/App.jsx` (paleta `BX`, componentes base), y añade lo que faltaba para que el núcleo pulido tenga su propia voz en los momentos que importan.

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

## Uso del logo (nuevo en esta consulta; refinado el 19 ago 2026)
- **Isotipo únicamente** (marca cuadrada "iX"), en exactamente 3 sitios dentro de la app: barra superior de la app, cabecera de Inicio, sello pequeño en Resultado (como un sello de torneo que certifica el logro). Añadido 19 ago: también en el formulario de Login/Registro (ver más abajo).
- **El wordmark completo nunca aparece dentro de las pantallas de la app** — el manual de marca ya lo reserva para cabeceras y contexto de marketing, no para "avatar de app, espacios reducidos" (eso es trabajo del isotipo). Regla existente, respetada sin cambios.
- **Excepción explícita — bienvenida pre-login (`AuthScreen`, `mode === "welcome"`):** único lugar de la app donde el wordmark se mantiene. Es el primer contacto de alguien sin sesión — más cerca de una splash de marketing que de una pantalla operativa, así que se trata como el manual de marca trata cabeceras/marketing, no como "avatar de app". El formulario que sigue (login/registro, `mode !== "welcome"`) sí es flujo operativo — usa isotipo, igual que el resto de la app. **Pendiente técnico:** hoy el componente `Logo` (`App.jsx:583`) usa `wordmark-white` por defecto en ambos casos — corregir el formulario de login/registro a `variant="isotipo"` al implementar.
- **Rutas reales de los assets** (antes solo descritas conceptualmente): `public/branding/logos/birdix-isotipo-ix.png`, `birdix-wordmark-blanco-sobre-verde.png`, `birdix-wordmark-verde-sobre-blanco.png`. PNG 500×500, sin canal alfa (fondo sólido incluido en el archivo).
- **Pendiente técnico (no bloqueante para el 10 sept):** el PNG a 500×500 rinde bien en los usos actuales dentro de la app (32–36px, muy sobremuestreado incluso a 3x). El riesgo real es de cara al PWA — íconos de instalación necesitan hasta 1024×1024 (maskable) y el archivo actual no tiene transparencia para componer sobre fondos distintos. Conseguir el isotipo en SVG antes de construir el manifest de PWA (ver TODOS.md).

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

## Estado de conexión (nuevo — 19 ago 2026)
Cierra el gap explícito que dejó abierto el `/plan-eng-review` del 19 de agosto: el canal Realtime nunca bloquea la partida (principio ya fijado en arquitectura — el jugador sigue apuntando golpes y jugando cartas con normalidad si se cae la conexión), pero faltaba el patrón visual. Segunda opinión de un subagente Claude independiente incorporada (Codex no estaba instalado en esta sesión).

- **Dónde vive:** un punto de 6px en el hueco de simetría ya reservado en la cabecera fija de Hoyo N (`MatchPlayScreen`, `App.jsx:2763` — hoy un `<div className="h-10 w-10" />` vacío que balancea el botón de cerrar). Cero layout nuevo, presente en cada hoyo. No junto al isotipo — Hoyo N no es uno de los 3 sitios del isotipo (ver "Uso del logo"), así que ese emparejamiento no existe en esta pantalla.
- **Online (por defecto):** sin punto. Invisible es el estado normal — importa más que cómo se ve degradado.
- **Reconectando:** punto en `mist #9CA3AF` (nunca ámbar/rojo — el ámbar ya está tomado por la división Oro y acentos de carta; usarlo aquí mandaría la señal equivocada). Un pulso lento único (opacidad 0.4→1, ~2s ease), nunca un spinner girando.
- **Vuelve la conexión:** destello breve en `greenLight #2D8E5C` (~600ms) y desaparece. Nunca desaparece en silencio — un jugador que nunca ve confirmación puede desconfiar de si sus golpes se guardaron de verdad.
- **Sin texto ambiental, nunca.** Ni "reconectando…" ni "sin conexión" — el color solo ya lleva el mensaje completo; coherente con "sin jerga, botones grandes" para el extremo de 70 años del rango de edad.
- **Excepción — carta jugada sin conexión:** única acción de suficiente peso (es el diferenciador entero del producto) para ganarse una línea de texto — franja inline breve (~1.5s) bajo la acción de la carta: "Carta guardada — se sincroniza sola." Nunca "reintentar", nunca implica una decisión del jugador. Los golpes apuntados sin conexión no llevan ningún tratamiento adicional más allá del punto ambiental — son de bajo riesgo y alta frecuencia; una confirmación en cada uno sería ruido.
- **Por qué no un banner/hoja inferior tipo "estás sin conexión":** ese patrón asume que estar offline es excepcional y hay que disculparse por ello. En un campo de golf es un martes cualquiera — hacerlo más ruidoso que un punto violaría el propio principio de "nunca bloquea" que fijó la arquitectura.

## Las 8 pantallas
| # | Pantalla | Rol |
|---|----------|-----|
| — | Login/Registro | `AuthScreen` — bienvenida (wordmark, único sitio) + formulario (isotipo, utilitario) — ver "Uso del logo" |
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
| 19 ago 2026 | Indicador de reconexión Realtime: punto de 6px en el hueco de simetría de la cabecera de Hoyo N, sin texto ambiental, verde al recuperar conexión | Cierra el gap explícito dejado por `/plan-eng-review` del 19 ago; segunda opinión (subagente Claude) descartó banner/toast por implicar que estar sin cobertura es excepcional, cuando en campo es rutina |
| 19 ago 2026 | Login/Registro entra al inventario de pantallas: bienvenida mantiene wordmark (único sitio en la app, por ser pre-sesión/marketing), formulario pasa a isotipo | `AuthScreen` ya funcionaba en código sin tratamiento de sistema de diseño; el wordmark en el formulario violaba la regla ya cerrada de "nunca dentro de pantallas de la app" |
| 19 ago 2026 | Rutas reales de logo documentadas; SVG del isotipo marcado como pendiente antes del manifest de PWA | Los PNG ya están en `public/branding/logos/` y en uso; a 500×500 sin alfa funcionan hoy pero no sirven para íconos de instalación (hasta 1024×1024) que exige el lanzamiento PWA del 10 sept |
| 25 ago 2026 | Color de acento por carta pasa de tonos sky/amber/fuchsia/violet (fuera de paleta) a solo verde/coral: verde si el efecto solo te beneficia a ti, coral si actúa directamente sobre el rival — el tipo (Reacción/Defensa/Ofensiva/Sabotaje) lo sigue llevando el chip de texto, no el color | Feedback tras la primera partida real: mazo "desordenado"; `/design-consultation` de refinamiento de cartas en partida — mantener todo dentro de la paleta BX ya cerrada, en vez de sumar 4 familias de color nuevas |
| 25 ago 2026 | Big Shoulders 900 se amplía de Rango/división/nombre de carta a también el número de puntos ganados en la hoja de revelación del efecto (nueva, ver siguiente decisión) | Mismo momento emocional que ya usaba esa tipografía — coherencia entre los picos de energía del sistema en vez de una tercera familia tipográfica |
| 25 ago 2026 | Nueva hoja de revelación del efecto de carta (`RealMatchPlayScreen`): se abre una sola vez por hoyo, en el instante en que ambos jugadores han decidido su jugada (`cardsRevealed` pasa a verdadero) mientras el jugador sigue viendo ese hoyo — si navega a otro hoyo antes, no reaparece retroactivamente al volver | Hoy el efecto se aplica en silencio, sin ningún aviso; debía respetar la regla dura del reglamento de que Bloqueo depende de que nadie vea la jugada del rival hasta que ambos hayan decidido — mismo "flip seco y con peso" ya reservado a revelar carta, aplicado por primera vez al flujo de 2 dispositivos |
| 25 ago 2026 | Indicador de "carta en juego" durante el hoyo se eleva de píldora entre otros elementos a banda de ancho completo justo debajo de "Puntos del hoyo", reutilizando el pulso `mist`→verde ya definido para el indicador de conexión (sin resplandor de color nuevo) | Feedback: las cartas son "el corazón de Birdix, no una funcionalidad más" y no se notaban en pantalla; se mantiene la regla de resplandor reservado a los 3 sitios ya cerrados, sin abrir un cuarto |
| 25 ago 2026 | Selección de mazo se reorganiza: cartas agrupadas por tipo (Ofensiva/Defensa/Sabotaje/Reacción) con subtítulos, contador de texto sustituido por barras de huecos del mazo que se llenan | Feedback: pantalla "desordenada y con diseño pobre" — grid plana de 10 sin jerarquía ni contexto para decidir 2-4 cartas a ciegas |
