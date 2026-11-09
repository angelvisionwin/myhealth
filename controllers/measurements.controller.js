'use strict';

const settings = require('../config/settings');
const measurementModel = require('../models/measurement.model');
const {
  parameters: measurementParameters,
  getParameter,
  isValidParameter
} = require('../config/measurement-parameters');
const format = require('../utils/format');
const createHttpError = require('../utils/http-error');
const { parseDateFilter, parsePositiveInteger } = require('../utils/query');

const PAGE_SIZE = 20;

const STATUS_MESSAGES = {
  created: {
    type: 'success',
    title: 'Medida registrada',
    message: 'El registro se ha guardado correctamente.'
  },
  updated: {
    type: 'success',
    title: 'Medida actualizada',
    message: 'Los cambios se han guardado correctamente.'
  },
  deleted: {
    type: 'info',
    title: 'Medida eliminada',
    message: 'El registro se ha eliminado de la base de datos.'
  }
};

function todayDateString() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: settings.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const getPart = (type) => parts.find((part) => part.type === type)?.value;
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
}

function parseMeasurementForm(req) {
  const formData = {
    measurement_date:
      typeof req.body.measurement_date === 'string' ? req.body.measurement_date.trim() : '',
    parameter: typeof req.body.parameter === 'string' ? req.body.parameter.trim() : '',
    value: typeof req.body.value === 'string' ? req.body.value.trim() : '',
    notes: typeof req.body.notes === 'string' ? req.body.notes.trim() : ''
  };
  const errors = [];
  const date = parseDateFilter(formData.measurement_date);
  const parameterConfig = getParameter(formData.parameter);

  if (!date) {
    errors.push('La fecha es obligatoria y debe ser válida.');
  }
  if (!parameterConfig) {
    errors.push('El parámetro seleccionado no es válido.');
  }

  const normalizedValue = formData.value.replace(',', '.');
  const value = normalizedValue === '' ? Number.NaN : Number(normalizedValue);

  if (!Number.isFinite(value) || value <= 0) {
    errors.push('El valor debe ser un número mayor que cero.');
  }
  if (formData.notes.length > 1000) {
    errors.push('Las observaciones no pueden superar los 1000 caracteres.');
  }

  const isOutlier =
    parameterConfig &&
    Number.isFinite(value) &&
    value > 0 &&
    (value < parameterConfig.min || value > parameterConfig.max);

  const outlierWarning = isOutlier
    ? `El valor ${format.formatNumber(value)} ${parameterConfig.unit} está fuera del rango orientativo ${parameterConfig.min}–${parameterConfig.max} ${parameterConfig.unit}. Si es correcto, confirma el aviso y vuelve a guardar.`
    : null;

  return {
    formData: {
      ...formData,
      value: Number.isFinite(value) ? normalizedValue : formData.value,
      unit: parameterConfig?.unit || ''
    },
    date,
    parameterConfig,
    value,
    errors,
    outlierWarning,
    outlierConfirmed: req.body.confirm_outlier === 'on' || req.body.confirm_outlier === '1'
  };
}

function renderMeasurementForm(res, options) {
  const {
    isEdit,
    measurement,
    errors = [],
    outlierWarning = null,
    outlierConfirmed = false,
    statusCode = 200
  } = options;

  const formAction = isEdit ? `/measurements/${measurement.id}/edit` : '/measurements/new';

  res.status(statusCode).renderPage('measurements/form', {
    activeNav: isEdit ? 'measurements' : 'measurement-new',
    pageTitle: isEdit ? 'Editar medida' : 'Nuevo registro',
    pageSubtitle: isEdit
      ? 'Actualiza un registro de peso o medida corporal'
      : 'Registra peso o medidas corporales',
    breadcrumbs: [
      { label: 'Mis constantes', href: '/measurements' },
      { label: isEdit ? 'Editar' : 'Nuevo registro' }
    ],
    parameters: measurementParameters,
    measurement,
    formAction,
    isEdit,
    errors,
    outlierWarning,
    outlierConfirmed,
    pageScripts: ['/js/measurements.js']
  });
}

function listMeasurements(req, res, next) {
  try {
    const page = parsePositiveInteger(req.query.page);
    const from = parseDateFilter(req.query.from);
    const to = parseDateFilter(req.query.to);
    const rawParameter = typeof req.query.parameter === 'string' ? req.query.parameter : '';
    const parameter = isValidParameter(rawParameter) ? rawParameter : '';
    const filterErrors = [];

    if (rawParameter && !parameter) {
      filterErrors.push('El parámetro seleccionado no es válido.');
    }
    if (req.query.from && !from) {
      filterErrors.push('La fecha «desde» no es válida.');
    }
    if (req.query.to && !to) {
      filterErrors.push('La fecha «hasta» no es válida.');
    }
    if (from && to && from > to) {
      filterErrors.push('La fecha «desde» no puede ser posterior a la fecha «hasta».');
    }

    const firstResult = measurementModel.list({
      parameter,
      from,
      to,
      limit: PAGE_SIZE,
      offset: 0
    });
    const totalPages = Math.max(1, Math.ceil(firstResult.total / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const result =
      currentPage === 1
        ? firstResult
        : measurementModel.list({
            parameter,
            from,
            to,
            limit: PAGE_SIZE,
            offset: (currentPage - 1) * PAGE_SIZE
          });

    const rows = result.rows.map((row) => ({
      ...row,
      parameter_label: getParameter(row.parameter)?.label || row.parameter
    }));

    const queryParams = new URLSearchParams();
    if (parameter) queryParams.set('parameter', parameter);
    if (from) queryParams.set('from', from);
    if (to) queryParams.set('to', to);
    const queryPrefix = queryParams.toString() ? `${queryParams.toString()}&` : '';

    const chartParameterKey = parameter || 'weight';
    const chartParameter = getParameter(chartParameterKey);
    const chartSeries = measurementModel.getSeries(chartParameterKey, {
      from,
      to,
      days: from || to ? null : 90
    });
    const chartData =
      chartSeries.length > 0
        ? {
            labels: chartSeries.map((row) => format.formatDate(row.measurement_date)),
            values: chartSeries.map((row) => row.value),
            unit: chartParameter?.unit || '',
            label: chartParameter?.label || chartParameterKey
          }
        : null;
    const statusCode = typeof req.query.status === 'string' ? req.query.status : '';
    const statusMessage = STATUS_MESSAGES[statusCode] || null;

    res.renderPage('measurements/index', {
      activeNav: 'measurements',
      pageTitle: 'Evolución de constantes',
      pageSubtitle: 'Peso y medidas corporales registradas',
      breadcrumbs: [
        { label: 'Mis constantes' },
        { label: 'Evolución' }
      ],
      measurements: rows,
      total: result.total,
      page: currentPage,
      totalPages,
      queryPrefix,
      filters: { parameter, from, to },
      filterErrors,
      parameters: measurementParameters,
      chartParameter,
      chartRangeLabel: from || to ? 'Rango filtrado' : 'Últimos 90 días',
      chartData,
      chartJson: chartData ? JSON.stringify(chartData).replace(/</g, '\\u003c') : null,
      statusMessage,
      pageScripts: chartData
        ? ['/vendor/chartjs/chart.umd.min.js', '/js/measurements.js']
        : []
    });
  } catch (error) {
    next(error);
  }
}

function getNewMeasurementPage(req, res, next) {
  try {
    const requestedParameter =
      typeof req.query.parameter === 'string' ? req.query.parameter : '';
    const parameterConfig = getParameter(requestedParameter) || getParameter('weight');

    renderMeasurementForm(res, {
      isEdit: false,
      measurement: {
        measurement_date: todayDateString(),
        parameter: parameterConfig.key,
        value: '',
        unit: parameterConfig.unit,
        notes: ''
      }
    });
  } catch (error) {
    next(error);
  }
}

function createMeasurement(req, res, next) {
  try {
    const parsed = parseMeasurementForm(req);

    if (parsed.errors.length > 0 || (parsed.outlierWarning && !parsed.outlierConfirmed)) {
      return renderMeasurementForm(res, {
        isEdit: false,
        measurement: parsed.formData,
        errors: parsed.errors,
        outlierWarning: parsed.outlierWarning,
        outlierConfirmed: parsed.outlierConfirmed,
        statusCode: 422
      });
    }

    measurementModel.create({
      measurementDate: parsed.date,
      parameter: parsed.formData.parameter,
      value: parsed.value,
      unit: parsed.parameterConfig.unit,
      notes: parsed.formData.notes || null
    });

    return res.redirect('/measurements?status=created');
  } catch (error) {
    return next(error);
  }
}

function getEditMeasurementPage(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    const measurement = id ? measurementModel.findById(id) : null;

    if (!measurement) {
      return next(createHttpError(404, 'Medida no encontrada'));
    }

    return renderMeasurementForm(res, {
      isEdit: true,
      measurement
    });
  } catch (error) {
    return next(error);
  }
}

function updateMeasurement(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    const existing = id ? measurementModel.findById(id) : null;

    if (!existing) {
      return next(createHttpError(404, 'Medida no encontrada'));
    }

    const parsed = parseMeasurementForm(req);

    if (parsed.errors.length > 0 || (parsed.outlierWarning && !parsed.outlierConfirmed)) {
      return renderMeasurementForm(res, {
        isEdit: true,
        measurement: { ...parsed.formData, id },
        errors: parsed.errors,
        outlierWarning: parsed.outlierWarning,
        outlierConfirmed: parsed.outlierConfirmed,
        statusCode: 422
      });
    }

    measurementModel.update(id, {
      measurementDate: parsed.date,
      parameter: parsed.formData.parameter,
      value: parsed.value,
      unit: parsed.parameterConfig.unit,
      notes: parsed.formData.notes || null
    });

    return res.redirect('/measurements?status=updated');
  } catch (error) {
    return next(error);
  }
}

function getDeleteMeasurementPage(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    const measurement = id ? measurementModel.findById(id) : null;

    if (!measurement) {
      return next(createHttpError(404, 'Medida no encontrada'));
    }

    res.renderPage('measurements/delete', {
      activeNav: 'measurements',
      pageTitle: 'Eliminar medida',
      pageSubtitle: 'Confirma antes de borrar el registro',
      breadcrumbs: [
        { label: 'Mis constantes', href: '/measurements' },
        { label: 'Eliminar' }
      ],
      measurement,
      parameterLabel: getParameter(measurement.parameter)?.label || measurement.parameter
    });
  } catch (error) {
    next(error);
  }
}

function deleteMeasurement(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    const measurement = id ? measurementModel.findById(id) : null;

    if (!measurement) {
      return next(createHttpError(404, 'Medida no encontrada'));
    }

    measurementModel.remove(id);
    return res.redirect('/measurements?status=deleted');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listMeasurements,
  getNewMeasurementPage,
  createMeasurement,
  getEditMeasurementPage,
  updateMeasurement,
  getDeleteMeasurementPage,
  deleteMeasurement
};
