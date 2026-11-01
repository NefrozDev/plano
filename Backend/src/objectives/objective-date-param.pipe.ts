import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isDateString, matches } from 'class-validator';

/** A route parameter holding a real calendar day written `YYYY-MM-DD`. */
@Injectable()
export class ObjectiveDateParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (
      !matches(value, /^\d{4}-\d{2}-\d{2}$/) ||
      !isDateString(value, { strict: true })
    ) {
      throw new BadRequestException('Date invalide.');
    }
    return value;
  }
}
