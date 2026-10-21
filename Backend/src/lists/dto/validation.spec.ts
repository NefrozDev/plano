import { plainToInstance } from 'class-transformer';
import { IsString, validate } from 'class-validator';
import { IsOptionalButNotNull, sentFields } from './validation';

class Probe {
  @IsOptionalButNotNull()
  @IsString()
  name?: string;
}

const errorsFor = async (body: object): Promise<string[]> =>
  (await validate(plainToInstance(Probe, body))).map(
    ({ property }) => property,
  );

describe('list DTO validation helpers', () => {
  it('skips a missing field but still validates null and wrong types', async () => {
    await expect(errorsFor({})).resolves.toEqual([]);
    await expect(errorsFor({ name: 'Courses' })).resolves.toEqual([]);
    // Unlike @IsOptional(), null cannot clear a field that must keep a value.
    await expect(errorsFor({ name: null })).resolves.toEqual(['name']);
    await expect(errorsFor({ name: 42 })).resolves.toEqual(['name']);
  });

  it('keeps only the fields a PATCH body actually sent, null included', () => {
    const dto = Object.assign(new Probe(), {
      name: undefined,
      color: null,
      done: false,
    });

    expect(sentFields(dto)).toEqual({ color: null, done: false });
    expect('name' in sentFields(dto)).toBe(false);
  });
});
