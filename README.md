# MyHealth

Aplicación web personal y local para consultar entrenamientos de Hevy y registrar medidas
corporales. La aplicación escucha únicamente en `127.0.0.1` y guarda los datos en SQLite.

**Estado actual: Fases 1–4 terminadas y módulo de entrenador personal.** La aplicación importa
entrenamientos reales de Hevy, calcula estadísticas, permite gestionar medidas corporales y genera
informes de progreso con un motor de reglas (y una capa de IA opcional).

## Requisitos

- Node.js 20 o superior.
- npm.
- Windows 11, macOS o Linux para ejecución local. El proyecto se ha verificado en Windows 11.

El equipo de desarrollo dispone actualmente de Node.js **25.2.1** y npm **11.6.2**. Es una versión
*Current*, no LTS. El proyecto declara compatibilidad con Node.js `>=20` y se recomienda usar una
versión LTS (20, 22 o 24) para el uso continuado.

Comprobación de versiones:

```powershell
node -v
npm -v
```

## Puesta en marcha

Desde la carpeta del proyecto:

```powershell
npm install
npm run dev
```

Después abre:

<http://127.0.0.1:3000>

`npm run dev` usa `nodemon`, copia los recursos locales de Tabler si es necesario y reinicia el
servidor al guardar cambios. Para ejecutarlo sin `nodemon`:

```powershell
npm start
```

El fichero `.env` se crea a partir de `.env.example`. Si no existe, créalo antes de arrancar:

```powershell
Copy-Item .env.example .env
```

No se debe versionar `.env`.

### Recursos locales de Tabler

Tabler (`@tabler/core`) y Chart.js (`chart.js`) se instalan desde npm y se copian a
`public/vendor/tabler` y `public/vendor/chartjs` mediante `scripts/setup-vendor.js`. Los scripts
`prestart` y `predev` hacen esta copia automáticamente. Si faltan los recursos:

```powershell
npm run setup:vendor
```

La aplicación no usa CDN, por lo que la interfaz y las gráficas funcionan sin conexión. Las únicas
llamadas externas son las de la API de Hevy cuando se pulsa «Sincronizar ahora».

## Instalar como aplicación (PWA)

La interfaz es una PWA instalable: se abre a pantalla completa, con su propio icono y sin barra del
navegador. No es una aplicación nativa: sigue siendo la misma web de Express, sin backend móvil.

- **Android (Chrome/Edge):** menú del navegador → «Instalar aplicación» o «Añadir a pantalla de
  inicio».
- **iOS (Safari):** botón Compartir → «Añadir a pantalla de inicio». Debe hacerse desde Safari.
- **Escritorio (Chrome/Edge):** icono de instalación de la barra de direcciones.

Requisitos y comportamiento:

- El service worker solo se registra en contexto seguro: `http://127.0.0.1:3000`,
  `http://localhost:3000` o HTTPS. Si abres la app por la IP de la red local sin HTTPS, funciona
  igual, pero no se puede instalar ni funciona sin conexión.
- Solo se cachean recursos estáticos propios (`/css`, `/js`, `/vendor`, `/images`). Las páginas y
  los datos de SQLite van siempre a red: nunca se muestra una pantalla antigua con datos de salud.
- Sin conexión, una navegación muestra `public/offline.html` con un botón para reintentar.
- Los cambios de CSS/JS se sirven primero desde red; el vendor y las imágenes se actualizan en
  segundo plano. El propio `sw.js` y el manifest se sirven con `Cache-Control: no-cache`.

Archivos implicados: `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html` y los
iconos de `public/images/icons`. Si cambia la marca, regenera los iconos con:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
```

## Configuración

Variables disponibles en `.env`:

| Variable | Valor por defecto | Descripción |
| --- | --- | --- |
| `PORT` | `3000` | Puerto HTTP local. |
| `HOST` | `127.0.0.1` | Interfaz de escucha. No se debe cambiar a `0.0.0.0` sin una decisión explícita. |
| `APP_TIMEZONE` | `Europe/Madrid` | Zona usada para mostrar fechas y horas. |
| `DATABASE_PATH` | `data/myhealth.db` | Ruta de la base SQLite. |
| `HEVY_API_KEY` | vacío | Clave de la API de Hevy. Solo se usa en el servidor y nunca se muestra en la interfaz. |
| `COACH_LLM_ENABLED` | `false` | Activa la redacción opcional de informes con IA. |
| `COACH_LLM_BASE_URL` | `https://api.openai.com/v1` | Endpoint compatible con Chat Completions (OpenAI, Ollama, etc.). |
| `COACH_LLM_API_KEY` | vacío | Clave del proveedor de IA. |
| `COACH_LLM_MODEL` | vacío | Modelo usado por la capa de IA; obligatorio si se activa. |

La clave debe guardarse en `.env`, excluido de Git. No se almacena en la base de datos ni se
devuelve por HTTP. La pantalla de configuración solo indica si está presente. Si existe una variable
`HEVY_API_KEY` definida en el entorno del sistema, tiene prioridad sobre el valor de `.env`; el
servidor necesitará reiniciarse después de cambiarla.

La aplicación calcula fechas locales con SQLite (`localtime`). En un VPS conviene que la zona
horaria del sistema coincida con `APP_TIMEZONE` (normalmente `Europe/Madrid`).

## Sincronización con Hevy

La integración está disponible en **Entrenamientos → Sincronizar Hevy**. La sincronización es
manual: no se ejecuta al abrir las pantallas ni mediante tareas programadas.

1. Configura `HEVY_API_KEY` en `.env`.
2. Arranca la aplicación y abre `/workouts/sync`.
3. Pulsa **Sincronizar ahora**.
4. Revisa el resultado en el historial de sincronizaciones y en el histórico de entrenamientos.

La importación:

- usa la cabecera oficial `api-key` y la paginación documentada (`page`, `pageSize` máximo 10);
- recorre todas las páginas del histórico;
- importa entrenamientos, ejercicios y series en transacciones SQLite;
- enriquece los ejercicios con el catálogo de plantillas (músculo principal y equipamiento);
- actualiza por `hevy_id` y reemplaza las series del workout, por lo que puede repetirse sin crear
  duplicados;
- registra cada intento en `sync_history` con estado, contadores y error si procede;
- conserva los datos ya importados si una ejecución falla a mitad.

El contrato verificado, la muestra estructural redactada y el mapeo de campos están documentados en
[`docs/hevy-api.md`](docs/hevy-api.md).

Diagnóstico de la conexión (no muestra la clave ni los valores personales):

```powershell
npm run hevy:diagnose
```

Limitaciones actuales: no se sincronizan eliminaciones de Hevy, no se importan medidas corporales
desde Hevy y un ejercicio repetido dentro de una sesión se agrupa por su plantilla.

## Estadísticas

La pantalla **Entrenamientos → Estadísticas** (`/stats`) muestra:

- sesiones, tiempo entrenado, volumen de carga y ejercicios con registros del mes actual;
- entrenamientos y volumen de carga de las últimas 12 semanas;
- resumen mensual de los últimos 12 meses;
- evolución de peso máximo y repeticiones totales del ejercicio seleccionado;
- récords personales básicos por ejercicio.

Fórmulas y criterios:

- **Volumen de carga**: Σ(`weight_kg` × `reps`) de las series que tienen peso y repeticiones,
  excluyendo las series marcadas como `warmup`.
- **Semanas**: empiezan en lunes y se agrupan con la zona local del sistema.
- **Meses**: se agrupan por `YYYY-MM` en la zona local.
- **Récords**: mejor peso y mejor serie de repeticiones registradas por ejercicio. No se estima un
  1RM y no se comparan ejercicios, variantes o unidades distintas.
- Las series de calentamiento pueden aparecer como récord si son la mejor marca registrada; el
  volumen sí las excluye.

Las gráficas usan Chart.js copiado localmente. No hay llamadas a servicios externos para
estadísticas.

## Entrenador personal

El módulo **Entrenador** revisa el progreso y genera un informe semanal con acciones concretas.
Está orientado por defecto a un objetivo de **prevención de sarcopenia con pérdida de grasa**, pero
el perfil permite elegir otros objetivos (pérdida de grasa, recomposición, hipertrofia, fuerza o
mantenimiento).

| Ruta | Pantalla |
| --- | --- |
| `/coach` | Informe actual, resumen de perfil y estado del check-in. |
| `/coach/plan` | Plan semanal con fuerza, montaña y descanso. |
| `/coach/plan/routines` | `GET` revisa los cambios del plan; `POST` los aplica en Hevy con confirmación. |
| `/coach/progress` | Gráficas de peso, series por grupo muscular, e1RM y tabla de ejercicios. |
| `/coach/profile` | `GET` muestra el perfil; `POST` guarda objetivo, medidas meta y días preferidos. |
| `/coach/checkin` | `GET` muestra el formulario semanal; `POST` crea o actualiza el check-in. |
| `/coach/checkin/:id/delete` | `GET` confirma el borrado; `POST` elimina el check-in. |
| `/coach/hiking` | Registro de salidas de montaña e importación GPX/TCX. |
| `/coach/hiking/:id/edit` | Edición de una salida. |
| `/coach/history` | Historial de informes guardados. |
| `/coach/export` | Exportación JSON/CSV y copias consistentes de SQLite. |
| `POST /coach/backup` | Crea una copia de la base en `data/backups`. |
| `POST /coach/reports` | Genera un informe nuevo con los últimos 28 días. |
| `/coach/reports/:id` | Informe completo con hallazgos, plan y texto copiable. |
| `POST /coach/reports/:id/ai` | Redacta el informe con IA si está configurada. |

### Perfil y check-in

El perfil guarda año de nacimiento, altura, sexo, experiencia, objetivo, peso/cintura/grasa
objetivo, sesiones por semana, minutos por sesión, días preferidos de fuerza y montaña,
equipamiento y limitaciones.

El check-in semanal registra peso, sueño, energía, estrés, agujetas,
**zonas de molestia estructuradas** y notas. Es la única fuente de recuperación: Hevy no envía sueño
ni RPE de forma fiable. Si el check-in incluye peso, se guarda también como medida de tipo `weight`
para que la evolución sea única. Al editar un check-in se actualiza el registro del mismo día; al
borrarlo, la medida de peso se conserva.

### Plan semanal

**Entrenador → Plan semanal** reparte la semana en sesiones de fuerza, salidas de montaña y descanso
activo. Las sesiones de fuerza se construyen con las **rutinas de Hevy** de la carpeta elegida en el
perfil (por defecto «Musculación» si existe): se respetan sus ejercicios, series, rangos de
repeticiones y cargas, y la rotación continúa por la última rutina registrada en Hevy. Los días
planificados que no se completan no avanzan la rotación: si se salta una semana o un par de
sesiones, al volver se retoma la misma rutina pendiente, sin reiniciar el ciclo. Cada ejercicio
muestra la carga de la rutina y el e1RM reciente cuando hay historial suficiente.

Si el plan ajusta algo respecto a la rutina original (por ejemplo, series en una semana de
descarga), el ejercicio se **resalta**, se muestra la comparación y aparece la acción **Revisar y
actualizar en Hevy**. Esa acción abre una confirmación con los cambios y, al aceptarla, actualiza las
rutinas mediante `PUT /v1/routines/{id}` y refresca la copia local.

Si la montaña ya ha cargado las piernas o hay molestias de rodilla, cadera o tobillo, se priorizan
las rutinas de tren superior. Cuando el motor detecta recuperación baja, marca la semana como
descarga y reduce a dos series por ejercicio. Si todavía no hay rutinas sincronizadas, el plan usa
los ejercicios del histórico como respaldo y avisa de que conviene sincronizar.

### Motor de reglas

El informe evalúa, entre otras cosas:

- adherencia (sesiones/semana frente al objetivo) y racha;
- cobertura de los diez grupos musculares principales;
- balance empuje/tirón y cuádriceps/isquiotibiales;
- ritmo de cambio de peso (rango recomendado 0,2–0,6 % semanal);
- progreso o descenso de fuerza por ejercicio;
- ejercicios estancados y récords recientes;
- recuperación (sueño, energía, estrés, agujetas y dolor);
- molestias por zona (hombro, codo, rodilla, cadera, etc.) y ajustes sugeridos;
- saltos bruscos de volumen y uso de series de calentamiento;
- progreso hacia el peso objetivo.

Los umbrales están en `config/coach.config.js`. Las reglas generan hallazgos con severidad
(`positive`, `info`, `warning`, `alert`), evidencia numérica y una acción concreta. Cada informe
guarda el análisis completo en JSON para poder reproducirlo aunque los datos cambien.

Si el motor recomienda una semana de descarga, las acciones de añadir volumen se posponen para no
dar consejos contradictorios. El plan de la semana prioriza descarga, ajuste de volumen, frecuencia
y ritmo de peso.

El informe incluye además una **próxima sesión sugerida** con hasta tres ejercicios de los grupos
con menos volumen o más tiempo sin entrenar. Solo usa ejercicios que ya aparecen en el histórico y
muestra la última carga registrada; no inventa rutinas ni equipamiento.

### Fórmulas y comparaciones

- **e1RM**: `peso × (1 + repeticiones / 30)` con la mejor serie de cada sesión; solo series de 1–12
  repeticiones y sin calentamiento.
- **Tendencia de fuerza**: mejor e1RM de los últimos 28 días frente a la ventana de 28 días
  anterior. Si no hay ventana anterior, se usa la última sesión previa disponible.
- **Récord**: mejor e1RM del periodo superior a todo el histórico anterior.
- **Series por grupo**: los ejercicios compuestos suman 1 serie al grupo principal y 0,5 a cada
  secundario. Los secundarios se rellenan en la siguiente sincronización con Hevy; hasta entonces
  solo se usa el grupo principal.
- **Peso**: regresión lineal sobre los pesajes de los últimos 28 días, expresada en % por semana.
  Necesita al menos 4 registros; con menos, la tendencia queda vacía.
- **Series semanales**: total de series de trabajo dividido entre las semanas del periodo.
- **Volumen**: `peso × repeticiones`; si el ejercicio está marcado como carga por lado, se
  multiplica por dos.
- **Semanas activas**: en una reanudación, la adherencia se calcula sobre las semanas con al menos
  una sesión, no sobre las semanas naturales del parón.

### Parones y reanudación

Un hueco de **14 días o más** entre sesiones se registra como parón. Si la vuelta fue hace 21 días o
menos, el informe entra en modo **reanudación**:

- no compara la fuerza con la etapa anterior;
- calcula la frecuencia sobre semanas activas;
- suaviza las recomendaciones de volumen y evita marcar estancamientos;
- añade un hallazgo con las fechas y la duración del parón.

Así, un parón por lesión no se interpreta como pérdida de fuerza ni como abandono.

### Cargas unilaterales

En **Entrenador → Ajustes de ejercicios** puedes marcar qué ejercicios registran el peso de un solo
lado (máquinas unilaterales, mancuernas, etc.). Al marcarlos:

- el volumen cuenta el doble, porque se hizo el trabajo en ambos lados;
- el e1RM se muestra como **por lado** y no se mezcla con ejercicios bilaterales;
- la próxima sesión indica la carga “por lado”.

La marca no cambia las series ni los grupos musculares y no se sobrescribe al sincronizar con Hevy.
Los ejercicios con equipamiento de mancuerna o pesa rusa aparecen con una sugerencia visual, pero
no se marcan automáticamente.

### Montaña

**Entrenador → Montaña** registra salidas de senderismo o montañismo con fecha, duración, desnivel,
distancia, esfuerzo y notas. El entrenador las tiene en cuenta:

- si en los últimos 7 días hay una salida de 3 horas o 400 m de desnivel, avisa de que la montaña ya
  es carga de piernas;
- en ese caso evita proponer volumen extra de piernas y la próxima sesión prioriza espalda, core o
  brazos;
- el informe incluye salidas, horas y desnivel del periodo.

En el formulario se puede **importar un archivo GPX o TCX exportado desde COROS** (u otro reloj).
El archivo se lee en el navegador, sin subirlo al servidor: se rellenan fecha, duración, desnivel
positivo (con histéresis para no inflarlo con el ruido del GPS) y distancia, y se revisan antes de
guardar. COROS no ofrece una API pública de autoservicio para uso personal: su API oficial es de
tipo partner/OAuth y requiere solicitud, así que la importación del archivo es la vía recomendada.
Si en el futuro se usa Strava, se podría valorar conectar su API oficial para traer las salidas
automáticamente.

Una salida se puede **editar** o **borrar**. Antes de guardar una salida nueva, la aplicación avisa
si ya existe otra de la misma fecha con duración, desnivel o distancia parecidos, para evitar
duplicados al importar dos veces el mismo archivo; se puede confirmar el guardado igualmente.

No se envían a Hevy ni a la IA.

### Fotos de progreso

**Entrenador → Fotos** permite guardar una foto cada 4–6 semanas con fecha, peso y notas. La imagen
se comprime y se vuelve a codificar en el navegador (máximo 1600 px, JPEG), lo que elimina los
metadatos EXIF antes de subirla. Se guarda en `data/photos`, fuera de `public/`, y se sirve mediante
una ruta privada de la aplicación. Nunca se envía a la IA.

### Rutinas de Hevy

La API pública de Hevy permite listar, crear y actualizar rutinas (`GET/POST /v1/routines`,
`GET/PUT /v1/routines/{id}`) y listar carpetas (`GET /v1/routine_folders`). MyHealth descarga tus
rutinas y carpetas a `hevy_routines` y `hevy_routine_folders`. La sincronización es de **solo
lectura** y funciona como **espejo**: elimina de la copia local las rutinas y carpetas que ya no
existan en Hevy. La única escritura es la acción explícita **Revisar y actualizar en Hevy** del plan
semanal, que muestra los cambios y pide confirmación antes de aplicar `PUT /v1/routines/{id}`. En
**Entrenador → Perfil y objetivo** se elige qué carpeta alimenta el plan semanal; en
**Entrenador → Rutinas** se revisan las rutinas sincronizadas y se lanza la sincronización manual.
Cada rutina enlaza a `/coach/routines/:id`, donde se ven sus ejercicios, series de calentamiento y
trabajo, repeticiones, cargas, descansos y notas. También se puede abrir desde el plan semanal.
Los ejercicios se muestran con el nombre en español registrado en tus entrenamientos, relacionado
por la plantilla de Hevy; si aún no existe, se usa el título original. Para editar una rutina
manualmente, hazlo en Hevy y pulsa «Sincronizar rutinas»: MyHealth no incluye editor de rutinas.

### IA opcional

El motor de reglas es completo por sí solo. La IA solo redacta una versión más natural del informe
y está desactivada por defecto:

```dotenv
COACH_LLM_ENABLED=true
COACH_LLM_BASE_URL=https://api.openai.com/v1
COACH_LLM_API_KEY=...
COACH_LLM_MODEL=...
```

Se envían únicamente métricas agregadas, hallazgos y el perfil (edad, objetivo, limitaciones);
nunca la base de datos, los identificadores de Hevy ni notas de entrenamiento. El prompt prohíbe
diagnósticos, fármacos, suplementos y promesas de resultados. La clave se usa solo en el servidor y
nunca se muestra en la interfaz.

### Límites y calidad del dato

- Hevy no aporta sueño, frecuencia cardiaca ni RPE fiable: el contexto subjetivo es el check-in.
- Los ejercicios a peso corporal no generan e1RM; se siguen midiendo por repeticiones en
  Estadísticas.
- Cambios de máquina, multiplicadores o unidades pueden falsear la comparación de cargas.
- El informe no es un consejo médico. Ante dolor persistente o lesión, consulta con un profesional
  sanitario.

Diagnóstico rápido por consola:

```powershell
npm run coach:check
```

## Constantes y medidas

La sección **Mis constantes → Evolución** (`/measurements`) permite:

- registrar fecha, parámetro, valor, unidad y observaciones;
- editar y eliminar registros, con página de confirmación antes de borrar;
- filtrar por parámetro y rango de fechas;
- consultar la gráfica del parámetro seleccionado;
- ver el peso destacado en el dashboard, con gráfica de los últimos 90 días.

Parámetros y unidades:

| Parámetro | Unidad | Rango orientativo |
| --- | --- | --- |
| Peso | kg | 20–400 |
| Cintura | cm | 20–250 |
| Cadera | cm | 20–250 |
| Pecho | cm | 20–250 |
| Brazo | cm | 5–100 |
| Muslo | cm | 10–150 |
| Cuello | cm | 10–100 |
| Grasa corporal | % | 1–70 |

Validación:

- el valor debe ser un número mayor que cero;
- si queda fuera del rango orientativo se muestra un aviso y se exige una confirmación explícita;
  no se bloquea un valor clínico atípico de forma silenciosa;
- se permiten varios registros en la misma fecha y parámetro;
- la unidad se deriva del parámetro para evitar mezclas;
- las observaciones tienen un máximo de 1000 caracteres.

## Base de datos

SQLite se inicializa automáticamente al arrancar:

- Fichero de datos: `data/myhealth.db`.
- Esquema inicial: `database/schema/001_initial.sql`.
- Migraciones posteriores: `database/migrations/`.
- Cada migración aplicada se registra en la tabla `schema_migrations`.
- Se activan claves foráneas, WAL y `busy_timeout`.

Tablas creadas: `workouts`, `exercises`, `workout_sets`, `measurements`, `settings`,
`sync_history`, `schema_migrations`, `athlete_profile`, `checkins`, `coach_reports`,
`hiking_sessions`, `progress_photos`, `hevy_routines` y `hevy_routine_folders`.

Migraciones del entrenador:

- `002_coach.sql`: perfil, check-ins, informes y `exercises.secondary_muscle_groups`.
- `003_exercise_unilateral.sql`: `exercises.is_unilateral`.
- `004_hiking.sql`: salidas de montaña.
- `005_progress_photos.sql`: metadatos de fotos.
- `006_hevy_routines.sql`: rutinas de Hevy en solo lectura.
- `007_nutrition_plan.sql`: días preferidos de fuerza/montaña y zonas de molestia.
- `008_routine_folders.sql`: carpetas de rutinas de Hevy y carpeta preferida del plan.

Comprobación rápida de la base de datos:

```powershell
npm run db:check
```

### Copia de seguridad

La aplicación incluye **Configuración → Datos y copias**:

- descarga un JSON completo con todas las tablas;
- exporta medidas, check-ins y montaña a CSV (punto y coma y BOM UTF-8 para Excel);
- crea una copia consistente de SQLite con `db.backup()` en `data/backups`;
- permite descargar las copias guardadas.

También puedes copiar `data/myhealth.db` con el servidor detenido y, si existen, los ficheros
`-wal` y `-shm`. Si usas fotos de progreso, copia también `data/photos`. Guarda una copia fuera del
equipo de vez en cuando.

## Pantallas y rutas

| Ruta | Pantalla |
| --- | --- |
| `/` | Redirección a `/dashboard`. |
| `/dashboard` | Resumen de actividad, última sincronización y último peso. |
| `/workouts` | Histórico de entrenamientos con filtros y paginación. |
| `/workouts/sync` | Estado e historial de la sincronización con Hevy. `GET` muestra la página; `POST` ejecuta la sincronización manual. |
| `/workouts/:id` | Detalle de una sesión, ejercicios, series y notas. |
| `/stats` | Estadísticas semanales, mensuales, por ejercicio y récords personales. |
| `/coach` | Informe actual del entrenador y estado del perfil/check-in. |
| `/coach/plan` | Plan semanal de fuerza, montaña y descanso. |
| `/coach/plan/routines` | Confirmación para aplicar los cambios del plan en las rutinas de Hevy. |
| `/coach/progress` | Progreso detallado con gráficas y tablas. |
| `/coach/profile` | Perfil, objetivo, días preferidos y limitaciones. |
| `/coach/checkin` | Check-in semanal de recuperación y molestias. |
| `/coach/exercises` | Marcar ejercicios con carga por lado. |
| `/coach/hiking` | Registro de salidas de montaña. |
| `/coach/hiking/:id/edit` | Edición de una salida de montaña. |
| `/coach/photos` | Galería de fotos de progreso. |
| `/coach/routines` | Rutinas de Hevy en modo lectura. |
| `/coach/routines/:id` | Contenido completo de una rutina: ejercicios, series, cargas y descansos. |
| `/coach/history` | Historial de informes. |
| `/coach/reports/:id` | Informe completo del entrenador. |
| `/coach/export` | Exportación JSON/CSV y copias de seguridad. |
| `/coach/export.json` | Descarga JSON completo. |
| `/coach/export.csv?type=...` | Descarga CSV de medidas, check-ins o montaña. |
| `POST /coach/backup` | Crea una copia consistente en `data/backups`. |
| `/measurements` | Listado de medidas con filtros, gráfica y acciones de edición/borrado. |
| `/measurements/new` | Formulario de alta. `GET` lo muestra; `POST` guarda la medida. |
| `/measurements/:id/edit` | Formulario de edición. `GET` lo muestra; `POST` guarda los cambios. |
| `/measurements/:id/delete` | Confirmación de borrado. `GET` muestra la confirmación; `POST` elimina. |
| `/settings/hevy` | Estado de la configuración de Hevy. |

El menú lateral, la barra superior y el pie son parciales EJS. El layout se renderiza mediante
`middleware/render-page.js`, que compone la vista con `views/layouts/main.ejs`.

## Estructura

```text
myhealth/
├── app.js
├── config/
│   ├── database.js
│   ├── settings.js
│   ├── coach.config.js
│   └── measurement-parameters.js
├── controllers/
│   ├── coach.controller.js
│   └── coach-export.controller.js
├── database/
│   ├── schema/001_initial.sql
│   └── migrations/002_coach.sql … 008_routine_folders.sql
├── data/myhealth.db
├── middleware/
├── models/
│   ├── athlete-profile.model.js
│   ├── checkin.model.js
│   ├── coach-metrics.model.js
│   ├── coach-report.model.js
│   ├── hevy-routine.model.js
│   ├── hiking.model.js
│   └── progress-photo.model.js
├── public/
│   ├── css/
│   ├── images/                # favicon.svg e icons/ (iconos de la PWA)
│   ├── js/                    # app.js, coach.js, photos.js, exercise-settings.js, …
│   ├── vendor/
│   │   ├── tabler/            # generado por setup-vendor
│   │   └── chartjs/           # generado por setup-vendor
│   ├── manifest.webmanifest
│   ├── offline.html
│   └── sw.js
├── routes/
├── scripts/
│   ├── check-database.js
│   ├── coach-check.js
│   ├── generate-icons.ps1
│   ├── hevy-diagnose.js
│   └── setup-vendor.js
├── services/
│   ├── hevy.service.js       # cliente HTTP de Hevy
│   ├── hevy-sync.service.js  # orquestación e importación
│   ├── hevy-routines.service.js # rutinas en solo lectura
│   ├── coach-metrics.service.js
│   ├── coach-rules.service.js
│   ├── coach-report.service.js
│   ├── coach-plan.service.js
│   └── coach-llm.service.js  # IA opcional
├── docs/
│   └── hevy-api.md
├── utils/
├── views/
│   ├── coach/
│   ├── dashboard/
│   ├── errors/
│   ├── layouts/
│   ├── measurements/
│   ├── partials/
│   ├── settings/
│   ├── stats/
│   └── workouts/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Alcance del MVP

Incluido en las Fases 1–4:

- Express, EJS, Tabler y Chart.js locales.
- Layout común, menú lateral, barra superior, migas de pan y diseño responsive.
- SQLite con creación automática, migración inicial e índices.
- Dashboard con sincronización, actividad, peso y gráfica de los últimos 90 días.
- Histórico de entrenamientos con filtros, paginación y detalle de sesión.
- Sincronización manual con Hevy: diagnóstico, paginación completa, importación de ejercicios y
  series, enriquecimiento con plantillas, idempotencia e historial de ejecuciones.
- Estadísticas semanales y mensuales, evolución por ejercicio y récords personales básicos.
- CRUD completo de medidas con validación, confirmación de valores atípicos, confirmación de
  borrado y gráficas.
- Entrenador personal: perfil, check-in semanal, motor de métricas, reglas de progreso, informes
  persistidos, progreso detallado y redacción opcional con IA.
- Plan semanal de fuerza y montaña.
- Detección de parones y modo reanudación, cargas unilaterales, registro de montaña con edición e
  importación GPX/TCX, molestias estructuradas y fotos de progreso.
- Sincronización de rutinas de Hevy en modo lectura (sin modificar nada en Hevy).
- Exportación JSON/CSV y copias consistentes de la base de datos.
- Manejo centralizado de errores, páginas 404/500 y validación de entradas.
- Tema claro/oscuro y formato local español de fechas.

Fuera de este MVP (según el documento maestro):

- Sincronización de eliminaciones de Hevy mediante eventos.
- Importación de medidas corporales desde Hevy.
- Modelos AEAT/SII, OCR, cartera/remesas, amortizaciones completas, analítica y presupuestos.
- Autenticación multiusuario, servicios cloud y aplicación móvil nativa.

El CRUD de medidas ya cubre el criterio 12.8 del documento maestro.

## Verificación realizada

- `npm install` termina sin vulnerabilidades conocidas.
- `npm run dev` arranca `nodemon`, sirve en `http://127.0.0.1:3000` y reinicia al cambiar archivos.
- Todas las rutas principales responden `200`; una ruta inexistente responde `404` con una página
  amigable.
- Tabler, Chart.js y la hoja de estilos propia se sirven desde `public/vendor` y `public/css`.
- La base de datos se crea en `data/myhealth.db` con las tablas e índices esperados.
- `npm run hevy:diagnose` verificó la autenticación y la estructura real de las respuestas.
- La sincronización real desde la interfaz importó 64 entrenamientos, 52 ejercicios y 1.149
  series. Una segunda ejecución leyó los 64 y los actualizó sin crear duplicados.
- Se comprobaron filtros, paginación, detalle y claves foráneas con los datos reales; no quedaron
  series huérfanas ni identificadores de Hevy duplicados.
- Se comprobaron las estadísticas semanales y mensuales, la selección de ejercicio y los récords
  personales con los datos reales.
- Se probó el CRUD completo de medidas en una base aislada: alta, edición, aviso y confirmación de
  valor atípico, y borrado con confirmación. Los datos de prueba se eliminaron al terminar.
- Se verificó que los valores no positivos y las fechas inválidas se rechazan, y que la gráfica
  de peso aparece tanto en el dashboard como en Mis constantes.
- La interfaz se revisó en navegador en tema claro y oscuro, en escritorio y móvil.
- El entrenador se verificó con los datos reales: perfil, validación del formulario, check-in
  semanal con sincronización del peso, informe con reglas de adherencia, volumen, fuerza, peso y
  recuperación, y página de progreso con las tres gráficas renderizadas.
- Se verificaron el parón real de 21 días (modo reanudación y frecuencia en semanas activas), la
  marca de carga por lado (volumen doble y e1RM “por lado”), el registro de montaña y su efecto en la
  próxima sesión, la subida/borrado de una foto y la sincronización de rutinas en una copia de la
  base de datos.
- Se verificaron el plan semanal, el check-in con zonas de molestia, la edición de montaña, el
  aviso de duplicados y la exportación JSON/CSV y copia SQLite en una base de pruebas.
- La PWA se verificó en navegador: manifest e iconos servidos, service worker activado, precache de
  estáticos y página `offline.html` al simular pérdida de conexión.

## Seguridad y privacidad

- Escucha por defecto en `127.0.0.1`.
- No incluye autenticación multiusuario: es una aplicación personal local.
- `.env`, la base de datos y los logs están excluidos de Git.
- Consultas SQL preparadas y validación de filtros.
- Límite de tamaño para cuerpos de petición.
- Validación de valores positivos, rangos orientativos con confirmación y borrado con confirmación.
- Los errores técnicos se registran en consola, no se muestran al usuario.
- La API Key nunca se muestra en las vistas ni se devuelve en respuestas HTTP.
- El service worker no cachea HTML ni respuestas con datos: solo recursos estáticos propios.
- Las fotos de progreso se guardan en `data/photos`, fuera de `public/`, y se sirven mediante una
  ruta privada. El navegador las recompone sin EXIF antes de subirlas y nunca se envían a la IA.
- Las rutinas de Hevy se sincronizan en modo lectura; MyHealth no crea, modifica ni borra rutinas en
  Hevy.
- El perfil y los check-ins se guardan en SQLite local. La redacción con IA es opcional y, al
  activarse, envía solo métricas agregadas, hallazgos y perfil; nunca la base de datos ni
  identificadores de Hevy.
- Las copias de seguridad se guardan en `data/backups`, fuera de `public/`, y solo se descargan por
  una ruta validada de la aplicación.
- Los informes incluyen una nota de seguridad: no son consejo médico ni sustituyen a un profesional
  sanitario.

## Problemas frecuentes

**El puerto 3000 está ocupado.** Cambia `PORT` en `.env` o detén el proceso que lo usa. El servidor
muestra un mensaje claro al arrancar.

**No aparecen Tabler o las gráficas.** Ejecuta `npm run setup:vendor` y recarga la página.

**No aparece la opción de instalar la aplicación.** Debe abrirse en `localhost`, `127.0.0.1` o por
HTTPS. Por la IP de la red local con HTTP el navegador no permite instalar ni registrar el service
worker; la aplicación funciona igual.

**El entrenador dice que no hay datos de peso.** Registra el peso 2-3 veces por semana en el
check-in o en Mis constantes. La tendencia necesita al menos 4 pesajes en 28 días.

**No aparece el botón de redactar con IA.** La capa es opcional y está desactivada por defecto.
Configura `COACH_LLM_ENABLED`, `COACH_LLM_API_KEY` y `COACH_LLM_MODEL` en `.env` y reinicia el
servidor.

**El informe marca fuerza en descenso.** Compara la mejor marca de los últimos 28 días con la
ventana anterior. Revisa si cambiaste de máquina, multiplicador o unidad, y consulta el detalle por
ejercicio en Progreso antes de sacar conclusiones. Tras un parón de 14 días o más, el modo
reanudación desactiva esa comparación temporalmente.

**El volumen no cuadra en máquinas unilaterales.** Marca el ejercicio en Entrenador → Ajustes de
ejercicios. El volumen se multiplica por dos y el e1RM se etiqueta como “por lado”.

**No se puede subir una foto.** Usa JPEG, PNG o WebP de menos de 12 MB y un navegador con JavaScript
activado; la imagen se comprime antes de enviarse.

**La sincronización de rutinas falla.** Comprueba `HEVY_API_KEY` y la conexión. MyHealth solo lee
rutinas; no modifica nada en Hevy.

**El formulario avisa de un valor atípico.** Es intencionado: el valor está fuera del rango
orientativo. Si es correcto, marca la casilla de confirmación y vuelve a guardar.

**Error al instalar `better-sqlite3`.** Comprueba que estás usando una versión de Node compatible
(20 o superior) y que tienes las herramientas de compilación disponibles si npm necesita compilar el
módulo nativo.

**La sincronización indica error de API Key.** Revisa `HEVY_API_KEY` en `.env`, comprueba que la
clave sigue activa y reinicia el servidor. La clave no se muestra en la interfaz ni en los logs.

**La sincronización devuelve error de conexión o de límite.** Comprueba la conexión a Internet y
reintenta desde la pantalla de sincronización. El cliente aplica un tiempo máximo de espera y
reintenta los errores 429/502/503/504, pero Hevy puede limitar temporalmente las peticiones.

**Las fechas no coinciden.** Ajusta `APP_TIMEZONE` en `.env` y reinicia el servidor. Las fechas se
guardan en ISO y se muestran en la zona configurada.
