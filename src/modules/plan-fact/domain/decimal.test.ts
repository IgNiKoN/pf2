/**
 * Тесты точной десятичной арифметики.
 * Главная проверка — то, ради чего decimal и существует: 0,1 + 0,2 = 0,3 (в float это не так).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addDecimal, compareDecimal, decimalToNumber, formatDecimal, isDecimal, normalizeDecimal,
  parseDecimalInput, sumDecimal
} from './decimal.ts';

test('parseDecimalInput: разделители, проценты, мусор', () => {
  assert.equal(parseDecimalInput('0,1'), '0.1');
  assert.equal(parseDecimalInput('1 234,5'), '1234.5');
  assert.equal(parseDecimalInput('1.234,5'), '1234.5');
  assert.equal(parseDecimalInput('1,234.5'), '1234.5');
  assert.equal(parseDecimalInput('12,5%'), '12.5');
  assert.equal(parseDecimalInput(12.5), '12.5');
  assert.equal(parseDecimalInput('  7  '), '7');
});

test('parseDecimalInput: пустое и мусор дают null, а не ноль', () => {
  assert.equal(parseDecimalInput(''), null);
  assert.equal(parseDecimalInput('—'), null);
  assert.equal(parseDecimalInput('н/д'), null);
  assert.equal(parseDecimalInput(null), null);
  assert.equal(parseDecimalInput(undefined), null);
  assert.equal(parseDecimalInput(true), null);
  assert.equal(parseDecimalInput(Number.POSITIVE_INFINITY), null);
});

test('normalizeDecimal убирает хвостовые и ведущие нули', () => {
  assert.equal(normalizeDecimal('0.500'), '0.5');
  assert.equal(normalizeDecimal('000'), '0');
  assert.equal(normalizeDecimal('10.00'), '10');
  assert.equal(normalizeDecimal('-0.0'), '0');
  assert.equal(normalizeDecimal('abc'), null);
  assert.equal(isDecimal('12.5'), true);
  assert.equal(isDecimal('12,5'), false);
});

test('сложение точное: 0,1 + 0,2 = 0,3', () => {
  assert.equal(addDecimal('0.1', '0.2'), '0.3');
  assert.equal(addDecimal('1234.5', '0.5'), '1235');
  assert.equal(addDecimal('1.005', '2'), '3.005');
  assert.equal(addDecimal('0.1', '-0.1'), '0');
  assert.equal(sumDecimal(['0.1', '0.2', '0.3']), '0.6');
});

test('сравнение и приведение к числу', () => {
  assert.equal(compareDecimal('0.3', '0.30'), 0);
  assert.equal(compareDecimal('0.2', '0.25'), -1);
  assert.equal(compareDecimal('10', '9.99'), 1);
  assert.equal(decimalToNumber('1234.5'), 1234.5);
});

test('formatDecimal: разряды, запятая, фиксированные знаки, минус', () => {
  assert.equal(formatDecimal('1234.5'), `1\u00a0234,5`);
  assert.equal(formatDecimal('0.5'), '0,5');
  assert.equal(formatDecimal('1234.5', 2), `1\u00a0234,50`);
  assert.equal(formatDecimal('-12.25'), '−12,25');
  assert.equal(formatDecimal('1000000'), `1\u00a0000\u00a0000`);
});
