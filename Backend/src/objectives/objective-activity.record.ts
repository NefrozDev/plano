import type { ObjectiveActivityKind } from '@plano/common';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { ObjectiveActivity } from './entities/objective-activity.entity';

/** Writes a line of history, in the transaction of what it tells about. */
export async function recordActivity(
  manager: EntityManager,
  objectiveId: string,
  actorId: string,
  kind: ObjectiveActivityKind,
  detail = '',
): Promise<void> {
  await manager.insert(ObjectiveActivity, {
    id: randomUUID(),
    objectiveId,
    actorId,
    kind,
    detail: detail.slice(0, 200),
  });
}
