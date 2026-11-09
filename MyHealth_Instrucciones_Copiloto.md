# MyHealth — Documento maestro para el copiloto

**Versión:** 1.0  
**Fecha:** 30/10/2026  
**Objetivo:** construir una aplicación web personal para consultar entrenamientos de Hevy y registrar medidas corporales.

---

## 1. Instrucción principal

Actúa como desarrollador senior de Node.js. Construye MyHealth de forma incremental, sencilla y mantenible.

Antes de implementar:
1. Inspecciona el proyecto y el entorno existentes.
2. Si el repositorio está vacío, crea la estructura descrita en este documento.
3. Comprueba las versiones instaladas de Node.js y npm.
4. No añadas tecnologías ni funcionalidades fuera del alcance sin consultar.
5. Explica brevemente el plan y después implementa la primera fase.
6. No inventes endpoints, campos ni comportamientos de la API de Hevy: verifica la documentación oficial y prueba las respuestas reales.

**Prioridad:** una aplicación pequeña que funcione bien, no una arquitectura empresarial.

## 2. Objetivo del producto

MyHealth es una aplicación web de uso individual, ejecutada en un PC con Windows 11 y accesible inicialmente solo desde `localhost`.

La primera versión tendrá tres apartados:

1. **Dashboard:** resumen de actividad y medidas.
2. **Entrenamientos:** sincronización manual con Hevy, histórico y detalle de sesiones.
3. **Constantes:** registro manual de peso y medidas corporales, con histórico y gráficas.

La aplicación debe quedar preparada para ampliaciones futuras, pero no implementar ahora módulos que no estén incluidos en este alcance.

## 3. Tecnologías obligatorias

- Runtime: Node.js, versión LTS disponible en el entorno.
- Backend: Express.
- Vistas: EJS.
- Interfaz: Tabler, usando sus recursos oficiales y componentes Bootstrap incluidos en la versión elegida.
- Base de datos: SQLite.
- Driver: `better-sqlite3`.
- Gráficos: Chart.js.
- HTTP: `axios` o `fetch` nativo de Node. Preferir `fetch` si la versión de Node lo soporta adecuadamente.
- Configuración: `dotenv`.
- Desarrollo: `nodemon`.

No utilizar:
- MySQL, MariaDB ni PostgreSQL.
- Docker o Kubernetes.
- React, Vue, Angular ni frontend SPA.
- Redis, colas o microservicios.
- Integraciones con Apple Salud o COROS.
- IA.
- Servicios cloud o alojamiento externo.

## 4. Estructura de carpetas propuesta

```text
myhealth/
├── app.js
├── package.json
├── .env
├── .env.example
├── .gitignore
├── README.md
│
├── config/
│   ├── database.js
│   └── settings.js
│
├── database/
│   ├── myhealth.db
│   ├── schema/
│   │   └── 001_initial.sql
│   └── migrations/
│
├── routes/
│   ├── dashboard.routes.js
│   ├── hevy.routes.js
│   └── measurements.routes.js
│
├── controllers/
│   ├── dashboard.controller.js
│   ├── hevy.controller.js
│   └── measurements.controller.js
│
├── services/
│   └── hevy.service.js
│
├── models/
│   ├── workout.model.js
│   ├── exercise.model.js
│   ├── measurement.model.js
│   └── setting.model.js
│
├── middleware/
│   └── error-handler.js
│
├── views/
│   ├── layouts/
│   ├── partials/
│   ├── dashboard/
│   ├── workouts/
│   └── measurements/
│
├── public/
│   ├── css/
│   ├── js/
│   ├── images/
│   └── vendor/
│       └── tabler/
│
└── data/
    └── myhealth.db
```

El archivo SQLite real debe estar en `data/myhealth.db`. No mantener dos bases de datos distintas. La carpeta `database/` contiene esquemas y migraciones; `data/` contiene el fichero de datos.

Los recursos de Tabler deben instalarse localmente, preferentemente mediante npm o descargando la distribución oficial. No depender de CDN para que la aplicación funcione sin conexión a Internet, salvo para las llamadas a Hevy.

## 5. Interfaz y navegación

Diseñar una interfaz limpia, profesional y responsive utilizando Tabler.

Menú lateral inicial:
- Dashboard
- Entrenamientos
  - Histórico
  - Sincronizar Hevy
- Mis constantes
  - Evolución
  - Nuevo registro
- Configuración
  - Integración Hevy

Requisitos:
- Layout común EJS.
- Menú lateral y barra superior como parciales.
- Breadcrumbs cuando aporten valor.
- Formularios con validación y mensajes claros.
- Tablas con paginación cuando sea necesario.
- Gráficas Chart.js.
- Fechas mostradas en formato local español `DD/MM/YYYY HH:mm` cuando proceda.
- Unidades visibles junto a cada valor.
- Evitar exceso de tarjetas y elementos decorativos.

## 6. Base de datos SQLite

Usar `better-sqlite3`, consultas preparadas y claves foráneas activadas (`PRAGMA foreign_keys = ON`).

### 6.1 workouts

Almacena una sesión de entrenamiento de Hevy.

Campos mínimos:
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT.
- `hevy_id`: TEXT NOT NULL UNIQUE.
- `title`: TEXT.
- `description`: TEXT.
- `start_time`: TEXT.
- `end_time`: TEXT.
- `duration_seconds`: INTEGER.
- `created_at`: TEXT.
- `updated_at`: TEXT.
- `raw_json`: TEXT, opcional, para conservar la respuesta original relevante.

### 6.2 exercises

Catálogo de ejercicios.

- `id`: INTEGER PRIMARY KEY AUTOINCREMENT.
- `hevy_exercise_id`: TEXT UNIQUE.
- `name`: TEXT NOT NULL.
- `muscle_group`: TEXT.
- `equipment`: TEXT.
- `created_at`: TEXT.
- `updated_at`: TEXT.

No asumir que todos los ejercicios de Hevy tendrán todos estos campos. Conservar los campos disponibles y documentar el mapeo real.

### 6.3 workout_sets

Series asociadas a una sesión y un ejercicio.

- `id`: INTEGER PRIMARY KEY AUTOINCREMENT.
- `workout_id`: INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE.
- `exercise_id`: INTEGER NOT NULL REFERENCES exercises(id).
- `set_index`: INTEGER.
- `set_type`: TEXT.
- `weight_kg`: REAL.
- `repetitions`: INTEGER.
- `distance_meters`: REAL.
- `duration_seconds`: INTEGER.
- `rpe`: REAL, nullable.
- `raw_json`: TEXT, opcional.

Guardar unidades normalizadas internamente cuando sea posible, sin perder el valor original si la API utiliza otra unidad. No convertir valores sin verificar las unidades de origen.

### 6.4 measurements

Registro de medidas corporales.

- `id`: INTEGER PRIMARY KEY AUTOINCREMENT.
- `measurement_date`: TEXT NOT NULL.
- `parameter`: TEXT NOT NULL.
- `value`: REAL NOT NULL.
- `unit`: TEXT NOT NULL.
- `notes`: TEXT.
- `created_at`: TEXT NOT NULL.

Parámetros iniciales:
- `weight` — kg.
- `waist` — cm.
- `hip` — cm.
- `chest` — cm.
- `arm` — cm.
- `thigh` — cm.
- `neck` — cm.
- `body_fat` — %.

Permitir varios parámetros en una misma fecha. No imponer unicidad por fecha y parámetro de momento; decidir si se permiten varias mediciones diarias y documentarlo.

### 6.5 settings

Configuración clave/valor.

- `key`: TEXT PRIMARY KEY.
- `value`: TEXT.
- `updated_at`: TEXT.

No guardar la API Key en texto visible en vistas ni devolverla en respuestas HTTP. Para esta aplicación local puede guardarse en la configuración local, pero debe excluirse de Git. Preferir `.env` para secretos; si se permite configurarla desde la interfaz, guardar el valor fuera de la base de datos y explicar la solución.

### 6.6 sync_history

Historial de sincronizaciones.

- `id`: INTEGER PRIMARY KEY AUTOINCREMENT.
- `provider`: TEXT NOT NULL.
- `started_at`: TEXT NOT NULL.
- `finished_at`: TEXT.
- `status`: TEXT NOT NULL.
- `items_read`: INTEGER DEFAULT 0.
- `items_created`: INTEGER DEFAULT 0.
- `items_updated`: INTEGER DEFAULT 0.
- `error_message`: TEXT.

Añadir índices para `workouts.start_time`, `workout_sets.workout_id`, `measurements.measurement_date` y `measurements.parameter`.

## 7. Integración con Hevy

La integración con Hevy es la prioridad funcional de la primera versión.

Documentación oficial:
https://api.hevyapp.com/docs

Requisitos:
1. Configurar la API Key de forma segura.
2. Implementar un servicio aislado `hevy.service.js`.
3. Verificar los endpoints y modelos en la documentación vigente antes de programar.
4. No inventar rutas, parámetros, límites de paginación ni nombres de campos.
5. Implementar paginación según el contrato real de la API.
6. Importar el histórico disponible.
7. Guardar entrenamientos y series en SQLite.
8. Evitar duplicados mediante `hevy_id` y operaciones UPSERT.
9. Permitir sincronización manual desde la interfaz.
10. Registrar cada ejecución en `sync_history`.
11. Mostrar fecha, resultado, elementos importados y errores.
12. Si una sincronización falla, conservar los datos ya importados correctamente y permitir reintentar sin duplicar.
13. Gestionar timeouts, errores HTTP, respuestas inesperadas y límites de API.
14. No consultar Hevy cada vez que se abre una pantalla: las páginas deben leer SQLite.

La primera tarea de integración debe ser un pequeño diagnóstico:
- comprobar autenticación;
- consultar un endpoint real;
- guardar una muestra de respuesta sin secretos;
- documentar el mapeo de campos;
- solo después implementar la importación completa.

No hacer scraping ni utilizar endpoints privados/no documentados.

## 8. Pantallas y comportamiento

### 8.1 Dashboard

Mostrar:
- Fecha de última sincronización con Hevy.
- Número de entrenamientos del mes.
- Duración total entrenada en el mes, si se dispone de datos fiables.
- Último entrenamiento.
- Último peso registrado.
- Diferencia respecto al registro anterior.
- Gráfica de peso de los últimos 90 días.
- Resumen de entrenamientos recientes.

Si no existen datos, mostrar estados vacíos útiles y enlaces para sincronizar o registrar el primer dato. No mostrar ceros engañosos.

### 8.2 Histórico de entrenamientos

Tabla con:
- Fecha.
- Nombre de sesión.
- Duración, si está disponible.
- Número de ejercicios.
- Número de series.

Filtros:
- Rango de fechas.
- Búsqueda por nombre.

Al abrir una sesión:
- Datos generales.
- Ejercicios ordenados.
- Series, repeticiones y peso.
- Notas disponibles.
- Unidades claras.

### 8.3 Estadísticas de entrenamiento

Incluir inicialmente:
- Entrenamientos por semana/mes.
- Volumen de carga por semana, solo cuando los datos y unidades permitan calcularlo correctamente.
- Evolución de carga y repeticiones por ejercicio.
- Récords personales básicos.

Definir claramente las fórmulas. No comparar directamente ejercicios, variantes o unidades incompatibles. No llamar “series efectivas” a todas las series sin tener criterios suficientes.

### 8.4 Constantes

Formulario para registrar:
- Fecha.
- Parámetro.
- Valor.
- Unidad.
- Observaciones.

Permitir editar y eliminar registros, con confirmación antes de borrar.

Listado con filtros por parámetro y fechas.
Gráfica de evolución para el parámetro seleccionado.
El peso tendrá una vista destacada.

Validar valores positivos y rangos razonables para evitar errores de entrada, pero no bloquear valores clínicos atípicos de forma silenciosa. Mostrar avisos y permitir confirmación.

## 9. Seguridad y privacidad

- La aplicación escucha por defecto en `127.0.0.1`.
- No exponerla a la red local ni a Internet sin una decisión explícita posterior.
- No incluir `.env`, base de datos real, claves ni datos personales en Git.
- Crear `.env.example` con valores ficticios.
- Validar y sanear entradas.
- Usar consultas preparadas.
- No construir SQL concatenando valores del usuario.
- No mostrar stack traces al usuario final.
- Registrar errores en consola o fichero local sin incluir API Keys.
- Limitar el tamaño de peticiones y validar tipos de archivo si se añaden cargas.
- Mantener copias de seguridad sencillas de `data/myhealth.db`.

No implementar autenticación multiusuario: es una aplicación personal local. No obstante, no asumir que localhost elimina la necesidad de validar entradas.

## 10. Convenciones de desarrollo

- JavaScript moderno, CommonJS o ES Modules, pero elegir uno y mantenerlo en todo el proyecto.
- Preferir nombres de archivos y variables en inglés.
- Interfaz y textos visibles en español.
- Separar rutas, controladores, servicios y acceso a datos.
- No introducir capas abstractas innecesarias.
- Funciones pequeñas y nombres explícitos.
- Usar transacciones SQLite al importar un entrenamiento completo con sus ejercicios y series.
- No realizar llamadas HTTP dentro de controladores si pertenecen al servicio Hevy.
- Manejar errores de forma centralizada.
- Comentar decisiones no obvias, no cada línea.
- Mantener `README.md` actualizado.

## 11. Fases de implementación

### Fase 1 — Esqueleto
- Inicializar Node y Express.
- Integrar EJS.
- Integrar Tabler localmente.
- Crear layout, menú y navegación.
- Configurar SQLite y creación/migración inicial de tablas.
- Crear dashboard vacío con estados informativos.
- Añadir scripts `npm start` y `npm run dev`.

### Fase 2 — Hevy
- Configurar API Key.
- Diagnóstico de autenticación.
- Verificar respuestas reales.
- Importar histórico con paginación.
- Guardar entrenamientos, ejercicios y series.
- Implementar sincronización manual idempotente.
- Crear histórico y detalle de sesión.

### Fase 3 — Estadísticas
- Resumen mensual.
- Evolución por ejercicio.
- Volumen semanal.
- Récords personales básicos.

### Fase 4 — Constantes
- CRUD de medidas.
- Listado y filtros.
- Gráficas de evolución.
- Integración de peso en dashboard.

No empezar una fase nueva hasta que la anterior funcione y esté probada.

## 12. Criterios de aceptación de la primera entrega

La primera entrega se considera correcta cuando:

1. `npm install` termina correctamente.
2. `npm run dev` inicia el servidor sin errores.
3. La aplicación abre en `http://127.0.0.1:3000`.
4. Tabler se carga desde recursos locales.
5. La base de datos se crea automáticamente si no existe.
6. La navegación entre Dashboard, Entrenamientos y Constantes funciona.
7. El dashboard muestra estados vacíos correctos.
8. Se puede registrar, listar, editar y eliminar una medida de prueba.
9. La base de datos persiste tras reiniciar Node.
10. El README explica instalación, configuración y ejecución.

Para la integración Hevy, los criterios serán:
- autenticación verificada con la API real;
- paginación completa;
- importación sin duplicados;
- detalle de entrenamiento correcto;
- errores visibles y recuperables.

## 13. Forma de trabajo del copiloto

Trabaja por entregas pequeñas.

Para cada fase:
1. Indica qué archivos vas a crear o modificar.
2. Implementa la funcionalidad.
3. Ejecuta las comprobaciones o pruebas posibles.
4. Corrige los errores encontrados.
5. Resume qué está terminado y qué queda pendiente.
6. Actualiza el README.

No simules datos de Hevy como si fueran reales. Para desarrollo visual puedes usar fixtures claramente identificados como datos de demostración, separados de la base de datos real.

No cambies el stack ni amplíes el alcance sin autorización.

**Primera orden:** implementa únicamente la Fase 1 — Esqueleto. No empieces todavía la integración con Hevy hasta que la aplicación base arranque y se pueda navegar correctamente.

---

## 14. Ampliación autorizada (30/10/2026): entrenador personal

El propietario del producto autoriza ampliar el alcance con un módulo de entrenador personal
orientado a prevenir la sarcopenia y perder grasa de forma moderada.

Alcance añadido:

- perfil del atleta (edad, altura, experiencia, objetivo, metas, disponibilidad y limitaciones);
- check-in semanal (peso, sueño, energía, estrés, agujetas y dolor) que alimenta la valoración de
  recuperación;
- motor de métricas determinista (adherencia, volumen por grupo muscular, balance, e1RM, tendencia
  de peso y cintura, recuperación);
- motor de reglas que genera hallazgos explicables con acción concreta;
- informes persistidos con snapshot del análisis e historial;
- pantalla de progreso con gráficas;
- diagnóstico `npm run coach:check`.

Cambios respecto a las restricciones originales:

- La sección 3 decía «No IA». Se permite una **capa opcional de redacción con IA**, desactivada por
  defecto y nunca en el camino crítico: el motor de reglas funciona sin ella. Si se activa, solo
  recibe métricas agregadas, hallazgos y perfil; no recibe la base de datos, identificadores ni
  notas personales de entrenamiento.
- Sigue sin implementarse autenticación multiusuario ni exposición a Internet. Cuando se plantee el
  despliegue en VPS será necesario añadir autenticación, TLS, copias de seguridad y endurecimiento
  de cabeceras antes de abrir el servicio.

Criterios de aceptación del módulo:

1. El perfil valida rangos y no bloquea valores clínicos atípicos.
2. El check-in es único por fecha y sincroniza el peso con `measurements` sin duplicarlo.
3. Los informes guardan el JSON del análisis y el texto generado.
4. Las reglas muestran evidencia numérica y una acción concreta por hallazgo.
5. La IA es opcional, está desactivada por defecto y sus errores son visibles y recuperables.
6. El informe incluye una nota de seguridad y no emite diagnósticos médicos.

## 15. Ampliación 2 (30/10/2026): contexto real de entrenamiento

Se autoriza ampliar el entrenador con el contexto que Hevy no registra:

- **Parones**: un hueco de 14 días o más entre sesiones se detecta como parón. Durante 21 días
  desde la vuelta, el informe no compara fuerza, calcula la frecuencia sobre semanas activas y
  suaviza las recomendaciones de volumen.
- **Cargas unilaterales**: cada ejercicio puede marcarse como «carga por lado». El volumen cuenta
  el doble y el e1RM se etiqueta por lado; la marca no se sobrescribe al sincronizar con Hevy.
- **Montaña**: registro manual de salidas con duración, desnivel, distancia y esfuerzo. Una salida
  reciente de 3 horas o 400 m de desnivel evita que el plan añada volumen de piernas.
- **Fotos de progreso**: se comprimen y recodifican en el navegador (sin EXIF), se guardan en
  `data/photos` fuera de `public/` y no se envían a la IA.
- **Rutinas de Hevy**: la API permite listar, crear y actualizar rutinas y listar carpetas. MyHealth
  sincroniza rutinas y carpetas en modo lectura y solo escribe con la acción explícita **Revisar y
  actualizar en Hevy** del plan semanal (con confirmación y sincronización previa).

Criterios añadidos:

1. El modo reanudación no genera falsos descensos de fuerza.
2. El volumen unilateral se contabiliza por ambos lados.
3. La montaña influye en el consejo de piernas y en la próxima sesión.
4. Las fotos no son accesibles desde `public/`.
5. La sincronización de rutinas es idempotente; la escritura solo ocurre con confirmación explícita.

## 16. Ampliación 3 (30/10/2026): plan semanal, molestias y continuidad

Se autoriza ampliar el entrenador para cerrar el ciclo entre el análisis y la acción diaria:

- **Plan semanal**: reparte la semana en sesiones de fuerza, montaña y descanso activo. Las
  sesiones de fuerza salen de las rutinas de Hevy de la carpeta elegida en el perfil (por defecto
  «Musculación»): ejercicios, series, repeticiones y cargas reales. La rotación continúa la última
  rutina registrada y evita repetirla en la misma semana. Evita piernas tras una salida exigente o
  con molestias de rodilla, cadera o tobillo, y marca descarga cuando la recuperación está baja.
- **Molestias estructuradas**: el check-in permite marcar zonas (hombro, codo, muñeca, cuello,
  espalda baja, cadera, rodilla, tobillo u otra). El motor añade un hallazgo con ajustes concretos
  y evita piernas cuando la molestia es de cadera, rodilla o tobillo.
- **Montaña editable**: se puede editar una salida y se avisa de posibles duplicados al guardar
  una fecha con duración, desnivel o distancia parecidos.
- **Datos y copias**: exportación JSON completa, CSV de medidas/check-ins/montaña y copia
  consistente de SQLite con `db.backup()` en `data/backups`.

Criterios añadidos:

1. El plan semanal respeta los días elegidos y no duplica fuerza y montaña el mismo día.
2. Las molestias quedan registradas y aparecen en el informe.
3. La edición de montaña mantiene la integridad y el aviso de duplicados se puede confirmar.
4. Las copias se guardan fuera de `public/` y solo se descargan por una ruta validada.

> **Nota (09/11/2026)**: la función de nutrición se ha retirado de la aplicación; el usuario usará
> los servicios de un profesional. Las columnas de nutrición permanecen en la base de datos por si
> se recupera la función.

## 17. Ampliación 4 (30/10/2026): plan basado en rutinas de Hevy

- Migración `008_routine_folders.sql`: tabla `hevy_routine_folders` y columna
  `athlete_profile.routine_folder_id`.
- La sincronización de rutinas descarga también `GET /v1/routine_folders`; la carpeta del plan se
  elige en **Perfil y objetivo** (automática: «Musculación» o la carpeta de la última rutina).
- `coach-plan.service.js` usa `hevy_routines.raw_json` para construir cada sesión de fuerza y
  `workouts.raw_json.routine_id` para la rotación según la fecha de cada día planificado. Relaciona
  rutinas y historial por `exercise_template_id`, porque los títulos de rutina pueden estar en otro
  idioma. Los días planificados que no se completan **no avanzan** la rotación: la próxima sesión es
  siempre la siguiente a la última rutina realmente registrada (sin reset tras un parón).
- Si no hay rutinas sincronizadas, se mantiene el plan generado desde el historial como respaldo.
- El plan compara cada ejercicio propuesto con la rutina original y resalta los que cambian. Si hay
  cambios, la acción **Revisar y actualizar en Hevy** (`/coach/plan/routines`) muestra la
  comparación, sincroniza antes de escribir, aplica solo los campos modificados con
  `PUT /v1/routines/{id}` y refresca la copia local. Si una rutina falla, se informa del resultado
  parcial.
- `/coach/routines/:id` muestra el contenido completo de una rutina: ejercicios, grupos musculares,
  series de calentamiento y trabajo, repeticiones, cargas, descansos y notas.

Criterios añadidos:

1. El plan de fuerza coincide con las rutinas de la carpeta elegida y muestra sus cargas.
2. La rotación continúa después de la última rutina realizada y no repite rutina en la semana.
3. Si se saltan días o una semana entera, al volver se retoma la rutina pendiente; no hay reset.
4. Editar una rutina en Hevy requiere pulsar «Sincronizar rutinas» para reflejarla.
5. Los cambios del plan se resaltan y solo se escriben en Hevy tras confirmarlos; nunca de forma
   automática.
6. La sincronización de rutinas sigue siendo de solo lectura.

Sigue pendiente el despliegue seguro en VPS: autenticación monousuario, CSRF, sesión persistente,
TLS, `trust proxy`, copias automáticas, systemd y CSP/HSTS. Hasta entonces la aplicación se usa en
localhost.
