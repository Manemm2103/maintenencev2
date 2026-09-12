import { randomUUID } from 'node:crypto';

export function id() {
  return randomUUID();
}

export function asString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

export function nullableString(value) {
  const text = asString(value);
  return text.length > 0 ? text : null;
}

export function requireString(body, field, label = field) {
  const value = asString(body?.[field]);
  if (!value) {
    const error = new Error(`${label} is required`);
    error.status = 400;
    throw error;
  }
  return value;
}

export function customerCode() {
  const token = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DRH-${token}`;
}

export function safeJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

export function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
