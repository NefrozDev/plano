import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CompletionMode, ObjectiveDetail } from '@plano/common';
import { randomUUID } from 'node:crypto';
import type {
  AddObjectiveSessionDto,
  SetObjectiveCompletedDto,
  SetObjectiveProgressDto,
} from './dto/objective.dto';
import { ObjectiveCheckInRow } from './entities/objective-check-in.entity';
import { ObjectiveSession } from './entities/objective-session.entity';
import { Objective } from './entities/objective.entity';
import { recordActivity } from './objective-activity.record';
import { ObjectiveViewService } from './objective-view.service';
import { ObjectiveWriterService } from './objective-writer.service';
import { ObjectiveAccessService } from './objective-access.service';

/**
 * Dates come from the person's device, in their time zone: a day ahead of the
 * server can still be today for them, any later is in the future.
 */
export function isFutureDate(date: string, now = new Date()): boolean {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return date > tomorrow.toISOString().slice(0, 10);
}

function requireMode(node: Objective, mode: CompletionMode): void {
  if (node.completion !== mode) {
    throw new BadRequestException(
      'Cette action ne correspond pas au suivi de cet objectif.',
    );
  }
}

/** Progress on an objective: anyone who can contribute to it. */
@Injectable()
export class ObjectiveTrackingService {
  constructor(
    private readonly access: ObjectiveAccessService,
    private readonly writer: ObjectiveWriterService,
    private readonly view: ObjectiveViewService,
  ) {}

  async addSession(
    id: string,
    userId: string,
    details: AddObjectiveSessionDto,
  ): Promise<ObjectiveDetail> {
    await this.writer.change(
      id,
      userId,
      'contribute',
      async ({ node }, manager) => {
        requireMode(node, 'metric');
        if (details.status === 'done' && isFutureDate(details.date)) {
          throw new BadRequestException(
            'Une séance future ne peut pas être déjà réalisée.',
          );
        }
        await manager.save(
          manager.create(ObjectiveSession, {
            id: randomUUID(),
            objectiveId: node.id,
            authorId: userId,
            date: details.date,
            status: details.status,
            label: details.label,
            value: details.value,
            durationMinutes: details.durationMinutes ?? null,
          }),
        );
        // What is only planned has not happened yet.
        if (details.status === 'done') {
          await recordActivity(
            manager,
            node.id,
            userId,
            'session',
            [`${details.value} ${node.metricUnit ?? ''}`.trim(), details.label]
              .filter(Boolean)
              .join(' · '),
          );
        }
      },
      { news: 'contribution' },
    );
    return this.detail(id, userId);
  }

  /** Contributors take back their own sessions; the owner can remove any. */
  async removeSession(
    id: string,
    sessionId: string,
    userId: string,
  ): Promise<ObjectiveDetail> {
    await this.writer.change(
      id,
      userId,
      'contribute',
      async ({ node, role }, manager) => {
        const session = await manager.findOne(ObjectiveSession, {
          where: { id: sessionId, objectiveId: node.id },
        });
        if (!session) throw new NotFoundException('Séance introuvable.');
        if (role !== 'owner' && session.authorId !== userId) {
          throw new ForbiddenException(
            'Vous ne pouvez retirer que vos propres séances.',
          );
        }
        await manager.delete(ObjectiveSession, { id: session.id });
        if (session.status === 'done') {
          await recordActivity(
            manager,
            node.id,
            userId,
            'session_removed',
            session.label,
          );
        }
      },
    );
    return this.detail(id, userId);
  }

  /** Each person checks in their own days only. */
  async setCheckIn(
    id: string,
    date: string,
    userId: string,
    checked: boolean,
  ): Promise<ObjectiveDetail> {
    await this.writer.change(
      id,
      userId,
      'contribute',
      async ({ node }, manager) => {
        requireMode(node, 'habit');
        if (checked && isFutureDate(date)) {
          throw new BadRequestException(
            'Un jour à venir ne peut pas être coché.',
          );
        }
        const row = { objectiveId: node.id, userId, date };
        if (checked) {
          await manager.upsert(ObjectiveCheckInRow, row, [
            'objectiveId',
            'userId',
            'date',
          ]);
        } else {
          await manager.delete(ObjectiveCheckInRow, row);
        }
        await recordActivity(
          manager,
          node.id,
          userId,
          checked ? 'check_in' : 'check_out',
          date,
        );
      },
      { news: 'contribution' },
    );
    return this.detail(id, userId);
  }

  async setProgress(
    id: string,
    userId: string,
    { percent }: SetObjectiveProgressDto,
  ): Promise<ObjectiveDetail> {
    await this.writer.change(
      id,
      userId,
      'contribute',
      async ({ node }, manager) => {
        requireMode(node, 'manual');
        node.manualProgress = percent;
        await manager.save(node);
        await recordActivity(
          manager,
          node.id,
          userId,
          'progress',
          String(percent),
        );
      },
      { news: 'contribution' },
    );
    return this.detail(id, userId);
  }

  /** Only for objectives without a bar: the others follow their progress. */
  async setCompleted(
    id: string,
    userId: string,
    { completed }: SetObjectiveCompletedDto,
  ): Promise<ObjectiveDetail> {
    await this.writer.change(
      id,
      userId,
      'contribute',
      async ({ node }, manager) => {
        requireMode(node, 'none');
        if (node.status === 'paused') {
          throw new BadRequestException('Cet objectif est en pause.');
        }
        node.status = completed ? 'completed' : 'active';
        node.completedAt = completed ? new Date() : null;
        node.completedByUserId = completed ? userId : null;
        await manager.save(node);
        await recordActivity(
          manager,
          node.id,
          userId,
          completed ? 'completed' : 'reopened',
        );
      },
      { news: 'contribution' },
    );
    return this.detail(id, userId);
  }

  private async detail(id: string, userId: string): Promise<ObjectiveDetail> {
    return this.view.detail(
      await this.access.require(id, userId, 'read'),
      userId,
    );
  }
}
