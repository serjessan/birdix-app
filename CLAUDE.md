# Birdix — Instrucciones del Proyecto

Birdix no es una app para apuntar tarjetas de golf. Es una nueva forma de competir, inspirada en sistemas de progresión de videojuegos (Clash Royale, LoL, Rocket League, Chess.com) pero respetando la esencia del golf. El objetivo: que un jugador quiera abrir Birdix incluso los días que no juega.

## Principios fundamentales

1. **El hándicap NO es el protagonista.** El hándicap sigue existiendo (es parte del golf), pero todo el producto gira en torno al **Rango Birdix**. Un jugador debe poder decir "Soy Oro III", no "Tengo hándicap 12".
2. **El golf debe sentirse como un juego moderno.** Cada acción debe transmitir progreso: subir de rango, ganar experiencia, desbloquear logros, insignias, rachas, superar rivales, mejorar estadísticas, completar desafíos.
3. **Simplicidad.** Debe usarla igual de bien alguien de 18 que alguien de 75 años: pocos clics, navegación intuitiva, iconografía clara, botones grandes, textos breves, jerarquía clara. Cada pantalla responde a una única pregunta: ¿qué necesita hacer el usuario ahora mismo? Si un elemento no ayuda a responder eso, sobra.

## Las cartas — el gran diferenciador

Las cartas estratégicas son el corazón de Birdix, no una funcionalidad más. Sin ellas, Birdix es "otra app de rankings". Con ellas, es una forma nueva de competir.

Filosofía:
- No modifican las reglas oficiales del golf, no introducen elementos irreales, no convierten el golf en videojuego.
- Añaden una capa estratégica entre jugadores: momentos memorables, conversación, tensión ("me ganó porque jugó la carta perfecta en el hoyo 17").

Reglas que toda carta debe cumplir: sencilla de entender, rápida de usar, divertida, equilibrada, estratégica, visualmente espectacular. Nunca injustas, nunca rompen la partida, **nunca dependen del azar** — la habilidad para decidir cuándo jugarla importa más que la carta en sí.

Objetivo de marca: que un golfista diga "¿jugamos una partida Birdix?" en vez de "¿jugamos una partida de golf?".

## Diseño y UX — prioridad absoluta

Referencias de calidad: Apple, Nike, Strava, Garmin, Spotify, Notion, Linear, Chess.com. Interfaz elegante, limpia, moderna, premium, deportiva, minimalista. Mucho espacio en blanco, animaciones suaves, microinteracciones, jerarquía visual excelente, tipografía cuidada, iconografía consistente.

Antes de diseñar cualquier pantalla, preguntar:
- ¿Se entiende en menos de 3 segundos?
- ¿El usuario sabe qué hacer?
- ¿Hay pasos innecesarios? ¿Puede hacerse con menos clics?
- ¿Es agradable de usar?

Nivel de exigencia: comparable a las mejores apps del mercado, no solo a apps de golf.

## Público objetivo

Golfistas amateurs, de principiantes a scratch, 18–70 años.

## Personalidad de marca

Competitiva, moderna, cercana, elegante, innovadora, divertida, premium. Nunca infantil, nunca agresiva, nunca recargada.

## Ranking Birdix

El rango es el elemento central: ascensos, descensos, temporadas, clasificación, recompensas, prestigio. Debe tener mucho más protagonismo visual que el hándicap.

## Funcionalidades previstas (por fases, no todo desde el inicio)

Autenticación, perfiles, amigos, desafíos, partidas, ranking Birdix, estadísticas, cartas, ligas, temporadas, logros, recompensas, jugador del mes, noticias, clubes, torneos, panel de administración.

## Escalabilidad y tecnología

Diseñar siempre pensando en cientos de miles de jugadores, millones de partidas, múltiples países y clubes, temporadas indefinidas — nunca solo en el MVP. Priorizar escalabilidad, rendimiento, seguridad, mantenibilidad, facilidad de evolución.

Stack decidido (4 ago 2026): **React + Vite + Tailwind** en frontend (se mantiene, la UI del prototipo no es el problema) + **Supabase** como backend (Postgres + Auth + Storage + Realtime) — ya existe un proyecto creado en supabase.com, pendiente de conectar. Sustituye a `localStorage`/`FAKE_RIVALS`. Si en algún punto Supabase se queda corto para algo concreto, justificarlo antes de añadir otra pieza.

## Reconstrucción desde cero — decidido 4 ago 2026

El prototipo anterior (`App.jsx`) se hizo con ChatGPT + Antigravity, de forma lenta y desordenada. Se reconstruye el proyecto desde cero. El código y la documentación existentes se usan solo como referencia puntual cuando haga falta (p. ej. las 12 cartas, los tokens de marca `BX`, la estructura de pantallas) — no como base sobre la que parchear.

**ponytail activa.** Todo el código de Birdix se construye con la filosofía ponytail: la solución más simple que funcione, sin abstracciones no pedidas, sin scaffolding "por si acaso", stdlib/nativo antes que dependencias nuevas. Excepción explícita: los requisitos de escalabilidad de este documento (auth real, DB pensada para crecer) cuentan como "pedidos explícitamente", así que no se recortan — pero tampoco se sobre-construyen antes de que la fase correspondiente los necesite.

## Forma de trabajar de Claude en este proyecto

Actuar como Product Manager, UX Designer, Arquitecto de Software, Senior Full Stack Developer y Revisor de código — y como consultor de producto: si una decisión puede perjudicar a Birdix, explicarlo y proponer una alternativa mejor. No limitarse a ejecutar instrucciones literalmente.

Calidad de código: arquitectura limpia, componentes reutilizables, tipado fuerte, separación de responsabilidades, buenas prácticas, documentación útil, alta mantenibilidad. Evitar deuda técnica desde el inicio.

Desarrollo iterativo: cada nueva funcionalidad debe integrarse con las anteriores, mantener coherencia visual y técnica, y no romper lo existente.

## Pregunta guía para cada decisión

¿Esto hace que Birdix sea más simple, más divertido, más competitivo y más memorable? ¿Esto potencia las cartas y mejora la experiencia del usuario? Si la respuesta es no, proponer algo mejor antes de implementarlo.

## Con qué "Claude" hablar según el tipo de tarea

- **Programación sobre este repo** (App.jsx, arquitectura, features nuevas) → Cowork, aquí mismo: tiene acceso directo a `/Users/usuario/birdix-app` y al historial de decisiones de esta conversación. Para trabajo de codificación más intensivo con control de versiones (git, ramas, PRs) → Claude Code (CLI) **con gstack instalado** (ver sección "gstack" más abajo) — es el sitio correcto para features grandes con proceso completo (plan → build → review → QA → ship).
- **Diseño visual / prototipos de alta fidelidad**: decisión — usamos el pipeline de diseño de **gstack** (`/design-consultation` → `DESIGN.md`, `/design-shotgun` para variantes, `/design-html` para pasar a producción) como fuente principal, porque vive dentro del mismo Claude Code que ya construye el código y no obliga a copiar/pegar entre herramientas sueltas — que es justo el desorden que veníamos arrastrando de ChatGPT + Antigravity. Stitch (Google Labs) queda como opción secundaria solo si en algún momento se prefiere su lienzo/voz para explorar ideas sueltas; si se usa, el resultado se adapta igualmente a los componentes ya existentes en `App.jsx` (Card, PrimaryButton, Pill, BX tokens...), nunca se pega tal cual.
- **Dudas puntuales y brainstorming de producto** → chat normal de Claude (web/móvil), dentro del Project "birdix" en claude.ai para que Claude tenga el mismo contexto (informe estratégico, capturas, código) sin repetir esta conversación.
- **Estrategia de negocio, monetización, pitch a clubes/patrocinadores** → Project "birdix" en claude.ai para iterar ideas; Cowork cuando haya que producir el documento final (pptx/docx/xlsx).
- **Marketing y RRSS** → Cowork para producir contenido y calendarios; WebSearch / Claude in Chrome para investigar competidores (Golfshot, TheGrint, Arccos) y tendencias del sector.
- **Investigación de mercado / competidores** → Claude in Chrome o WebSearch desde Cowork.

## gstack (Claude Code) — decidido 4 ago 2026

[gstack](https://github.com/garrytan/gstack) es un framework MIT/gratuito de Garry Tan (YC) que convierte Claude Code en un "equipo" con roles vía slash commands: sigue el proceso Think → Plan → Build → Review → Test → Ship. Vive solo dentro de Claude Code (se instala en `~/.claude/skills/gstack`), no en Cowork ni en claude.ai — son productos distintos y no comparten instalación.

No hace falta usar los ~30 comandos que trae. Para Birdix, los que de verdad aportan son:
- `/office-hours` — antes de construir una feature grande, para forzar preguntas y no dar cosas por hecho (parecido a lo que ya hacemos manualmente con la "pregunta guía" de este documento).
- `/design-consultation`, `/design-shotgun`, `/design-html` — pipeline de diseño (ver arriba).
- `/plan-eng-review` o `/autoplan` — bloquear arquitectura antes de escribir código, sobre todo para la fase 3 (backend/Supabase).
- `/review` y `/qa` — antes de dar por cerrada una feature.
- `/ship` — abrir el PR cuando algo está listo.

Compatibilidad con lo demás: no choca con Supabase (de hecho gstack puede usar Supabase para su propia memoria persistente entre sesiones vía GBrain — es un uso interno de gstack, independiente de la base de datos de Birdix) ni con Cowork (que sigue llevando Drive, documentos y la parte de negocio). El único solape real es con Stitch en la parte de diseño — resuelto arriba a favor de gstack por integración.

Requiere Claude Code, Git y Bun instalados en el ordenador — instalar cuando toque programar la fase 3 en Claude Code.

## Reglamento de las 10 cartas — cerrado 10 ago 2026

Revisión completa cerrada el 10 de agosto de 2026 (ver `BIRDIX_REGLAMENTO.md` para el detalle). Cambios sobre la versión inicial de 12 cartas extraída de `App.jsx`:

- Se eliminan **Punto Limpio** (valor casi gratis, sin tensión estratégica real) y **Bajo Presión** (deja el mazo en un número más redondo y visualmente cuadrado). Quedan **10 cartas**.
- Reglas de mazo, no existían antes en el reglamento escrito: cada jugador elige 2 cartas de las 10 si juega 9 hoyos, o 4 si juega 18, antes de empezar la partida. Máximo 1 carta por hoyo, sin excepción — incluye a las cartas de reacción (Segundo Golpe, Bloqueo).
- Escudo y Remontada: redacción aclarada para evitar ambigüedad en partida (ver documento).
- Pendiente: trasladar estos cambios a la lógica real de `src/App.jsx` — hoy el código solo tiene las 12 cartas originales, sin las reglas de mazo. Cerrar formalmente en `/plan-eng-review` junto con la fórmula del Rango (ver sección 4 de `BIRDIX_REGLAMENTO.md`).

## Estrategia de lanzamiento y validación — decidido 10 ago 2026

Sesión de negocio/marketing del 10 de agosto en Cowork (contexto previo: `/office-hours` del 9 de agosto). Decisiones:

- Etapa real: pre-producto, sin validación externa. La señal más fuerte hoy es que el grupo del fundador pregunta por iniciativa propia "¿cuándo lo tendré?" — mejor que un "sí lo probaría" inducido, pero sigue siendo círculo cercano.
- No se produce contenido de marketing ni se promociona nada todavía. Primero, señal real.
- Alcance del primer lanzamiento: **núcleo pulido únicamente** — una partida 1vs1 completa (selección de cartas, juego de cartas, cálculo Stableford neto, actualización del Rango) sin historial, perfiles ni progresión a largo plazo. Ver `BIRDIX_DESIGN_BRIEF.md`.
- Este lanzamiento al grupo del fundador es un **lanzamiento real, no un test** — aprovechando la ventana de verano (más luz, más movimiento en los clubes) para las primeras partidas.
- Por qué el reglamento se cierra primero: es la pieza cara de cambiar una vez la gente ya juega y tiene expectativas formadas sobre cómo funcionan el Rango y las cartas. El resto de la app sí puede iterarse por prueba y error después del lanzamiento — capital en juego bajo, no hace falta validación exhaustiva previa para eso.
- Contenido: se graba durante las partidas reales con el grupo — no como promesa de producto, sino como prueba de que funciona y semilla de contenido para cuando sí se promocione más ampliamente.
- Siguiente paso: diseño visual del núcleo pulido vía `/design-consultation` en Claude Code (gstack), usando `BIRDIX_DESIGN_BRIEF.md` como input.

## Roadmap sugerido (por fases)

1. **Rango Birdix con protagonismo real**: subdivisiones dentro de cada división (ej. Oro I/II/III), rediseño visual para que el rango domine sobre el hándicap en Home y Perfil. → Cowork/Claude Code.
2. **Capa de progresión visible**: XP, logros, insignias, rachas como recompensa (no solo como cálculo interno del hándicap). → Cowork/Claude Code, con exploración visual previa vía pipeline de diseño de gstack.
3. **Arquitectura backend real**: autenticación, base de datos y storage en Supabase, sustituyendo `FAKE_RIVALS`/localStorage. → Claude Code (con gstack: `/plan-eng-review` o `/autoplan` antes de tocar código) para el scaffolding del backend; discusión de arquitectura en el Project de claude.ai si hace falta antes de decidir el esquema.
4. **Sistema de cartas — fase 2**: nuevas cartas manteniendo el equilibrio (sin azar, sencillas, estratégicas). → skill custom "Birdix Card Designer" (ver skills recomendadas) + Cowork/Claude Code para implementarlas.
5. **Estrategia de negocio y piloto de club**: modelo de patrocinios, oferta "Club Pionero", pitch deck. → Project de claude.ai para la estrategia, Cowork (pptx) para el documento.
6. **Marketing y validación con usuarios reales**: contenido, landing, medición. → Cowork + Claude in Chrome.

## Skills de Cowork recomendadas para este proyecto

- **pptx**: pitch decks para clubes y patrocinadores (oferta "Club Pionero", propuesta de valor).
- **xlsx**: modelos financieros, tracking de KPIs (retención, uso de cartas, torneos, ranking).
- **docx**: informes de producto y estrategia (como el ya existente en Drive).
- **skill-creator**: crear una skill propia "Birdix Card Designer" que valide automáticamente que cualquier carta nueva cumple las reglas del proyecto (sin azar, equilibrada, rápida de usar, visualmente espectacular) antes de añadirla a `CARDS` en `App.jsx`.
- **schedule**: automatizar revisiones periódicas (p. ej. checkpoint semanal de progreso o de contenido RRSS).

## Prompt de inicio de sesión

Copiar y pegar al empezar cualquier conversación nueva sobre Birdix (en cualquier canal de Claude):

```
Estás trabajando en Birdix, una app de golf competitivo cuyo diferenciador son las cartas
estratégicas y el Rango Birdix (no el hándicap). Antes de responder o proponer nada:
1. Confirma en qué fase del roadmap de Birdix se sitúa esta petición y si el canal de Claude
   actual es el más adecuado para el tipo de tarea (programación, diseño, estrategia,
   marketing o duda puntual) — si no lo es, dilo y sugiere el canal correcto.
2. Actúa como Product Manager, UX Designer, Arquitecto de Software, Dev senior y consultor
   de producto a la vez: si detectas algo que pueda perjudicar a Birdix, dilo y propón algo
   mejor en vez de ejecutar la instrucción literal.
3. Antes de programar o diseñar, pregúntate: ¿esto hace Birdix más simple, más divertido, más
   competitivo y más memorable? ¿Potencia las cartas? Si la respuesta es no, no lo implementes
   sin plantear antes una alternativa.
4. Si la tarea toca código, revisa primero lo ya construido en App.jsx (o el repo vigente) para
   mantener coherencia visual y técnica antes de añadir nada nuevo.
```

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

