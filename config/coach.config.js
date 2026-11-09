'use strict';

// Configuración del entrenador: objetivos, grupos musculares y umbrales de las reglas.
// Todo lo que el motor de reglas considera "normal" vive aquí para poder ajustarlo sin tocar lógica.

const RULES_VERSION = '1.1.0';

const GOALS = Object.freeze([
  {
    key: 'sarcopenia_fat_loss',
    label: 'Evitar sarcopenia y perder grasa',
    shortLabel: 'Anti-sarcopenia + grasa',
    includesFatLoss: true,
    emphasizesStrength: true,
    defaultSessionsPerWeek: 3,
    description:
      'Mantener o ganar fuerza y masa muscular mientras se reduce grasa a un ritmo moderado.'
  },
  {
    key: 'fat_loss',
    label: 'Perder grasa',
    shortLabel: 'Pérdida de grasa',
    includesFatLoss: true,
    emphasizesStrength: false,
    defaultSessionsPerWeek: 3,
    description: 'Reducir peso y cintura conservando la mayor cantidad de músculo posible.'
  },
  {
    key: 'recomposition',
    label: 'Recomposición corporal',
    shortLabel: 'Recomposición',
    includesFatLoss: true,
    emphasizesStrength: true,
    defaultSessionsPerWeek: 3,
    description: 'Ganar músculo y perder grasa de forma simultánea, con cambios lentos.'
  },
  {
    key: 'hypertrophy',
    label: 'Ganar masa muscular',
    shortLabel: 'Hipertrofia',
    includesFatLoss: false,
    emphasizesStrength: false,
    defaultSessionsPerWeek: 4,
    description: 'Aumentar volumen muscular con superávit controlado.'
  },
  {
    key: 'strength',
    label: 'Ganar fuerza',
    shortLabel: 'Fuerza',
    includesFatLoss: false,
    emphasizesStrength: true,
    defaultSessionsPerWeek: 3,
    description: 'Mejorar el rendimiento en los levantamientos principales.'
  },
  {
    key: 'maintenance',
    label: 'Mantener',
    shortLabel: 'Mantenimiento',
    includesFatLoss: false,
    emphasizesStrength: true,
    defaultSessionsPerWeek: 2,
    description: 'Conservar fuerza, masa muscular y peso corporal.'
  }
]);

const EXPERIENCE_LEVELS = Object.freeze([
  { key: 'beginner', label: 'Principiante (menos de 1 año)' },
  { key: 'intermediate', label: 'Intermedio (1–3 años)' },
  { key: 'advanced', label: 'Avanzado (más de 3 años)' }
]);

const SEX_OPTIONS = Object.freeze([
  { key: 'male', label: 'Hombre' },
  { key: 'female', label: 'Mujer' },
  { key: 'other', label: 'Otro' },
  { key: 'unspecified', label: 'Prefiero no decirlo' }
]);

// Zonas de molestia estructuradas. El consejo es orientativo y no sustituye a un profesional.
const PAIN_ZONES = Object.freeze([
  {
    key: 'shoulder',
    label: 'Hombro',
    advice:
      'Evita press por encima de la cabeza y fondos en paralelas mientras haya molestia; usa press neutro o máquina en un rango cómodo.'
  },
  {
    key: 'neck',
    label: 'Cuello',
    advice:
      'Evita encogimientos pesados y presses por detrás de la cabeza; mantén el cuello neutro y revisa la técnica de press.'
  },
  {
    key: 'elbow',
    label: 'Codo',
    advice:
      'Reduce curls y extensiones de tríceps con barra; prueba agarre neutro, mancuernas o bandas y baja el rango si duele.'
  },
  {
    key: 'wrist',
    label: 'Muñeca',
    advice:
      'Evita press y curl con barra recta; usa mancuernas, agarre neutro o máquina y mantén la muñeca alineada.'
  },
  {
    key: 'lower_back',
    label: 'Espalda baja',
    advice:
      'Evita peso muerto pesado y buenos días; prioriza curl femoral, prensa o hip thrust con core firme y aprende a bloquear la respiración.'
  },
  {
    key: 'hip',
    label: 'Cadera',
    advice:
      'Evita sentadillas muy profundas y zancadas largas; acorta el rango, usa prensa o step-up bajo y calienta bien la cadera.'
  },
  {
    key: 'knee',
    label: 'Rodilla',
    advice:
      'Evita saltos y sentadillas profundas; usa box squat, prensa en rango parcial o extensión con carga ligera y vigila la bajada en montaña.'
  },
  {
    key: 'ankle',
    label: 'Tobillo',
    advice:
      'Evita impactos y terreno irregular; prioriza bici, natación o fuerza sentado y trabaja equilibrio y gemelo en rango cómodo.'
  },
  {
    key: 'other',
    label: 'Otra zona',
    advice:
      'Ajusta el ejercicio que reproduzca la molestia y consulta con un profesional si persiste más de una o dos semanas.'
  }
]);

const WEEKDAYS = Object.freeze([
  { key: 1, label: 'Lunes', short: 'Lun' },
  { key: 2, label: 'Martes', short: 'Mar' },
  { key: 3, label: 'Miércoles', short: 'Mié' },
  { key: 4, label: 'Jueves', short: 'Jue' },
  { key: 5, label: 'Viernes', short: 'Vie' },
  { key: 6, label: 'Sábado', short: 'Sáb' },
  { key: 7, label: 'Domingo', short: 'Dom' }
]);

// Agrupación de los valores `primary_muscle_group` de Hevy.
const MUSCLE_GROUPS = Object.freeze([
  { key: 'chest', label: 'Pecho', category: 'push', aliases: ['chest'] },
  {
    key: 'back',
    label: 'Espalda',
    category: 'pull',
    aliases: ['lats', 'upper_back', 'traps', 'lower_back']
  },
  { key: 'shoulders', label: 'Hombros', category: 'push', aliases: ['shoulders'] },
  { key: 'biceps', label: 'Bíceps', category: 'pull', aliases: ['biceps', 'forearms'] },
  { key: 'triceps', label: 'Tríceps', category: 'push', aliases: ['triceps'] },
  { key: 'quads', label: 'Cuádriceps', category: 'legs', aliases: ['quadriceps'] },
  { key: 'hams', label: 'Isquiotibiales', category: 'legs', aliases: ['hamstrings'] },
  {
    key: 'glutes',
    label: 'Glúteos',
    category: 'legs',
    aliases: ['glutes', 'abductors', 'adductors']
  },
  { key: 'calves', label: 'Gemelos', category: 'legs', aliases: ['calves'] },
  { key: 'abs', label: 'Core', category: 'core', aliases: ['abdominals'] }
]);

const MUSCLE_INDEX = new Map();
for (const group of MUSCLE_GROUPS) {
  for (const alias of group.aliases) {
    MUSCLE_INDEX.set(alias, group.key);
  }
}

const MUSCLE_GROUP_BY_KEY = new Map(MUSCLE_GROUPS.map((group) => [group.key, group]));

function resolveMuscleGroup(hevyMuscleGroup) {
  if (!hevyMuscleGroup) {
    return null;
  }

  return MUSCLE_INDEX.get(String(hevyMuscleGroup).toLowerCase()) || null;
}

// Umbrales de las reglas para un objetivo anti-sarcopenia con pérdida de grasa.
const THRESHOLDS = Object.freeze({
  minSessionsPerWeek: 2,
  setsPerMuscleWeek: { low: 6, goodMin: 10, goodMax: 22 },
  weightChangePctPerWeek: { goodMin: -0.6, goodMax: -0.2, tooFast: -0.8, tooSlow: -0.1 },
  strengthChangePct: { progress: 2, declineWarn: -5, declineAlert: -8 },
  stagnationSessions: 3,
  pushPullRatio: { min: 0.75, max: 1.33 },
  quadsHamsRatio: { min: 0.8, max: 1.6 },
  volumeJumpPct: 30,
  checkinStaleDays: 10,
  recovery: { lowScore: 2, highSoreness: 4, highStress: 4 },
  warmupShareMin: 0.3
});

module.exports = {
  RULES_VERSION,
  GOALS,
  GOAL_BY_KEY: new Map(GOALS.map((goal) => [goal.key, goal])),
  EXPERIENCE_LEVELS,
  SEX_OPTIONS,
  PAIN_ZONES,
  PAIN_ZONE_BY_KEY: new Map(PAIN_ZONES.map((zone) => [zone.key, zone])),
  WEEKDAYS,
  WEEKDAY_BY_KEY: new Map(WEEKDAYS.map((day) => [day.key, day])),
  MUSCLE_GROUPS,
  MUSCLE_GROUP_BY_KEY,
  resolveMuscleGroup,
  THRESHOLDS
};
