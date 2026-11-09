'use strict';

const settings = require('../config/settings');

const dateTimeFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: settings.timeZone,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

const numberFormatter = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 2
});

const monthFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  month: 'short',
  year: 'numeric'
});

const syncStatuses = {
  success: { label: 'Correcta', className: 'bg-green-lt' },
  partial: { label: 'Parcial', className: 'bg-yellow-lt' },
  error: { label: 'Error', className: 'bg-red-lt' },
  running: { label: 'En curso', className: 'bg-blue-lt' }
};

const setTypes = {
  normal: 'Normal',
  warmup: 'Calentamiento',
  dropset: 'Drop set',
  drop: 'Drop set',
  failure: 'Al fallo'
};

const findingSeverities = {
  positive: { label: 'Punto fuerte', className: 'bg-green-lt' },
  info: { label: 'Observación', className: 'bg-blue-lt' },
  warning: { label: 'A vigilar', className: 'bg-yellow-lt' },
  alert: { label: 'Prioridad', className: 'bg-red-lt' }
};

const muscleGroups = {
  abdominals: 'Abdominales',
  shoulders: 'Hombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebrazos',
  quadriceps: 'Cuádriceps',
  hamstrings: 'Isquiotibiales',
  calves: 'Gemelos',
  glutes: 'Glúteos',
  abductors: 'Abductores',
  adductors: 'Aductores',
  lats: 'Dorsales',
  upper_back: 'Espalda alta',
  traps: 'Trapecios',
  lower_back: 'Espalda baja',
  chest: 'Pecho',
  cardio: 'Cardio',
  neck: 'Cuello',
  full_body: 'Cuerpo completo',
  other: 'Otros'
};

const equipmentTypes = {
  none: 'Sin equipamiento',
  barbell: 'Barra',
  dumbbell: 'Mancuernas',
  kettlebell: 'Pesa rusa',
  machine: 'Máquina',
  plate: 'Disco',
  resistance_band: 'Banda elástica',
  suspension: 'Suspensión',
  other: 'Otros'
};

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const parts = Object.fromEntries(
    dateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const text = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  }

  return formatDateTime(value).split(' ')[0] || '—';
}

function formatMonth(value) {
  if (!value) {
    return '—';
  }

  const match = /^(\d{4})-(\d{2})$/.exec(String(value));
  if (!match) {
    return String(value);
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return monthFormatter.format(date).replace('.', '');
}

function formatDuration(totalSeconds) {
  const seconds = Number(totalSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '—';
  }

  if (seconds < 60) {
    return `${Math.round(seconds)} s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  }

  return `${minutes} min`;
}

function formatNumber(value) {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) {
    return '—';
  }

  return numberFormatter.format(number);
}

function formatSignedNumber(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return '—';
  }

  const prefix = number > 0 ? '+' : number < 0 ? '−' : '';
  const formatted = `${prefix}${numberFormatter.format(Math.abs(number))}`;
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatSyncStatus(status) {
  return syncStatuses[status] || { label: status || 'Desconocido', className: 'bg-secondary-lt' };
}

function formatSetType(setType) {
  if (!setType) {
    return '—';
  }

  return setTypes[setType] || setType;
}

function formatMuscleGroup(muscleGroup) {
  if (!muscleGroup) {
    return '—';
  }

  return muscleGroups[muscleGroup] || muscleGroup;
}

function formatEquipment(equipment) {
  if (!equipment) {
    return '—';
  }

  return equipmentTypes[equipment] || equipment;
}

function formatFindingSeverity(severity) {
  return findingSeverities[severity] || { label: '—', className: 'bg-secondary-lt' };
}

module.exports = {
  // Alias cortos usados por las vistas EJS.
  dateTime: formatDateTime,
  date: formatDate,
  month: formatMonth,
  duration: formatDuration,
  number: formatNumber,
  signedNumber: formatSignedNumber,
  syncStatus: formatSyncStatus,
  setType: formatSetType,
  muscleGroup: formatMuscleGroup,
  equipment: formatEquipment,
  findingSeverity: formatFindingSeverity,
  // Nombres descriptivos para uso desde JavaScript.
  formatDateTime,
  formatDate,
  formatMonth,
  formatDuration,
  formatNumber,
  formatSignedNumber,
  formatSyncStatus,
  formatSetType,
  formatMuscleGroup,
  formatEquipment,
  formatFindingSeverity
};
