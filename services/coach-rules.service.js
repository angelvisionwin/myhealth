'use strict';

const coachConfig = require('../config/coach.config');
const format = require('../utils/format');

const THRESHOLDS = coachConfig.THRESHOLDS;

function createFinding(data) {
  return {
    id: data.id,
    category: data.category,
    severity: data.severity,
    title: data.title,
    detail: data.detail,
    evidence: Array.isArray(data.evidence) ? data.evidence : [],
    action: data.action || null,
    priority: Number.isFinite(data.priority) ? data.priority : 50
  };
}

function listNames(items, limit = 3) {
  const names = items.slice(0, limit).map((item) => item.name || item.label || item);
  if (items.length > limit) {
    names.push(`y ${items.length - limit} más`);
  }
  return names.join(', ');
}

function evaluate({ metrics }) {
  const findings = [];
  const { profile, training, volume, muscles, strength, body, recovery, hiking } = metrics;
  const isResuming = training.isResuming;
  const effectiveSessionsPerWeek = isResuming
    ? training.sessionsPerWeekActive
    : training.sessionsPerWeek;
  const rateLabel = isResuming
    ? `${format.number(effectiveSessionsPerWeek)} sesiones por semana activa`
    : `${format.number(effectiveSessionsPerWeek)} sesiones por semana`;

  // 1. Contexto: el consejo depende de conocer el perfil.
  if (!profile.isComplete) {
    const missing = [];
    if (!profile.birthYear) missing.push('año de nacimiento');
    if (!profile.heightCm) missing.push('altura');
    if (!profile.targetSessionsPerWeek) missing.push('días por semana');
    if (profile.includesFatLoss && !profile.targetWeightKg) missing.push('peso objetivo');

    findings.push(
      createFinding({
        id: 'profile-incomplete',
        category: 'contexto',
        severity: 'info',
        priority: 92,
        title: 'Completa el perfil para personalizar el consejo',
        detail: `Falta información básica: ${missing.join(', ')}. Sin esos datos el entrenador no puede valorar tu punto de partida ni calcular objetivos realistas.`,
        action: 'Completa «Perfil y objetivo» con altura, días disponibles y peso objetivo.'
      })
    );
  }

  // 1a. Molestias estructuradas.
  if (recovery.painZones.length > 0) {
    const repeated = recovery.painZones.some((zone) => zone.count >= 2);
    const severity = repeated || recovery.painZones.length >= 2 ? 'warning' : 'info';
    const zonesText = recovery.painZones
      .map((zone) => `${zone.label} (${zone.count} ${zone.count === 1 ? 'vez' : 'veces'})`)
      .join(', ');
    const advice = recovery.painZones.map((zone) => zone.advice).join(' ');

    findings.push(
      createFinding({
        id: 'pain-zone',
        category: 'seguridad',
        severity,
        priority: severity === 'warning' ? 86 : 71,
        title: `Molestias en ${recovery.painZones.map((zone) => zone.label.toLowerCase()).join(', ')}`,
        detail: `Has marcado ${zonesText} en los últimos 14 días. Entrenar con molestia no significa parar: significa ajustar el ejercicio que la reproduce y no acumular carga sobre la zona.`,
        evidence: recovery.painZones.map(
          (zone) => `${zone.label}: última vez ${format.date(zone.lastDate)}`
        ),
        action: `${advice} Si la molestia persiste más de dos semanas o aparece en reposo, consulta con un profesional sanitario.`
      })
    );
  }

  // 1b. Parones de entrenamiento.
  if (training.lastBreak && training.daysSinceBreakEnd !== null && training.daysSinceBreakEnd <= 90) {
    findings.push(
      createFinding({
        id: 'training-break',
        category: 'adherencia',
        severity: isResuming ? 'info' : 'positive',
        priority: isResuming ? 89 : 36,
        title: isResuming
          ? `Reanudación tras un parón de ${training.lastBreak.days} días`
          : `Parón de ${training.lastBreak.days} días registrado`,
        detail: isResuming
          ? `Has vuelto a entrenar hace ${training.daysSinceBreakEnd} días tras un parón de ${training.lastBreak.days} días (${format.date(training.lastBreak.startDate)} – ${format.date(training.lastBreak.endDate)}). La frecuencia se calcula sobre semanas activas y la fuerza todavía no se compara con la etapa anterior.`
          : `Se detectó un parón de ${training.lastBreak.days} días entre el ${format.date(training.lastBreak.startDate)} y el ${format.date(training.lastBreak.endDate)}.`,
        evidence: isResuming
          ? [
              `Semanas activas en el periodo: ${training.activeWeeks}`,
              `${training.sessionsPeriod} sesiones desde la vuelta`
            ]
          : [],
        action: isResuming
          ? 'Progresa durante 2-3 semanas antes de valorar pérdida de fuerza; prioriza recuperar la técnica y la cobertura muscular.'
          : null
      })
    );
  }

  // 2. Sin actividad reciente.
  if (training.sessionsPeriod === 0) {
    findings.push(
      createFinding({
        id: 'no-sessions',
        category: 'adherencia',
        severity: 'alert',
        priority: 100,
        title: 'Sin entrenamientos en el periodo analizado',
        detail:
          training.daysSinceLastSession === null
            ? 'No hay sesiones registradas en la base de datos.'
            : `La última sesión registrada fue el ${format.date(training.lastSessionDate)} (${training.daysSinceLastSession} días atrás). A partir de los 50 años, la fuerza y la masa muscular se pierden rápido con la inactividad.`,
        evidence: [
          `Periodo analizado: ${format.date(metrics.period.start)} – ${format.date(metrics.period.end)}`,
          `Sesiones: ${training.sessionsPeriod}`,
          `Objetivo: ${training.targetSessionsPerWeek} sesiones/semana`
        ],
        action: 'Retoma con 2 sesiones de cuerpo completo esta semana, aunque sean cortas.'
      })
    );
  } else {
    // 3. Adherencia.
    const target = training.targetSessionsPerWeek;

    if (effectiveSessionsPerWeek >= target) {
      findings.push(
        createFinding({
          id: 'adherence-good',
          category: 'adherencia',
          severity: 'positive',
          priority: 45,
          title: isResuming ? 'Has retomado con buena frecuencia' : 'Cumples el objetivo de frecuencia',
          detail: isResuming
            ? `Promedias ${rateLabel} frente a las ${target} planificadas. Volver con esta regularidad es la mejor señal para recuperar músculo y fuerza.`
            : `Promedias ${format.number(training.sessionsPerWeek)} sesiones por semana frente a las ${target} planificadas. La constancia es el factor que más protege la masa muscular.`,
          evidence: [
            `Sesiones en el periodo: ${training.sessionsPeriod}`,
            isResuming
              ? `Semanas activas: ${training.activeWeeks}`
              : `Racha: ${training.currentStreakWeeks} semana(s) cumpliendo el objetivo`
          ]
        })
      );
    } else if (effectiveSessionsPerWeek >= THRESHOLDS.minSessionsPerWeek) {
      findings.push(
        createFinding({
          id: 'adherence-medium',
          category: 'adherencia',
          severity: 'info',
          priority: 62,
          title: 'Estás por debajo de la frecuencia planificada',
          detail: `Promedias ${rateLabel} y el objetivo es ${target}. Sigues por encima del mínimo de ${THRESHOLDS.minSessionsPerWeek} sesiones, así que el margen de mejora está en la regularidad.`,
          evidence: [`Sesiones en el periodo: ${training.sessionsPeriod}`],
          action: `Fija ${target} huecos fijos en la semana y trata el entrenamiento como una cita.`
        })
      );
    } else {
      findings.push(
        createFinding({
          id: 'adherence-low',
          category: 'adherencia',
          severity: 'warning',
          priority: 84,
          title: 'Frecuencia insuficiente para frenar la sarcopenia',
          detail: `Promedias ${rateLabel}. Por debajo de ${THRESHOLDS.minSessionsPerWeek} sesiones cuesta mantener fuerza y masa muscular, sobre todo si el objetivo incluye perder grasa.`,
          evidence: [
            `Sesiones en el periodo: ${training.sessionsPeriod}`,
            `Objetivo: ${target} sesiones/semana`,
            `Última sesión: ${format.date(training.lastSessionDate)}`
          ],
          action: 'Prioriza 2 sesiones de cuerpo completo de 40-50 minutos antes que sesiones largas aisladas.'
        })
      );
    }
  }

  // 4. Cobertura muscular.
  const lowGroups = muscles.perGroup
    .filter((group) => group.setsPerWeek < THRESHOLDS.setsPerMuscleWeek.low)
    .sort((a, b) => a.setsPerWeek - b.setsPerWeek);

  if (lowGroups.length > 0 && training.sessionsPeriod > 0) {
    const hasZero = lowGroups.some((group) => group.setsPeriod === 0);
    const suggestedGroups = lowGroups.filter(
      (group) =>
        !(hiking.bigHikeRecent && ['quads', 'hams', 'glutes', 'calves'].includes(group.key))
    );
    const groupsForAction = suggestedGroups.length > 0 ? suggestedGroups : lowGroups;
    findings.push(
      createFinding({
        id: 'muscle-coverage',
        category: 'volumen',
        severity: isResuming ? 'info' : hasZero ? 'warning' : 'info',
        priority: isResuming ? 64 : 72,
        title: 'Hay grupos musculares con poco volumen',
        detail: `En las últimas 4 semanas estos grupos están por debajo de ${THRESHOLDS.setsPerMuscleWeek.low} series semanales: ${listNames(
          lowGroups.map((group) => ({
            name: `${group.label} (${format.number(group.setsPerWeek)} series/sem)`
          })),
          4
        )}. Para prevenir sarcopenia conviene que ningún grupo importante quede sin estímulo.${isResuming ? ' Tras el parón es esperable; recupera la cobertura poco a poco.' : ''}`,
        evidence: lowGroups.slice(0, 5).map((group) =>
          group.lastTrainedDate
            ? `${group.label}: última vez ${format.date(group.lastTrainedDate)}`
            : `${group.label}: sin series registradas en el periodo`
        ),
        action: isResuming
          ? 'Recupera primero 2 sesiones de cuerpo completo; después añade 2-3 series a los grupos más bajos.'
          : `Añade 2-3 series semanales de ${groupsForAction
              .slice(0, 3)
              .map((group) => group.label.toLowerCase())
              .join(', ')}.${hiking.bigHikeRecent ? ' La montaña ya cubre buena parte de las piernas.' : ''}`
      })
    );
  }

  // 5. Balance empuje/tirón.
  const pushPull = muscles.pushPull;
  if (
    pushPull.ratio !== null &&
    pushPull.push + pushPull.pull >= 8 &&
    (pushPull.ratio < THRESHOLDS.pushPullRatio.min ||
      pushPull.ratio > THRESHOLDS.pushPullRatio.max)
  ) {
    const tooMuchPush = pushPull.ratio > THRESHOLDS.pushPullRatio.max;
    findings.push(
      createFinding({
        id: 'push-pull',
        category: 'volumen',
        severity: 'info',
        priority: 58,
        title: tooMuchPush ? 'Demasiado empuje frente a tirón' : 'Demasiado tirón frente a empuje',
        detail: `Reparto en el periodo: ${format.number(pushPull.push)} series de empuje y ${format.number(pushPull.pull)} de tirón (ratio ${format.number(pushPull.ratio)}). Un reparto equilibrado protege hombros y espalda.`,
        evidence: ['Empuje: pecho, hombros y tríceps', 'Tirón: espalda y bíceps'],
        action: isResuming
          ? 'Cuando consolides la vuelta, añade 3-4 series semanales de remo o jalón y reduce 2 de press.'
          : tooMuchPush
            ? 'Añade 3-4 series semanales de remo o jalón y reduce 2 de press.'
            : 'Añade 3-4 series semanales de press y reduce 2 de tirón.'
      })
    );
  }

  // 6. Balance cuádriceps/isquios.
  const quadsHams = muscles.quadsHams;
  if (
    quadsHams.ratio !== null &&
    quadsHams.quads + quadsHams.hams >= 6 &&
    (quadsHams.ratio < THRESHOLDS.quadsHamsRatio.min ||
      quadsHams.ratio > THRESHOLDS.quadsHamsRatio.max)
  ) {
    const tooMuchQuads = quadsHams.ratio > THRESHOLDS.quadsHamsRatio.max;
    findings.push(
      createFinding({
        id: 'quads-hams',
        category: 'volumen',
        severity: 'info',
        priority: 44,
        title: tooMuchQuads ? 'Poco trabajo de isquiotibiales' : 'Poco trabajo de cuádriceps',
        detail: `Reparto en el periodo: ${format.number(quadsHams.quads)} series de cuádriceps y ${format.number(quadsHams.hams)} de isquiotibiales (ratio ${format.number(quadsHams.ratio)}).`,
        action: isResuming
          ? 'Cuando consolides la vuelta, añade 2-3 series de curl femoral o peso muerto rumano.'
          : tooMuchQuads
            ? 'Añade 2-3 series de curl femoral o peso muerto rumano.'
            : 'Añade 2-3 series de sentadilla, prensa o extensión.'
      })
    );
  }

  // 7. Ritmo de pérdida de peso.
  const weight = body.weight;
  if (profile.includesFatLoss) {
    if (!weight.latest || !weight.latestDate) {
      findings.push(
        createFinding({
          id: 'weight-missing',
          category: 'composicion',
          severity: 'info',
          priority: 68,
          title: 'Sin datos de peso corporal',
          detail:
            'No hay pesajes registrados. Sin peso no se puede valorar si el ritmo de pérdida de grasa es compatible con conservar músculo.',
          action: 'Pésate 2-3 veces por semana en las mismas condiciones y regístralo.'
        })
      );
    } else if (weight.trendPctPerWeek !== null) {
      const trend = weight.trendPctPerWeek;

      if (trend <= THRESHOLDS.weightChangePctPerWeek.tooFast) {
        findings.push(
          createFinding({
            id: 'weight-fast',
            category: 'composicion',
            severity: 'warning',
            priority: 88,
            title: 'Pérdida de peso demasiado rápida',
            detail: `Estás bajando un ${format.number(Math.abs(trend))} % por semana. Por encima del ${format.number(
              Math.abs(THRESHOLDS.weightChangePctPerWeek.tooFast)
            )} % semanal aumenta el riesgo de perder músculo además de grasa, algo especialmente importante a los ${profile.age || '50+'} años.`,
            evidence: [
              `Peso actual: ${format.number(weight.latest)} kg`,
              `Tendencia: ${format.signedNumber(trend, '%/semana')}`
            ],
            action: 'Mantén la fuerza y revisa la tendencia con tu profesional de nutrición; apunta a 0,2-0,6 % semanal.'
          })
        );
      } else if (
        trend >= THRESHOLDS.weightChangePctPerWeek.goodMin &&
        trend <= THRESHOLDS.weightChangePctPerWeek.goodMax
      ) {
        findings.push(
          createFinding({
            id: 'weight-good',
            category: 'composicion',
            severity: 'positive',
            priority: 56,
            title: 'Ritmo de pérdida de grasa adecuado',
            detail: `Estás bajando un ${format.number(Math.abs(trend))} % por semana (${format.number(
              weight.latest
            )} kg actuales). Es un ritmo compatible con conservar masa muscular si la fuerza se mantiene.`,
            evidence: [`Tendencia: ${format.signedNumber(trend, '%/semana')}`]
          })
        );
      } else if (trend <= THRESHOLDS.weightChangePctPerWeek.goodMin) {
        findings.push(
          createFinding({
            id: 'weight-slightly-fast',
            category: 'composicion',
            severity: 'info',
            priority: 60,
            title: 'Ritmo de pérdida algo rápido',
            detail: `Estás bajando un ${format.number(
              Math.abs(trend)
            )} % por semana, por encima del rango recomendado de 0,2-0,6 %. No es alarmante, pero conviene vigilar que la fuerza no caiga.`,
            evidence: [`Tendencia: ${format.signedNumber(trend, '%/semana')}`],
            action: 'No cambies el plan de entrenamiento esta semana y revisa que la fuerza se mantenga.'
          })
        );
      } else if (trend > THRESHOLDS.weightChangePctPerWeek.goodMax) {
        findings.push(
          createFinding({
            id: 'weight-slow',
            category: 'composicion',
            severity: 'info',
            priority: 54,
            title: 'El peso está casi estancado',
            detail:
              trend >= 0
                ? `La tendencia reciente es ${format.signedNumber(trend, '%/semana')}. Si el objetivo es perder grasa, el déficit actual no está produciendo cambios.`
                : `La tendencia es ${format.signedNumber(trend, '%/semana')}, por debajo del ritmo objetivo de 0,2-0,6 % semanal.`,
            evidence: [`Peso actual: ${format.number(weight.latest)} kg`],
            action:
              'Revisa la constancia de entrenamiento y los pasos diarios; mantén la fuerza antes de cambiar nada más.'
          })
        );
      }
    }
  }

  // 8. Progreso hacia el peso objetivo.
  if (
    profile.targetWeightKg &&
    weight.latest &&
    weight.trendPctPerWeek !== null &&
    weight.trendPctPerWeek < -0.05
  ) {
    const remaining = weight.latest - profile.targetWeightKg;
    const kgPerWeek = (Math.abs(weight.trendPctPerWeek) / 100) * weight.latest;

    if (remaining > 0 && kgPerWeek > 0) {
      const weeks = Math.ceil(remaining / kgPerWeek);
      findings.push(
        createFinding({
          id: 'goal-eta',
          category: 'composicion',
          severity: 'info',
          priority: 30,
          title: 'Progreso hacia tu peso objetivo',
          detail: `Te faltan ${format.number(remaining)} kg para el objetivo de ${format.number(
            profile.targetWeightKg
          )} kg. Al ritmo actual tardarías unas ${weeks} semanas. Es una estimación, no una promesa: lo importante es que la fuerza se mantenga.`
        })
      );
    }
  }

  // 9. Fuerza en descenso.
  const declining = strength.exercises
    .filter(
      (exercise) =>
        exercise.changePct !== null &&
        exercise.changePct <= THRESHOLDS.strengthChangePct.declineWarn &&
        exercise.sessionsPeriod >= 2 &&
        exercise.setsPeriod >= 3
    )
    .sort((a, b) => a.changePct - b.changePct);

  if (!isResuming && declining.length > 0) {
    const worst = declining[0];
    const isAlert = worst.changePct <= THRESHOLDS.strengthChangePct.declineAlert;

    findings.push(
      createFinding({
        id: 'strength-decline',
        category: 'progresion',
        severity: isAlert ? 'alert' : 'warning',
        priority: isAlert ? 94 : 90,
        title: `Fuerza en descenso en ${declining.length} ejercicio(s)`,
        detail: `${listNames(
          declining.map((exercise) => ({
            name: `${exercise.name} (${format.signedNumber(exercise.changePct, '%')})`
          }))
        )}. Mantener la fuerza es el mejor indicador de que estás conservando músculo mientras pierdes grasa.`,
        evidence: declining.slice(0, 4).map(
          (exercise) =>
            `${exercise.name}: e1RM ${format.number(exercise.maxE1rmLatest)} kg frente a ${format.number(
              exercise.maxE1rmPrevious
            )} kg`
        ),
        action:
          'Mantén las cargas y reduce 2-3 series por sesión esta semana; revisa sueño y estrés antes de cambiar el plan.'
      })
    );
  }

  // 10. Fuerza en progreso.
  const improving = strength.exercises
    .filter(
      (exercise) =>
        exercise.changePct !== null &&
        exercise.changePct >= THRESHOLDS.strengthChangePct.progress &&
        exercise.sessionsPeriod >= 2 &&
        exercise.setsPeriod >= 3
    )
    .sort((a, b) => b.changePct - a.changePct);

  if (improving.length > 0) {
    findings.push(
      createFinding({
        id: 'strength-progress',
        category: 'progresion',
        severity: 'positive',
        priority: 64,
        title: 'Estás ganando fuerza',
        detail: `${listNames(
          improving.map((exercise) => ({
            name: `${exercise.name} (${format.signedNumber(exercise.changePct, '%')})`
          }))
        )}. Con este objetivo, la fuerza es el marcador que mejor refleja que el músculo se conserva.`,
        evidence: improving.slice(0, 4).map(
          (exercise) =>
            `${exercise.name}: e1RM ${format.number(exercise.maxE1rmLatest)} kg (antes ${format.number(
              exercise.maxE1rmPrevious
            )} kg)`
        )
      })
    );
  }

  // 11. Recomposición: fuerza estable o subiendo mientras baja el peso.
  if (
    !isResuming &&
    profile.includesFatLoss &&
    weight.trendPctPerWeek !== null &&
    weight.trendPctPerWeek <= -0.1 &&
    strength.declinedCount === 0 &&
    strength.improvedCount > 0
  ) {
    findings.push(
      createFinding({
        id: 'recomposition',
        category: 'composicion',
        severity: 'positive',
        priority: 60,
        title: 'Señales de recomposición corporal',
        detail:
          'Estás perdiendo peso y, al mismo tiempo, la fuerza sube o se mantiene. Es exactamente el escenario que buscamos: grasa abajo, músculo protegido.',
        action: 'No cambies nada esta semana; mantén la progresión y la recuperación.'
      })
    );
  }

  // 12. Estancamiento.
  const stagnating = strength.exercises
    .filter(
      (exercise) =>
        exercise.stagnating && exercise.sessionsPeriod >= 2 && exercise.setsPeriod >= 6
    )
    .slice(0, 4);

  if (!isResuming && stagnating.length > 0) {
    findings.push(
      createFinding({
        id: 'stagnation',
        category: 'progresion',
        severity: 'info',
        priority: 52,
        title: 'Ejercicios estancados',
        detail: `${listNames(stagnating)} llevan al menos 3 sesiones sin superar su mejor marca reciente. No es un problema si el resto progresa, pero conviene romper la monotonía.`,
        evidence: stagnating.map(
          (exercise) =>
            `${exercise.name}: ${exercise.sessionsPeriod} sesiones, ${exercise.setsPeriod} series en el periodo`
        ),
        action: `Cambia el rango de repeticiones (por ejemplo 3×6-8) o haz una semana suave en ${stagnating[0].name.toLowerCase()}.`
      })
    );
  }

  // 13. Récords recientes.
  if (strength.prCount > 0) {
    findings.push(
      createFinding({
        id: 'prs',
        category: 'progresion',
        severity: 'positive',
        priority: 48,
        title: `${strength.prCount} récord(s) personal(es) recientes`,
        detail:
          'Has superado tu mejor marca de fuerza en el último mes. A los 54 años, seguir batiendo récords mientras pierdes grasa es una señal excelente.',
        evidence: strength.exercises
          .filter((exercise) => exercise.isPr)
          .slice(0, 4)
          .map((exercise) => `${exercise.name}: ${format.number(exercise.maxE1rmLatest)} kg e1RM`)
      })
    );
  }

  // 14. Check-in.
  if (!recovery.latestCheckin) {
    findings.push(
      createFinding({
        id: 'checkin-missing',
        category: 'recuperacion',
        severity: 'info',
        priority: 66,
        title: 'Falta el check-in semanal',
        detail:
          'Sin sueño, energía, estrés y agujetas el entrenador solo puede valorar la carga. El check-in tarda menos de un minuto y cambia la calidad del consejo.',
        action: 'Haz el check-in de esta semana antes del próximo entrenamiento.'
      })
    );
  } else if (recovery.daysSinceCheckin > THRESHOLDS.checkinStaleDays) {
    findings.push(
      createFinding({
        id: 'checkin-stale',
        category: 'recuperacion',
        severity: 'info',
        priority: 58,
        title: 'El check-in está desactualizado',
        detail: `El último check-in fue el ${format.date(
          recovery.latestCheckin.checkin_date
        )}, hace ${recovery.daysSinceCheckin} días.`,
        action: 'Registra cómo has dormido y cómo estás de energía esta semana.'
      })
    );
  }

  // 15. Recuperación.
  if (recovery.negativeMarkers.length >= 2) {
    const severe = recovery.negativeMarkers.length >= 3 && strength.declinedCount > 0;
    findings.push(
      createFinding({
        id: 'recovery-low',
        category: 'recuperacion',
        severity: severe ? 'alert' : 'warning',
        priority: severe ? 96 : 82,
        title: severe ? 'Semana de descarga recomendada' : 'Señales de recuperación insuficiente',
        detail: `Hay ${recovery.negativeMarkers.length} indicadores negativos: ${recovery.negativeMarkers
          .map((marker) => `${marker.label.toLowerCase()} (${marker.detail})`)
          .join('; ')}.`,
        evidence: recovery.negativeMarkers.map((marker) => marker.label),
        action: severe
          ? 'Haz una semana de descarga: mismo patrón, 50-60 % del volumen y cargas suaves.'
          : 'Baja un 20-30 % el volumen esta semana y prioriza dormir 7-8 horas.'
      })
    );
  }

  // 16. Salto brusco de volumen.
  if (hiking.hasData && hiking.bigHikeRecent) {
    findings.push(
      createFinding({
        id: 'hiking-load',
        category: 'recuperacion',
        severity: 'info',
        priority: 74,
        title: 'La montaña ya es entrenamiento de piernas',
        detail: `En los últimos 7 días has acumulado ${format.number(
          hiking.minutesLast7 / 60
        )} h y ${format.number(hiking.elevationLast7)} m de desnivel en ${hiking.sessionsLast7} salida(s). Cuenta como carga de piernas y de recuperación.`,
        evidence: [`Última salida: ${format.date(hiking.lastSessionDate)}`],
        action: 'No añadas volumen de piernas esta semana; prioriza espalda, core y recuperación.'
      })
    );
  }

  if (!isResuming && volume.changePct !== null && volume.changePct > THRESHOLDS.volumeJumpPct) {
    findings.push(
      createFinding({
        id: 'volume-jump',
        category: 'volumen',
        severity: 'info',
        priority: 38,
        title: 'Subida brusca de volumen',
        detail: `El volumen de los últimos 7 días es un ${format.number(
          volume.changePct
        )} % mayor que la semana anterior. Los aumentos grandes de carga de trabajo suelen preceder a molestias.`,
        action: 'Mantén el volumen de esta semana y sube como máximo un 10 % la siguiente.'
      })
    );
  }

  // 17. Calentamiento.
  if (
    training.warmupShare !== null &&
    training.warmupShare < THRESHOLDS.warmupShareMin * 100 &&
    training.sessionsPeriod >= 4 &&
    profile.age &&
    profile.age >= 45
  ) {
    findings.push(
      createFinding({
        id: 'warmup',
        category: 'seguridad',
        severity: 'info',
        priority: 34,
        title: 'Pocas series de calentamiento registradas',
        detail: `Solo el ${training.warmupShare} % de tus sesiones incluye series de calentamiento. A partir de los 45-50 años, calentar bien reduce el riesgo de molestias y mejora el rendimiento en las series fuertes.`,
        action: 'Añade 1-2 series de aproximación en el primer ejercicio de cada grupo.'
      })
    );
  }

  // 18. Cintura.
  if (body.waist.latest && body.waist.changePeriod !== null) {
    if (body.waist.changePeriod <= -1) {
      findings.push(
        createFinding({
          id: 'waist-down',
          category: 'composicion',
          severity: 'positive',
          priority: 46,
          title: 'La cintura baja',
          detail: `Has reducido ${format.number(
            Math.abs(body.waist.changePeriod)
          )} cm de cintura en el periodo. Es un buen indicador de pérdida de grasa abdominal, más fiable que el peso aislado.`,
          evidence: [
            `Cintura actual: ${format.number(body.waist.latest)} cm`,
            `Último registro: ${format.date(body.waist.latestDate)}`
          ]
        })
      );
    }
  }

  findings.sort((a, b) => b.priority - a.priority);

  // Si se recomienda descarga, las acciones de añadir volumen se posponen.
  const deloadRecommended = findings.some(
    (finding) => finding.id === 'recovery-low' && finding.severity === 'alert'
  );
  const volumeActions = new Set(['muscle-coverage', 'push-pull', 'quads-hams']);

  if (deloadRecommended) {
    for (const finding of findings) {
      if (volumeActions.has(finding.id) && finding.action) {
        finding.action = `Cuando termine la semana de descarga, ${finding.action.toLowerCase()}`;
      }
    }
  }

  return findings;
}

function buildPlan(findings) {
  const deloadRecommended = findings.some(
    (finding) => finding.id === 'recovery-low' && finding.severity === 'alert'
  );
  const postponed = new Set(['muscle-coverage', 'push-pull', 'quads-hams', 'stagnation']);

  const actionable = findings
    .filter(
      (finding) =>
        finding.action &&
        (finding.severity === 'warning' ||
          finding.severity === 'alert' ||
          finding.severity === 'info') &&
        !(deloadRecommended && postponed.has(finding.id))
    )
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);

  if (actionable.length === 0) {
    return [
      {
        title: 'Mantén el plan actual',
        reason: 'No hay avisos pendientes: sigue con la progresión y la recuperación.',
        severity: 'positive'
      }
    ];
  }

  return actionable.map((finding) => ({
    title: finding.action,
    reason: finding.title,
    severity: finding.severity
  }));
}

module.exports = {
  evaluate,
  buildPlan
};
