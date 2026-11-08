import { describe, expect, it } from 'vitest';
import { parseAmount } from './amount';

describe('parseAmount', () => {
  it.each([
    ['450', 450],
    ['  450  ', 450],
    ['1250', 1250],
    ['1,250', 1250],
    ['1 250', 1250],
    ['1,250,000', 1_250_000],
    ['007', 7],
    ['0', 0],
  ])('reads %j as %d', (text, value) => {
    expect(parseAmount(text)).toEqual({ status: 'ok', value });
  });

  it('treats a blank box as empty', () => {
    expect(parseAmount('')).toEqual({ status: 'empty' });
    expect(parseAmount('   ')).toEqual({ status: 'empty' });
  });

  it.each(['12.5', '1.250', '12.', '.5'])('refuses %j and asks for whole denars', (text) => {
    expect(parseAmount(text)).toEqual({
      status: 'invalid',
      message: 'Enter whole denars, for example 1250',
    });
  });

  it.each(['abc', '12 denars', '-5', '1e3', '€5', '5-'])(
    'refuses %j and asks for digits',
    (text) => {
      expect(parseAmount(text)).toEqual({
        status: 'invalid',
        message: 'Use digits only, for example 1250',
      });
    },
  );
});
