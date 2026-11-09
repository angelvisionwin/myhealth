'use strict';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parsePositiveInteger(value, fallback = 1) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function parseDateFilter(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!DATE_PATTERN.test(trimmed)) {
    return null;
  }

  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    return null;
  }

  return trimmed;
}

function parseSearch(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, 100);
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

module.exports = {
  parsePositiveInteger,
  parseDateFilter,
  parseSearch,
  escapeLike
};
