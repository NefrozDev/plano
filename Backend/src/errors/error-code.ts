import type { HttpExceptionOptions } from '@nestjs/common';
import type { ApiErrorCode } from '@plano/common';

/**
 * Exception options adding the stable `errorCode` the frontend translates;
 * the message stays in English for developers and logs.
 */
export function errorCode(code: ApiErrorCode): HttpExceptionOptions {
  return { errorCode: code };
}
