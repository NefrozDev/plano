import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ObjectiveDetail,
  ObjectiveTemplateNode,
  ObjectiveTemplateSummary,
} from '@plano/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { DatabaseWriteLockService } from '../database/database-write-lock.service';
import type {
  SaveObjectiveTemplateDto,
  UseObjectiveTemplateDto,
} from './dto/objective.dto';
import { ObjectiveTemplate } from './entities/objective-template.entity';
import { Objective } from './entities/objective.entity';
import { recordActivity } from './objective-activity.record';
import { ObjectiveAccessService } from './objective-access.service';
import type { ObjectiveTree } from './objective-tree';
import { ObjectivesService } from './objectives.service';
import { ObjectiveWriterService } from './objective-writer.service';
import { errorCode } from '../errors/error-code';

/** Templates one person can keep. */
export const MAX_TEMPLATES = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
      DAY_MS,
  );
}

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function countNodes(node: ObjectiveTemplateNode): number {
  return node.children.reduce((total, child) => total + countNodes(child), 1);
}

/** The structure below a node: its settings, never its progress or its people. */
function toTemplateNode(
  tree: ObjectiveTree,
  node: Objective,
): ObjectiveTemplateNode {
  return {
    title: node.title,
    category: node.category,
    description: node.description,
    plan: node.plan,
    completion: node.completion,
    metric:
      node.metricUnit !== null &&
      node.metricTarget !== null &&
      node.metricAggregation !== null
        ? {
            unit: node.metricUnit,
            target: node.metricTarget,
            aggregation: node.metricAggregation,
          }
        : null,
    habitTargetDays: node.habitTargetDays,
    timelapse: node.timelapse,
    durationDays: node.dueDate
      ? daysBetween(node.startDate, node.dueDate)
      : null,
    weight: node.weight,
    recurrence: node.recurrence,
    children: tree
      .childrenOf(node.id)
      .filter(({ archived }) => !archived)
      .map((child) => toTemplateNode(tree, child)),
  };
}

/** Structures to reuse: private to the person who saved them. */
@Injectable()
export class ObjectiveTemplatesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly writeLock: DatabaseWriteLockService,
    private readonly access: ObjectiveAccessService,
    private readonly writer: ObjectiveWriterService,
    private readonly objectives: ObjectivesService,
  ) {}

  async findAll(userId: string): Promise<ObjectiveTemplateSummary[]> {
    const rows = await this.dataSource.manager.find(ObjectiveTemplate, {
      where: { ownerId: userId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => this.toSummary(row));
  }

  /** From anything the person can open: what they see is what they may copy. */
  async save(
    objectiveId: string,
    userId: string,
    { name }: SaveObjectiveTemplateDto,
  ): Promise<ObjectiveTemplateSummary> {
    const { tree, node } = await this.access.require(
      objectiveId,
      userId,
      'read',
    );
    return this.writeLock.runExclusive(async () => {
      const manager = this.dataSource.manager;
      if (
        (await manager.count(ObjectiveTemplate, {
          where: { ownerId: userId },
        })) >= MAX_TEMPLATES
      ) {
        throw new BadRequestException(
          `You cannot keep more than ${MAX_TEMPLATES} templates.`,
          errorCode('objectives.tooManyTemplates'),
        );
      }
      const template = await manager.save(
        manager.create(ObjectiveTemplate, {
          id: randomUUID(),
          ownerId: userId,
          name,
          structure: toTemplateNode(tree, node),
        }),
      );
      return this.toSummary(template);
    });
  }

  async remove(templateId: string, userId: string): Promise<void> {
    await this.writeLock.runExclusive(async () => {
      const { affected } = await this.dataSource.manager.delete(
        ObjectiveTemplate,
        { id: templateId, ownerId: userId },
      );
      if (!affected)
        throw new NotFoundException(
          'Template not found.',
          errorCode('objectives.templateNotFound'),
        );
    });
  }

  /** A new private objective with this structure, starting on the given day. */
  async use(
    templateId: string,
    userId: string,
    { startDate }: UseObjectiveTemplateDto,
  ): Promise<ObjectiveDetail> {
    const template = await this.dataSource.manager.findOne(ObjectiveTemplate, {
      where: { id: templateId, ownerId: userId },
    });
    if (!template)
      throw new NotFoundException(
        'Template not found.',
        errorCode('objectives.templateNotFound'),
      );

    const id = await this.writer.inTransaction(async (manager) => {
      const rootId = randomUUID();
      await this.instantiate(template.structure, {
        id: rootId,
        rootId,
        parentId: null,
        ownerId: userId,
        startDate,
        position: 0,
        manager,
      });
      await this.writer.settle(rootId, userId, manager);
      await recordActivity(manager, rootId, userId, 'created', template.name);
      return rootId;
    });
    return this.objectives.findOne(id, userId);
  }

  private async instantiate(
    node: ObjectiveTemplateNode,
    place: {
      id: string;
      rootId: string;
      parentId: string | null;
      ownerId: string;
      startDate: string;
      position: number;
      manager: EntityManager;
    },
  ): Promise<void> {
    const { manager, ...ids } = place;
    await manager.save(
      manager.create(Objective, {
        ...ids,
        title: node.title,
        category: node.category,
        description: node.description,
        plan: node.plan,
        completion: node.completion,
        metricUnit: node.metric?.unit ?? null,
        metricTarget: node.metric?.target ?? null,
        metricAggregation: node.metric?.aggregation ?? null,
        habitTargetDays: node.habitTargetDays,
        timelapse: node.durationDays === null ? 'off' : node.timelapse,
        dueDate:
          node.durationDays === null
            ? null
            : addDays(place.startDate, node.durationDays),
        weight: node.weight,
        // Only a top-level objective recurs.
        recurrence: place.parentId ? 'none' : node.recurrence,
        periodStart:
          !place.parentId && node.recurrence !== 'none'
            ? place.startDate
            : null,
      }),
    );
    for (const [position, child] of node.children.entries()) {
      await this.instantiate(child, {
        ...place,
        id: randomUUID(),
        parentId: place.id,
        position,
      });
    }
  }

  private toSummary(row: ObjectiveTemplate): ObjectiveTemplateSummary {
    return {
      id: row.id,
      name: row.name,
      nodeCount: countNodes(row.structure),
    };
  }
}
