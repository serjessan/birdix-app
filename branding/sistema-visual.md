# Birdix — Manual de marca (Sistema Visual)

Documento de referencia para todo lo relacionado con la identidad visual de Birdix. Extraído y formalizado a partir del sistema ya implementado en `src/App.jsx` (tokens `BX`, componentes base) — no son propuestas nuevas, es la marca tal como existe hoy en el prototipo, documentada para que cualquier persona o herramienta (incluido el pipeline de diseño de gstack) pueda trabajar con ella sin tener que leer el código.

---

## 1. Filosofía de marca

Birdix no es una app para apuntar tarjetas de golf. Es una nueva forma de competir, inspirada en sistemas de progresión de videojuegos (Clash Royale, LoL, Rocket League, Chess.com) pero respetando la esencia del golf.

**Personalidad:** competitiva, moderna, cercana, elegante, innovadora, divertida, premium. Nunca infantil, nunca agresiva, nunca recargada.

**Público objetivo:** golfistas amateurs, de principiantes a scratch, 18–70 años. La marca tiene que funcionar igual de bien para alguien de 18 que para alguien de 75: clara, directa, sin ruido visual innecesario.

**Referencias de calidad:** Apple, Nike, Strava, Garmin, Spotify, Notion, Linear, Chess.com. Interfaz elegante, limpia, moderna, premium, deportiva, minimalista.

**Protagonista visual: el Rango Birdix, no el hándicap.** Cualquier aplicación de la marca — color, jerarquía, tamaño — debe reflejar esto. Un jugador se identifica por su división y su progreso, no por un número de hándicap.

---

## 2. Logo

### Sistema de lockup

Birdix usa un isotipo y dos variantes de wordmark:

| Activo | Uso | Ruta esperada en código |
|---|---|---|
| Isotipo "IX" | Favicon, avatar de app, espacios reducidos donde no cabe el wordmark completo | `/branding/logos/birdix-isotipo-ix.png` |
| Wordmark, blanco sobre verde | Fondos oscuros o de color (verde Birdix, imágenes, headers de color) | `/branding/logos/birdix-wordmark-blanco-sobre-verde.png` |
| Wordmark, verde sobre blanco | Fondos claros/blancos (la mayoría de las pantallas de la app) | `/branding/logos/birdix-wordmark-verde-sobre-blanco.png` |

> **Pendiente — acción requerida:** el código (`src/App.jsx`, objeto `LOGOS`) ya referencia estos tres archivos, pero **no existen todavía** en el repositorio. Hasta que se generen los assets reales, la app no puede mostrar el logo — hoy corre sin él. Esto debería resolverse en la misma sesión de `/design-consultation` donde se trabaje el núcleo pulido, o antes.

### Espacio de seguridad y tamaño mínimo

Hasta no tener el archivo de logo definitivo, se aplican las convenciones estándar del sector como referencia de partida (a confirmar cuando exista el asset real):

- Espacio de seguridad mínimo alrededor del lockup: la altura de la "B" del wordmark, en todos los lados.
- Tamaño mínimo del wordmark: 24px de alto en pantalla (por debajo de eso, usar el isotipo solo).
- El isotipo nunca se estira, rota, ni se le aplican efectos (sombras, brillos, degradados propios).

### Usos incorrectos (a evitar)

No recolorear el logo fuera de las dos variantes oficiales (verde/blanco). No colocar el wordmark verde sobre fondos de color o imagen sin suficiente contraste. No combinar isotipo y wordmark completo en un mismo lockup (son alternativas, no se usan juntos).

---

## 3. Paleta de color

Todos los valores están definidos en el objeto `BX` de `src/App.jsx` — cualquier cambio de marca en color empieza y termina ahí.

### Verde Birdix (color primario)

| Token | Hex | Uso |
|---|---|---|
| `green` | `#00703a` | Color de marca principal. Botones primarios, acentos activos, iconos destacados, estado "seleccionado". |
| `greenDark` | `#014F2A` | Hover/pressed de elementos verdes, texto sobre fondo `greenFill`. |
| `greenLight` | `#2D8E5C` | Variante clara para gradientes y detalles secundarios. |
| `greenFill` | `#E6F4ED` | Fondo suave para tarjetas/estados activos (chips, selección, empty states). |

### Coral (color secundario — golfistas del lockup)

| Token | Hex | Uso |
|---|---|---|
| `coral` | `#D67560` | Acento secundario. Nunca compite con el verde como color de acción principal — se usa para contraste puntual y para el lockup del isotipo. |
| `coralDark` | `#A8543F` | Estados de error, texto de advertencia, hover sobre elementos coral. |
| `coralFill` | `#FBEAE3` | Fondo suave para estados de error/derrota (p. ej. resultado de partida perdida). |

### Neutros

| Token | Hex | Uso |
|---|---|---|
| `ink` | `#111827` | Texto de máximo contraste (títulos principales). |
| `graphite` | `#1F2937` | Texto secundario oscuro. |
| `slate` | `#6B7280` | Texto terciario, metadatos, labels. |
| `mist` | `#9CA3AF` | Texto deshabilitado, placeholders. |
| `border` | `#E5E7EB` | Bordes y separadores. |
| `surface` | `#FFFFFF` | Fondo de tarjetas y superficies elevadas. |
| `bg` | `#F9FAFB` | Fondo general de pantalla. |
| `bgStrong` | `#F3F4F6` | Fondo de secciones que necesitan separarse ligeramente del fondo general. |

### Colores de división (Rango Birdix)

Cada división del Rango tiene su propio color de identidad — es la aplicación más importante de la marca, porque es lo primero que un jugador reconoce de sí mismo dentro de la app.

| División | Hex |
|---|---|
| Bronce | `#92400E` |
| Plata | `#6B7280` |
| Oro | `#CA8A04` |
| Platino | `#0E7490` |
| Élite | `#7C3AED` |
| Leyenda | `#00703a` (retoma el verde de marca — la división más alta "vuelve" al color principal, cerrando el círculo) |

### Reglas de uso

El verde Birdix es siempre el color de acción principal (botones primarios, CTAs, estado activo). El coral nunca sustituye al verde como acción principal — es acento y advertencia. Los colores de división solo se usan para representar el Rango (badges, anillos de progreso, avatares) — no se reutilizan como colores decorativos genéricos.

---

## 4. Tipografía

**Familia tipográfica única: Open Sans** (vía Fontsource/jsDelivr), con fallback a system-ui / -apple-system / Segoe UI / Roboto / sans-serif.

Pesos cargados y su uso:

| Peso | Uso |
|---|---|
| 400 (regular) | Texto de cuerpo, descripciones, contenido secundario. |
| 600 (semibold) | Labels, subtítulos, texto de énfasis medio (`font-semibold`). |
| 700 (bold) | Títulos, botones, texto de énfasis alto (`font-bold`, y `font-black` para etiquetas muy pequeñas en mayúsculas). |

### Jerarquía observada en el prototipo

- **Labels/eyebrows:** mayúsculas, tracking amplio (`tracking-wider` / `tracking-[0.18em]`), 10–12px, semibold o black. Ej.: "BIRDIX CLUBHOUSE", "NUEVA PARTIDA".
- **Títulos de sección:** 15px, bold, color `ink`/slate-900.
- **Cuerpo de texto:** 14–15px, regular o semibold según énfasis.
- **Botones:** 15px, bold.
- **Metadatos/hints:** 12px, regular, color `slate`.

No se usan más de 3 niveles de peso en una misma pantalla. La jerarquía se construye con tamaño y color antes que con tipografías adicionales — Birdix usa una sola familia tipográfica en toda la app, deliberadamente.

---

## 5. Iconografía

**Librería: [lucide-react](https://lucide.dev/)**, exclusivamente — no mezclar con otras librerías de iconos.

Convenciones de trazo (`strokeWidth`) según contexto:

| Contexto | strokeWidth | Tamaño típico |
|---|---|---|
| Icono decorativo / dentro de texto o pill | 2 – 2.5 | 12–18px |
| Icono de botón | 2.5 | 18px |
| Icono de estado activo / check de selección | 3 | 18px |
| Icono destacado (empty states, avatares) | 2 | 28px |

Los iconos heredan siempre el color del contexto (texto, marca, estado) — nunca llevan color propio fijo salvo cuando representan directamente el verde de marca (acciones, éxito) o el coral (alertas, error).

---

## 6. Componentes de marca (lenguaje visual)

Extraído de los componentes base ya construidos en `App.jsx` — cualquier pantalla nueva debe reutilizar este lenguaje, no inventar uno nuevo.

### Radios de esquina

Escala consistente de "más cuadrado = más pequeño/denso" a "más redondeado = más protagonismo":

- `rounded-xl` / `rounded-2xl` — inputs, botones, controles.
- `rounded-3xl` — tarjetas (`Card`), contenedores principales.
- `rounded-full` — pills, avatares, barras de progreso.

### Elevación y sombra

- `shadow-sm` — tarjetas en reposo.
- `shadow-lg` + sombra de color (ej. `shadow-[#014F2A]/20`) — botones primarios, para que la sombra "tiña" del color de marca en vez de ser gris genérica.
- Sin sombra — elementos secundarios, texto, fondos.

### Botones

- **Primario:** fondo `green` (`#00703a`), hover `greenDark`, texto blanco, `rounded-2xl`, sombra de color. Es la acción principal de la pantalla, solo debe haber una por vista.
- **Secundario:** fondo blanco, anillo `slate-200`, texto oscuro. Para acciones alternativas, nunca compite visualmente con el primario.

### Pills / badges

Fondo suave (`Fill`) + texto oscuro del mismo tono (`emerald`, `rose`, `amber`, `sky`, `slate`) — nunca fondo sólido con texto blanco salvo en chips de estado muy puntuales (ej. victoria/derrota).

### Interacción

Micro-interacción estándar: `active:scale-[0.98]` en botones — todo elemento pulsable "cede" ligeramente al tacto. Transiciones suaves (`transition`) en todos los estados hover/focus, nunca cambios bruscos.

---

## 7. Voz y tono

Se deriva de la personalidad de marca (competitiva, moderna, cercana, elegante, divertida, premium — nunca infantil, agresiva o recargada).

**Cómo hablamos:**
- Frases cortas, directas, sin jerga técnica de golf innecesaria ni jerga de "gamer" forzada.
- Se celebra el progreso sin excesos ("¡Subes a Oro II!" mejor que "¡¡¡INCREÍBLE, ERES IMPARABLE!!!").
- El Rango se nombra siempre con orgullo, nunca con condescendencia ("Eres Oro III" nunca "Solo llegaste a Oro III").
- Los mensajes de error o derrota son honestos pero nunca duros — Birdix compite, no humilla.

**Evitar:** exclamaciones excesivas, emojis decorativos sin función, superlativos vacíos, cualquier tono que suene a app infantil o a casino.

---

## 8. Estado del sistema y pendientes

- ✅ Paleta de color, tipografía, componentes base: implementados y en uso en `src/App.jsx`.
- ✅ **Logo:** resuelto el 10 de agosto de 2026. Los tres archivos ya existen en `branding/logos/` (`birdix-isotipo-ix.png`, `birdix-wordmark-blanco-sobre-verde.png`, `birdix-wordmark-verde-sobre-blanco.png`), con los mismos nombres que ya esperaba `LOGOS` en `src/App.jsx` — no hace falta tocar código para que se muestren.
- ✅ Este documento formaliza lo que antes solo vivía como comentario en el código (`"Documentado en branding/sistema-visual.md"`) — a partir de ahora, cualquier cambio de marca debe actualizarse aquí y en `BX`/`LOGOS` a la vez, para que no se desincronicen.

---

*Documento generado el 10 de agosto de 2026 a partir del sistema visual real implementado en `src/App.jsx`, como manual de marca de referencia para diseño (gstack), desarrollo y cualquier material futuro de negocio o marketing.*
