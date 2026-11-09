'use strict';

const settings = require('../config/settings');

const isoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: settings.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function today() {
  return isoDateFormatter.format(new Date());
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Lunes como inicio de semana.
function startOfWeek(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const weekday = date.getUTCDay();
  const offset = (weekday + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86400000);
}

function eachWeekStart(endDate, weeks) {
  const current = startOfWeek(endDate);
  return Array.from({ length: weeks }, (_, index) => addDays(current, -7 * (weeks - 1 - index)));
}

module.exports = {
  isValidDateString,
  today,
  addDays,
  startOfWeek,
  daysBetween,
  eachWeekStart
};
