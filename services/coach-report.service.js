'use strict';

const coachMetricsService = require('./coach-metrics.service');
const coachRulesService = require('./coach-rules.service');
const coachReportModel = require('../models/coach-report.model');
const coachConfig = require('../config/coach.config');
const format = require('../utils/format');
const dates = require('../utils/dates');

function buildSummary({ periodDays = 28 } = {}) {
  const metrics = coachMetricsService.build({ periodDays });
  const findings = coachRulesService.evaluate({ metrics });
  const plan = coachRulesService.buildPlan(findings);

  return {
    rulesVersion: coachConfig.RULES_VERSION,
    generatedAt: new Date().toISOString(),
    periodDays,
    period: metrics.period,
    profile: metrics.profile,
    metrics,
    findings,
    plan
  };
}

function describeTraining(summary) {
  const { metrics, profile } = summary;
  const rate = metrics.training.isResuming
    ? metrics.training.sessionsPerWeekActive
    : metrics.training.sessionsPerWeek;
  const rateLabel = metrics.training.isResuming ? 'en semanas activas' : 'por semana';
  const parts = [
    `Sesiones: ${metrics.training.sessionsPeriod} (${format.number(rate)} ${rateLabel}, objetivo ${metrics.training.targetSessionsPerWeek})`
  ];

  if (metrics.training.isResuming && metrics.training.lastBreak) {
    parts.push(
      `reanudación tras ${metrics.training.lastBreak.days} días de parón (vuelta el ${format.date(metrics.training.lastBreak.endDate)})`
    );
  }

  if (metrics.body.weight.latest !== null) {
    parts.push(`Peso: ${format.number(metrics.body.weight.latest)} kg`);
  }
  if (metrics.body.weight.trendPctPerWeek !== null) {
    parts.push(`tendencia ${format.signedNumber(metrics.body.weight.trendPctPerWeek, '%/semana')}`);
  }
  if (metrics.strength.improvedCount > 0) {
    parts.push(`${metrics.strength.improvedCount} ejercicio(s) con fuerza en aumento`);
  }
  if (metrics.strength.declinedCount > 0) {
    parts.push(`${metrics.strength.declinedCount} ejercicio(s) con fuerza en descenso`);
  }
  if (!profile.isComplete) {
    parts.push('perfil incompleto');
  }

  return `- ${parts.join(' · ')}`;
}

function renderText(summary) {
  const { metrics, findings, plan } = summary;
  const positives = findings.filter((finding) => finding.severity === 'positive');
  const risks = findings.filter(
    (finding) => finding.severity === 'warning' || finding.severity === 'alert'
  );
  const observations = findings.filter((finding) => finding.severity === 'info');

  const lines = [
    'INFORME DEL ENTRENADOR — MyHealth',
    `Generado: ${format.dateTime(summary.generatedAt)}`,
    `Periodo: ${format.date(summary.period.start)} – ${format.date(summary.period.end)} (${
      summary.periodDays
    } días)`,
    `Objetivo: ${summary.profile.goalLabel}${
      summary.profile.age ? ` · ${summary.profile.age} años` : ''
    }`,
    ''
  ];

  lines.push('RESUMEN');
  lines.push(describeTraining(summary));
  if (metrics.hiking.sessionsPeriod > 0) {
    lines.push(
      `- Montaña: ${metrics.hiking.sessionsPeriod} salida(s), ${format.number(
        metrics.hiking.minutesPeriod / 60
      )} h, ${format.number(metrics.hiking.elevationPeriod)} m de desnivel en el periodo${
        metrics.hiking.bigHikeRecent ? ' · carga alta en los últimos 7 días' : ''
      }`
    );
  }
  if (metrics.recovery.painZones.length > 0) {
    lines.push(
      `- Molestias: ${metrics.recovery.painZones
        .map((zone) => `${zone.label} (${zone.count} ${zone.count === 1 ? 'vez' : 'veces'})`)
        .join(', ')}`
    );
  }
  lines.push('');

  if (positives.length > 0) {
    lines.push('LO QUE VA BIEN');
    for (const finding of positives) {
      lines.push(`- ${finding.title}: ${finding.detail}`);
    }
    lines.push('');
  }

  if (risks.length > 0) {
    lines.push('A VIGILAR');
    for (const finding of risks) {
      lines.push(`- ${finding.title}: ${finding.detail}`);
      if (finding.action) {
        lines.push(`  Acción: ${finding.action}`);
      }
    }
    lines.push('');
  }

  if (observations.length > 0) {
    lines.push('OBSERVACIONES');
    for (const finding of observations) {
      lines.push(`- ${finding.title}: ${finding.detail}`);
      if (finding.action) {
        lines.push(`  Acción: ${finding.action}`);
      }
    }
    lines.push('');
  }

  lines.push('PLAN DE LA SEMANA');
  plan.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title}`);
    lines.push(`   Motivo: ${item.reason}`);
  });
  lines.push('');

  const nextSession = summary.metrics.nextSession;
  if (nextSession && nextSession.exercises.length > 0) {
    lines.push('PRÓXIMA SESIÓN SUGERIDA');
    for (const exercise of nextSession.exercises) {
      lines.push(
        `- ${exercise.name} (${exercise.groupLabel}): ${exercise.sets}×${exercise.reps} · última carga ${exercise.load} (${format.date(exercise.lastDate)})`
      );
    }
    lines.push(
      '  Ajusta para terminar con 2 repeticiones en reserva. Si esta semana toca descarga, haz 2 series por ejercicio.'
    );
    lines.push('');
  }

  const weeklyPlan = summary.metrics.weeklyPlan;
  if (weeklyPlan && weeklyPlan.days.length > 0) {
    lines.push('ESTRUCTURA DE LA SEMANA');
    for (const day of weeklyPlan.days) {
      lines.push(
        `- ${day.weekdayLabel} ${format.date(day.date)} · ${day.title}: ${day.focus}${day.isToday ? ' (hoy)' : ''}`
      );
      if (day.type === 'strength' && day.exercises.length > 0) {
        lines.push(
          `  ${day.exercises
            .map(
              (exercise) =>
                `${exercise.name} ${exercise.sets}×${exercise.reps}${exercise.changed ? ' (ajustado)' : ''}`
            )
            .join(' · ')}`
        );
      }
    }
    lines.push('');

    if (weeklyPlan.hasChanges) {
      lines.push('CAMBIOS PROPUESTOS EN TUS RUTINAS DE HEVY');
      for (const update of weeklyPlan.routineUpdates) {
        for (const change of update.changes) {
          const unit =
            change.field === 'sets'
              ? 'series'
              : change.field === 'reps'
                ? 'repeticiones'
                : 'kg';
          lines.push(
            `- ${update.title} · ${change.exerciseName}: ${change.from} → ${change.to} ${unit}`
          );
        }
      }
      lines.push(
        '  Revísalos y actualízalos desde Entrenador → Plan semanal → Revisar y actualizar en Hevy.'
      );
      lines.push('');
    }
  }

  lines.push(
    'NOTA: este informe se basa solo en los entrenamientos, medidas, check-ins y preferencias registrados en MyHealth. No es un consejo médico. Si aparece dolor persistente, lesión o un síntoma preocupante, consulta con un profesional sanitario.'
  );

  return lines.join('\n');
}

function generate({ periodDays = 28 } = {}) {
  const summary = buildSummary({ periodDays });
  const text = renderText(summary);

  const id = coachReportModel.create({
    periodStart: summary.period.start,
    periodEnd: summary.period.end,
    periodDays: summary.periodDays,
    rulesVersion: summary.rulesVersion,
    summaryJson: JSON.stringify(summary),
    reportText: text,
    generatedAt: summary.generatedAt
  });

  return { id, summary, text };
}

function parseSummary(report) {
  if (!report || !report.summary_json) {
    return null;
  }

  try {
    const summary = JSON.parse(report.summary_json);

    if (
      !summary ||
      typeof summary !== 'object' ||
      !summary.metrics ||
      !summary.profile ||
      !Array.isArray(summary.findings) ||
      !Array.isArray(summary.plan)
    ) {
      return null;
    }

    return summary;
  } catch (error) {
    return null;
  }
}

function isStale(report, days = 7) {
  if (!report) {
    return true;
  }

  const generatedDate = String(report.generated_at).slice(0, 10);
  return dates.daysBetween(generatedDate, dates.today()) > days;
}

module.exports = {
  buildSummary,
  generate,
  parseSummary,
  isStale
};
