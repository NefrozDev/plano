import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ObjectiveDateParamPipe } from '../objective-date-param.pipe';
import { CreateObjectiveDto } from './objective.dto';
import { IsIsoDate } from './validation';

class Dated {
  @IsIsoDate()
  date!: unknown;
}

class ManyDated {
  @IsIsoDate({ each: true })
  dates!: unknown;
}

const errorsOf = (date: unknown) =>
  validateSync(plainToInstance(Dated, { date })).length;

describe('IsIsoDate', () => {
  it('accepts a real calendar day', () => {
    expect(errorsOf('2026-10-15')).toBe(0);
    expect(errorsOf('2024-02-29')).toBe(0);
  });

  it.each([
    ['an impossible day', '2026-02-31'],
    ['a day of a year without it', '2026-02-29'],
    ['another format', '15/10/2026'],
    ['a timestamp', '2026-10-15T10:00:00Z'],
    ['a short year', '26-10-15'],
    ['a number', 20261015],
    ['nothing', null],
  ])('refuses %s', (_, date) => {
    expect(errorsOf(date)).toBeGreaterThan(0);
  });

  it('checks each item of a list', () => {
    const check = (dates: unknown[]) =>
      validateSync(plainToInstance(ManyDated, { dates })).length;

    expect(check(['2026-10-15', '2026-10-16'])).toBe(0);
    expect(check(['2026-10-15', 'bientôt'])).toBeGreaterThan(0);
  });
});

describe('CreateObjectiveDto', () => {
  const valid = {
    title: 'Courir',
    category: 'health',
    completion: 'none',
    startDate: '2026-10-15',
  };
  const fieldsWithErrors = (changes: object) =>
    validateSync(
      plainToInstance(CreateObjectiveDto, { ...valid, ...changes }),
    ).map(({ property }) => property);

  it('accepts what is required and nothing more', () => {
    expect(fieldsWithErrors({})).toEqual([]);
  });

  it('trims the names of sub-objectives, and refuses blank ones', () => {
    const dto = plainToInstance(CreateObjectiveDto, {
      ...valid,
      children: ['  Un  ', 'Deux'],
    });
    expect(dto.children).toEqual(['Un', 'Deux']);

    expect(fieldsWithErrors({ children: ['   '] })).toEqual(['children']);
    expect(fieldsWithErrors({ children: 'Un' })).toEqual(['children']);
    expect(fieldsWithErrors({ children: [1] })).toEqual(['children']);
  });

  it('checks what is nested', () => {
    expect(
      fieldsWithErrors({
        metric: { unit: 'km', target: -1, aggregation: 'sum' },
      }),
    ).toEqual(['metric']);
    expect(
      fieldsWithErrors({
        reminder: { frequency: 'daily', time: '09:00', weekday: 7 },
      }),
    ).toEqual(['reminder']);
    expect(
      fieldsWithErrors({ members: [{ userId: 'x', role: 'owner' }] }),
    ).toEqual(['members']);
  });

  it('lets null clear a deadline or a metric, not a title', () => {
    expect(fieldsWithErrors({ dueDate: null, metric: null })).toEqual([]);
    expect(fieldsWithErrors({ title: null })).toEqual(['title']);
  });
});

describe('ObjectiveDateParamPipe', () => {
  const pipe = new ObjectiveDateParamPipe();

  it('lets a real day through, unchanged', () => {
    expect(pipe.transform('2026-10-15')).toBe('2026-10-15');
  });

  it.each(['not-a-date', '2026-02-31', '15-10-2026', '2026-10-15T00:00:00Z'])(
    'refuses %s',
    (value) => {
      expect(() => pipe.transform(value)).toThrow(BadRequestException);
    },
  );
});
