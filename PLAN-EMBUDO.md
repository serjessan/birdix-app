# Embudo de partida — arquitectura para /plan-eng-review

**5 nov 2026.** Entrada para `/plan-eng-review` en Claude Code. No implementar sin pasar por ahí primero.

Decisiones tomadas por Sergio en esta sesión:
- Embudo estricto **solo en la configuración**. Durante el juego se mantiene el diseño no bloqueante de D7/D12/D14.
- Abandono = derrota **con umbral**: antes del hoyo 3 se cancela sin efecto; a partir de ahí, quien abandona pierde y el rival gana. Cancelación acordada por ambos: sin efecto en ningún caso.
- Se construye el **embudo completo de una vez**, no por parches.

## Por qué esto no se puede desplegar a medias

La app en producción llama a `create_match` esperando una partida ya `active` con el mazo incluido. Cambiar la función sin cambiar el cliente rompe la versión instalada en los 5 móviles. **La migración de Supabase y el deploy del cliente tienen que salir juntos.** Sergio avisa cuando vaya a hacer el push y la migración se aplica en ese momento.

## El esquema ya soporta el embudo — la función se lo salta

Esto no hay que inventarlo. Ya existe desde agosto:

- `matches.status` acepta: `pending`, `active`, `review`, `confirmed`, `cancelled`, `abandoned`.
- `match_players` tiene `accepted_at`, `deck_confirmed_at`, `opened_at`.

El problema es `create_match`: crea la partida directamente como `active`, marca `accepted_at` del rival **sin preguntarle**, e inserta el mazo del creador en el mismo golpe.

### De ahí sale el bug de la carta repetida

`match_player_decks` tiene clave primaria `(match_id, user_id)` — una fila por jugador y partida. `create_match` ya inserta esa fila. Cuando la interfaz vuelve a pedir cartas y lo intenta guardar otra vez, es un duplicado de clave primaria y revienta sin dejar continuar. La segunda pantalla de cartas no está "de más": el mazo ya estaba commiteado antes de mostrarla.

El embudo lo arregla de raíz, porque la elección de mazo sale de `create_match` y pasa a ser un paso propio que ocurre **una sola vez**.

## Máquina de estados

Los sub-pasos del embudo **no llevan estados nuevos**: se derivan de los timestamps que ya existen. Un solo `pending` cubre toda la configuración.

| Situación | Cómo se detecta |
|---|---|
| Esperando que el rival acepte | `status = 'pending'` y `accepted_at` del rival es NULL |
| Ambos aceptaron, eligiendo cartas | `status = 'pending'`, ambos `accepted_at` puestos, algún `deck_confirmed_at` NULL |
| Partida en juego | ambos `deck_confirmed_at` puestos → `status = 'active'`, `started_at = now()` |
| Jugada, pendiente de confirmar resultado | `status = 'review'` (flujo actual con `match_confirmations`) |
| Resultado aplicado | `status = 'confirmed'` |
| No se jugó | `status = 'cancelled'` — sin efecto en el Rango |
| Abandonada pasado el umbral | `status = 'abandoned'` — derrota para quien abandona |

## RPCs

### 1. `create_match(course_id, player_b_id, holes_count)` — CAMBIA

- **Quitar el parámetro `selected_cards_a`.** La validación de tamaño de mazo y de ids de carta válidos se mueve a `confirm_deck`.
- Crear con `status = 'pending'`, sin `started_at`.
- `accepted_at = now()` solo para el creador (proponer implica aceptar). Para el rival, **NULL**.
- **No insertar nada en `match_player_decks`.**
- Mantener la creación de las filas de `match_holes` y la validación de que el campo tiene los hoyos configurados: es una comprobación útil en el momento de proponer.
- **Nuevo rechazo:** si cualquiera de los dos jugadores ya tiene una partida en `pending` o `active`, fallar con un mensaje claro. Una partida viva por jugador como máximo. Esto previene de golpe las partidas huérfanas y el caso de varias activas a la vez, que hoy rompería la consulta de partida activa del Home.

### 2. `respond_to_match(match_id, accept boolean)` — NUEVA

- Solo el rival (`player_b`), solo si `status = 'pending'`.
- `accept = true` → `accepted_at = now()`.
- `accept = false` → `status = 'cancelled'`. No afecta al Rango.

### 3. `confirm_deck(match_id, selected_cards text[])` — NUEVA

- Cualquiera de los dos jugadores, solo si `status = 'pending'` y **ambos** tienen `accepted_at`.
- Valida tamaño según `holes_count` (2 cartas si 9 hoyos, 4 si 18) y que los ids estén entre las 10 cartas válidas.
- Inserta en `match_player_decks` y pone `deck_confirmed_at`.
- **Si ya tiene `deck_confirmed_at`, fallar con un mensaje explícito** ("ya has confirmado tu mazo"), nunca dejar que salte el error de clave primaria. Es la clase de bug que bloqueó a Sergio.
- Si tras esta llamada **ambos** tienen `deck_confirmed_at` → `status = 'active'`, `started_at = now()`.

### 4. Cancelar y abandonar

Hace falta una columna nueva en `matches`: `cancel_requested_by uuid` (nullable) y `abandoned_by uuid` (nullable). Sin `abandoned_by` la regla de quién pierde no se puede verificar en servidor.

Progreso = número de hoyos con golpes enviados por ambos jugadores.

**Si `status = 'pending'`:** cualquiera de los dos cancela → `cancelled`, sin efecto. Directo, sin confirmación del otro.

**Si `status = 'active'` y progreso < 3 hoyos:** cualquiera cancela → `cancelled`, sin efecto.

**Si `status = 'active'` y progreso >= 3 hoyos**, dos caminos distintos en la interfaz:
- *"Pedir cancelación al rival"* → marca `cancel_requested_by`. Si el otro también cancela → `cancelled`, **sin efecto para ninguno**. Es la cancelación acordada.
- *"Abandonar"* → `status = 'abandoned'`, `abandoned_by = quien llama`, `winner_id` = el otro, `finished_at = now()`. **Con aviso claro de que cuenta como derrota antes de confirmar.**

### 5. Aplicar el Rango en un abandono

Restricción que no se puede romper: **la fórmula de Elo vive solo en `rango.js`** y no se duplica en SQL (decidido en PR1). Y el abandono no puede depender de que el que abandona colabore en calcular su propio castigo.

Diseño propuesto, **a validar en `/plan-eng-review`**: `abandon_match` solo registra el abandono (status, `abandoned_by`, `winner_id`, `finished_at`). El Rango lo aplica el primer cliente que cargue la partida después, llamando a `apply_match_result` — que hay que relajar para que acepte partidas en `abandoned` **sin exigir las 2 confirmaciones**, manteniendo la validación de suma cero y añadiendo que el ganador tiene que ser el jugador que **no** abandonó.

Es el punto más delicado de todo el bloque: toca la única función que mueve puntos de Rango. Revisar con cuidado.

## Partidas que se quedan colgadas

Con el límite de una partida viva por jugador, una invitación sin responder bloquea a los dos. Hace falta salida:

- Una partida en `pending` con más de 24 h se considera caducada: no cuenta para el límite y cualquiera de los dos la puede cerrar como `cancelled`.
- Implementarlo en carga (perezoso), no con un cron. Si más adelante molesta, se añade tarea programada.

## Qué entra en el mismo deploy

Estos tres son independientes del embudo y baratos, así que viajan en el mismo bloque y no esperan:

1. **Bug bloqueante del Home:** la consulta de partida activa pide `selected_cards` dentro de `match_players` y devuelve **400 en cada carga**. Esa columna está en `match_player_decks`. Ojo: la política RLS solo deja ver el mazo **propio** (es intencional, D11) — pedir solo el del usuario actual, no ampliar la política.
2. **Quitar "Buscar rival" del Home.** Punto 1 del QA del 25 de agosto. Los logs de producción confirman que la búsqueda que se usa es la de dentro de crear partida.
3. **Borrar los jugadores ficticios** (`FAKE_RIVALS` y mocks en `src/`). En Supabase los 5 perfiles son reales; lo ficticio está solo en código.

## Ya arreglado en Supabase (no tocar)

`GRANT SELECT, INSERT ON public.match_player_decks TO authenticated` — migración `grant_match_player_decks_to_authenticated`, 5 nov. Era la única tabla de las nueve sin permisos de tabla para `authenticated`: tenía políticas RLS correctas pero sin `GRANT` por debajo, y eso devolvía 403 en `create_match`. Es lo que bloqueó a Ignacio ayer.

**Lección para las tablas que vengan:** RLS filtra filas, el `GRANT` da acceso a la tabla. Una política sin `GRANT` no protege, bloquea. Comprobarlo en cada tabla nueva.

## Estado real a 5 nov 2026

5 jugadores registrados, **0 partidas creadas**. Nadie ha conseguido empezar una partida todavía.

| Jugador | Registro |
|---|---|
| `SERGIO SANCHEZ#2356` | 4 nov, 09:44 |
| `FITO#8464` | 4 nov, 11:06 |
| `Raúl Sanz#7068` | 4 nov, 12:52 |
| `Raúl Sánchez Borrego#5568` | 4 nov, 13:26 |
| `Ignacio#7786` | 4 nov, 15:41 |

Ignacio se registró e intentó crear partida **ocho veces en 50 segundos** antes de irse. Es gente real esperando, y el núcleo está bloqueado por completo.

---
---

# REVISIÓN DE INGENIERÍA — /plan-eng-review

**Objetivo de la revisión (fijado en el Scope gate):** este documento,
`embudo-partida-arquitectura.md`.
**Fecha:** 5 nov 2026 · **Rama:** main · **Commit:** b1f5828
**Base de tests:** 138 tests en 9 ficheros, todos en verde (`npm test`, vitest 4.1.10).

`SPEC-username-y-limpieza-ficticios.md` queda marcado obsoleto por decisión del
fundador: el username elegido se descartó a favor de identidad estilo Riot ID
(`profiles.tag`, integer, default `1000 + floor(random()*9000)`, ya en producción y
verificado — `SERGIO SANCHEZ#2356`). Lo único vivo de ese spec es borrar
`FAKE_RIVALS`, que se recoge aquí.

## Índice de hallazgos y decisiones

Los hallazgos se presentaron primero en el chat como S0-1…S0-4 y al escribirse pasaron a
la numeración F. Equivalencias:

| Nombre en el chat | Nombre en este documento |
|---|---|
| S0-1 (producción corre una build vieja) | **F1** |
| S0-2 (barredor de 30 minutos) | **F2** |
| S0-3 (`SECURITY DEFINER` y la guarda en vacío) | **F3** |
| S0-4 (abandono sin relajar `apply_match_result`) | **R1 / D2** (pasó de hallazgo a decisión) |

### Las 6 decisiones

| ID | Decisión | Elección | Dónde |
|---|---|---|---|
| D1 | Secuencia de entrega | Desplegar `main` hoy (PR-A), embudo después (PR-B) | Scope Challenge |
| D2 | Rango al abandonar | Confirmaciones firmadas por el servidor; `apply_match_result` intacta y con una guarda más | R1 |
| D3 | Partidas colgadas | Caducidad derivada, cero barredores | R2 |
| D4 | Permisos de escritura | Las 4 RPCs `SECURITY DEFINER` + `is_match_participant` + revoke/grant de execute | R3 |
| D5 | Ver la invitación | Consulta ampliada + **dos** canales Realtime con filtros distintos | R4 |
| D6 | Tests de SQL | pgTAP con `set local role authenticated`; checklist manual obligatoria | R5 |
| — | Guarda de dirección | Stableford acumulado, sin reabrir la decisión de PR1 | R6 |

### Los 16 hallazgos

| ID | Severidad | Resumen |
|---|---|---|
| F1 | CRITICAL | Producción corre una build de antes del 27 ago; 2 de los 3 extras ya están en `main` |
| F2 | CRITICAL | El barredor de 30 min marca `abandoned` sin actor y borra una vuelta real a media partida |
| F3 | CRITICAL | Sin `SECURITY DEFINER`, media máquina de estados falla solo para el segundo jugador y la guarda de una-partida-viva pasa en vacío |
| F4 | CRITICAL | El invitado no tiene forma de enterarse de la invitación |
| F5 | INFO | Cambiar la firma de `create_match` da un 404 PGRST202 opaco |
| **F6** | INFO | `apply_match_result` acepta cualquier delta de suma cero de cualquiera de los dos jugadores |
| F7 | INFO | `match_confirmations` tiene dos restricciones UNIQUE idénticas |
| **F8** | INFO | `private.is_match_participant` es ejecutable por PUBLIC y por `anon` |
| F9 | CRITICAL | `confirm_deck` como DEFINER podría escribir el mazo del rival si aceptase un `user_id` |
| F10 | CRITICAL | Los mensajes de error de las RPCs se muestran al jugador tal cual, en inglés |
| F11 | INFO | El tamaño de mazo está escrito en tres sitios |
| F12 | INFO | `confirmDeck` (cliente) y `confirm_deck` (RPC) harían lo mismo |
| F13 | INFO | El embudo añade su quinta función a `src/App.jsx` (4725 líneas) |
| F14 | INFO | Falta el diagrama de la máquina de estados donde vive el código |
| F15 | INFO | `listMyActiveMatches` trae 18 filas de `match_holes` para obtener un entero |
| F16 | INFO | La guarda de una-partida-viva no tiene índice que la sostenga |

### Los 3 TODO

Escritos en `TODOS.md` (líneas 79, 116 y 144). Detalle y dispositions en
`## Dispositions de TODOS.md`.

1. **Cierre completo de F6** — P3 con disparador escrito: bloqueante antes de habilitar
   registro público. Las 2 guardas de dirección de R1/R6 son defensa en profundidad, no
   cierre.
2. **Permisos por columna en `profiles`** — fuga **actual** del email de 5 personas
   reales. Se cierra en PR-A, después de cambiar los dos `select("*")`.
3. **2vs2 real contra Supabase** — el flujo local se borra en PR-A (dependía de
   `FAKE_RIVALS` en 5 puntos). Recuperable desde el commit `b1f5828`.

## Filas de realidad (reality rows)

### premise-table

| Premisa | Afirmación del documento | Recibo (file:line) | Veredicto |
|---|---|---|---|
| P1 | `matches.status` acepta pending/active/review/confirmed/cancelled/abandoned | Supabase, check constraint en `matches.status` | TRUE |
| P2 | `match_players` tiene `accepted_at`, `deck_confirmed_at`, `opened_at` | Supabase, columnas de `match_players` | TRUE |
| P3 | `create_match` crea como `active`, pone `accepted_at` del rival sin preguntarle e inserta el mazo del creador | `pg_get_functiondef(create_match)`: `values (p_course_id, v_player_a, 'active', ...)`, `insert into match_players (... accepted_at) select ... now() ... where p.id = p_player_b_id`, `insert into match_player_decks (...) values (v_match_id, v_player_a, p_selected_cards_a)` | TRUE |
| P4 | `match_player_decks` tiene PK `(match_id, user_id)` | Supabase, `primary_keys: [match_id, user_id]` | TRUE |
| P5 | La app en producción llama a `create_match` esperando partida ya `active` con mazo incluido | edge_logs 4 nov: `POST /rpc/create_match` con 4 argumentos | TRUE |
| P6 | Bug del Home: la consulta pide `selected_cards` dentro de `match_players` y devuelve 400 en cada carga | edge_logs 4 nov: `GET 400 ...match_players(side,user_id,points_before,birdix_hcp_at_match,selected_cards,profiles(full_name))` | **TRUE en producción, FALSE en el repo** — `src/lib/api/matches.js:146` ya pide `match_player_decks ( user_id, selected_cards )`; corregido en a7cd7c8 (27 ago) |
| P7 | La RLS solo deja ver el mazo propio (D11) | `pg_policies`: `players can view only their own deck`, qual `(user_id = auth.uid())` | TRUE |
| P8 | El `GRANT` de `match_player_decks` era lo que devolvía 403 en `create_match` | edge_logs 4 nov: 8× `POST 403 /rpc/create_match`; hoy `information_schema.role_table_grants` da `INSERT,SELECT` a `authenticated` | TRUE |
| P9 | 5 jugadores registrados, **0 partidas creadas** | `select count(*) from matches` = 1: `2d4784de-25d2-4302-8220-290513baee04`, `status='active'`, `started_at` 2026-11-05 12:10:23Z | **FALSE** — existe 1 partida, creada hoy a las 12:10 UTC |
| P10 | Ignacio intentó crear partida 8 veces en 50 segundos | edge_logs: 8× `POST 403 /rpc/create_match`, mismo user-agent iOS 18_7 | TRUE |
| P11 | La fórmula de Elo vive solo en `rango.js`, no duplicada en SQL | `apply_match_result` recibe `p_new_points_a/b` ya calculados; `src/domain/rango.js:34` `calculateEloDelta` | TRUE |
| P12 | Hay que quitar "Buscar rival" del Home | `HomeScreen`, `src/App.jsx:1205-1310`: los únicos CTAs son Crear partida, Mi mazo, Mi perfil. No hay botón de buscar rival | **FALSE en el repo** — ya no existe; único `findRivalCandidates` es `src/App.jsx:1444`, dentro de crear partida |
| P13 | Los ficticios están solo en código, los 5 perfiles de Supabase son reales | `src/App.jsx:234` `FAKE_RIVALS`, `:243` `FAKE_TOP`; `profiles` = 5 filas | TRUE |

`unverified=0` · FALSE=3 (P6 parcial, P9, P12)

### Resto de filas

- **already-done:** `git log origin/main --since=2026-11-01 -- src/lib/api/matches.js src/App.jsx` da b1f5828 y 9e1cb1a (3 nov). **HIT doble:** los puntos 1 y 2 de "Qué entra en el mismo deploy" ya están resueltos en `main` (P6, P12). `git log --grep='respond_to_match|confirm_deck|abandon_match|embudo'` → 0 resultados: el embudo en sí no está empezado. → **finding F1**
- **surface-check:** las 3 RPCs nuevas (`respond_to_match`, `confirm_deck`, `abandon_match`) no existen todavía en `pg_proc` — correcto, son nuevas. `create_match`, `apply_match_result`, `get_match_context`, `handle_new_user` verificadas contra `pg_get_functiondef`. `pass`
- **binding-decisions:** `gstack-decision-search --scope branch --recent 50` da 3 decisiones vinculantes (19 y 23 ago). Ninguna se reintroduce al revés aquí. La de PR1 — "la fórmula de Elo vive solo en `rango.js`, no se duplica en SQL" — es justo la que el punto 5 respeta y la razón por la que no se puede resolver el abandono en SQL puro. `pass`
- **numbers:** `STALE_ACTIVE_MATCH_MS = 30 * 60 * 1000` [measured: `src/lib/api/matches.js:114`]. Umbral de abandono = 3 hoyos [estimated: decisión de producto, sin datos todavía]. 138 tests [measured: `npm test`]. 5 perfiles / 1 partida [measured: Supabase]. `pass`
- **deferred-asks:** el documento pide 3 extras en el mismo deploy; 2 ya están hechos (P6, P12) y 1 sigue pendiente (`FAKE_RIVALS`). Nada del documento se deja fuera sin razón escrita. `pass`
- **pr-count:** sin `.gstack/ship-policy.json`, default 1 PR por tanda. Aquí la decisión D1 parte el trabajo en **2 PRs**: PR-A (desplegar lo que ya existe) y PR-B (el embudo). Coste del PR extra: una segunda pasada de `/review` + `/ship`. Justificado porque PR-A desbloquea a 5 personas hoy y PR-B no puede salir hoy. `pass`
- **transaction-semantics** (tier 2, scope db): `create_match` no es `SECURITY DEFINER` y corre con RLS del llamante; cada RPC nueva que escriba en `matches` hereda ese problema. → **finding F3**

`PLAN_REALITY: 8/8 filas tier 1 + 1 tier 2 emitidas, 0 premisas unverified, 3 premisas FALSE`

## Scope Challenge

**Resultado: scope reduced per recommendation** (D1: desplegar `main` primero, embudo después).

### Qué resuelve ya el código existente

| Sub-problema | Ya existe | Reutilizar o construir |
|---|---|---|
| Hidratar el mazo propio al cargar la partida | `listMyActiveMatches`, `src/lib/api/matches.js:146` con embed `match_player_decks` | Reutilizar — ya corregido, sin desplegar |
| Guardar el mazo de un jugador | `confirmDeck`, `src/lib/api/matches.js:375` (insert + `deck_confirmed_at`) | Mover a RPC `confirm_deck` para poder validar en servidor |
| Saber si el rival ya decidió | `deck_confirmed_at` en `match_players`, `getMatchPlayersStatus:100` | Reutilizar tal cual |
| Marcar que he abierto la partida | `markMatchOpened:89`, con `.is("opened_at", null)` | Reutilizar — el embudo no lo cambia |
| Mover puntos de Rango | `apply_match_result` + `src/domain/rango.js` | Reutilizar sin tocar (ver R1) |
| Progreso de hoyos jugados | `match_holes.player_a_hole_submitted` / `player_b_hole_submitted` | Reutilizar — el umbral de 3 hoyos se deriva de aquí, no hace falta columna nueva |
| Descubrir una partida donde no soy el creador | `listMyActiveMatches:120` | Extender: hoy filtra `status='active'`, no vería un `pending` (ver R4) |

### Cambio mínimo que cumple el objetivo

- **PR-A (hoy):** desplegar `main`; cambiar la constante de 30 min; borrar `FAKE_RIVALS`/`FAKE_TOP`/`renderPlayerPicker` y ocultar el 2vs2. ~2 ficheros.
- **PR-B (el embudo):** 1 migración (2 columnas + 4 funciones), `src/lib/api/matches.js`, `src/App.jsx`. ~3 ficheros, 3 RPCs nuevas.

### Complejidad

PR-B: 3 ficheros, 3 servicios nuevos (RPCs). Dispara el umbral de 2+ servicios nuevos
→ resuelto en D1 partiendo en 2 PRs; la estructura del embudo se mantiene como la
propone el documento (un solo `pending` con sub-pasos derivados de timestamps), que ya
es la disposición más pequeña posible: no añade estados nuevos a la máquina.

### Search check

- **[Layer 1]** Postgres `SECURITY DEFINER` + comprobación explícita de participante
  es el patrón estándar de Supabase para escrituras multi-actor que la RLS por fila no
  puede expresar. No se inventa nada. Alternativa descartada: ampliar la política
  UPDATE de `matches` a cualquier participante — da permiso de escritura sobre
  columnas que no deberían tocar (`winner_id`, `is_ranked`, `suspicious_match`).
- **[Layer 1]** `insert ... on conflict do nothing` para la idempotencia de
  `match_confirmations`: la tabla ya tiene `UNIQUE (match_id, user_id)` (dos veces, ver F7).
- **[EUREKA]** El documento propone dos barredores de estado (el de 30 min que ya
  existe y uno nuevo de 24 h). La convención sería un cron o una limpieza perezosa en
  carga. Primeros principios dicen lo contrario aquí: **una partida caducada no
  necesita que nadie le escriba el estado.** Basta con que la guarda de "una partida
  viva por jugador" la ignore por antigüedad, y que el estado solo se escriba cuando un
  jugador actúa de verdad. Eso elimina de golpe las escrituras de estado sin actor,
  que son exactamente la causa de F2. Ver R2.

### TODOS cross-reference

- *RLS por columna en `match_holes`* (P3): es la pieza que haría el abandono y los
  golpes a prueba de manipulación de verdad. No bloquea el embudo; sigue en P3.
- *Columna sin uso `card_cancelled_reason`* (P3): sin relación. Sin cambios.
- *Reestructuración completa (Approach B)* (P1): el embudo añade código a `App.jsx`
  (4725 líneas). No lo bloquea, pero empeora el problema que ese TODO describe.
- **TODO nuevo propuesto:** `apply_match_result` acepta cualquier delta de suma cero
  de cualquiera de los dos jugadores (ver F6). Ver sección TODOS.md.

### NO está en alcance

- **2vs2 real contra Supabase** — se oculta, no se construye. El flujo local con
  `FAKE_RIVALS` se deja en el código, no se borra a lo bruto.
- **RLS por columna en `match_holes`** — convención de app, no restricción de base de
  datos, igual que hoy. El grupo es cerrado.
- **Cerrar la fuga de `profiles.email`** — `profiles are viewable by everyone` deja leer
  todas las columnas a cualquiera con la clave anónima. Heredado del spec obsoleto, sigue
  siendo real, no lo toca el embudo.
- **Partir `App.jsx`** — Approach B, su propia sesión.
- **Cron de limpieza** — innecesario si se acepta R2.

## 1. Revisión de arquitectura

### F1 — Dos de los tres extras ya están en `main`; producción corre una build de antes del 27 de agosto

`[CRITICAL] (confianza: 10/10)` `src/lib/api/matches.js:146` — el repo pide
`match_player_decks ( user_id, selected_cards )`; el bundle en producción pide
`match_players(...,selected_cards,...)` y devuelve 400 en cada carga del Home
(edge_logs, 4 nov). `src/App.jsx:1205-1310` — `HomeScreen` ya no tiene "Buscar rival".

La consecuencia encadenada es el bug de la carta repetida, y no es el que describe el
documento. La pantalla de mazo se abre con la guarda `if (deck.length !== required)`
(`src/App.jsx:3659`). Con el 400, `listMyActiveMatches` no devuelve nada, el mazo del
creador nunca se hidrata, `deck` queda vacío, la pantalla se abre **para el creador** y
`confirmDeck` choca contra la PK que `create_match` ya había escrito. Con la build del
repo, el embed hidrata el mazo, la guarda no se cumple, la pantalla se salta, y no hay
colisión. El embudo arregla la causa de raíz, pero **no es lo que hace falta para jugar
hoy**.

**Disposición: aceptado** → PR-A (D1).

### F2 — El barredor de 30 minutos marca `abandoned` sin actor, y choca de frente con el nuevo significado de `abandoned`

`[CRITICAL] (confianza: 9/10)` `src/lib/api/matches.js:114-139`:

```js
const STALE_ACTIVE_MATCH_MS = 30 * 60 * 1000;
...
supabase.from("matches").update({ status: "abandoned" })
  .eq("status", "active").eq("created_by", userId).lt("started_at", cutoffIso)
  .then(() => {}, () => {});
...
.eq("status", "active").gte("started_at", cutoffIso)
```

Dos problemas, ninguno visible hoy porque esta build nunca se desplegó:

1. Una vuelta de 9 hoyos dura unas dos horas. A los 30 minutos la partida desaparece
   del Home de los dos jugadores (`.gte`) y queda marcada `abandoned`. Es un bug
   bloqueante para la primera partida real que se juegue después del deploy, al margen
   del embudo.
2. Escribe `abandoned` sin `abandoned_by` ni `winner_id`. En cuanto `abandoned`
   signifique "pierde quien abandona", este barredor fabrica partidas abandonadas sin
   culpable, y el camino del punto 5 ("el primer cliente que cargue aplica el Rango")
   intentaría liquidarlas.

También: el `update` es fire-and-forget con `.then(() => {}, () => {})`, así que un fallo
de RLS o de red no se ve en ningún sitio. Y solo barre lo que ha creado el propio
usuario (`created_by`), porque la política UPDATE de `matches` no le deja más — la
partida del rival la barre el dispositivo del rival, o no la barre nadie.

**Disposición: pendiente** → R2.

### F3 — Toda RPC nueva que escriba en `matches` necesita `SECURITY DEFINER`; sin eso, media máquina de estados falla solo para el segundo jugador

`[CRITICAL] (confianza: 9/10)` `create_match` es
`LANGUAGE plpgsql SET search_path TO 'public'`, **sin** `SECURITY DEFINER` — corre como
el llamante, con RLS aplicada. Compárese con `apply_match_result` y `get_match_context`,
que sí son `SECURITY DEFINER`. La única política UPDATE de `matches` es:

```
match creator can update match | UPDATE | (created_by = auth.uid())
```

Con eso, tal como está escrito el documento:

| RPC propuesta | Qué intenta escribir | Qué pasa de verdad |
|---|---|---|
| `respond_to_match(accept=false)` | `matches.status = 'cancelled'` | player_b no puede tocar `matches`: 0 filas afectadas, silencioso |
| `confirm_deck` (segundo en confirmar) | `matches.status='active'`, `started_at` | falla siempre que el segundo sea player_b |
| cancelar / abandonar siendo player_b | `matches.status`, `abandoned_by`, `winner_id` | falla |
| caducidad de 24 h cerrada por el invitado | `matches.status='cancelled'` | falla |

Y lo más silencioso de todo: la guarda de "una partida viva por jugador" lee
`match_players` del **otro** jugador, y la política SELECT es
`private.is_match_participant(match_id, auth.uid())`. Esas filas son invisibles para el
llamante, así que la guarda pasa en vacío y **no previene nada de lo que está diseñada
para prevenir**. Es la clase de fallo que no se ve probando como creador y revienta
para el invitado.

**Disposición: pendiente** → R3.

### F4 — El invitado no tiene forma de enterarse de la invitación

`[CRITICAL] (confianza: 9/10)` `src/lib/api/matches.js:141`
(`.eq("status", "active")`) y `src/hooks/useMatchRealtime.js` — el único canal Realtime
escucha `match_holes` filtrado por `match_id`, que requiere ya conocer la partida.

El embudo introduce `pending` como el estado donde vive toda la configuración, pero la
única consulta que descubre partidas filtra por `status='active'`. Un `pending` no
aparece en ninguna pantalla de nadie, así que `respond_to_match` no tiene desde dónde
llamarse. El TODO de D7 ya anotaba la mitad de esto ("si el rival crea la partida
mientras ya estás en Partidas, no la descubres hasta cambiar de pestaña"); el embudo lo
convierte de molestia en bloqueo, porque ahora la partida **empieza** en el estado que
no se descubre.

**Disposición: pendiente** → R4.

### F5 — Cambiar la firma de `create_match` da un 404 opaco, no un error claro

`[INFORMATIONAL] (confianza: 8/10)` Quitar `p_selected_cards_a` cambia la firma.
PostgREST resuelve funciones por firma: un cliente viejo que mande 4 argumentos recibe
`404 PGRST202 Could not find the function public.create_match(...)`. El documento ya
exige que migración y deploy salgan juntos, que es lo correcto; la nota que falta es que
el modo de fallo, si alguien tiene una pestaña vieja abierta, es un 404 con un mensaje
de Postgres, no "actualiza la app". No hay service worker en el repo (no hay manifest de
PWA todavía, ver TODOS), así que el riesgo real se limita a una pestaña sin recargar.

**Disposición: aceptado** — anotar el modo de fallo en el plan de PR-B; sin cambio de
arquitectura.

### F6 — `apply_match_result` acepta cualquier delta de suma cero de cualquiera de los dos jugadores

`[INFORMATIONAL] (confianza: 9/10)` `apply_match_result` valida que el llamante sea
jugador, que haya 2 confirmaciones y que los deltas sumen cero — pero no que el ganador
sea quien ganó de verdad:

```sql
if (p_new_points_a - v_points_before_a) <> -(p_new_points_b - v_points_before_b) then
  raise exception 'Points change must be zero-sum: ...';
```

El ganador se deriva del signo del delta, no de los hoyos. Cualquiera de los dos puede
regalarse los puntos del otro. Es preexistente y aceptable en un grupo cerrado, pero
importa para el abandono: sin la guarda que pide el punto 5, **quien abandona podría
aplicar el resultado a su favor**. Eso convierte la guarda de "el ganador tiene que ser
el que no abandonó" en un endurecimiento necesario, no en un adorno.

**Disposición: parcialmente aceptado** → la guarda del abandono entra en R1; el agujero
general va a TODOS.md.

### F7 — `match_confirmations` tiene dos restricciones UNIQUE idénticas

`[INFORMATIONAL] (confianza: 10/10)` `pg_constraint` sobre
`public.match_confirmations`: `match_confirmations_match_id_user_id_key` y
`match_confirmations_match_user_unique`, las dos `UNIQUE (match_id, user_id)`.
Inofensivo (dos índices donde sobra uno), probablemente de la corrección de agosto
aplicada dos veces. Vale la pena tirar una en la misma migración.

**Disposición: aceptado** — incluir en la migración de PR-B.

### Dos formas antes de una (design-twice)

El embudo introduce una frontera nueva: **quién tiene la autoridad para cambiar el
estado de una partida.** Dos formas:

**Forma 1 — la del documento: estado escrito por quien pasa por ahí.**
Cuatro RPCs escriben `matches.status`, más dos barredores perezosos (el de 30 min que ya
existe, el de 24 h propuesto) que lo escriben sin que nadie haya actuado. El estado es
el resultado de que alguien haya cargado la pantalla a tiempo.

```
   create_match ──┐
 respond_to_match ─┤
    confirm_deck ──┼──> matches.status
   abandon_match ──┤
  barredor 30 min ─┤   (sin actor, best-effort, silencioso)
  barredor 24 h  ──┘   (sin actor, bloqueado por RLS para el invitado)
```

**Forma 2 — autoridad única, caducidad derivada.** Una sola función con permiso para
mover el estado; la caducidad no se escribe, se calcula al leer.

```
   create_match ─────┐
 respond_to_match ───┤
    confirm_deck ────┼──> set_match_status()  ──> matches.status
   abandon_match ────┘     (SECURITY DEFINER,
                            valida la transición)
                                  ▲
   "¿tengo una partida viva?" ────┘  se deriva:
     status='pending' AND created_at > now() - 24h
     status='active'  AND started_at > now() - 6h
     (ninguna escritura)
```

**Elección: Forma 2.** El argumento es de profundidad de interfaz: una sola superficie
pública (`set_match_status`, con la tabla de transiciones legales dentro) esconde más
política detrás de menos interfaz que cuatro llamantes repitiendo cada uno su propio
`update ... where status = ...`. Y elimina una clase entera de fallo: el estado solo
cambia cuando un jugador hace algo, nunca porque un dispositivo cargó una pantalla.
La caducidad pasa de ser una escritura (que puede fallar, llegar tarde o estar bloqueada
por RLS) a ser un predicado (que no puede fallar).

Banderas rojas sobre la forma elegida:

- **Propiedad compartida (bandera 5):** en la Forma 1, `matches.status` lo escriben
  cuatro RPCs más dos barredores en el cliente. Nadie es el dueño. La Forma 2 le pone
  un dueño. *Arreglo: R2 + R3.*
- **Fuga de información (bandera 2):** la regla del umbral de 3 hoyos viviría en el
  cliente (para pintar "Pedir cancelación" frente a "Abandonar") y en el servidor (para
  validarla). Es inevitable que el cliente sepa qué botón pintar, pero la **cuenta** de
  progreso debe calcularse en un solo sitio. *Arreglo: que `get_match_context` —
  o una `get_match_funnel_state` — devuelva el progreso y el umbral ya resueltos, y que
  el cliente solo pinte lo que le digan.*
- **Dos maneras de hacer lo mismo (bandera 6):** `confirmDeck` (cliente, insert directo,
  `src/lib/api/matches.js:375`) y `confirm_deck` (RPC nueva) harían lo mismo. *Arreglo:
  borrar el insert directo y mover el llamante en el mismo cambio, no dejar los dos.*
- **Lista sincronizada a mano (bandera 8):** los 10 ids de carta válidos están en
  `v_valid_cards` dentro de `create_match` y en `CARDS` en `src/App.jsx`. Al mover la
  validación a `confirm_deck` la lista se duplica otra vez. *Arreglo: dejar la lista en
  un solo sitio del SQL (`confirm_deck`), no en las dos funciones.*
- Sin banderas 1, 3, 4, 7.

### Modos de fallo en producción

| Camino nuevo | Fallo realista | ¿Lo cubre el plan? | Qué ve el jugador |
|---|---|---|---|
| `respond_to_match` | el invitado acepta sin cobertura | no escrito | **hueco crítico si no se decide**: acción única, sin outbox (igual que D6 para crear) → error claro y botón de reintentar |
| `confirm_deck` | doble pulsación del botón "Confirmar mazo" | sí (el punto 5 pide fallo explícito) | "ya has confirmado tu mazo" en vez del error de PK |
| `confirm_deck` | los dos confirman a la vez; los dos ven ambos `deck_confirmed_at` puestos y los dos intentan pasar a `active` | **no escrito** | la segunda llamada debe ser idempotente, no un error |
| `abandon_match` | quien abandona cierra la app antes de que se aplique el Rango | sí, por diseño (lo aplica el rival al cargar) | nada, hasta que el rival abra la app |
| `abandon_match` | **los dos** cierran la app y no vuelven en semanas | no escrito | la partida queda `abandoned` sin puntos aplicados indefinidamente |
| caducidad 24 h | el invitado intenta cerrar la invitación caducada | no escrito; bloqueado por RLS (F3) | fallo silencioso, los dos siguen bloqueados |

El tercer y el sexto no están contemplados en el documento. El primero necesita decidir
si `respond_to_match` reintenta o exige cobertura.

### F8 — `private.is_match_participant` es ejecutable por `anon` y por PUBLIC

`[INFORMATIONAL] (confianza: 10/10)` `pg_proc.proacl` de
`private.is_match_participant`: `=X/postgres | postgres=X/postgres |
authenticated=X/postgres | anon=X/postgres`. La entrada `=X/postgres` (sin rol a la
izquierda) es EXECUTE para PUBLIC, y encima hay un `anon=X` explícito.

Es una función `SECURITY DEFINER` que devuelve un booleano para cualquier par
`(match_id, user_id)` que le pases. Con la clave anónima, cualquiera puede preguntar si
un usuario concreto está en una partida concreta. Hace falta conocer los dos UUID y
filtra un solo bit, así que es mucho menor que la fuga de `profiles.email`, pero es la
misma clase de problema que el `GRANT` que faltaba, al revés: ahí faltaba permiso donde
hacía falta, aquí sobra donde no.

Las otras tres funciones no tienen este problema: `create_match`, `apply_match_result`
y `get_match_context` ya tienen `postgres=X | authenticated=X` sin entrada de PUBLIC.

**Disposición: aceptado** — `revoke execute on function private.is_match_participant
from public, anon;` en la migración de PR-B, junto a los grants de las RPCs nuevas
(añadido 2 de R3).

### F9 — `confirm_deck` como DEFINER puede escribir el mazo del rival si acepta un `user_id`

`[CRITICAL] (confianza: 9/10)` `match_player_decks` tiene como única política INSERT
`players can insert only their own deck`, con `with_check (user_id = auth.uid())`. Al
pasar `confirm_deck` a `SECURITY DEFINER` (R3), esa política deja de aplicarse.

Si la función acepta un parámetro `user_id`, un jugador puede insertar la fila del
rival — y como `match_player_decks` es la tabla del mazo secreto (D26, cuya RLS SELECT
es `user_id = auth.uid()` precisamente para que el rival no lo vea), eso rompe la
garantía entera: escribirle el mazo al rival es saber qué mazo tiene.

La firma del documento (`confirm_deck(match_id, selected_cards text[])`) ya es la
correcta. El riesgo está en el envoltorio que ya existe:
`confirmDeck({ matchId, userId, selectedCards })` (`src/lib/api/matches.js:375`) pasa
`userId` hoy, y la tentación al migrar es mantener la firma del wrapper.

**Disposición: aceptado** — recogido en el alcance de R3; `confirm_deck` deriva el
usuario de `auth.uid()` y no expone parámetro de usuario. El wrapper pierde `userId`.

**Dispositions (Arquitectura):** F1 aceptado (PR-A) · F2 aprobado (R2/D3) · F3 aprobado
(R3/D4 + 2 añadidos) · F4 aprobado (R4/D5) · F5 aceptado (nota en el plan) · F6 parcial
(guarda en R1/D2, agujero general a TODOS.md) · F7 aceptado (migración) · F8 aceptado
(revoke) · F9 aceptado (dentro de R3)

## 2. Revisión de calidad de código

### F10 — Los mensajes de error de las RPCs se le muestran al jugador tal cual, en inglés

`[CRITICAL] (confianza: 9/10)` `src/App.jsx:1553`:
`setCreateError(err?.message || "No se pudo crear la partida...")`. El `err.message` de
una excepción de PostgREST es el texto del `raise exception`. Los de `create_match` son
de desarrollador y están en inglés:

```sql
raise exception 'holes_count must be 9 or 18, got %', p_holes_count;
raise exception 'course % does not have % holes configured (has %)', ...
raise exception 'selected_cards_a contains an unknown card id';
```

Hoy, si alguien elige un campo sin tarjeta cargada, lee literalmente
`course 7c3f… does not have 9 holes configured (has 0)`. El embudo multiplica esto: el
documento pide explícitamente mensajes claros para "ya has confirmado tu mazo" y para el
rechazo de partida duplicada, y esos mensajes van a llegar por el mismo camino.

Recomendación: escribir los `raise exception` de las 4 RPCs del embudo en español y en
tono de jugador, porque ya se muestran directamente, y arreglar de paso los 3 de
`create_match` que viajan en el mismo cambio. Alternativa descartada: mapear SQLSTATE a
textos en el cliente — es más correcto a largo plazo pero añade una tabla de códigos que
mantener a mano (bandera roja 8) para un beneficio que hoy no existe.

**Disposición: aceptado** — entra en PR-B.

### F11 — El tamaño de mazo está escrito en tres sitios, y el embudo añade un cuarto

`[INFORMATIONAL] (confianza: 9/10)` La regla "2 cartas si 9 hoyos, 4 si 18" vive en:

- `src/App.jsx:1455` — `const required = draft.holes === "9" ? 2 : 4;`
- `src/App.jsx:3341` — `const required = total === 9 ? 2 : 4;`
- `create_match` (SQL) — `if p_holes_count = 9 then v_deck_size := 2; elsif ...`

Y la lista de los 10 ids válidos vive en `v_valid_cards` dentro de `create_match` y en
`CARDS` en `src/App.jsx`. Al mover la validación a `confirm_deck`, las dos reglas se
duplican otra vez si no se tiene cuidado.

Recomendación mínima: la validación SQL queda **solo** en `confirm_deck` (sale de
`create_match` con el parámetro, como ya dice el documento), no en las dos. Los dos
`required` de `App.jsx` se unifican en una constante del dominio
(`src/domain/cards.js` ya es el sitio natural y ya exporta reglas de carta). No se
intenta derivar la lista SQL de `CARDS`: cruzar JS y SQL por generación es peor que la
duplicación que arregla.

**Disposición: aceptado** — unificar los dos `required` y dejar la validación SQL en un
solo sitio, dentro de PR-B.

### F12 — `confirmDeck` (cliente) y `confirm_deck` (RPC) harían lo mismo

`[INFORMATIONAL] (confianza: 10/10)` `src/lib/api/matches.js:375-389` hace hoy el
insert directo más el `update deck_confirmed_at`. La RPC nueva hace lo mismo con
validación. Dejar las dos es la bandera roja 6: el siguiente que toque esto copia la
que encuentre primero.

**Disposición: aceptado** — borrar el cuerpo actual de `confirmDeck` y dejarlo como un
`supabase.rpc("confirm_deck", ...)`, moviendo el único llamante
(`src/App.jsx:3670`) en el mismo cambio. Sin periodo de convivencia.

### F13 — El embudo añade su quinta función a `src/App.jsx`, que ya tiene 4725 líneas

`[INFORMATIONAL] (confianza: 8/10)` `src/App.jsx` son 4725 líneas y 222 KB. El TODO
*Reestructuración completa (Approach B)* lleva desde el 4 de agosto diciendo que es el
problema de fondo; D7 ya optó por añadir un componente nuevo
(`RealMatchPlayScreen`) en vez de reescribir, y la extracción se está haciendo "pieza a
pieza". El embudo añade pantalla de invitación, aceptar/rechazar, y los diálogos de
cancelar y abandonar.

No bloquea nada y no recomiendo meter el split en este PR: mezclar una
reestructuración con un cambio de reglas de partida es exactamente lo que se decidió
evitar el 10 de agosto. Pero sí recomiendo que **las pantallas nuevas del embudo nazcan
en `src/screens/`** en vez de dentro de `App.jsx`: son código nuevo, no hay que mover
nada existente para ello, y es la primera rebanada del split que no cuesta nada.

**Disposición: aceptado** — pantallas nuevas en `src/screens/`, sin tocar lo existente.

### F14 — Falta el diagrama de la máquina de estados donde vive el código

`[INFORMATIONAL] (confianza: 7/10)` `src/lib/api/matches.js` no tiene ningún diagrama,
y el embudo convierte ese fichero en el dueño de una máquina de estados de 7 estados
con sub-pasos derivados de timestamps. La tabla del documento es buena, pero vive en un
`.md` en Downloads, no junto al código.

**Disposición: aceptado** — el diagrama ASCII de la sección de arquitectura se copia
como comentario de cabecera en `src/lib/api/matches.js`, y se mantiene actualizado en el
mismo commit que cambie la máquina (política de diagramas del proyecto).

**Dispositions (Calidad de código):** F10 aceptado · F11 aceptado · F12 aceptado ·
F13 aceptado · F14 aceptado. Sin decisiones nuevas: ninguna abre una alternativa real
que cambie el comportamiento aprobado.

## 3. Revisión de tests

**Framework detectado:** vitest 4.1.10 vía `npm test`, configurado en `vite.config.js`
(bloque `test` con `exclude` de `.claude/worktrees`). `CLAUDE.md` no tiene sección de
Testing. Base: 138 tests en 9 ficheros, todos verdes. No hay jsdom ni
`@testing-library/react` en el repo — decisión consciente de D7, así que la lógica se
prueba en la capa framework-free y los componentes se revisan a mano.

**No hay forma de probar SQL en este repo.** Las 138 pruebas son de JS con `supabase`
mockeado (`src/lib/api/matches.test.js`, 725 líneas). Las RPCs se han verificado
históricamente a mano contra Supabase real con cuentas de verdad (consta en el TODO de
PR1 y de D7). El embudo pone en SQL la parte más delicada: la guarda de
una-partida-viva, las transiciones de estado, el umbral de 3 hoyos y la guarda del
abandono. Eso es el hueco central de esta sección → R5.

### Paso 1-2. Trazado de caminos y flujos de usuario

```
ENTRADA: crear partida (creador)
  MatchesScreen · goToCardPick → createMatchApi
    └─ rpc create_match(course_id, player_b_id, holes_count)      [SQL, DEFINER]
        ├─ auth.uid() NULL                      → 'Not authenticated'
        ├─ player_b = yo                        → 'contra ti mismo'
        ├─ holes_count ∉ {9,18}                 → error
        ├─ curso no existe / sin hoyos          → error
        ├─ player_b no existe                   → error
        ├─ ¿YO tengo partida viva?              → rechazo  ◄── NUEVO
        ├─ ¿EL RIVAL tiene partida viva?        → rechazo  ◄── NUEVO (hoy pasaría
        │                                                       en vacío sin DEFINER, F3)
        ├─ caducidad: pending >24h / active >6h no cuentan ◄── NUEVO (R2)
        ├─ insert matches (status='pending', started_at NULL)
        ├─ insert match_players ×2 (accepted_at: creador=now, rival=NULL)
        ├─ (ya NO inserta match_player_decks)              ◄── CAMBIO
        └─ insert match_holes × holes_count

ENTRADA: el invitado abre la app
  listMyActiveMatches → status in ('pending','active')              ◄── CAMBIO (R4)
    └─ canal Realtime match_players (user_id = yo)                  ◄── NUEVO (R4)
        └─ pantalla de invitación
            ├─ "Aceptar"  → rpc respond_to_match(id, true)          [SQL, DEFINER]
            │   ├─ no soy player_b            → error
            │   ├─ status ≠ 'pending'         → error
            │   └─ accepted_at = now()
            └─ "Rechazar" → rpc respond_to_match(id, false)
                └─ status='cancelled', sin efecto en el Rango

ENTRADA: elegir mazo (cualquiera de los dos)
  pantalla de mazo, guarda `deck.length !== required`  (src/App.jsx:3659)
    └─ rpc confirm_deck(match_id, selected_cards)                   [SQL, DEFINER]
        ├─ no participante                     → error
        ├─ status ≠ 'pending'                  → error
        ├─ falta algún accepted_at             → error
        ├─ tamaño ≠ 2|4 según holes_count      → error
        ├─ id de carta desconocido             → error
        ├─ YA tengo deck_confirmed_at          → 'ya has confirmado tu mazo' ◄── NUEVO
        ├─ user_id = auth.uid() SIEMPRE, nunca parámetro  ◄── F9
        ├─ insert match_player_decks + deck_confirmed_at = now()
        └─ ¿los dos confirmados? → status='active', started_at=now()
            └─ CARRERA: los dos confirman a la vez, los dos leen "ambos
               confirmados", los dos intentan el update  → tiene que ser
               idempotente, no error                      ◄── HUECO del documento

ENTRADA: cancelar / abandonar (partida en curso)
  progreso := count(match_holes donde los DOS enviaron golpes)
    ├─ status='pending'          → cualquiera cancela → 'cancelled', sin efecto
    ├─ status='active', prog < 3 → cualquiera cancela → 'cancelled', sin efecto
    └─ status='active', prog >= 3
        ├─ "Pedir cancelación"  → cancel_requested_by = yo
        │   └─ ¿el otro también? → 'cancelled', sin efecto para ninguno
        └─ "Abandonar" (con aviso previo de que cuenta como derrota)
            └─ rpc abandon_match(match_id)                           [SQL, DEFINER]
                ├─ status='abandoned', abandoned_by=yo,
                │  winner_id=el otro, finished_at=now()
                └─ insert match_confirmations ×2 on conflict do nothing  ◄── R1
                    └─ el PRIMER cliente que cargue → confirmMatchResult
                        └─ rpc apply_match_result (SIN CAMBIOS salvo la guarda)
                            ├─ confirmaciones < 2        → error (ya hay 2, puestas arriba)
                            ├─ suma cero                 → error
                            ├─ abandoned_by no NULL y el ganador ES el que
                            │  abandonó                  → error        ◄── NUEVO (R1)
                            └─ status='confirmed', razón queda en abandoned_by
                                └─ sale en listMyMatchHistory (filtra 'confirmed')
```

### Pasos 3-4. Diagrama de cobertura

```
CAMINOS DE CÓDIGO                                       FLUJOS DE USUARIO
[+] SQL · create_match (modificada)                     [+] Invitar y empezar
  ├── [GAP] [→E2E] guarda: yo ya tengo partida viva       ├── [GAP] [→E2E] invitar → aceptar → mazos → jugar
  ├── [GAP] [→E2E] guarda: el rival ya tiene partida      ├── [GAP] [→E2E] invitar → rechazar
  ├── [GAP] caducidad pending >24h no cuenta              ├── [GAP] el invitado ve la invitación sin recargar
  ├── [GAP] caducidad active >6h no cuenta                └── [GAP] los dos eligen mazo a la vez
  ├── [GAP] nace en 'pending', started_at NULL
  └── [GAP] ya NO escribe match_player_decks            [+] Cancelar y abandonar
[+] SQL · respond_to_match (nueva)                        ├── [GAP] [→E2E] cancelar en 'pending'
  ├── [GAP] solo player_b puede responder                 ├── [GAP] [→E2E] cancelar con prog < 3
  ├── [GAP] falla si status ≠ 'pending'                   ├── [GAP] [→E2E] cancelación acordada (los dos)
  ├── [GAP] aceptar pone accepted_at                      ├── [GAP] [→E2E] abandonar con prog >= 3 → derrota
  └── [GAP] rechazar deja 'cancelled' sin efecto          └── [GAP] el aviso de derrota antes de abandonar
[+] SQL · confirm_deck (nueva)
  ├── [GAP] rechaza tamaño de mazo incorrecto           [+] Estados de error visibles
  ├── [GAP] rechaza id de carta desconocido               ├── [GAP] doble pulsación en "Confirmar mazo"
  ├── [GAP] 2ª confirmación → mensaje claro, no PK         ├── [GAP] aceptar sin cobertura
  ├── [GAP] ignora cualquier user_id externo (F9)          ├── [GAP] mensajes en español, no SQL en inglés (F10)
  └── [GAP] los dos confirmados → 'active' (idempotente)   └── [GAP] 404 PGRST202 con pestaña vieja (F5)
[+] SQL · abandon_match (nueva)
  ├── [GAP] escribe abandoned_by = quien llama
  ├── [GAP] inserta las 2 confirmaciones (R1)
  └── [GAP] idempotente si se llama dos veces
[+] SQL · apply_match_result (guarda nueva)
  ├── [★★★ PROBADA] suma cero, 2 confirmaciones — matches.test.js (mockeada)
  └── [GAP] el ganador no puede ser quien abandonó (R1)
[+] JS · src/lib/api/matches.js
  ├── [★★★ PROBADA] createMatch, confirmMatchResult, listMy* — matches.test.js 725 líneas
  ├── [GAP] respondToMatch / abandonMatch / requestCancel (envoltorios nuevos)
  ├── [GAP] listMyActiveMatches con 'pending' y estado del embudo
  └── [GAP] confirmDeck reescrito como rpc, sin userId (F9, F12)
[+] JS · canales Realtime de match_players (×2, R4)
  ├── [GAP] descubrimiento: filtro user_id = auth.uid() → INSERT de mi fila
  ├── [GAP] embudo: filtro match_id → UPDATE de la fila DEL RIVAL (deck_confirmed_at)
  └── [GAP] reconexión compartida extraída de subscribeToMatchHoles

COBERTURA: 2/37 caminos con test (5%)  |  SQL: 1/19 (5%)  |  JS: 1/6  |  Flujos: 0/12
CALIDAD: ★★★:2 ★★:0 ★:0  |  HUECOS: 35 (9 →E2E, 0 →EVAL)
```

Leyenda: ★★★ comportamiento + bordes + errores | ★★ camino felíz | ★ humo
[→E2E] = necesita prueba de integración | [→EVAL] = necesita eval de LLM

Sin alcance de LLM/prompts: `CLAUDE.md` no declara patrones de prompt y el embudo no
toca ninguno. No aplica eval.

### Regla de regresión (obligatoria)

El embudo pone en riesgo comportamiento que **hoy funciona** y está cubierto:

| Comportamiento a preservar | Cubierto hoy por | Riesgo |
|---|---|---|
| `createMatch` devuelve el contexto del rival (rank y hcp) para la pantalla | `matches.test.js` | la firma de `create_match` cambia; `getMatchContext` detrás tiene que seguir igual |
| `confirmMatchResult` aplica Elo/hcp/racha y es idempotente por `match_confirmations` | `matches.test.js` + `rango.test.js` | R1 le mete filas de confirmación desde el servidor: la idempotencia tiene que seguir valiendo |
| `listMyMatchHistory` lista las partidas `confirmed` con su delta | `matches.test.js` | R1 hace que un abandono acabe en `confirmed`: tiene que aparecer, y con el delta correcto |
| `RealMatchPlayScreen` juega una partida `active` de principio a fin | revisión manual (D7) | la partida ahora llega a `active` por un camino distinto |

Diferencias intencionadas (no son regresiones): `create_match` ya no acepta
`selected_cards_a` ni deja la partida en `active`; `listMyActiveMatches` ya no filtra
por antigüedad ni barre estado.

### Paso 5. Tests que faltan

Los 35 huecos se agrupan en dos bloques con naturaleza distinta:

**Bloque JS (envoltorios y canal) — se prueba con lo que ya hay.** `respondToMatch`,
`abandonMatch`, `requestCancel`, `confirmDeck` reescrito, `listMyActiveMatches`
extendido y el canal de `match_players`: todos van en `matches.test.js` y un
`useMatchRealtime.test.js` extendido, con el mismo patrón de `supabase` mockeado que ya
usan las 725 líneas existentes. No hace falta decidir nada: es proof requerida de
comportamiento ya aprobado (R1-R4).

Value: protects=los envoltorios mandan los argumentos correctos y propagan el error de
la RPC; fails_when=alguien reintroduce `userId` en confirmDeck o vuelve a filtrar solo
'active'; why_new=matches.test.js no conoce ninguna de las 4 RPCs nuevas; seam=none;
no_claim=no prueba nada de la lógica SQL (supabase está mockeado)

**Bloque SQL (19 caminos) — no hay con qué probarlo hoy.** → R5.

**Tests que quedan obsoletos:** los de `confirmDeck` en `matches.test.js` que asserten
el insert directo a `match_player_decks` más el update de `deck_confirmed_at` dejan de
describir el comportamiento real cuando pase a ser una RPC. Propuesta: reescribirlos
contra la nueva firma, no borrarlos (siguen protegiendo un contrato público). Ningún
test se retira del todo.

## 4. Revisión de rendimiento

Escala real: 5 jugadores, 1 partida, 9 filas en `match_holes`. Nada de lo de abajo
importa hoy por volumen; importa porque son patrones que se quedan en el código.

### F15 — `listMyActiveMatches` ya trae 4 recursos embebidos y R4 le añade estado del embudo

`[INFORMATIONAL] (confianza: 7/10)` `src/lib/api/matches.js:143-152` embebe `courses`,
`match_players→profiles`, `match_holes` y `match_player_decks` en una sola consulta.
`match_holes` se trae **solo para contar hoyos** (`holes: row.match_holes.length`): son
18 filas por partida transferidas para obtener un entero. Con 5 jugadores es irrelevante;
con una pantalla de "mis partidas" y varias partidas por jugador se convierte en el
patrón de traerse la tabla para hacer un `count`.

Recomendación: no tocarlo en PR-A (es exactamente el fichero que hay que desplegar sin
cambios de más). En PR-B, cuando se le añada el estado del embudo, cambiar
`match_holes ( hole_number )` por `match_holes ( count )` — PostgREST soporta agregados
embebidos y el cambio es de una línea.

**Disposición: aceptado** — dentro de PR-B.

### F16 — La guarda de una-partida-viva no tiene índice que la sostenga

`[INFORMATIONAL] (confianza: 7/10)` La guarda consulta, por los dos jugadores,
`match_players` unido a `matches` filtrando por `status in ('pending','active')`.
Índices actuales relevantes: `matches` solo tiene su PK; `match_players` tiene PK más
las FK. No hay índice por `status` ni por `(user_id, match_id)`.

Con 1 partida es un seq scan sobre 1 fila. Es correcto hoy y seguirá siendo correcto con
cientos. Lo anoto porque la guarda corre en **cada** creación de partida y es la
consulta que más va a crecer: cuando `matches` tenga decenas de miles de filas, un
índice parcial `create index on matches (status) where status in ('pending','active')`
lo deja en nada. No es trabajo de ahora.

**Disposición: aceptado como nota, sin trabajo en PR-A ni PR-B.** El proyecto pide
pensar en escala; la respuesta honesta aquí es "el índice correcto se sabrá cuando haya
datos", no añadirlo a ciegas.

### Sin hallazgos en

- **N+1:** no hay bucles con consultas dentro en ninguno de los caminos nuevos. El único
  bucle del SQL es el `for v_hole in ... loop insert` de `create_match`, acotado a 18
  iteraciones por el propio `holes_count` validado.
- **Memoria:** sin cargas de ficheros completos ni cachés sin límite.
- **Llamadas bloqueantes sin timeout:** las RPCs son peticiones HTTP sueltas; `matchSync`
  ya tiene su propio reintento y el embudo no pasa por él (crear/aceptar/confirmar son
  acciones únicas, D6).

**Dispositions (Rendimiento):** F15 aceptado (PR-B) · F16 aceptado como nota, sin
trabajo. Sin decisiones nuevas.

## Decision ledger

### R1: Cómo se aplica el Rango en un abandono sin relajar `apply_match_result`

Finding: F6, CRITICAL, confianza 9/10, `apply_match_result` (Supabase) + punto 5 del
documento, revisor: Claude (nativo).

Plan baseline: propuesta original del documento, punto 5 — "relajar
`apply_match_result` para que acepte partidas en `abandoned` **sin exigir las 2
confirmaciones**, manteniendo la validación de suma cero y añadiendo que el ganador
tiene que ser el jugador que no abandonó". El propio documento la marca como "a validar
en `/plan-eng-review`" y "el punto más delicado de todo el bloque".

Runtime evidence: `apply_match_result` exige `v_confirmations >= 2` contra
`match_confirmations`, valida suma cero contra `profiles.points` en vivo, deriva el
ganador del signo del delta y escribe `status='confirmed'` incondicionalmente.
`match_confirmations` ya tiene `UNIQUE (match_id, user_id)`. `listMyMatchHistory`
(`src/lib/api/matches.js:188`) filtra `.eq("status","confirmed")`, así que una partida
que se quede en `abandoned` no aparece en el historial de ninguno de los dos.

Comparison grid:

| Elemento | Actual | A) confirmaciones de servidor | B) relajar el chequeo (documento) | C) RPC aparte |
|---|---|---|---|---|
| Chequeo de 2 confirmaciones en `apply_match_result` | exige 2 | **intacto** | se añade un `or status='abandoned'` | intacto |
| Quién atestigua el resultado del abandono | n/a | el servidor, dentro de `abandon_match` | nadie: se salta la atestiguación | el servidor, en la RPC nueva |
| Guarda "el ganador es quien no abandonó" | no existe | **se añade** a `apply_match_result` | se añade a `apply_match_result` | se añade solo a la RPC nueva |
| Agujero de F6 en partidas normales | abierto | sigue abierto (TODO) | sigue abierto (TODO) | sigue abierto (TODO) |
| Dónde vive la fórmula de Elo | solo `rango.js` | solo `rango.js` | solo `rango.js` | solo `rango.js` |
| Funciones que mueven puntos de Rango | 1 | **1** | 1 | **2** |
| La partida sale en el historial | n/a | sí (`status` pasa a `confirmed`, razón en `abandoned_by`) | sí | depende de lo que escriba la RPC nueva |
| Trabajo | n/a | 2 inserts + 1 guarda | 1 condición + 1 guarda | duplicar la función de puntos |

Question D2:
D2 — Cómo aplicar el Rango en un abandono sin relajar `apply_match_result`
Proyecto/rama/tarea: birdix-app, rama main — punto 5 del embudo, la única función que
mueve puntos de Rango.
ELI10: Cuando alguien abandona una partida, hay que quitarle puntos y darlos al rival.
Hoy la función que mueve puntos exige que los dos jugadores hayan confirmado el
resultado, y el que abandona no va a confirmar su propio castigo. El documento propone
quitarle ese requisito a la función. Hay otra salida: que el servidor, que acaba de
verificar el abandono, firme las dos confirmaciones él mismo. La función no se toca y su
garantía sigue siendo verdad literalmente.
Stakes si se elige mal: es la única función que mueve puntos de Rango. Relajarla mal
significa partidas que mueven puntos sin que nadie las haya confirmado, y el Rango es
el producto entero.
Recommendation: A, porque deja `apply_match_result` byte a byte igual y encima le añade
una guarda, así que la función acaba más estricta que hoy, no más laxa.
Completeness: A=10/10, B=7/10, C=6/10
Pros / cons:
A) Confirmaciones firmadas por el servidor (recommended)
  ✅ `apply_match_result` no se toca: su invariante de 2 confirmaciones sigue siendo cierta
  ✅ Sigue habiendo una sola función que mueve puntos de Rango, como se decidió en PR1
  ❌ Las filas de `match_confirmations` ya no significan "un humano le dio a confirmar"
B) Relajar el chequeo de confirmaciones, como dice el documento
  ✅ Es el cambio más pequeño de los tres: una condición y una guarda
  ✅ Deja explícito en el SQL que un abandono es un camino distinto
  ❌ Abre un camino que mueve puntos sin ninguna confirmación: si la guarda del ganador tiene un bug, no hay segunda red
C) Una RPC aparte para el resultado del abandono
  ✅ El camino del abandono queda aislado y no puede romper el flujo normal
  ✅ Se puede dar permisos distintos a cada una
  ❌ Pasa de 1 a 2 funciones que mueven puntos de Rango: justo lo que PR1 decidió evitar
Net: A compra la garantía de no tocar la función crítica a cambio de que una fila de
confirmación pueda venir del servidor en vez de un humano.
Header: Rango al abandonar
Options:
A) Confirmaciones de servidor
   `abandon_match` (SECURITY DEFINER) registra el abandono y además inserta las dos
   filas de `match_confirmations` con `on conflict do nothing`. `apply_match_result`
   queda intacta y se le **añade** la guarda de que el ganador sea el jugador cuyo
   `abandoned_by` no coincide. El primer cliente que cargue la partida aplica el Rango
   como en una partida normal. `status` pasa a `confirmed` y la razón queda en
   `abandoned_by`, lo que además hace que la partida salga en el historial.
B) Relajar el chequeo de confirmaciones
   Lo que propone el documento: `apply_match_result` acepta `status='abandoned'` sin
   exigir las 2 confirmaciones, manteniendo la suma cero y añadiendo la guarda del
   ganador.
C) RPC aparte para el abandono
   Una `apply_abandon_result` nueva que mueve los puntos por su cuenta, con su propia
   validación, dejando `apply_match_result` sin tocar.

State: approved
Actual answer: A) Confirmaciones de servidor — respuesta del fundador a D2, 5 nov 2026
Accepted scope: (1) `abandon_match` nueva, SECURITY DEFINER: valida que el llamante sea
participante, escribe `status='abandoned'`, `abandoned_by = auth.uid()`, `winner_id` = el
otro jugador, `finished_at = now()`, e inserta las dos filas de `match_confirmations`
con `on conflict (match_id, user_id) do nothing`. (2) `apply_match_result`: se le AÑADE
la guarda de que, si `abandoned_by` no es NULL, el ganador derivado del signo del delta
tenga que ser el jugador distinto de `abandoned_by`; el chequeo de 2 confirmaciones y la
validación de suma cero NO se tocan. (3) El primer cliente que cargue la partida aplica
el Rango con `confirmMatchResult` del flujo normal; `status` termina en `confirmed` y la
razón del abandono queda en `abandoned_by`, lo que hace que la partida salga en
`listMyMatchHistory`. (4) El agujero general de F6 (cualquiera puede mandar cualquier
delta de suma cero en una partida normal) NO entra aquí: va a TODOS.md.
History: —

### R2: Barredores de estado frente a caducidad derivada

Finding: F2, CRITICAL, confianza 9/10, `src/lib/api/matches.js:114-139`, revisor:
Claude (nativo).

Plan baseline: el documento propone **añadir** un segundo barredor — "una partida en
`pending` con más de 24 h se considera caducada... implementarlo en carga (perezoso), no
con un cron". No menciona el barredor de 30 minutos que ya existe en el código.

Runtime evidence: `src/lib/api/matches.js:114` `STALE_ACTIVE_MATCH_MS = 30*60*1000`;
`:124-131` un `update {status:'abandoned'}` fire-and-forget con
`.then(() => {}, () => {})`, filtrado a `.eq("created_by", userId)`; `:141` la lectura
filtra `.gte("started_at", cutoffIso)`. Nunca ha afectado a nadie porque esta build no
está desplegada (ver F1). Una vuelta de 9 hoyos dura unas 2 h.

Comparison grid:

| Elemento | Actual | A) caducidad derivada | B) arreglar los dos barredores | C) solo la constante |
|---|---|---|---|---|
| Barredor de 30 min sobre `active` | escribe `abandoned` a los 30 min | **eliminado** | se queda, con constante nueva y `abandoned_by` | se queda, con constante nueva |
| Barredor de 24 h sobre `pending` | no existe | **no se crea** | se crea | no se crea |
| Escrituras de estado sin actor humano | 1 (silenciosa) | **0** | 2 (con registro de error) | 1 (silenciosa) |
| Cómo se decide "tengo una partida viva" | n/a | predicado por antigüedad al leer | lectura tras el barrido | lectura tras el barrido |
| ¿La partida desaparece del Home a media vuelta? | sí, a los 30 min | no | no | no |
| ¿Un `abandoned` puede quedar sin `abandoned_by`? | sí | **no** | no | sí |
| ¿Funciona cuando el invitado cierra la invitación? | n/a | sí (predicado, sin escritura) | solo si la RPC es SECURITY DEFINER (R3) | n/a |
| Trabajo | n/a | borrar ~12 líneas + predicado en la guarda | 2 barredores + columnas | 1 constante |
| Humano / CC | n/a | ~2 h / ~15 min | ~4 h / ~25 min | ~5 min / ~2 min |

Question D3:
D3 — Barredores de estado frente a caducidad derivada
Proyecto/rama/tarea: birdix-app, rama main — qué pasa con las partidas que se quedan
colgadas, y quién escribe ese estado.
ELI10: Hay partidas que se quedan a medias: una invitación sin responder, o una vuelta
que nadie termina. Hoy el código las marca como abandonadas a los 30 minutos, desde el
móvil del que la creó, sin decírselo a nadie, y el documento propone añadir otro
barredor igual para las invitaciones de más de 24 h. La alternativa es no escribir nada:
una partida caducada simplemente no cuenta cuando se pregunta "¿tienes una partida
viva?". El estado solo cambia cuando un jugador pulsa algo.
Stakes si se elige mal: con 30 minutos tal cual, la primera vuelta real de 9 hoyos
desaparece del móvil de los dos jugadores a mitad de partida y queda marcada como
abandonada, que a partir de ahora significa derrota.
Recommendation: A, porque una partida caducada no necesita que nadie le escriba el
estado, y cada escritura sin actor es un sitio donde se puede fabricar una derrota que
nadie pidió.
Completeness: A=10/10, B=8/10, C=4/10
Pros / cons:
A) Caducidad derivada, sin barredores (recommended)
  ✅ Cero escrituras de estado sin que un jugador haya actuado: `abandoned` siempre tiene culpable
  ✅ Borra el barredor de 30 min antes de que llegue a desaparecer una vuelta real a mitad de partida
  ❌ Una partida colgada se queda en `pending`/`active` para siempre en la tabla, aunque ya no cuente para nada
B) Arreglar los dos barredores y quedárselos
  ✅ La tabla queda limpia: lo caducado acaba con su estado final escrito
  ✅ Mantiene el diseño tal como lo propone el documento, sin replantear nada
  ❌ Deja dos escrituras de estado sin actor, cada una con su propio modo de fallo silencioso y su dependencia de la RLS
C) Cambiar solo la constante de 30 minutos ahora
  ✅ Es el arreglo de 5 minutos que entra en el deploy de hoy sin pensar en nada más
  ✅ Quita el riesgo inmediato de que una vuelta real desaparezca a media partida
  ❌ Deja el barredor escribiendo `abandoned` sin `abandoned_by`, que es justo lo que choca con la regla nueva de derrota
Net: A cambia una tabla menos ordenada por la garantía de que nadie pierde una partida
sin haberla abandonado.
Header: Partidas colgadas
Options:
A) Caducidad derivada
   Borrar el barredor de 30 min de `listMyActiveMatches` y no crear el de 24 h. La
   guarda de "una partida viva por jugador" dentro de `create_match` ignora por
   antigüedad: `pending` con `created_at` de más de 24 h y `active` con `started_at` de
   más de 6 h no cuentan. `matches.status` solo lo escribe un jugador actuando
   (`respond_to_match`, `confirm_deck`, cancelar, `abandon_match`). La lectura del Home
   deja de filtrar por antigüedad y muestra `pending` y `active`.
B) Arreglar los dos barredores
   Subir la constante de 30 min a un valor realista (6 h), hacer que el barrido escriba
   también `abandoned_by` (o un estado distinto como `cancelled`), registrar los
   errores en vez de tragárselos, y añadir el barredor de 24 h para `pending` como pide
   el documento.
C) Solo la constante
   Subir `STALE_ACTIVE_MATCH_MS` a 6 h en el deploy de hoy y dejar la decisión completa
   para la sesión del embudo.

State: approved
Actual answer: A) Caducidad derivada — respuesta del fundador a D3, 5 nov 2026
Accepted scope: **partido entre los 2 PRs, porque el barredor de 30 min se despliega
hoy y el predicado todavía no existe.**
· PR-A (hoy): borrar el bloque `update {status:'abandoned'}` de
`listMyActiveMatches` (`src/lib/api/matches.js:124-131`), borrar la constante
`STALE_ACTIVE_MATCH_MS` y quitar el filtro `.gte("started_at", cutoffIso)` de la
lectura (`:141`). Sin esto, la primera vuelta real desaparece a los 30 minutos.
· PR-B (embudo): la guarda de una-partida-viva dentro de `create_match` ignora por
antigüedad — `pending` con `created_at <= now() - interval '24 hours'` y `active` con
`started_at <= now() - interval '6 hours'` no cuentan. No se crea ningún barredor de
24 h. `matches.status` solo lo escriben las 4 RPCs cuando un jugador actúa. La lectura
del Home pasa a mostrar `pending` además de `active` (ver R4).
History: —

### R3: Autoridad para escribir en `matches` — `SECURITY DEFINER` frente a ampliar la RLS

Finding: F3, CRITICAL, confianza 9/10, `create_match` (Supabase) + política
`match creator can update match`, revisor: Claude (nativo).

Plan baseline: el documento no menciona `SECURITY DEFINER` ni la RLS de `matches` en
ningún punto. Las 3 RPCs nuevas se describen solo por su comportamiento.

Runtime evidence: `create_match` es `LANGUAGE plpgsql SET search_path TO 'public'`, sin
`SECURITY DEFINER` (compárese con `apply_match_result` y `get_match_context`, que sí lo
son). `pg_policies`: la única política UPDATE de `matches` es
`(created_by = auth.uid())`; la SELECT de `match_players` es
`private.is_match_participant(match_id, auth.uid())` más `(user_id = auth.uid())`.
`authenticated` tiene `INSERT,SELECT,UPDATE` de tabla sobre `matches`.

Comparison grid:

| Elemento | Actual | A) las 4 RPCs SECURITY DEFINER | B) ampliar la RLS a participantes |
|---|---|---|---|
| `create_match` | INVOKER | **DEFINER** | INVOKER |
| Las 3 RPCs nuevas | no existen | DEFINER | INVOKER |
| Política UPDATE de `matches` | solo el creador | **sin cambios** | cualquier participante |
| ¿Puede el invitado rechazar/cancelar/abandonar? | n/a | sí, vía RPC | sí, y también por REST directo |
| ¿Puede un jugador escribir `winner_id`/`is_ranked`/`suspicious_match` a mano? | solo el creador | **no** | **sí, cualquiera de los dos** |
| ¿Funciona la guarda de una-partida-viva? | n/a (no existe) | **sí**: la función ve las filas del otro | no: la RLS SELECT las sigue ocultando |
| Dónde vive la comprobación de participante | en la RLS | explícita dentro de cada función | en la RLS |
| Trabajo | n/a | 4 funciones + 4 comprobaciones explícitas | 1 política |

Question D4:
D4 — Quién tiene permiso para escribir el estado de una partida
Proyecto/rama/tarea: birdix-app, rama main — las 3 RPCs nuevas del embudo escriben en
`matches`, y hoy solo el creador tiene permiso para eso.
ELI10: La base de datos solo deja cambiar una partida al jugador que la creó. El embudo
necesita que el invitado también pueda rechazarla, cancelarla o abandonarla. Hay dos
formas: que las funciones corran con permisos elevados y comprueben ellas mismas quién
llama, o abrir el permiso a los dos jugadores en la propia base de datos. La segunda es
más corta pero también les deja escribir a mano columnas como quién ganó.
Stakes si se elige mal: con el permiso tal como está, rechazar una invitación o
abandonar no hace nada para el invitado — cero filas afectadas, sin error. Y la guarda
de "una partida viva por jugador" pasa en vacío, porque la función no puede ver las
partidas del otro jugador, así que no previene nada de lo que está diseñada para
prevenir.
Recommendation: A, porque B le daría a cualquiera de los dos jugadores permiso para
escribir `winner_id` directamente por REST, y además no arregla la guarda: la función
seguiría sin poder ver las partidas del rival.
Completeness: A=10/10, B=5/10
Pros / cons:
A) Las 4 RPCs con SECURITY DEFINER (recommended)
  ✅ La guarda de una-partida-viva funciona de verdad: la función ve las filas de los dos jugadores
  ✅ `winner_id`, `is_ranked` y `suspicious_match` siguen fuera del alcance de cualquier escritura directa por REST
  ❌ La comprobación de "¿eres participante?" pasa de estar en la RLS a repetirse explícita dentro de cada función
B) Ampliar la política UPDATE de `matches` a cualquier participante
  ✅ Un solo cambio de política en vez de tocar cuatro funciones
  ✅ La comprobación de participante sigue viviendo en un solo sitio, la RLS
  ❌ Deja a los dos jugadores escribir `winner_id` y `suspicious_match` directamente por REST, y encima no arregla la guarda de una-partida-viva
Net: A paga repetir la comprobación de participante en cuatro sitios a cambio de que la
guarda funcione y de no abrir `winner_id` a escritura directa.
Header: Permisos de escritura
Options:
A) Las 4 RPCs con SECURITY DEFINER
   `create_match` pasa a `SECURITY DEFINER` y las 3 nuevas (`respond_to_match`,
   `confirm_deck`, `abandon_match`) se crean así desde el principio, todas con
   `SET search_path TO 'public'` y una comprobación explícita de que `auth.uid()` es
   participante (y del lado correcto, cuando la regla lo exija: `respond_to_match` solo
   player_b). La política UPDATE de `matches` se queda como está.
B) Ampliar la política UPDATE de `matches`
   Cambiar `(created_by = auth.uid())` por una comprobación de participante, y dejar
   las RPCs como INVOKER.

State: approved
Actual answer: A) Las 4 RPCs SECURITY DEFINER — respuesta del fundador a D4, 5 nov 2026
Accepted scope: PR-B. `create_match` se recrea como `SECURITY DEFINER SET search_path
TO 'public'`. `respond_to_match`, `confirm_deck` y `abandon_match` se crean igual. La
política UPDATE de `matches` (`created_by = auth.uid()`) NO se toca, así que
`winner_id`, `is_ranked` y `suspicious_match` siguen sin ser escribibles por REST
directo salvo por el creador.

**Añadido 1 del fundador (5 nov) — una sola definición de "participante".** La
comprobación NO se repite a mano en las 4 funciones: se usa
`private.is_match_participant(match_id, auth.uid())`, verificada en vivo como
`LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'`. Matiz: solo prueba
participación, no lado — `respond_to_match` necesita además su propia comprobación de
`side = 'player_b'` encima.

**Añadido 2 del fundador (5 nov) — cerrar el permiso de ejecución.** Cada RPC nueva
lleva `revoke execute on function ... from public, anon;` y
`grant execute on function ... to authenticated;`. No es una práctica nueva en este
proyecto: `create_match`, `apply_match_result` y `get_match_context` ya tienen
`proacl = postgres=X | authenticated=X` sin entrada de PUBLIC, así que alguien ya lo
hizo. Es consistencia con lo que hay, no una capa añadida.

**Verificación pedida por el fundador — ¿cubren las validaciones de `create_match` lo
que antes comprobaba la RLS?** Sí, las cuatro políticas que deja de atravesar:
`matches` INSERT (`created_by = auth.uid()`) se cumple por construcción porque
`v_player_a := auth.uid()` con guarda de NULL y el insert usa `v_player_a` — aun así se
añade un assert explícito en vez de dejarlo implícito; `match_players` INSERT
(`m.created_by = auth.uid()`) se cumple porque los dos inserts apuntan a la partida que
acaba de crear; `match_holes` INSERT (llamante ∈ `match_players`) se cumple porque
inserta su propia fila de jugador antes; `match_player_decks` INSERT
(`user_id = auth.uid()`) queda fuera, porque ese insert sale de `create_match`.

**Riesgo nuevo que sale de esa verificación (F9):** `confirm_deck`, al ser DEFINER, deja
de pasar por `user_id = auth.uid()` de `match_player_decks`. Tiene que derivar el
usuario de `auth.uid()` dentro de la función y **no aceptar nunca un parámetro
`user_id`** — si no, un jugador puede escribir el mazo secreto del rival, que es justo
lo que D26 protege. La firma del documento (`confirm_deck(match_id, selected_cards)`)
ya es la correcta; el envoltorio actual `confirmDeck({matchId, userId, selectedCards})`
(`src/lib/api/matches.js:375`) pasa `userId` y tiene que dejar de hacerlo.
History: Respuesta inicial a D4 el 5 nov 2026 (A, las 4 RPCs SECURITY DEFINER) con
alcance "comprobación explícita de participante dentro de cada función". Ampliada el
mismo día por el fundador con los dos añadidos de arriba: la comprobación pasa a
reutilizar `private.is_match_participant` en vez de repetirse, y se añaden los
revoke/grant de execute. La elección de opción (A) no cambia.

### R4: Cómo descubre el invitado una partida en `pending`

Finding: F4, CRITICAL, confianza 9/10, `src/lib/api/matches.js:141` y
`src/hooks/useMatchRealtime.js`, revisor: Claude (nativo).

Plan baseline: el documento define `respond_to_match` pero no dice desde dónde se llama
ni cómo aparece la invitación en la pantalla del invitado.

Runtime evidence: `listMyActiveMatches` filtra `.eq("status", "active")` — un `pending`
no sale. `subscribeToMatchHoles` (`src/hooks/useMatchRealtime.js`) escucha `match_holes`
filtrado por `match_id`, así que requiere conocer ya la partida. No hay ningún canal
Realtime sobre `matches` ni `match_players`. El TODO de D7 ya anotaba la mitad: "si el
rival crea la partida mientras ya estás en Partidas, no la descubres hasta cambiar de
pestaña o recargar".

Comparison grid:

| Elemento | Actual | A) consulta + canal Realtime | B) solo consulta | C) aplazar |
|---|---|---|---|---|
| `listMyActiveMatches` | `status='active'` | `status in ('pending','active')` | `status in ('pending','active')` | sin cambios |
| Canal Realtime sobre `match_players` | no existe | **se añade**, filtrado por `user_id` | no | no |
| Cuándo ve el invitado la invitación | nunca | al instante | al montar o cambiar de pestaña | nunca |
| Cuándo ve el creador que el rival aceptó | n/a | al instante | al cambiar de pestaña | n/a |
| ¿Sirve la sala de espera que ya existe? | `getMatchPlayersStatus` por sondeo | sí, pasa a ser reactiva | sí, con sondeo | n/a |
| ¿Se puede llamar a `respond_to_match`? | n/a | sí | sí | **no**: el embudo no funciona |
| Trabajo | n/a | 1 filtro + 1 hook nuevo | 1 filtro | 0 |
| Humano / CC | n/a | ~1 día / ~45 min | ~2 h / ~10 min | 0 |

Question D5:
D5 — Cómo descubre el invitado la invitación
Proyecto/rama/tarea: birdix-app, rama main — el embudo empieza en `pending`, y hoy
ninguna pantalla muestra partidas en `pending`.
ELI10: El embudo hace que una partida nazca en estado "pendiente", esperando que el
rival acepte. El problema es que la única consulta que busca partidas pide solo las que
están "en juego", así que una pendiente no aparece en ninguna pantalla de nadie y el
botón de aceptar no tiene desde dónde pulsarse. Además, el único canal en tiempo real
que hay escucha los hoyos de una partida que ya conoces, no las invitaciones nuevas.
Stakes si se elige mal: sin esto, el embudo está construido pero no se puede usar: nadie
puede aceptar una invitación. Y sin tiempo real, el que invita se queda mirando una
pantalla de espera que solo se actualiza si cambia de pestaña.
Recommendation: A, porque la pantalla de "Esperando a {rival}" ya existe
(`src/App.jsx:3640`) y hoy depende de sondear `getMatchPlayersStatus`; con el canal pasa
a ser reactiva y el embudo entero deja de necesitar que nadie recargue nada.
Completeness: A=10/10, B=7/10, C=2/10
Pros / cons:
A) Consulta ampliada más canal Realtime sobre `match_players` (recommended)
  ✅ La invitación aparece sola en el móvil del rival, sin recargar ni cambiar de pestaña
  ✅ Convierte en reactiva la sala de espera que ya existe y hoy depende de sondeo
  ❌ Es un segundo canal Realtime que mantener, y el patrón de reconexión de `useMatchRealtime` hay que repetirlo o extraerlo
B) Solo ampliar la consulta, sin tiempo real
  ✅ Un filtro y nada más: el embudo ya es usable de punta a punta
  ✅ Cero canales nuevos, cero riesgo de reconexión mal hecha
  ❌ El invitado solo ve la invitación al abrir la app o cambiar de pestaña, y el que invita se queda esperando sin saber si llegó
C) Aplazar la decisión
  ✅ No añade nada al alcance de PR-B
  ✅ Deja la pieza para cuando haya más señal de uso real
  ❌ Deja el embudo construido pero inutilizable: nadie puede aceptar una invitación
Net: A paga un segundo canal Realtime a cambio de que el embudo funcione sin que nadie
tenga que recargar nada.
Header: Ver la invitación
Options:
A) Consulta ampliada y canal Realtime
   `listMyActiveMatches` pasa a `status in ('pending','active')` y devuelve el estado del
   embudo (quién aceptó, quién confirmó mazo) para que la pantalla sepa qué pintar. Se
   añade una suscripción Realtime a `match_players` filtrada por `user_id = yo`,
   reutilizando el patrón de reconexión de `subscribeToMatchHoles` (extraído a una
   función compartida, no copiado).
B) Solo ampliar la consulta
   `listMyActiveMatches` pasa a `status in ('pending','active')`. Sin canal nuevo: la
   invitación aparece al montar la pantalla o al cambiar de pestaña, como hoy.
C) Aplazar
   Dejarlo fuera de PR-B y decidirlo en otra sesión.

State: approved
Actual answer: A) Consulta ampliada y canal Realtime — respuesta del fundador a D5,
5 nov 2026, **con una corrección del fundador al diseño de los canales**.
Accepted scope: PR-B.

**1. Consulta.** `listMyActiveMatches` pasa a `status in ('pending','active')` y
devuelve además el estado del embudo (`accepted_at` / `deck_confirmed_at` de los dos
lados) para que la pantalla sepa qué sub-paso pintar sin una segunda consulta.

**2. Dos suscripciones con filtros distintos (corrección del fundador).** La propuesta
original del revisor — un solo canal de `match_players` filtrado por `user_id = yo` —
era **incorrecta**: el filtro de Postgres Changes se evalúa contra la fila que cambia, y
cuando el rival confirma su mazo cambia SU fila, no la mía. Ese evento no se entrega con
ese filtro, así que habría resuelto el descubrimiento de la invitación y habría dejado
la sala de espera igual de muerta que hoy. Hacen falta dos:

- **Descubrir invitaciones:** `match_players` filtrado por `user_id = auth.uid()`.
  Filtrar por usuario es obligatorio aquí porque todavía no se conoce el `match_id`.
  Entrega el INSERT de mi propia fila cuando alguien me invita. La política
  `users can read own match player rows` (`user_id = auth.uid()`) lo permite.
- **Mover el embudo:** `match_players` filtrado por `match_id` de la partida en curso.
  Entrega las filas de **los dos** jugadores, y por tanto el `deck_confirmed_at` del
  rival. Verificado: la política SELECT es
  `private.is_match_participant(match_id, auth.uid())`, así que un participante lee
  ambas filas. Es además el mismo patrón de filtro que `subscribeToMatchHoles`, así que
  el código de reconexión compartido encaja sin forzarlo.

**3. Publicación de Realtime: sin cambios.** Verificado en vivo —
`pg_publication_tables` muestra que `supabase_realtime` ya incluye `matches`,
`match_players`, `match_holes` y `match_confirmations`.

**4. Nota de implementación (sale de la verificación).** `match_players` tiene
`REPLICA IDENTITY DEFAULT` y su PK es `id`, no `match_id` ni `user_id`. En un evento
DELETE solo viajan las columnas de identidad, así que un filtro por `match_id` o
`user_id` no recibiría DELETEs. El embudo no borra filas de `match_players` (cancelar y
abandonar escriben `matches.status`), así que no afecta — pero el embudo no debe
apoyarse nunca en DELETE para avanzar.

**5. El canal es señal, no fuente de verdad.** Al recibir un evento se vuelve a lanzar
la consulta del punto 1; no se reconstruye el estado desde el payload. Así no hace falta
meter `matches` en ningún canal ni mantener dos representaciones del estado del embudo
(bandera roja 2: fuga de información).

**6. Criterio de aceptación explícito de los dos lados (pedido por el fundador).** No
vale verificar solo al que invita: (a) B ve la invitación aparecer sola, sin recargar ni
cambiar de pestaña; (b) A ve "ya ha elegido" cuando B confirma su mazo, sin recargar.
Las dos entran en el guion de verificación de dos dispositivos y en el Test Plan.

History: **Registro erróneo corregido el 5 nov 2026.** D5 nunca se preguntó: la ficha
de R4 se guardó y el mensaje del fundador ("elijo la 1", con dos añadidos sobre
`SECURITY DEFINER`) llegó antes de que se disparase la pregunta. El revisor lo asignó a
R4 por la regla de "una letra suelta va a la ficha pendiente más reciente"; el fundador
aclaró que iba dirigido a D4 y que no había visto las opciones de D5. Se anula el
alcance que se había registrado (consulta ampliada + canal Realtime) y la ficha vuelve
a pendiente sin cambios aprobados. R3/D4 no se ve afectada: ya estaba respondida como A
antes de ese mensaje, y los dos añadidos sí eran suyos y siguen en su alcance.

### R5: Cómo se prueban los 19 caminos que viven en SQL

Finding: hueco de la revisión de tests, CRITICAL, confianza 9/10,
`src/lib/api/matches.test.js` (725 líneas, `supabase` mockeado), revisor: Claude
(nativo).

Plan baseline: el documento no menciona tests en ningún punto.

Runtime evidence: 138 tests en 9 ficheros, todos JS. `matches.test.js` mockea
`supabase`, así que ninguna prueba toca Postgres. Las RPCs existentes se verificaron a
mano contra Supabase real con cuentas de verdad (consta en los TODOs de PR1 y D7). No
hay jsdom ni `@testing-library/react`, decisión consciente de D7. El embudo mete en SQL
la guarda de una-partida-viva, 4 transiciones de estado, el umbral de 3 hoyos y la
guarda del abandono: 19 caminos sin forma de probarse.

Comparison grid:

| Elemento | Actual | A) script de verificación en vivo | B) pgTAP | C) solo a mano |
|---|---|---|---|---|
| Tests JS de los envoltorios | 138, mockeados | +~25, mockeados | +~25, mockeados | +~25, mockeados |
| Los 19 caminos SQL | sin cubrir | cubiertos, repetible | cubiertos, en CI | sin cubrir |
| Dónde corre | script contra Supabase real | dentro de Postgres | en la cabeza de Sergio |
| ¿Se puede repetir tras un cambio? | sí, un comando | sí, un comando | no |
| ¿Prueba la RLS y los permisos de verdad? | **sí, con 2 cuentas reales** | parcial (hay que simular el JWT) | sí, pero una vez |
| Dependencias nuevas | ninguna (node + supabase-js ya están) | extensión pgTAP + runner | ninguna |
| Riesgo de dejar basura en la base real | sí: hay que limpiar tras cada pasada | ninguno (transacción) | sí |
| Humano / CC | ~1 día / ~45 min | ~2 días / ~1,5 h | ~2 h / ~0 |

Question D6:
D6 — Cómo se prueban los 19 caminos que viven en SQL
Proyecto/rama/tarea: birdix-app, rama main — el embudo pone su parte más delicada en
funciones de Postgres, y este repo no tiene forma de probar SQL.
ELI10: Las 138 pruebas que hay son de JavaScript con la base de datos simulada, así que
ninguna comprueba lo que de verdad hacen las funciones de Postgres. El embudo mete ahí
lo más delicado: la guarda de una partida por jugador, las cuatro transiciones de
estado y la guarda de quién pierde al abandonar. Hay tres salidas: un script que ejecuta
el embudo entero contra Supabase de verdad con dos cuentas de prueba, instalar un
framework de tests dentro de Postgres, o seguir verificando a mano como hasta ahora.
Stakes si se elige mal: los dos bugs que más han dolido en este proyecto fueron de esta
capa exacta — una política RLS que no dejaba al rival leer su fila, y un `GRANT` que
faltaba y devolvía 403. Ninguno lo habría cogido un test con la base simulada.
Recommendation: A, porque es la única de las tres que prueba la RLS y los permisos con
dos sesiones autenticadas de verdad, que es precisamente donde han estado los dos
fallos que bloquearon partidas reales.
Completeness: A=9/10, B=8/10, C=3/10
Pros / cons:
A) Script de verificación en vivo con 2 cuentas de prueba (recommended)
  ✅ Es el único que ejerce la RLS y los GRANT con dos sesiones autenticadas reales, donde han estado los 2 fallos que bloquearon partidas
  ✅ Cero dependencias nuevas: node y supabase-js ya están en el repo
  ❌ Escribe en la base de datos real, así que necesita limpiar tras cada pasada y no puede correr en CI sin un proyecto aparte
B) pgTAP dentro de Postgres
  ✅ Corre en una transacción y revierte: no deja basura ni toca datos reales
  ✅ Es el estándar para probar lógica de Postgres y podría entrar en CI
  ❌ Simular el JWT de dos usuarios distintos para probar RLS es incómodo, y es justo la parte donde han estado los fallos reales
C) Seguir verificando a mano
  ✅ Cero trabajo nuevo y es exactamente lo que se hizo en PR1 y D7, que acabaron funcionando
  ✅ Deja todo el presupuesto de esta tanda en construir el embudo
  ❌ 19 caminos sin red: cada cambio futuro del embudo vuelve a depender de que alguien se acuerde de probar los mismos casos a mano
Net: A paga limpiar datos de prueba en la base real a cambio de ser el único que prueba
la capa donde este proyecto ya se ha roto dos veces.
Header: Tests de SQL
Options:
A) Script de verificación en vivo
   Un script ejecutable (`scripts/verify-funnel.mjs`, node + supabase-js, sin
   dependencias nuevas) que crea 2 usuarios de prueba, recorre el embudo entero
   (invitar → rechazar; invitar → aceptar → los dos mazos → active; cancelar antes del
   hoyo 3; abandonar después del hoyo 3 con el Rango aplicado), asserta cada rechazo
   esperado y borra lo que creó al terminar. Se corre a mano antes de desplegar PR-B y
   cada vez que se toque una RPC. Los ~25 tests JS de los envoltorios van aparte, en
   `matches.test.js`.
B) pgTAP
   Instalar la extensión pgTAP y escribir los 19 casos como tests SQL que corren en una
   transacción y revierten, simulando el JWT con `set local request.jwt.claims`.
C) Solo verificación a mano
   Como en PR1 y D7: una lista de comprobación en el plan y Sergio la recorre con 2
   móviles antes de desplegar. Solo se añaden los ~25 tests JS de los envoltorios.

State: approved
Actual answer: C) pgTAP dentro de Postgres — respuesta del fundador a D6, 5 nov 2026,
**corrigiendo un error factual del revisor**.
Accepted scope: PR-B.

**Corrección del fundador (aceptada).** El revisor había puesto como contra de pgTAP
que "no prueba los GRANT de tabla, que es lo que bloqueó a Ignacio". Es **falso**.
`set local role authenticated` cambia el `current_user` de Postgres, y los privilegios
de tabla se comprueban contra `current_user`, así que los GRANT se aplican igual que en
una petición real; `set local request.jwt.claims` hace que `auth.uid()` devuelva el
usuario correcto y las políticas RLS se evalúan idénticas. No es una aproximación de la
RLS: es la RLS y el GRANT reales. Prueba: así es exactamente como se encontró el bug del
GRANT esta mañana, con el error literal
`42501: permission denied for table match_player_decks / HINT: GRANT INSERT ON
public.match_player_decks TO authenticated / CONTEXT: create_match line 54`.

**Alcance.** Instalar `pgtap` (1.3.3, verificado disponible en el proyecto,
`installed_version: null`) y escribir los 19 caminos SQL como tests que corren en una
transacción y revierten, con `set local role authenticated` +
`set local request.jwt.claims` para simular cada uno de los dos jugadores.

**Por qué se descartan las otras (razonamiento del fundador).**
- Opción A (script en vivo con `service_role`): coste que no estaba en la lista del
  revisor — exige la `service_role` key en un script local. Esa clave salta toda la RLS
  y basta un `git add` despistado para publicarla. Riesgo mayor que el hueco que tapa,
  y ahora hay datos de 5 personas reales. Además, **si el script falla a medias y deja
  una partida activa colgada, bloquea a un jugador real** por el límite de
  una-partida-viva que acaba de aprobarse en R2/R3. Interacción que el revisor no vio.
- Opción B (proyecto Supabase aparte): se descarta por su propio contra, que es el
  argumento correcto — dos proyectos divergen y entonces se prueba una base que no es
  la de verdad. Sin CI y en plan free, la divergencia es casi segura.

**Condición aceptada explícitamente: pgTAP no cubre la capa PostgREST.** El 400 del Home
(pedir `selected_cards` dentro de `match_players`, F1) era un bug de esa capa —
resolución de recursos embebidos— y pgTAP no lo habría cogido. Por tanto **la lista de
comprobación manual con 2 dispositivos de PR1/D7 se mantiene en el plan como parte
obligatoria, no se sustituye.** Incluye los 2 criterios Realtime de R4 (B ve la
invitación sola; A ve "ya ha elegido" sin recargar), que tampoco son observables desde
pgTAP.

**Nota 1 del revisor — hacia dónde apuntar los tests de GRANT después de R3.** Al pasar
`create_match` a `SECURITY DEFINER`, sus inserts internos corren como el dueño de la
función, así que la clase de error del GRANT (`CONTEXT: create_match line 54`) **ya no
puede reproducirse por dentro de las RPCs**. Es un beneficio de R3, pero significa que
los tests de GRANT+RLS tienen que apuntar a donde el cliente sigue tocando tablas
directamente como `authenticated`, que es donde queda el riesgo real: `match_holes`
UPDATE (los golpes y cartas de `matchSync`), `match_players` SELECT/UPDATE
(`markMatchOpened`), `match_player_decks` SELECT (hidratación del mazo),
`match_confirmations` INSERT (`confirmMatchResult`) y `matches` SELECT. Probar el GRANT
a través de una RPC DEFINER no probaría nada.

**Nota 2 del revisor — instalar pgtap sin ampliar la superficie de la API.** La
extensión es un objeto persistente en la base de producción (los tests revierten, la
extensión no). Instalarla en un esquema propio y aplicarle el mismo criterio del añadido
2 de R3: `revoke execute` a `anon` y `authenticated` sobre sus funciones, para que no
quede nada de pgtap llamable desde PostgREST.

History: —

### R6: Guarda de dirección por Stableford en `apply_match_result`

Finding: F6 (parcial), CRITICAL, confianza 9/10, `apply_match_result` (Supabase),
revisor: fundador (añadido 3 a la respuesta del TODO 1).

Plan baseline: el revisor había mandado F6 entero a TODOS.md, con el argumento de que
cerrarlo exige recalcular el Stableford en servidor y eso reabre la decisión vinculante
de PR1 (la fórmula vive solo en `rango.js`).

Runtime evidence: `match_holes` tiene `player_a_stableford` y `player_b_stableford`
(int4, default 0), verificado en el esquema. `listMyMatchHistory`
(`src/lib/api/matches.js:188`) ya los suma hoy en cliente:
`holes.reduce((sum, h) => sum + (h[mySide + '_stableford'] || 0), 0)`.

State: approved
Actual answer: Añadido 3 del fundador al TODO 1 — entra en PR-B, 5 nov 2026
Accepted scope: PR-B. `apply_match_result` valida que el ganador declarado (derivado del
signo del delta) sea el jugador con mayor Stableford acumulado, sumando
`match_holes.player_a_stableford` / `player_b_stableford`. **No reabre la decisión de
PR1:** sumar dos columnas de enteros ya escritas no es reimplementar la fórmula de Elo
en SQL; la fórmula sigue viviendo solo en `rango.js`. Como la función ya se va a editar
para la guarda del abandono (R1), son dos guardas en la misma edición.
**Límite explícito, registrado por el fundador:** esas columnas también las escribe el
cliente y la política UPDATE de `match_holes` es solo por fila (sin restricción de
columna), así que esto es **defensa en profundidad, no el cierre de F6**. El cierre
completo (recalcular la magnitud en servidor) se queda en TODOS.md.
History: —

## Dispositions de TODOS.md

Tres propuestas, tres respuestas del fundador, las tres con correcciones al encuadre del
revisor. Escritas en `TODOS.md` (3 entradas nuevas, líneas 79, 116 y 144).

**TODO 1 — cierre completo de F6.** Añadir a TODOS.md, con 3 precisiones del fundador:
(1) la prioridad es condicional y el **disparador va escrito en el propio TODO** ("antes
de habilitar registro público o de compartir la app fuera del grupo conocido"), porque un
TODO sin disparador no se hace nunca; (2) anotada la tensión con R1/D2 — al escribir
`abandon_match` las 2 confirmaciones, el requisito de "2 confirmaciones" ya puede
fabricarlo el servidor, lo que ensancha F6 y obliga a que la guarda del abandono sea
hermética; (3) la guarda de dirección por Stableford entra **ahora** en PR-B → R6.

**TODO 2 — fuga de `profiles.email`.** Añadir a TODOS.md **y arreglar en PR-A**, con el
encuadre corregido por el fundador: la fuga es **actual**, no futura — la clave anónima
viaja en el bundle, así que cualquiera que abra la web puede pedir `select=email` y
descargarse los correos de 5 personas reales. Y la solución no necesita vista ni RPC:
Postgres no tiene RLS por columna pero sí **permisos por columna** (la misma distinción
GRANT/RLS que bloqueó `match_player_decks`, invertida).

Corrección del revisor sobre la implementación: **el SQL no puede ir solo ni primero.**
`src/App.jsx:4363` y `:4454` hacen `select("*")` sobre `profiles`, y el bundle desplegado
también (verificado en `dist`: ``R.from(`profiles`).select(`*`)`` dos veces). Con
permisos por columna, `select=*` se expande a todas las columnas incluida `email` y la
petición falla entera con 42501 — login e hidratación de perfil caídos para los 5
jugadores. Orden obligatorio: primero las dos listas explícitas de columnas, se
despliega, y después (o con) la sentencia. La app no necesita `profiles.email`: los
cuatro sitios que leen el correo lo sacan de Auth (`App.jsx:4344`, `:4347`, `:4455`,
`:4456`). El `.update({birdix_hcp, full_name})` de `:4493` no lleva `.select()`, así que
revocar SELECT no lo afecta.

**TODO 3 — 2vs2 real.** Añadir a TODOS.md **y borrar el flujo local en PR-A en vez de
ocultarlo**, por el choque que detectó el fundador: PR-A borra `FAKE_RIVALS` y el 2vs2
depende de él en 5 puntos verificados — `buildTeamPlayers` (`App.jsx:401-403`), el
`fallback` (`:422-424`), el draft inicial (`:1400-1402`), la creación (`:1487-1488`) y
`renderPlayerPicker`, que hace `FAKE_RIVALS.map` (`:1571`). No se podían hacer las dos
cosas: o se rompía el 2vs2, o `FAKE_RIVALS` sobrevivía para sostener código muerto e
inalcanzable, lo contrario de lo pedido. Se borra; el TODO registra el commit **b1f5828**
para recuperarlo (`git show b1f5828:src/App.jsx`) y el gate de "no se construye hasta que
el 1vs1 funcione con el grupo".

## Voz externa — no disponible

`CODEX_MODE: not_installed`. El CLI de Codex no está instalado, así que se usó el
fallback nativo (subagente `Plan` con temporizador de 5 minutos). El temporizador venció
antes de que el subagente entregase informe: el resultado fue solo un arranque ("I'll
explore the codebase first to ground my critique in what's actually there") y la tarea se
canceló. Sin crédito a resultados tardíos, sin análisis cruzado de modelos.

- **Causa:** sin informe completo en cinco minutos.
- **Arreglo:** instalar Codex (`npm i -g @openai/codex`, luego `codex login`) para tener
  segunda opinión en los próximos reviews.
- **Consecuencia para este review:** cobertura de una sola voz. Registrado como
  `outside_status: unavailable`. **Este review no cuenta como revisión limpia por dos
  modelos.** Los puntos que más se habrían beneficiado de una segunda lectura son R1
  (confirmaciones firmadas por el servidor) y los umbrales de caducidad de R2 (24 h / 6 h),
  elegidos sin datos de uso real.

`OUTSIDE_VOICE_UNAVAILABLE`

## Approval readiness: PASS

| ID | Decisión | Respuesta real |
|---|---|---|
| D1 | Secuencia: PR-A hoy, PR-B después | respuesta del fundador a D1 |
| R1 | Confirmaciones firmadas por el servidor | respuesta a D2 |
| R2 | Caducidad derivada, cero barredores | respuesta a D3 |
| R3 | Las 4 RPCs `SECURITY DEFINER` + 2 añadidos del fundador | respuesta a D4 + mensaje del 5 nov |
| R4 | Consulta ampliada + 2 canales con filtros distintos | respuesta a D5 + corrección del fundador |
| R5 | pgTAP, checklist manual de 2 dispositivos obligatoria | respuesta a D6 + corrección factual del fundador |
| R6 | Guarda de dirección por Stableford | añadido 3 al TODO 1 |
| TODO 1/2/3 | anotados, con 2 cambios de alcance a PR-A | respuestas a las 3 preguntas de TODOS |

Cada remedio aceptado cita su respuesta real. Contratos de regresión: el de la sección de
tests (4 comportamientos a preservar) se arrastra con el alcance aprobado de R1-R6; no
hace falta una decisión aparte porque es proof requerida de comportamiento ya aprobado.
Sin remedios pendientes sin respuesta.

## NO está en alcance

- **2vs2 real contra Supabase** — el flujo local se borra en PR-A; construirlo de verdad
  espera a que el 1vs1 funcione con el grupo (TODOS.md:144).
- **Cierre completo de F6** (recalcular la magnitud del resultado en servidor) — choca con
  la decisión vinculante de PR1; solo entran las dos guardas de dirección (TODOS.md:79).
- **RLS por columna en `match_holes`** — sigue siendo convención de app, no restricción de
  base de datos. Es lo que haría infalsificables las guardas de R6 (TODOS.md:209).
- **Partir `src/App.jsx`** — Approach B, su propia sesión. Solo las pantallas nuevas del
  embudo nacen en `src/screens/` (F13).
- **Cron de limpieza de partidas** — innecesario con la caducidad derivada de R2.
- **Magic link** — decisión de agosto, sigue aplazada (TODOS.md:408).
- **Índice parcial para la guarda de una-partida-viva** — F16: el índice correcto se sabrá
  cuando haya datos, no se añade a ciegas.

## Qué ya existe (reutilizar, no reconstruir)

| Pieza | Dónde | Cómo se usa en este plan |
|---|---|---|
| Máquina de estados completa | `matches.status` CHECK + `match_players.accepted_at`/`deck_confirmed_at`/`opened_at` | Reutilizada tal cual: el embudo **no añade ningún estado nuevo** |
| Comprobación de participante | `private.is_match_participant`, `SECURITY DEFINER` | Reutilizada en las 4 RPCs (añadido 1 del fundador), no reimplementada |
| Fórmula de Rango | `src/domain/rango.js` (117 líneas, 155 tests) | Intacta. R1 evita duplicarla en SQL |
| Aplicación de resultado | `apply_match_result` | **Byte a byte igual** salvo dos guardas añadidas (R1, R6) |
| Hidratación del mazo propio | embed `match_player_decks` en `listMyActiveMatches:146` | Ya corregido el 27 ago, solo falta desplegarlo (F1) |
| Señal de "ya decidí" | `deck_confirmed_at` + `getMatchPlayersStatus:100` | Reutilizada; pasa de sondeo a reactiva (R4) |
| Patrón de reconexión Realtime | `subscribeToMatchHoles` en `useMatchRealtime.js` | Extraído a función compartida y reutilizado por los 2 canales nuevos |
| Progreso de hoyos | `match_holes.player_a/b_hole_submitted` | El umbral de 3 hoyos se deriva de aquí; sin columna nueva |
| Stableford por hoyo | `match_holes.player_a/b_stableford` | Base de la guarda de dirección de R6 |
| Publicación de Realtime | `supabase_realtime` ya incluye las 4 tablas | Sin cambios (verificado) |
| Unicidad de confirmación | `UNIQUE (match_id, user_id)` en `match_confirmations` | Sostiene el `on conflict do nothing` de R1 |

## Modos de fallo de los caminos nuevos

| Camino | Fallo realista | Cobertura | Qué ve el jugador |
|---|---|---|---|
| `create_match` guarda una-partida-viva | dos amigos quedan a jugar y uno tiene una invitación vieja sin responder | pgTAP + caducidad 24 h (R2) | mensaje claro en español (F10); se desbloquea solo a las 24 h |
| `respond_to_match` | el invitado acepta sin cobertura | acción única, sin outbox (D6 de agosto) | error claro + botón de reintentar |
| `confirm_deck` | doble pulsación | guarda de `deck_confirmed_at` ya confirmado | "ya has confirmado tu mazo" |
| `confirm_deck` | los dos confirman a la vez y los dos intentan pasar a `active` | **el update tiene que ser idempotente** (`where status='pending'`) | nada: pasa a jugar |
| `abandon_match` | quien abandona cierra la app antes de aplicar el Rango | por diseño: lo aplica el rival al cargar (R1) | nada hasta que el rival abra |
| `abandon_match` | **los dos** cierran la app y no vuelven | **hueco aceptado**: queda `abandoned` sin puntos aplicados | nada; no bloquea a nadie porque la caducidad de 6 h la saca del límite |
| 2 canales Realtime | el canal cae en medio del campo | patrón de reconexión ya probado (10 tests) | punto gris pulsando en la cabecera |
| Permisos por columna en `profiles` | columna nueva en `profiles` sin añadir al grant | **hueco**: solo lo coge el pgTAP si alguien escribe el caso | 42501 al cargar el perfil |

**Huecos críticos (sin test, sin manejo de error, y silenciosos): 0.** Los dos huecos
aceptados son visibles (uno no bloquea a nadie, el otro falla ruidosamente con 42501).

## Diagrama: la máquina de estados que va al código

Este bloque se copia como comentario de cabecera en `src/lib/api/matches.js` (F14).

```
                        create_match (DEFINER)
                               │
                               ▼
     ┌──────────────────── pending ────────────────────┐
     │  rival accepted_at NULL  →  "esperando a X"     │
     │  ambos accepted_at, falta algún deck_confirmed  │
     │                   →  "elige tus cartas"        │
     └───┬──────────────┬──────────────────────┬──────┘
         │              │                      │
 respond_to_match   confirm_deck ×2      cualquiera cancela
   (accept=false)   (ambos listos)              │
         │              │                      │
         ▼              ▼                      ▼
     cancelled       active                cancelled
                        │                 (sin efecto Rango)
       ┌────────────────┼────────────────┐
       │                │                │
   prog < 3        prog >= 3        se juega entera
  cualquiera    ┌───────┴───────┐         │
   cancela      │               │         ▼
       │   cancel_requested  abandon    review
       ▼     por LOS DOS      _match      │
   cancelled      │             │    confirmMatchResult
                  ▼             ▼         │  (2 confirmaciones
              cancelled    abandoned      │   humanas)
                            + abandoned_by│
                            + 2 confirma- │
                              ciones de   │
                              servidor    │
                                  └───────┴──► apply_match_result
                                                (2 guardas nuevas)
                                                      │
                                                      ▼
                                                  confirmed
                                          (razón del abandono
                                           queda en abandoned_by)

CADUCIDAD — derivada, nunca escrita (R2):
  pending  con created_at <= now() - 24h  →  no cuenta para el límite
  active   con started_at <= now() -  6h  →  no cuenta para el límite
  matches.status solo lo escribe un jugador actuando. Cero barredores.
```

## Estrategia de paralelización

| Paso | Módulos | Depende de |
|---|---|---|
| PR-A.1 | `src/lib/api/matches.js` (barredor), `src/App.jsx` (2 `select("*")`, borrar 2vs2 + FAKE_RIVALS) | — |
| PR-A.2 | migración SQL: permisos por columna en `profiles` | **PR-A.1 desplegado** |
| PR-B.1 | migración SQL: 2 columnas, 4 RPCs, revokes/grants, drop del UNIQUE duplicado | PR-A.2 |
| PR-B.2 | `tests/` pgTAP | PR-B.1 |
| PR-B.3 | `src/lib/api/matches.js` + `src/hooks/` (envoltorios, 2 canales) | PR-B.1 |
| PR-B.4 | `src/screens/` (pantallas del embudo) + `src/App.jsx` (cableado) | PR-B.3 |

**Carriles paralelos:** dentro de PR-B, el carril A (PR-B.2, pgTAP) y el carril B
(PR-B.3 → PR-B.4, cliente) son disjuntos en módulos y pueden ir en paralelo una vez
exista la migración. PR-A es estrictamente secuencial y además tiene una barrera de
despliegue entre sus dos pasos.

**Orden de ejecución:** PR-A.1 → desplegar → PR-A.2 → PR-B.1 → lanzar PR-B.2 y PR-B.3 en
paralelo → esperar los dos → PR-B.4.

**Conflictos a vigilar:** `src/lib/api/matches.js` lo tocan PR-A.1 y PR-B.3 — secuenciar,
no paralelizar. `src/App.jsx` lo tocan PR-A.1 y PR-B.4 — mismo caso.

## Implementation Tasks
Sintetizadas de los hallazgos de este review. Cada tarea sale de un hallazgo concreto.
Las 10 tareas del eng review del 19 ago quedan reconciliadas como `done` (PR1 + D7).
Artefacto: `~/.gstack/projects/usuario/tasks-eng-review-main-20261105-193547.jsonl`.

### PR-A — desplegar lo que ya existe (hoy)

- [ ] **T1 (P1, human: ~30min / CC: ~5min)** — lib — Borrar el barredor de 30 minutos de `listMyActiveMatches`
  - Surfaced by: Arquitectura F2 / R2 — marca `abandoned` sin actor y hace desaparecer una vuelta real a media partida
  - Files: `src/lib/api/matches.js` (borrar `STALE_ACTIVE_MATCH_MS`, el bloque `update` de :124-131 y el `.gte` de :141), `src/lib/api/matches.test.js`
  - Verify: `npm test`; ningún test asserta ya el barrido por antigüedad
- [ ] **T2 (P1, human: ~30min / CC: ~5min)** — screens — Sustituir los 2 `select("*")` sobre `profiles` por listas explícitas
  - Surfaced by: TODO 2 — requisito previo a T5; con permisos por columna, `select=*` incluye `email` y falla con 42501
  - Files: `src/App.jsx:4363`, `src/App.jsx:4454`
  - Verify: `grep -n 'from("profiles")' -A2 src/` no devuelve ningún `select("*")`; login y perfil cargan
- [ ] **T3 (P1, human: ~2h / CC: ~20min)** — screens — Borrar `FAKE_RIVALS`, `FAKE_TOP`, `renderPlayerPicker` y el flujo 2vs2 completo
  - Surfaced by: TODO 3 — el 2vs2 depende de `FAKE_RIVALS` en 5 puntos (`:401-403`, `:422-424`, `:1400-1402`, `:1487-1488`, `:1571`); ocultarlo dejaría código muerto sosteniendo los ficticios
  - Files: `src/App.jsx`
  - Verify: `grep -rn "FAKE_RIVALS\|FAKE_TOP" src/` vacío; `npm run build` y `npm test` limpios; buscar "Carlos Mendoza" en la app no devuelve nada
- [ ] **T4 (P1, human: ~30min / CC: ~10min)** — deploy — Desplegar PR-A a producción
  - Surfaced by: Arquitectura F1 — producción corre una build de antes del 27 ago; el 400 del Home y el bug del mazo repetido ya están arreglados en `main`
  - Files: —
  - Verify: cargar el Home desde un móvil y comprobar en los logs de Supabase que la consulta de partida activa devuelve 200, no 400
- [ ] **T5 (P1, human: ~30min / CC: ~10min)** — db — Migración: permisos por columna en `profiles`
  - Surfaced by: TODO 2 — fuga viva del email de 5 personas reales vía la clave anónima
  - Files: `supabase/migrations`
  - Verify: **solo después de T4.** Con la clave anónima, `select=email` sobre `profiles` devuelve 42501; `select=id,full_name,tag` devuelve 200; los 5 jugadores entran y editan perfil

### PR-B — el embudo

- [ ] **T6 (P1, human: ~1d / CC: ~1h)** — db — Migración del embudo: 2 columnas, 4 RPCs `SECURITY DEFINER`, revokes/grants, drop del UNIQUE duplicado
  - Surfaced by: R3 + R4 + F7 + F8 — `create_match` a DEFINER, 3 RPCs nuevas, `is_match_participant` revocada a `public`/`anon`, una de las 2 restricciones UNIQUE redundantes de `match_confirmations` eliminada
  - Files: `supabase/migrations`
  - Verify: `confirm_deck` no expone parámetro de usuario; `proacl` de las 4 RPCs sin entrada de PUBLIC; la guarda de una-partida-viva ve las filas de los dos jugadores
- [ ] **T7 (P1, human: ~2h / CC: ~20min)** — db — `apply_match_result`: las 2 guardas de dirección
  - Surfaced by: R1 + R6 — la función no se relaja; gana la guarda del abandono y la de Stableford en la misma edición
  - Files: `supabase/migrations`
  - Verify: el chequeo de 2 confirmaciones y la validación de suma cero siguen literalmente en el cuerpo; quien abandona no puede aplicarse el resultado a favor
- [ ] **T8 (P1, human: ~2d / CC: ~1.5h)** — test — pgTAP: instalar y escribir los 19 caminos SQL
  - Surfaced by: R5 — los 2 bugs que bloquearon partidas reales fueron de GRANT y de RLS; ningún test con la base simulada los coge
  - Files: `tests/`
  - Verify: los 19 casos pasan con `set local role authenticated` + `set local request.jwt.claims`; los de GRANT apuntan al acceso directo del cliente (`match_holes` UPDATE, `match_players` SELECT/UPDATE, `match_player_decks` SELECT, `match_confirmations` INSERT), no a través de una RPC DEFINER
- [ ] **T9 (P1, human: ~1d / CC: ~45min)** — lib — Envoltorios nuevos y `confirmDeck` reescrito como RPC sin `userId`
  - Surfaced by: F9 + F12 — `confirm_deck` deriva el usuario de `auth.uid()`; se borra el insert directo, no se dejan las 2 vías
  - Files: `src/lib/api/matches.js`, `src/lib/api/matches.test.js`
  - Verify: `npm test`; `grep -n "userId" src/lib/api/matches.js` no lo encuentra en `confirmDeck`
- [ ] **T10 (P1, human: ~1d / CC: ~45min)** — hooks — Dos canales Realtime de `match_players` con filtros distintos y reconexión compartida
  - Surfaced by: R4 — un solo canal filtrado por `user_id` no entrega el cambio de la fila del rival, así que la sala de espera quedaría muerta
  - Files: `src/hooks/useMatchRealtime.js`, `src/hooks/useMatchRealtime.test.js`
  - Verify: el patrón de reconexión está extraído a una función compartida, no copiado; `npm test`
- [ ] **T11 (P1, human: ~2d / CC: ~1.5h)** — screens — Pantallas del embudo en `src/screens/`
  - Surfaced by: F13 — el código nuevo nace fuera de `App.jsx`, que ya tiene 4725 líneas
  - Files: `src/screens/`, `src/App.jsx` (solo cableado)
  - Verify: `npm run build`; el aviso de que abandonar cuenta como derrota aparece antes de confirmar
- [ ] **T12 (P2, human: ~1h / CC: ~15min)** — db — Mensajes de las RPCs en español y en tono de jugador
  - Surfaced by: Calidad de código F10 — `err.message` se muestra tal cual; hoy el jugador lee errores de Postgres en inglés
  - Files: `supabase/migrations`
  - Verify: provocar cada rechazo y leer el texto en la pantalla, no en la consola
- [ ] **T13 (P2, human: ~30min / CC: ~10min)** — domain — Unificar las 2 constantes de tamaño de mazo
  - Surfaced by: F11 — la regla 2/4 vive en `App.jsx:1455`, `App.jsx:3341` y en el SQL
  - Files: `src/domain/cards.js`, `src/App.jsx`
  - Verify: `grep -n "=== 9 ? 2 : 4\|=== \"9\" ? 2 : 4" src/` no devuelve nada
- [ ] **T14 (P2, human: ~30min / CC: ~5min)** — lib — Contar hoyos con agregado embebido
  - Surfaced by: Rendimiento F15 — se transfieren 18 filas de `match_holes` para obtener un entero
  - Files: `src/lib/api/matches.js`
  - Verify: la consulta ya no trae `hole_number`; el número de hoyos sigue correcto en pantalla
- [ ] **T15 (P2, human: ~30min / CC: ~10min)** — lib — Diagrama ASCII de la máquina de estados como comentario de cabecera
  - Surfaced by: F14 — `matches.js` pasa a ser dueño de una máquina de 7 estados sin diagrama junto al código
  - Files: `src/lib/api/matches.js`
  - Verify: el diagrama coincide con el del plan y se actualiza en el mismo commit que cambie la máquina
- [ ] **T16 (P1, human: ~3h / CC: ~0)** — qa — Checklist manual de 2 dispositivos del embudo completo
  - Surfaced by: R5 — pgTAP no cubre la capa PostgREST (el 400 del Home era de ahí) ni los 2 criterios Realtime de R4
  - Files: —
  - Verify: los 3 Critical Paths del Test Plan, con los 2 criterios de los dos lados (B ve la invitación sola; A ve "ya ha elegido" sin recargar)

## Unresolved decisions that may bite you later

Ninguna decisión de este review quedó sin respuesta: R1-R6 y las 3 propuestas de TODOS.md
tienen respuesta real del fundador. Lo que queda abierto no son decisiones sino cobertura
que falta:

- **Sin segunda voz.** Codex no está instalado y el fallback nativo no entregó informe en
  5 minutos. R1 (confirmaciones firmadas por el servidor) y los umbrales 24 h / 6 h de R2
  son las dos piezas que más se habrían beneficiado de una lectura independiente: la
  primera porque reinterpreta qué significa una fila de `match_confirmations`, la segunda
  porque son números elegidos sin un solo dato de uso real.
- **Los umbrales de caducidad son conjeturas.** 24 h para `pending` y 6 h para `active`
  salen de "una vuelta de golf dura dos horas", no de medir nada. Con 0 partidas
  completadas no hay forma de calibrarlos; el primer fin de semana real los corregirá.
- **El umbral de 3 hoyos para que el abandono cuente como derrota** es decisión de
  producto sin datos. No se cuestiona aquí, pero conviene saber que nadie lo ha probado.

## Completion summary

- Step 0: Scope Challenge — **scope reduced per recommendation** (D1: 2 PRs en vez de 1)
- Reality rows: 8/8 filas tier 1 + 1 tier 2 emitidas (`PLAN_REALITY`), **0 premisas unverified**, 3 premisas FALSE (P6 parcial, P9, P12)
- Architecture Review: **9 issues** (F1-F9)
- Code Quality Review: **5 issues** (F10-F14)
- Test Review: diagrama producido, **35 huecos** identificados (2/37 caminos con cobertura hoy)
- Performance Review: **2 issues** (F15-F16)
- NOT in scope: escrito (7 piezas)
- What already exists: escrito (11 piezas reutilizadas)
- TODOS.md updates: **3 items propuestos**, 3 aceptados, 2 de ellos con cambio de alcance a PR-A
- Failure modes: **0 huecos críticos** (2 huecos aceptados, los dos visibles)
- Unresolved decisions: **0 en este review**
- Outside voice: codex, **unavailable** (CLI no instalado; fallback nativo sin informe en 5 min)
- Parallelization: 2 carriles paralelos dentro de PR-B, PR-A estrictamente secuencial con una barrera de despliegue
- Lake Score: 5/6 = respuestas que eligieron la opción 10/10 sobre respuestas puntuadas por completeness (D2 10/10, D3 10/10, D4 10/10, D5 10/10, D6 eligió 8/10 sobre el 10/10 recomendado — con razón, el 10/10 exigía la service_role key; D1 eligió 7/10 deliberadamente para desbloquear hoy)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | `codex` (`/plan-eng-review` outside voice) | Independent 2nd opinion | 4 | UNAVAILABLE | sin informe; 3 ejecuciones nativas previas (ago 2026), 0 de CLI externo |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 5 | ISSUES OPEN | 51 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**OUTSIDE COVERAGE:** proveedor `codex`, fase `plan-review`, estado **unavailable** — el
CLI no está instalado y el fallback nativo (subagente `Plan`) no entregó informe completo
dentro del temporizador de cinco minutos; solo devolvió un arranque y se canceló. Sin
crédito a resultados tardíos. Las 3 ejecuciones de `codex-plan-review` de agosto 2026
fueron subagentes nativos (`source: claude`), no CLI externo; se conservan con su
atribución original y están fuera de la ventana de 7 días. Arreglo:
`npm i -g @openai/codex` y `codex login`. **Este review tiene cobertura de una sola voz.**

**CROSS-MODEL:** no aplica — ninguna revisión externa completada con la que cruzar.

**VERDICT:** ENG REVIEW ISSUES OPEN — 51 hallazgos, todos con disposición y 6 decisiones
aprobadas (R1-R6), pero el trabajo está mapeado, no hecho. Las 3 revisiones previas de
`plan-eng-review` que estaban `clean` son de agosto 2026 y quedan fuera de la ventana de
7 días (3 commits desde entonces). Nota: la revisión de `plan-eng-review` del 23 ago
2026 puede estar obsoleta — 3 commits desde esa revisión. CEO y Design review nunca se
han ejecutado en esta rama; ninguna es obligatoria para este cambio, que es de backend y
datos. eng review required.

NO UNRESOLVED DECISIONS
