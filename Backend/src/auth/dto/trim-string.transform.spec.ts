import type { TransformFnParams } from 'class-transformer';
import { trimString } from './trim-string.transform';

describe('trimString', () => {
  it('trims strings and leaves other values unchanged', () => {
    expect(trimString({ value: '  Plano  ' } as TransformFnParams)).toBe(
      'Plano',
    );
    expect(trimString({ value: 42 } as TransformFnParams)).toBe(42);
  });
});
