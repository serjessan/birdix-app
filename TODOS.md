# TODOS

## Arquitectura

### Rediseñar MatchPlayScreen para 2 dispositivos reales

**What:** Rediseñar la pantalla de partida 1vs1 (`MatchPlayScreen`, `App.jsx:2578-3186`)
para que cada jugador lleve su propio móvil — slots de carta por jugador (hoy hay un
único `cardId` por hoyo), estados "esperando al rival", y quitar el input manual
`ScoreInput label="Golpes rival"` (hoy un solo móvil apunta los golpes de los dos).

**Why:** Hoy es un solo dispositivo llevando el marcador de ambos jugadores. Pero
`holeResolution.js`, `matchSync.js` y `useMatchRealtime.js` (T1-T4, 19 ago 2026) están
diseñados enteramente para dos clientes separados, cada uno escribiendo solo su propio
lado — no se pueden conectar de verdad a la pantalla real tal como está hoy. Sin esto,
ninguna partida real funciona de extremo a extremo con cartas y Realtime.

**Context:** Descubierto por la voz externa (subagente Claude independiente) durante
`/plan-eng-review` de Approach B PR1, el 19 de agosto de 2026 — ni el eng review
original del 19 ago ni la primera pasada de este mismo review lo detectaron, porque
ninguno de los dos abrió el componente real de la pantalla de juego. Es probablemente
el trozo de trabajo más grande e incierto de todo el lanzamiento del 10 sept, y no
tenía su propia decisión hasta esta sesión (D7).

**Estado — `/plan-eng-review` de D7 completado el 21 ago 2026:** arquitectura cerrada
— cartas por dispositivo con revelado a nivel de interfaz (D8, D9, D11), golpes
cruzados con fallback de auto-registro si el marcador está offline (D8/D14),
resolución de hoyo simétrica por cliente (D10), nunca bloquea esperando al rival
(D12). La voz externa encontró 2 huecos bloqueantes que ni el eng review del 19 ago
ni la primera pasada de este mismo review habían visto: la política SELECT de
`match_players` no dejaba a un jugador leer la fila del rival (rompía tanto D9 como
el cálculo de hcp compartido) — corregida; y `matchSync.js` no comprobaba filas
afectadas, así que un UPDATE sobre una fila inexistente fallaba en silencio —
corregido. Ver
`~/.gstack/projects/usuario/usuario-main-eng-review-d7-20260821.md` para el detalle
completo.

**Estado — D7 construido y probado el 23 ago 2026:** implementado como un componente
nuevo, `RealMatchPlayScreen` (`App.jsx`, tras `MatchPlayScreen`), en vez de reescribir
`MatchPlayScreen` in situ — así el 2vs2/legacy sigue funcionando exactamente igual
mientras Approach B no llegue a esa pantalla. Cubre T1-T9 del eng review: RLS de
`match_players` corregida y verificada en vivo (creador puede crear, el otro jugador
lee su fila incluidas `selected_cards`, un no-participante ve 0 filas); `matchSync.js`
ahora falla si un UPDATE no afecta ninguna fila en vez de vaciar la cola en silencio;
selección de mazo por dispositivo, visible al rival (D9); golpes cruzados con
fallback de auto-registro; resolución conjunta por cliente escribiendo solo columnas
propias, con Escudo como única carta de revelado inmediato (necesita verse antes de
que el rival elija, D11); navegación y "Finalizar partida" nunca bloqueados;
indicador de reconexión wireado al punto de la cabecera; `cards_revealed` se escribe
cuando ambos han decidido. Se añadió además `listMyActiveMatches` (`src/lib/api/
matches.js`) — sin ella el jugador que no crea la partida no tenía forma de
descubrirla, un hueco que no estaba en el eng review original. 117/117 tests, build y
lint limpios (línea base de 25 problemas preexistentes en `App.jsx` sin subir).

Durante la revisión manual de T10 (sin jsdom/RTL en el repo, así que sin forma de
hacer click real) se encontraron y corrigieron 3 bugs que no estaban en el eng
review: (1) si ningún jugador jugaba carta en un hoyo, `hole_submitted` nunca se
marcaba y ese hoyo no se resolvía jamás — corregido cerrando la ventana de elección
en cuanto entra el primer golpe, con Segundo Golpe como única excepción explícita en
el selector de cartas (Decision 4); (2) el campo "Golpes de {rival}" tenía el `value`
atado al valor ya persistido en vez del buffer local de edición — el jugador no podía
escribir ni usar los steppers +/- del todo, la interacción más usada de toda la
pantalla estaba rota; (3) navegar de hoyo no limpiaba los buffers locales de golpes,
así que un valor a medio escribir en un hoyo se colaba como valor inicial del
siguiente.

**Pendiente real:** sin prueba manual de 2 dispositivos reales (no hay forma de
hacerlo en este entorno) — T10 solo puede completarse hoy con revisión de código
línea a línea + tests automáticos, no con un click-through real. También sigue
pendiente: si el rival crea la partida mientras ya estás en la pestaña "Partidas",
no la descubres hasta cambiar de pestaña o recargar (la búsqueda de partidas activas
no tiene canal Realtime propio, solo se dispara al montar/cambiar de pestaña) — bajo
riesgo para el grupo cerrado del fundador, pero real.

**Effort:** L
**Priority:** P1
**Depends on:** Ninguna — construido.

### Cierre completo de F6: apply_match_result acepta cualquier delta de suma cero

**What:** Cerrar de verdad el agujero por el que cualquiera de los dos jugadores puede
regalarse los puntos del otro. `apply_match_result` valida que el llamante sea jugador,
que existan 2 confirmaciones y que los deltas sumen cero, pero **no** la magnitud: el
ganador se deriva del signo del delta, no de los hoyos jugados. El cierre real exige que
el servidor recalcule el Stableford neto desde `match_holes` y compare la magnitud del
delta contra el resultado.

**Why:** Es el único camino que mueve Rango, y el Rango es el producto entero. Hoy es
aceptable (grupo cerrado, sin adversario real); deja de serlo con registro abierto.

**Disparador (no es un P3 a secas):** P3 hoy, **BLOQUEANTE antes de habilitar registro
público o de compartir la app fuera del grupo conocido.** Si se abre la app sin cerrar
esto, el primer jugador con curiosidad y las devtools abiertas se pone líder.

**Pros:** cierra la única superficie que mueve Rango. **Cons:** recalcular la magnitud
en servidor choca con la decisión vinculante de PR1 (la fórmula de Elo vive solo en
`rango.js`, nunca duplicada en SQL); hay que decidir cómo convive, y no es barato.

**Context:** detectado en `/plan-eng-review` del 5 nov 2026 (hallazgo F6). En ese mismo
review se añadieron a `apply_match_result` dos guardas **de dirección**, que NO cierran
esto: la del abandono (el ganador no puede ser `abandoned_by`) y la de Stableford (el
ganador declarado tiene que ser el de mayor Stableford acumulado, sumando
`match_holes.player_a_stableford` / `player_b_stableford`). Las dos son defensa en
profundidad, no cierre: esas columnas también las escribe el cliente y la política UPDATE
de `match_holes` es solo por fila, así que un cliente malicioso puede escribirlas.
**Tensión con D2 del mismo review:** `abandon_match` ahora escribe él mismo las 2 filas
de `match_confirmations`, así que el requisito de "2 confirmaciones" ya puede fabricarlo
el servidor — eso ensancha ligeramente F6 y obliga a que la guarda del ganador del
abandono sea hermética.

**Effort:** M
**Priority:** P3 (condicional: bloqueante antes de registro público)
**Depends on:** relacionado con "RLS por columna en match_holes" — sin esa restricción,
cualquier guarda basada en columnas de `match_holes` es falsificable.

### Permisos por columna en profiles: la fuga de email está CERRADA, verificar que sigue

**What:** Mantener cerrada la lectura de `profiles.email` desde la clave anónima. La
política RLS `profiles are viewable by everyone` tiene `qual = true` y deja leer todas
las columnas; el cierre no es RLS (Postgres no tiene RLS por columna) sino **permisos por
columna**: `revoke select on public.profiles from anon, authenticated` más un
`grant select (columnas permitidas)` que excluye `email`.

**Why:** La clave anónima viaja en el bundle, así que cualquiera que abriera la web podía
pedir `select=email` y descargarse los correos de los 5 jugadores reales, dos de ellos
fuera del círculo cercano. Datos personales de personas reales.

**Estado — cerrado en PR-A el 5 nov 2026** (`/plan-eng-review`). Antes de aplicar la
sentencia hubo que cambiar dos `select("*")` sobre `profiles` por listas explícitas de
columnas (`src/App.jsx:4363` y `:4454`): con permisos por columna, `select=*` se expande
a todas las columnas incluida `email` y la petición falla entera con 42501. El bundle
desplegado también los hacía, así que el SQL **no podía ir antes** del deploy del cliente
arreglado. La app no necesita `profiles.email`: los cuatro sitios que leen el correo lo
sacan de Auth (`authSession.user.email`, `data.user.email`), no de la tabla.

**Qué queda por vigilar:** cualquier `select("*")` nuevo sobre `profiles`, y cualquier
columna nueva en la tabla, que nace **sin** grant y por tanto invisible — un `select` que
la pida fallará con 42501 hasta que se añada al grant. Es el modo de fallo a recordar.

**Effort:** XS (vigilancia)
**Priority:** P3
**Depends on:** ninguna — ya aplicado.

### 2vs2 real contra Supabase (el flujo local se borró en PR-A)

**What:** Construir el 2vs2 de verdad contra Supabase: esquema de participantes para 4
jugadores y validación explícita de que las políticas RLS funcionan igual con 2 y con 4.

**Why:** El 2vs2 existía solo como flujo local contra `FAKE_RIVALS`, sin guardar nada. Un
2vs2 que no persiste y juega contra gente inventada es peor que no tenerlo: el primer
amigo que lo pruebe piensa que la app está rota.

**Estado — borrado, no oculto, en PR-A el 5 nov 2026.** La primera propuesta era ocultar
la opción y dejar el código en su sitio, pero el fundador detectó el choque: PR-A borra
`FAKE_RIVALS` y el flujo 2vs2 **depende** de él en 5 puntos verificados —
`buildTeamPlayers` (`App.jsx:401-403`), el `fallback` (`:422-424`), el draft inicial
(`:1400-1402`), la creación (`:1487-1488`) y `renderPlayerPicker`, que hace
`FAKE_RIVALS.map` (`:1571`). No se podían hacer las dos cosas: o se rompía el 2vs2, o
`FAKE_RIVALS` sobrevivía en el bundle para sostener código muerto e inalcanzable. Se
borró, que es lo coherente con ponytail y con "evitar deuda técnica desde el inicio".

**Cómo recuperarlo:** el código del 2vs2 vive en el commit **b1f5828** (rama `main`,
`github.com/serjessan/birdix-app`). `git show b1f5828:src/App.jsx` lo devuelve entero.

**Gate explícito:** no se construye el 2vs2 real hasta que el 1vs1 funcione con el grupo.
A 5 nov 2026: 5 jugadores registrados, **0 partidas completadas** — esa señal todavía no
existe. La premisa 5 del `/office-hours` del 9 ago ya dejó el 2vs2 sin fecha por esto
mismo.

**Effort:** XL
**Priority:** P3
**Depends on:** que una partida 1vs1 real se complete de principio a fin con el grupo.

### Columna sin uso: card_cancelled_reason

**What:** Decidir el propósito de `card_cancelled_reason` (columna singular en
`match_holes`, aparte de las dos por jugador `player_a_card_cancelled_reason`/
`player_b_card_cancelled_reason` que sí se usan) — o eliminarla si no tiene uso real.

**Why:** Hoy nadie la escribe ni la lee. Podría ser vestigial de una versión anterior
del esquema, o pensada para una nota compartida del hoyo que nunca llegó a
implementarse.

**Context:** Encontrada por la voz externa durante `/plan-eng-review` de D7
(`MatchPlayScreen`, 2 dispositivos), 21 ago 2026.

**Effort:** XS
**Priority:** P3
**Depends on:** Ninguna — barato de revisar cuando convenga.

### club_id real (autocompletar/crear contra la tabla clubs)

**What:** Sustituir el campo de texto libre "Campo en el que sueles jugar" del
onboarding (`OnboardingStepper`, `App.jsx:1107`, campo `club`) por un buscador/
autocompletar contra la tabla `clubs` real — crear el club si no existe.

**Why:** `profiles.club_id` ya es una referencia real a `clubs` (uuid, FK), no texto
libre — hoy el onboarding guarda un string suelto que nunca llega a `club_id`.

**Context:** Gap #3 de `REBUILD_ARCHITECTURE.md` (4 ago 2026). Confirmado
explícitamente fuera de alcance para el lanzamiento del 10 sept 2026 por el fundador
al arrancar `/plan-eng-review` de Approach B PR1 (19 ago 2026) — no hay funcionalidad
de clubes todavía que lo necesite de verdad.

**Effort:** S
**Priority:** P3
**Depends on:** Ninguna — barato de resolver cuando convenga.

### RLS por columna en match_holes

**What:** Añadir restricción RLS por columna en `match_holes` — cada jugador solo
debería poder escribir sus propios campos (`player_a_*` si eres player_a), no los del
rival. Hoy la política UPDATE es solo por fila (¿eres jugador de esta partida?), sin
restricción de qué columnas puede tocar.

**Why:** Verificado en vivo contra Supabase real (19 ago 2026): cualquier jugador
puede escribir hoy cualquier campo de la fila, incluidas las cartas/golpes del rival.
Aceptable en el grupo cerrado del fundador (sin adversario real), no aceptable si
Birdix se abre a gente que no se conoce.

**Context:** Descubierto por la voz externa durante `/plan-eng-review` de Approach B
PR1 (19 ago 2026) — fue la razón por la que D1 (un trigger de Postgres para la
resolución de Bloqueo) se revirtió a cliente-a-cliente: mover el cálculo al servidor
no protegía nada mientras las entradas siguieran siendo falsificables por columna.

**Actualizado tras `/plan-eng-review` de D7 (21 ago 2026):** el diseño de cómo escribe
cada cliente ya está cerrado (D8/D10/D11/D14 — marcado cruzado con fallback, cada uno
escribe su propio campo por convención de la app, no por restricción de la base de
datos). La voz externa señaló explícitamente que toda esa convención es solo eso —
convención, no impuesta por RLS — y cuestionó si merece la pena frente a un modelo
más simple; se decidió mantener la convención (D14) precisamente porque protege
contra carreras accidentales entre los 2 dispositivos, no solo contra manipulación.
Este TODO sigue siendo la pieza que falta para que esa protección sea real a nivel de
base de datos, no solo de convención de la app — ya no depende de diseñar D7 primero
(D7 ya está diseñado), solo de implementarlo.

**Effort:** M
**Priority:** P3
**Depends on:** Ninguna — D7 ya está diseñado, esto se puede abordar cuando convenga.

### Reestructuración completa (Approach B) + esquema de participantes en Supabase

**What:** Separar `src/App.jsx` (3400+ líneas) en `domain/`, `screens/`, `hooks/`, `lib/api/`, `constants/`, y cerrar el esquema de participantes por partida en Supabase (1vs1/2vs2, con validación explícita de que las políticas RLS funcionan igual con 2 y con 4 jugadores).

**Why:** Sin esto, cada cambio sigue tocando el mismo archivo único que ya se identificó como el problema de fondo del prototipo original, y no hay backend real conectado — bloquea escalar el núcleo pulido más allá del grupo del fundador.

**Context:** Aprobado como Approach B en `/office-hours` del 9 de agosto de 2026 (ver `~/.gstack/projects/birdix-app/usuario-unknown-design-20260809-000456.md`). El 10 de agosto, durante `/plan-eng-review` de reglas de mazo + fórmula del Rango, se decidió explícitamente separar este rebuild en su propia sesión en vez de mezclarlo con el cierre de reglas — para no combinar una reestructuración grande con un cambio de reglas de juego en el mismo PR. Debe cerrarse en su propio `/plan-eng-review` antes de tocar código de Matches.

**Estado — PR1 (datos reales) completado el 23 ago 2026:** partido en 2 PRs tras
`/plan-eng-review` (19/23 ago) — el split mecánico a `components/screens/hooks/` sigue
pendiente (ver abajo), pero PR1 (buscar rival real, crear partida atómica, cerrar
partida y actualizar Rango) ya está construido y probado: migraciones aplicadas en
Supabase (`match_players` RLS UPDATE/creación duplicada corregida, RPCs `create_match`/
`apply_match_result`/`get_match_context`, ambas probadas en vivo con cuentas reales,
no solo con mocks), `src/lib/api/matches.js` + `courses.js` (25 tests), `MatchesScreen`
sustituye FAKE_RIVALS/COURSES por datos reales. Durante la implementación se
descubrieron y corrigieron 2 huecos que no estaban en el eng review original:
`match_players`/`match_holes`/`match_confirmations` ya tenían datos de prueba de
mayo-junio 2026 (limpiados, ver decisión en gstack), y `match_confirmations` no tenía
restricción única por jugador (añadida). El split a carpetas (`components/`,
`screens/`) sigue sin empezar.

**Estado — D7 completado el 23 ago 2026:** partidas 1vs1 reales ya se juegan con
`RealMatchPlayScreen`, un componente nuevo — no una reescritura de `MatchPlayScreen`
in situ, que sigue intacto para 2vs2/legacy (ver TODO "Rediseñar MatchPlayScreen"
arriba para el detalle completo). `src/domain/stableford.js` y
`src/domain/matchHoleView.js` se extrajeron de la matemática inline de `App.jsx`
durante esta pieza — el split completo a carpetas sigue pendiente, pero ya no es
"todo o nada": la extracción se está haciendo pieza a pieza, cada vez que una nueva
funcionalidad necesita reutilizar lógica que antes solo vivía inline.

**Effort:** XL (el split de carpetas es lo único que queda de esta pieza)
**Priority:** P1
**Depends on:** None

### Efecto real de Escudo, Bloqueo y Segundo Golpe

**What:** Implementar la lógica real de estas 3 cartas (hoy solo se registra que se jugaron, sin ningún efecto en el juego).

**Estado — T1 completado el 19 ago 2026:** la lógica de dominio ya existe en
`src/domain/cards.js` (`isCardPlayable` bloquea selección con
`ctx.alreadyPlayedThisHole`/`ctx.rivalShieldActive`; `applyStablefordCardEffect` anula
con `ctx.cancelledByBlock` y recalcula con `ctx.secondShotBase`), con tests exhaustivos
en `cards.test.js` (33/33 verde).

**Estado — T2 completado el 19 ago 2026:** `src/lib/matchSync.js` ya existe —
`queueMatchHoleWrite({matchId, holeNumber, patch})` escribe contra `match_holes`
(columnas reales verificadas en Supabase: `player_a_card`, `player_a_strokes`, etc.),
con outbox en `localStorage` (clave `matchId:holeNumber`, patches fusionados — dos
llamadas para el mismo hoyo nunca duplican), reintento automático en `online` + cada
`intervalMs` vía `initMatchSync()`, y guarda de en-vuelo (`inFlight`) para que un doble
tap o un tick solapado con `online` no disparen dos peticiones a la vez. 13/13 tests
(offline, reintento, doble pulsación, cola persistida al reabrir, arranque sin
`window`). **Sin probar manualmente con DevTools offline todavía** — el eng review pide
esa prueba además de los tests automáticos, y no hay wiring a la UI real para hacerlo
(ver más abajo).

**Estado — T3 completado el 19 ago 2026:** `src/hooks/useMatchRealtime.js` ya existe —
`subscribeToMatchHoles` (framework-free, igual que T1/T2) se suscribe a `match_holes`
vía Postgres Changes filtrado por `match_id`, y si el canal cae (`CHANNEL_ERROR` /
`TIMED_OUT` / `CLOSED`) lo tira y crea uno nuevo tras un delay — reconexión de verdad,
no solo la del socket que ya trae Supabase por debajo. Reporta `'connected'` /
`'reconnecting'` — exactamente el estado que pide el indicador de "Estado de conexión"
de `DESIGN.md`. `useMatchRealtime(matchId, {onChange})` es el envoltorio de React (ref
para el callback, para no resuscribir en cada render). 10/10 tests sobre
`subscribeToMatchHoles` (UPDATE recibido, reconexión en los 3 estados de fallo,
desmontaje limpio, doble desmontaje idempotente, no acumula reconexiones tras
desmontar). **El hook de React en sí no tiene test propio** — no hay
jsdom/@testing-library/react en el repo y añadirlas solo para esto no encajaba con
ponytail; toda la lógica real vive en la parte framework-free, que sí está probada.

**Estado — T4 completado el 19 ago 2026:** `src/domain/holeResolution.js` ya existe —
`resolveHoleCards({playerCard, playerChoiceMade, rivalCard, rivalChoiceMade})` decide
si ya toca resolver el hoyo (los dos han elegido) y calcula qué carta queda anulada por
Bloqueo, lista para pasar como `ctx.cancelledByBlock` a `applyStablefordCardEffect` de
cada lado. 12/12 tests, incluido exactamente el caso que pide el eng review ("A juega
Todo o Nada, B juega Bloqueo" → ninguna aplica), probado de extremo a extremo
encadenando con `cards.js` de verdad, no solo con la función aislada. También incluye
`resolveMatchHoleRow(row)`, un envoltorio sobre una fila real de `match_holes` —
**con una interpretación de los campos `*_card_confirmed`/`*_hole_submitted` que no
está verificada contra una partida real** (documentado en el propio archivo): al no
existir todavía la pantalla que confirma cartas contra Supabase, no hay forma de
comprobar que esa lectura de columnas es la que el resto del sistema espera. Revisar
esa función específicamente cuando se construya esa pantalla — `resolveHoleCards` en
sí (la parte sin Supabase) no depende de esta interpretación y no hace falta tocarla.

**Estado — conectado el 23 ago 2026 (D7):** `RealMatchPlayScreen` (el reemplazo de
`MatchPlayScreen` para partidas reales, ver TODO "Rediseñar MatchPlayScreen" arriba)
sí llama a `queueMatchHoleWrite`, `useMatchRealtime` y `resolveHoleCards` de verdad.
Escudo, Bloqueo y Segundo Golpe ya tienen efecto real en cualquier partida 1vs1 real
creada desde el 23 de agosto. `MatchPlayScreen` (legacy/2vs2) sigue exactamente igual
que antes — sin tocar a propósito, sigue sin este wiring.

**Why:** Son 3 de las 10 cartas del reglamento oficial y hoy no hacen nada más allá de aparecer en el marcador — necesitan que ambos jugadores vean la misma jugada en el mismo instante (Escudo bloquea cartas rivales ese hoyo, Bloqueo cancela una carta concreta, Segundo Golpe repite un golpe), lo cual requiere sincronización en tiempo real.

**Context:** Decidido en `/plan-eng-review` del 10 de agosto de 2026: "registrar la jugada, sin lógica de efecto" es la solución elegida para el lanzamiento al grupo del fundador, precisamente porque Supabase Realtime (fase 3 del roadmap) no está conectado todavía. Revertido en `/plan-eng-review` del 19 ago 2026 (Decision 4): con Realtime entrando en este mismo sprint, se implementa el efecto real antes del 10 sept — ver
`~/.gstack/projects/birdix-app/usuario-main-eng-review-20260819-120126.md`.

**Effort:** L (todo T1-T4 hecho y probado; lo que queda es el wiring real a
`MatchPlayScreen`, que depende de la reestructuración Approach B)
**Priority:** P1 (subida desde P2 — ya no depende de que Realtime "llegue", Realtime ya
está aquí; el bloqueante real ahora es la reestructuración de `App.jsx`)
**Depends on:** Reestructuración completa (Approach B) — ver TODO de arquitectura más arriba.

### Verificar reglas de cartas en 2vs2

**What:** Confirmar que el enfoque cerrado el 10 de agosto (registrar sin efecto para las 5 cartas no-puntuables, el gate de elegibilidad de Remontada) funciona igual de bien en `TeamStablefordScreen` (2vs2), que tiene su propio switch de efectos separado del de 1vs1.

**Why:** Esta sesión se centró en el núcleo pulido 1vs1 según `BIRDIX_DESIGN_BRIEF.md`, sin tocar la lógica 2vs2 — evita que ambos formatos se desincronicen silenciosamente en las reglas de cartas.

**Context:** `TeamStablefordScreen` (`src/App.jsx:2200`) duplica parte de la lógica de `applyStablefordCardEffect` para el caso de equipos. 2vs2 no tiene fecha de construcción decidida (premisa 5 del `/office-hours` del 9 de agosto: se decide tras ver cómo va el 1vs1 real con el grupo), así que esto es barato de revisar cuando 2vs2 vuelva a estar sobre la mesa.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Indicador visual de reconexión Realtime

**What:** Punto de 6px sin texto ambiental en el hueco de simetría ya reservado en la
cabecera de Hoyo N (`MatchPlayScreen`, `App.jsx:2763` — hoy `<div className="h-10 w-10" />`
vacío). Invisible online, `mist #9CA3AF` con pulso lento al reconectar, destello
`greenLight #2D8E5C` (~600ms) al recuperar conexión. Única excepción de texto: franja
inline breve ("Carta guardada — se sincroniza sola") cuando se juega una carta sin
conexión — los golpes apuntados sin conexión no llevan tratamiento adicional.

**Why:** Sin ningún indicador, el jugador no puede distinguir "la app está colgada" de
"no hay cobertura, ya se arreglará solo" — y sin el requisito de no-bloqueo, arriesga que
la partida se quede parada en medio del campo, justo lo que el fundador señaló como
inaceptable en el `/plan-eng-review` del 19 ago.

**Context:** Surge del `/plan-eng-review` del 19 ago 2026 (ver
`~/.gstack/projects/birdix-app/usuario-main-eng-review-20260819-120126.md`), al cerrar el
diseño del canal Realtime. El principio de no-bloqueo ya queda fijado en Architecture
Decision 2/3 de ese documento. **Patrón visual cerrado el 19 ago 2026 en
`/design-consultation`** (ver sección "Estado de conexión" en `DESIGN.md`) — este TODO
ya no está bloqueado en diseño. **T3 completado el 19 ago 2026:**
`useMatchRealtime(matchId, {onChange})` (`src/hooks/useMatchRealtime.js`) ya devuelve
exactamente el estado que este indicador necesita — `status: 'connected' |
'reconnecting'` — así que la fuente de datos ya existe.

**Estado — construido el 23 ago 2026 (D7):** el punto de 6px ya está en la cabecera de
`RealMatchPlayScreen`, wireado a `useMatchRealtime`. `MatchPlayScreen` (legacy/2vs2)
sigue con el hueco vacío, sin tocar a propósito.

**Effort:** XS
**Priority:** P2
**Depends on:** T3 del eng review del 19 ago (hook `useMatchRealtime.js`)

### SVG del isotipo antes del manifest de PWA

**What:** Conseguir el isotipo (`birdix-isotipo-ix.png`, hoy 500×500 sin canal alfa) en
SVG antes de construir los íconos de instalación del PWA.

**Why:** El PNG actual rinde bien en los usos de hoy dentro de la app (32-36px, muy
sobremuestreado), pero los íconos de instalación PWA necesitan hasta 1024×1024 (maskable)
y transparencia para componer sobre fondos distintos — el archivo actual no cubre ninguna
de las dos cosas.

**Context:** Detectado el 19 ago 2026 en `/design-consultation` al actualizar `DESIGN.md`
(sección "Uso del logo"). No bloquea nada hoy — no existe todavía manifest de PWA en el
repo — pero conviene resolverlo antes de que alguien lo descubra construyendo los íconos
la semana del lanzamiento.

**Effort:** XS
**Priority:** P3
**Depends on:** Ninguna — barato de resolver cuando convenga, antes de tocar el manifest de PWA.

### Migrar login a magic link

**What:** Sustituir el login actual de email+contraseña (`signInWithPassword`/`signUp`
en `App.jsx:3239-3288`) por magic link (`supabase.auth.signInWithOtp`), sin contraseñas.

**Why:** Era la decisión original del brief de negocio del 19 ago 2026 (menos fricción
de registro), pero se descubrió durante el `/plan-eng-review` del mismo día que el login
de contraseña ya está construido y funcionando de verdad contra Supabase — migrar ahora
añadía riesgo innecesario a un calendario ya ajustado para el lanzamiento del 10 sept, sin
necesidad real para un grupo cercano de amigos que ya sabe usar contraseñas.

**Context:** Ver Decision 5 en
`~/.gstack/projects/birdix-app/usuario-main-eng-review-20260819-120126.md`. Vale la pena
revisitar cuando Birdix se abra a más gente que el círculo cercano del fundador, donde la
fricción de contraseña empieza a pesar más.

**Effort:** S
**Priority:** P3
**Depends on:** Ninguna — se puede hacer cuando convenga tras el 10 sept.
