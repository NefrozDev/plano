import type {
  EntityManager,
  EntityTarget,
  FindOptionsWhere,
  ObjectLiteral,
} from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

/**
 * A person's settings row, created on first use so the defaults live in one
 * place: the column defaults of the migration.
 */
export async function ensureUserSettings<T extends ObjectLiteral>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  userId: string,
): Promise<T> {
  await manager
    .createQueryBuilder()
    .insert()
    .into(entity)
    .values({ userId } as unknown as QueryDeepPartialEntity<T>)
    .orIgnore()
    .execute();
  return manager.findOneByOrFail(entity, {
    userId,
  } as unknown as FindOptionsWhere<T>);
}
