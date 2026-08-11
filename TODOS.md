# TODOS

## Arquitectura

### Reestructuración completa (Approach B) + esquema de participantes en Supabase

**What:** Separar `src/App.jsx` (3400+ líneas) en `domain/`, `screens/`, `hooks/`, `lib/api/`, `constants/`, y cerrar el esquema de participantes por partida en Supabase (1vs1/2vs2, con validación explícita de que las políticas RLS funcionan igual con 2 y con 4 jugadores).

**Why:** Sin esto, cada cambio sigue tocando el mismo archivo único que ya se identificó como el problema de fondo del prototipo original, y no hay backend real conectado — bloquea escalar el núcleo pulido más allá del grupo del fundador.

**Context:** Aprobado como Approach B en `/office-hours` del 9 de agosto de 2026 (ver `~/.gstack/projects/birdix-app/usuario-unknown-design-20260809-000456.md`). El 10 de agosto, durante `/plan-eng-review` de reglas de mazo + fórmula del Rango, se decidió explícitamente separar este rebuild en su propia sesión en vez de mezclarlo con el cierre de reglas — para no combinar una reestructuración grande con un cambio de reglas de juego en el mismo PR. Debe cerrarse en su propio `/plan-eng-review` antes de tocar código de Matches.

**Effort:** XL
**Priority:** P1
**Depends on:** None

### Efecto real de Escudo, Bloqueo y Segundo Golpe

**What:** Implementar la lógica real de estas 3 cartas (hoy solo se registra que se jugaron, sin ningún efecto en el juego).

**Why:** Son 3 de las 10 cartas del reglamento oficial y hoy no hacen nada más allá de aparecer en el marcador — necesitan que ambos jugadores vean la misma jugada en el mismo instante (Escudo bloquea cartas rivales ese hoyo, Bloqueo cancela una carta concreta, Segundo Golpe repite un golpe), lo cual requiere sincronización en tiempo real.

**Context:** Decidido en `/plan-eng-review` del 10 de agosto de 2026: "registrar la jugada, sin lógica de efecto" es la solución elegida para el lanzamiento al grupo del fundador, precisamente porque Supabase Realtime (fase 3 del roadmap) no está conectado todavía. No es la versión final — es un default explícito para v1, no un olvido.

**Effort:** M
**Priority:** P2
**Depends on:** Supabase Realtime conectado (fase 3 del roadmap)

### Verificar reglas de cartas en 2vs2

**What:** Confirmar que el enfoque cerrado el 10 de agosto (registrar sin efecto para las 5 cartas no-puntuables, el gate de elegibilidad de Remontada) funciona igual de bien en `TeamStablefordScreen` (2vs2), que tiene su propio switch de efectos separado del de 1vs1.

**Why:** Esta sesión se centró en el núcleo pulido 1vs1 según `BIRDIX_DESIGN_BRIEF.md`, sin tocar la lógica 2vs2 — evita que ambos formatos se desincronicen silenciosamente en las reglas de cartas.

**Context:** `TeamStablefordScreen` (`src/App.jsx:2200`) duplica parte de la lógica de `applyStablefordCardEffect` para el caso de equipos. 2vs2 no tiene fecha de construcción decidida (premisa 5 del `/office-hours` del 9 de agosto: se decide tras ver cómo va el 1vs1 real con el grupo), así que esto es barato de revisar cuando 2vs2 vuelva a estar sobre la mesa.

**Effort:** S
**Priority:** P3
**Depends on:** None
