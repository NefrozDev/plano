import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ObjectiveDetail,
  ObjectiveSettingsFields,
  ObjectiveSummary,
} from '@plano/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { sentFields } from '../lists/dto/validation';
import type {
  CreateObjectiveDto,
  ReorderChildObjectivesDto,
  UpdateObjectiveDto,
} from './dto/objective.dto';
import { ObjectivePreference } from './entities/objective-preference.entity';
import { Objective } from './entities/objective.entity';
import { displayName } from '../lists/list.mapper';
import { User } from '../users/user.entity';
import { recordActivity } from './objective-activity.record';
import { ObjectiveAccessService } from './objective-access.service';
import { ObjectiveChangesService } from './objective-changes.service';
import { ObjectiveMembersService } from './objective-members.service';
import { ObjectivePreferencesService } from './objective-preferences.service';
import { ObjectiveRecurrenceService } from './objective-recurrence.service';
import { MAX_OBJECTIVE_LEVELS, MAX_TREE_NODES } from './objective-tree';
import { ObjectiveViewService } from './objective-view.service';
import { ObjectiveWriterService } from './objective-writer.service';
import { errorCode } from '../errors/error-code';

/** Applies settings to an objective, then checks they make sense together. */
export function applySettings(
  node: Objective,
  { metric, ...fields }: ObjectiveSettingsFields,
): void {
  Object.assign(node, fields);
  if (metric !== undefined) {
    node.metricUnit = metric?.unit ?? null;
    node.metricTarget = metric?.target ?? null;
    node.metricAggregation = metric?.aggregation ?? null;
  }
  if (node.completion !== 'metric') {
    node.metricUnit = null;
    node.metricTarget = null;
    node.metricAggregation = null;
  } else if (node.metricTarget === null) {
    throw new BadRequestException(
      'A numeric goal needs a target and a unit.',
      errorCode('objectives.numericNeedsTarget'),
    );
  }
  if (node.completion !== 'habit') {
    node.habitTargetDays = null;
  } else if (node.habitTargetDays === null) {
    throw new BadRequestException(
      'A habit needs a number of days to succeed.',
      errorCode('objectives.habitNeedsDays'),
    );
  }
  if (node.dueDate && node.dueDate < node.startDate) {
    throw new BadRequestException(
      'The due date cannot come before the start date.',
      errorCode('objectives.dueBeforeStart'),
    );
  }
  if (node.timelapse !== 'off' && !node.dueDate) {
    throw new BadRequestException(
      'A time bar needs a due date.',
      errorCode('objectives.timeBarNeedsDue'),
    );
  }
  if (node.recurrence !== 'none' && node.parentId) {
    throw new BadRequestException(
      'Only a top-level goal can repeat.',
      errorCode('objectives.topLevelOnlyRepeats'),
    );
  }
  // Changing what repeats starts a new period from the objective's start.
  if (node.recurrence === 'none') node.periodStart = null;
  else node.periodStart ??= node.startDate;
}

/** Objectives and their tree: creating, reading, editing, deleting. */
@Injectable()
export class ObjectivesService {
  constructor(
    private readonly access: ObjectiveAccessService,
    private readonly writer: ObjectiveWriterService,
    private readonly view: ObjectiveViewService,
    private readonly preferences: ObjectivePreferencesService,
    private readonly members: ObjectiveMembersService,
    private readonly changes: ObjectiveChangesService,
    private readonly recurrence: ObjectiveRecurrenceService,
  ) {}

  /** The top of what the user can see, in their own order. */
  async findAll(userId: string): Promise<ObjectiveSummary[]> {
    const tops = await this.access.findTops(userId);
    await this.recurrence.restartDue(tops.map(({ tree }) => tree.root.id));
    const arranged = await this.preferences.arrange(
      userId,
      await this.access.findTops(userId),
    );
    return this.view.summaries(arranged, userId);
  }

  async findOne(id: string, userId: string): Promise<ObjectiveDetail> {
    const { tree } = await this.access.require(id, userId, 'read');
    await this.recurrence.restartDue([tree.root.id]);
    return this.view.detail(
      await this.access.require(id, userId, 'read'),
      userId,
    );
  }

  async create(
    userId: string,
    details: CreateObjectiveDto,
  ): Promise<ObjectiveDetail> {
    const { id, before } = await this.writer.inTransaction(async (manager) => {
      const {
        parentId,
        children,
        reminder,
        dueReminder,
        members,
        ...settings
      } = details;
      const placement = parentId
        ? await this.placeUnder(
            parentId,
            userId,
            children?.length ?? 0,
            manager,
          )
        : null;

      const node = manager.create(Objective, {
        id: randomUUID(),
        ownerId: userId,
        parentId: parentId ?? null,
        position: placement?.position ?? 0,
        description: '',
        plan: '',
        timelapse: 'off',
        dueDate: null,
        weight: 1,
        recurrence: 'none',
        periodStart: null,
        metricUnit: null,
        metricTarget: null,
        metricAggregation: null,
        habitTargetDays: null,
        manualProgress: 0,
        status: 'active',
        completedAt: null,
        completedByUserId: null,
        archived: false,
      });
      node.rootId = placement?.rootId ?? node.id;
      applySettings(node, sentFields(settings));
      await manager.save(node);
      await recordActivity(manager, node.id, userId, 'created');

      await manager.save(
        (children ?? []).map((title, position) =>
          manager.create(Objective, {
            id: randomUUID(),
            rootId: node.rootId,
            parentId: node.id,
            ownerId: userId,
            title,
            category: node.category,
            completion: 'none',
            startDate: node.startDate,
            position,
          }),
        ),
      );
      if (reminder || dueReminder) {
        await manager.upsert(
          ObjectivePreference,
          {
            userId,
            objectiveId: node.id,
            ...(reminder && {
              reminderFrequency: reminder.frequency,
              reminderTime: reminder.time,
              reminderWeekday: reminder.weekday,
            }),
            ...(dueReminder && { dueReminder }),
          },
          ['userId', 'objectiveId'],
        );
      }
      for (const member of members ?? []) {
        await this.members.addTo(node.id, userId, member, manager);
      }
      await this.writer.settle(node.rootId, userId, manager);
      return {
        id: node.id,
        before: (await this.access.loadTree(node.rootId, manager))!,
      };
    });
    await this.changes.published({ before, objectiveId: id, actorId: userId });
    await this.changes.invited(
      id,
      userId,
      (details.members ?? []).map((member) => member.userId),
    );
    return this.findOne(id, userId);
  }

  async update(
    id: string,
    userId: string,
    changes: UpdateObjectiveDto,
  ): Promise<ObjectiveDetail> {
    await this.writer.change(
      id,
      userId,
      'own',
      async ({ tree, node }, manager) => {
        const { archived, paused, assignedToUserId, ...settings } =
          sentFields(changes);
        const recurredBefore = node.recurrence !== 'none';
        applySettings(node, settings);
        // Turned on later: from now, or a start long past would restart it at once.
        if (!recurredBefore && node.recurrence !== 'none') {
          node.periodStart = new Date().toISOString().slice(0, 10);
        }
        if (Object.keys(settings).length) {
          await recordActivity(manager, node.id, userId, 'edited');
        }
        if (archived !== undefined && archived !== node.archived) {
          await recordActivity(
            manager,
            node.id,
            userId,
            archived ? 'archived' : 'unarchived',
          );
        }
        if (archived !== undefined) node.archived = archived;
        if (paused !== undefined) {
          const wasPaused = node.status === 'paused';
          this.setPaused(node, paused);
          if (paused !== wasPaused) {
            await recordActivity(
              manager,
              node.id,
              userId,
              paused ? 'paused' : 'resumed',
            );
          }
        }
        if (assignedToUserId !== undefined) {
          if (assignedToUserId && !tree.roleOf(node.id, assignedToUserId)) {
            throw new BadRequestException(
              'A goal can only be assigned to someone who has access to it.',
              errorCode('objectives.assigneeNeedsAccess'),
            );
          }
          node.assignedToUserId = assignedToUserId;
          const assignee = assignedToUserId
            ? await manager.findOne(User, { where: { id: assignedToUserId } })
            : null;
          await recordActivity(
            manager,
            node.id,
            userId,
            assignee ? 'assigned' : 'unassigned',
            assignee ? displayName(assignee) : '',
          );
        }
        await manager.save(node);
      },
    );
    return this.findOne(id, userId);
  }

  /** Everything below goes with it, through the foreign key cascade. */
  async remove(id: string, userId: string): Promise<void> {
    await this.writer.change(id, userId, 'own', async ({ node }, manager) => {
      await manager.delete(Objective, { id: node.id });
    });
  }

  /** Takes every sub-objective of the objective exactly once, in the new order. */
  async reorderChildren(
    id: string,
    userId: string,
    { objectiveIds }: ReorderChildObjectivesDto,
  ): Promise<ObjectiveDetail> {
    await this.writer.change(
      id,
      userId,
      'own',
      async ({ tree, node }, manager) => {
        const children = tree.childrenOf(node.id);
        const sameIds =
          objectiveIds.length === children.length &&
          children.every((child) => objectiveIds.includes(child.id));
        if (!sameIds) {
          throw new BadRequestException(
            'The order must contain each sub-goal exactly once.',
            errorCode('objectives.childOrderInvalid'),
          );
        }
        for (const child of children) {
          child.position = objectiveIds.indexOf(child.id);
        }
        await manager.save([...children]);
      },
    );
    return this.findOne(id, userId);
  }

  /** Resuming lets the status follow the progress again. */
  private setPaused(node: Objective, paused: boolean): void {
    if (paused && node.status === 'completed') {
      throw new BadRequestException(
        'A completed goal cannot be paused.',
        errorCode('objectives.completedCannotPause'),
      );
    }
    if (paused) node.status = 'paused';
    else if (node.status === 'paused') node.status = 'active';
  }

  /** Where a new sub-objective goes, once the tree has room for it. */
  private async placeUnder(
    parentId: string,
    userId: string,
    extraNodes: number,
    manager: EntityManager,
  ): Promise<{ rootId: string; position: number }> {
    const { tree, node } = await this.access.require(
      parentId,
      userId,
      'own',
      manager,
    );
    const level = tree.levelOf(node.id) + 1;
    if (level + (extraNodes ? 1 : 0) > MAX_OBJECTIVE_LEVELS) {
      throw new BadRequestException(
        `A goal cannot go deeper than ${MAX_OBJECTIVE_LEVELS} levels.`,
        errorCode('objectives.tooDeep'),
      );
    }
    if (tree.nodes.length + 1 + extraNodes > MAX_TREE_NODES) {
      throw new BadRequestException(
        `A goal cannot hold more than ${MAX_TREE_NODES} sub-goals.`,
        errorCode('objectives.tooManyChildren'),
      );
    }
    const siblings = tree.childrenOf(node.id);
    return {
      rootId: tree.root.id,
      position: Math.max(-1, ...siblings.map(({ position }) => position)) + 1,
    };
  }
}
