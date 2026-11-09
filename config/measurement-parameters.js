'use strict';

// Los rangos son orientativos: no bloquean valores clínicos atípicos, solo piden confirmación.
const parameters = Object.freeze([
  { key: 'weight', label: 'Peso', unit: 'kg', min: 20, max: 400 },
  { key: 'waist', label: 'Cintura', unit: 'cm', min: 20, max: 250 },
  { key: 'hip', label: 'Cadera', unit: 'cm', min: 20, max: 250 },
  { key: 'chest', label: 'Pecho', unit: 'cm', min: 20, max: 250 },
  { key: 'arm', label: 'Brazo', unit: 'cm', min: 5, max: 100 },
  { key: 'thigh', label: 'Muslo', unit: 'cm', min: 10, max: 150 },
  { key: 'neck', label: 'Cuello', unit: 'cm', min: 10, max: 100 },
  { key: 'body_fat', label: 'Grasa corporal', unit: '%', min: 1, max: 70 }
]);

const parametersByKey = new Map(parameters.map((parameter) => [parameter.key, parameter]));

function getParameter(key) {
  return parametersByKey.get(key) || null;
}

function isValidParameter(key) {
  return parametersByKey.has(key);
}

module.exports = {
  parameters,
  getParameter,
  isValidParameter
};
