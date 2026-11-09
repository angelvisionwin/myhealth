# Integración con la API de Hevy

Documento de referencia para la Fase 2 de MyHealth. La fuente es la documentación oficial
publicada en <https://api.hevyapp.com/docs> y su especificación OpenAPI 3.0, consultada el
30/10/2026. No se han inventado endpoints, parámetros ni campos.

## Autenticación

- Base URL: `https://api.hevyapp.com`.
- Cabecera obligatoria: `api-key: <clave>`.
- La clave se obtiene en <https://hevy.com/settings?developer> y solo está disponible para usuarios
  Hevy Pro.
- MyHealth la lee de `HEVY_API_KEY` en `.env` y nunca la muestra en la interfaz ni la incluye en
  mensajes de error.
- Si la cabecera falta o no es válida, la API responde con un error de autenticación.

## Endpoints utilizados

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/v1/user/info` | Diagnóstico de autenticación. |
| `GET` | `/v1/workouts/count` | Diagnóstico y comprobación del total disponible. |
| `GET` | `/v1/workouts?page=1&pageSize=10` | Listado paginado de entrenamientos. |
| `GET` | `/v1/exercise_templates?page=1&pageSize=100` | Catálogo para enriquecer grupo muscular y equipamiento. |
| `GET` | `/v1/routines?page=1&pageSize=10` | Rutinas para el plan semanal y la pantalla de rutinas. |
| `PUT` | `/v1/routines/{routineId}` | Aplicar cambios del plan a una rutina, con confirmación previa. |
| `GET` | `/v1/routine_folders?page=1&pageSize=10` | Carpetas que agrupan las rutinas en Hevy. |

### Paginación

`/v1/workouts`:

- `page`: entero, empieza en `1`.
- `pageSize`: entero, máximo **10**; por defecto `10`.
- Respuesta: `{ page, page_count, workouts: Workout[] }`.

`/v1/exercise_templates`:

- `page`: entero, empieza en `1`.
- `pageSize`: entero, máximo **100**; por defecto `100`.
- Respuesta: `{ page, page_count, exercise_templates: ExerciseTemplate[] }`.

`/v1/routines` y `/v1/routine_folders`:

- `page`: entero, empieza en `1`.
- `pageSize`: entero, máximo **10**; por defecto `10`.
- Respuesta de rutinas: `{ page, page_count, routines: Routine[] }`.
- Respuesta de carpetas: `{ page, page_count, routine_folders: RoutineFolder[] }`.

La sincronización recorre todas las páginas hasta `page >= page_count` o hasta recibir una página
sin elementos. No se presupone un número fijo de páginas.

## Muestra estructural redactada

Los valores personales se sustituyen por marcadores. Esta muestra reproduce la forma observada en
las respuestas reales y en la especificación:

```json
{
  "page": 1,
  "page_count": 7,
  "workouts": [
    {
      "id": "<workout-uuid>",
      "title": "<título>",
      "routine_id": null,
      "description": null,
      "start_time": "<ISO-8601>",
      "end_time": "<ISO-8601>",
      "updated_at": "<ISO-8601>",
      "created_at": "<ISO-8601>",
      "exercises": [
        {
          "index": 0,
          "title": "<nombre del ejercicio>",
          "notes": null,
          "exercise_template_id": "<template-id>",
          "superset_id": null,
          "sets": [
            {
              "index": 0,
              "type": "normal",
              "weight_kg": 0,
              "reps": 0,
              "distance_meters": null,
              "duration_seconds": null,
              "rpe": null,
              "custom_metric": null
            }
          ]
        }
      ]
    }
  ]
}
```

`exercise_templates` incluye, entre otros: `id`, `title`, `type`,
`primary_muscle_group`, `secondary_muscle_groups`, `equipment`, `is_custom` y
`thumbnail_url`.

## Mapeo a SQLite

### workouts

| Campo Hevy | Columna | Notas |
| --- | --- | --- |
| `id` | `hevy_id` | Clave única para el UPSERT. |
| `title` | `title` | Puede ser una cadena vacía o nula. |
| `description` | `description` | Nullable. |
| `start_time` | `start_time` | ISO-8601; se conserva tal cual. |
| `end_time` | `end_time` | ISO-8601; se conserva tal cual. |
| `created_at` | `created_at` | Fecha de creación en Hevy. |
| `updated_at` | `updated_at` | Fecha de última modificación en Hevy. |
| — | `duration_seconds` | Calculado como `end_time - start_time`, redondeado a segundos; `NULL` si las fechas no son válidas. |
| — | `raw_json` | JSON completo del workout, para conservar campos no modelados. |

### exercises

| Campo Hevy | Columna | Notas |
| --- | --- | --- |
| `exercise_template_id` | `hevy_exercise_id` | Clave única del catálogo. |
| `title` | `name` | Nombre mostrado en la sesión. |
| `primary_muscle_group` de la plantilla | `muscle_group` | Se enriquece con `/v1/exercise_templates`; `NULL` si no se encuentra. |
| `equipment` de la plantilla | `equipment` | Se enriquece con `/v1/exercise_templates`; `NULL` si no se encuentra. |
| — | `created_at`, `updated_at` | Marcas locales de alta/actualización del catálogo. |

`secondary_muscle_groups`, `is_custom`, `thumbnail_url`, `notes` y `superset_id` no tienen columna
propia; quedan disponibles dentro de `raw_json` cuando corresponde.

### hevy_routines

La respuesta de `/v1/routines` se guarda completa en `raw_json` para que el plan semanal pueda leer
los ejercicios, las series, los rangos de repeticiones y las cargas sin volver a llamar a la API. El
plan elige una carpeta (por defecto «Musculación» o la indicada en el perfil) y continúa la rotación
por la última rutina registrada en los entrenamientos. Para mostrar los nombres en español, cada
ejercicio de la rutina se relaciona por `exercise_template_id` con `exercises.name`, que procede de
los entrenamientos importados; si no hay coincidencia, se conserva el título original de Hevy.

### hevy_routine_folders

| Campo Hevy | Columna | Notas |
| --- | --- | --- |
| `id` | `hevy_id` | Clave única de la carpeta (entero). |
| `title` | `title` | Nombre visible, por ejemplo «Musculación». |
| `index` | `folder_index` | Orden de la carpeta en Hevy. |
| — | `synced_at` | Marca local de la última sincronización. |

La sincronización de rutinas es un **espejo**: después del UPSERT se eliminan las filas de
`hevy_routines` y `hevy_routine_folders` cuyo identificador no aparezca en la respuesta actual. Si
la carpeta elegida en el perfil desaparece, `athlete_profile.routine_folder_id` se limpia. Las
respuestas de la API se validan antes de borrar; si falla la descarga, la copia local se conserva.

### workout_sets

| Campo Hevy | Columna | Notas |
| --- | --- | --- |
| `index` | `set_index` | Índice original de la API (0-based). |
| `type` | `set_type` | Valores observados: `normal`, `warmup`, `dropset`, `failure`. |
| `weight_kg` | `weight_kg` | Nullable. |
| `reps` | `repetitions` | Nullable. |
| `distance_meters` | `distance_meters` | Nullable. |
| `duration_seconds` | `duration_seconds` | Nullable. |
| `rpe` | `rpe` | Nullable. |
| — | `raw_json` | JSON completo de la serie, incluido `custom_metric` si existe. |

## Estrategia de sincronización

1. Crear una fila en `sync_history` con estado `running`.
2. Descargar el catálogo de plantillas (paginado) para enriquecer ejercicios. Si falla por un error
   no crítico, se continúa sin enriquecimiento y se anota un aviso.
3. Recorrer todas las páginas de `/v1/workouts` con `pageSize=10`.
4. Para cada workout, ejecutar una transacción SQLite:
   - UPSERT de `workouts` por `hevy_id`.
   - UPSERT de `exercises` por `hevy_exercise_id`.
   - Borrado y reinserción de las series del workout.
5. Actualizar `sync_history` con estado final, contadores y mensaje de error si procede.
6. Si un workout individual falla, se continúa con el resto y el estado final es `partial`.
7. Si falla la paginación o la autenticación, se conserva lo ya importado y el estado final es
   `error`. La siguiente sincronización puede reintentarse sin duplicar datos.

La operación es idempotente porque `workouts.hevy_id` es único y las series se reemplazan dentro de
la misma transacción.

## Actualización de rutinas

El plan semanal compara cada ejercicio propuesto con la rutina original descargada. Si hay cambios
(por ejemplo, menos series en una semana de descarga), la interfaz los resalta y ofrece una acción
explícita de actualización. Al confirmarla:

1. Se sincronizan de nuevo las rutinas para no pisar cambios recientes hechos en Hevy.
2. Se reconstruye el cuerpo `{ routine: { title, folder_id, notes, exercises } }` a partir del
   `raw_json` guardado, conservando ejercicios, notas, descansos y series de calentamiento.
3. Solo se modifican los campos con diferencia (series, repeticiones o peso).
4. Se envía `PUT /v1/routines/{routineId}` y se actualiza la copia local con la respuesta.
5. Si una rutina falla, se continúa con las demás y se informa del resultado parcial.

La escritura nunca se hace de forma automática ni al abrir una pantalla: requiere pulsar el botón y
confirmar en `/coach/plan/routines`.

## Limitaciones conocidas de esta fase

- No se sincronizan eliminaciones de Hevy. La API ofrece `/v1/workouts/events` para eventos de
  actualización y borrado; se estudiará en una fase posterior.
- Un mismo ejercicio repetido dentro de una sesión se agrupa por `exercise_template_id`, porque el
  esquema actual no modela instancias de ejercicio por workout.
- No se importan medidas corporales desde Hevy. La Fase 4 gestiona las medidas manuales de MyHealth.
- La sincronización es manual desde la interfaz. No hay tareas programadas ni llamadas al abrir las
  pantallas.

## Diagnóstico ejecutado

Con la clave real configurada, `npm run hevy:diagnose` comprobó:

- `GET /v1/user/info` respondió `200` y devolvió datos de usuario.
- `GET /v1/workouts/count` respondió `200`.
- `GET /v1/workouts?page=1&pageSize=1` respondió `200` con `page`, `page_count` y un workout con
  los campos `id`, `title`, `routine_id`, `description`, `start_time`, `end_time`, `updated_at`,
  `created_at` y `exercises`.
- Cada ejercicio incluye `index`, `title`, `notes`, `exercise_template_id`, `superset_id` y `sets`.
- Cada serie incluye `index`, `type`, `weight_kg`, `reps`, `distance_meters`, `duration_seconds`,
  `rpe` y `custom_metric`.
- `GET /v1/exercise_templates?page=1&pageSize=1` respondió `200` con `id`, `title`, `type`,
  `primary_muscle_group`, `secondary_muscle_groups`, `equipment`, `is_custom` y `thumbnail_url`.

Los valores personales de las respuestas no se guardaron en este documento ni en el repositorio.
