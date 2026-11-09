'use strict';

// Diagnóstico rápido del entrenador: imprime las métricas y reglas principales.
// Uso: npm run coach:check

const coachMetricsService = require('../services/coach-metrics.service');
const coachRulesService = require('../services/coach-rules.service');
const format = require('../utils/format');

const metrics = coachMetricsService.build({ periodDays: 28 });
const findings = coachRulesService.evaluate({ metrics });

console.log('[coach] Perfil');
console.log(`  Edad: ${metrics.profile.age ?? '—'}`);
console.log(`  Objetivo: ${metrics.profile.goalLabel}`);
console.log(`  Perfil completo: ${metrics.profile.isComplete ? 'sí' : 'no'}`);

console.log('\n[coach] Entrenamiento (28 días)');
console.log(`  Sesiones: ${metrics.training.sessionsPeriod}`);
console.log(`  Sesiones/semana: ${format.number(metrics.training.sessionsPerWeek)}`);
console.log(
  `  Sesiones/semana activa: ${format.number(metrics.training.sessionsPerWeekActive)} (${metrics.training.activeWeeks} semanas activas)`
);
console.log(`  Objetivo: ${metrics.training.targetSessionsPerWeek}/semana`);
console.log(`  Reanudando: ${metrics.training.isResuming ? 'sí' : 'no'}`);
if (metrics.training.lastBreak) {
  console.log(
    `  Último parón: ${format.date(metrics.training.lastBreak.startDate)} – ${format.date(metrics.training.lastBreak.endDate)} (${metrics.training.lastBreak.days} días)`
  );
}
console.log(`  Última sesión: ${format.date(metrics.training.lastSessionDate)}`);

console.log('\n[coach] Composición');
console.log(
  `  Peso: ${metrics.body.weight.latest === null ? '—' : `${format.number(metrics.body.weight.latest)} kg`}`
);
console.log(
  `  Tendencia: ${
    metrics.body.weight.trendPctPerWeek === null
      ? 'sin datos suficientes'
      : format.signedNumber(metrics.body.weight.trendPctPerWeek, '%/semana')
  }`
);
console.log(
  `  Cintura: ${metrics.body.waist.latest === null ? '—' : `${format.number(metrics.body.waist.latest)} cm`}`
);

console.log('\n[coach] Plan semanal');
console.log(
  `  Origen: ${
    metrics.weeklyPlan.source === 'hevy'
      ? `rutinas de Hevy (${metrics.weeklyPlan.routineFolderTitle || 'sin carpeta'})`
      : 'generado desde el historial'
  }`
);
for (const day of metrics.weeklyPlan.days) {
  console.log(`  ${day.weekdayLabel} ${format.date(day.date)} · ${day.title} · ${day.focus}`);
}

console.log('\n[coach] Fuerza');
console.log(`  Ejercicios que suben: ${metrics.strength.improvedCount}`);
console.log(`  Ejercicios que bajan: ${metrics.strength.declinedCount}`);
console.log(`  Estancados: ${metrics.strength.stagnatingCount}`);
console.log(`  Récords recientes: ${metrics.strength.prCount}`);

console.log('\n[coach] Hallazgos');
if (findings.length === 0) {
  console.log('  Sin hallazgos.');
} else {
  for (const finding of findings) {
    console.log(`  [${finding.severity}] ${finding.title}`);
    if (finding.action) {
      console.log(`    Acción: ${finding.action}`);
    }
  }
}
