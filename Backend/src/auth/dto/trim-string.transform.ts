import type { TransformFnParams } from 'class-transformer';

export function trimString(parameters: TransformFnParams): unknown {
  const value = parameters.value as unknown;

  return typeof value === 'string' ? value.trim() : value;
}
