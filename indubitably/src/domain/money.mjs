import { invariant } from './errors.mjs';

const SCALE = 1_000_000n;

function parse(value, allowZero) {
  invariant(typeof value === 'string', 'INVALID_AMOUNT', 'Credit amount must be a decimal string.');
  invariant(/^\d+(\.\d{1,6})?$/.test(value), 'INVALID_AMOUNT', 'Credit amount must have no more than six decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
  invariant(allowZero ? units >= 0n : units > 0n, 'INVALID_AMOUNT', allowZero ? 'Credit amount cannot be negative.' : 'Credit amount must be greater than zero.');
  return units;
}

export function parseCreditAmount(value) {
  return parse(value, false);
}

export function parseNonnegativeCreditAmount(value) {
  return parse(value, true);
}

export function formatCreditAmount(units) {
  const amount = BigInt(units);
  const whole = amount / SCALE;
  const fraction = (amount % SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function addAmounts(...values) {
  return values.reduce((sum, value) => sum + BigInt(value), 0n);
}
