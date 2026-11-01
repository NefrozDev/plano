import { Injectable } from '@nestjs/common';
import type { ObjectiveAgendaItem } from '@plano/common';
import { DataSource, In } from 'typeorm';
import { ObjectiveSession } from './entities/objective-session.entity';
import type { Objective } from './entities/objective.entity';
import { ObjectiveAccessService } from './objective-access.service';
import { ObjectiveRecurrenceService } from './objective-recurrence.service';
import type { ObjectiveTree } from './objective-tree';

/** What is dated on an objective: planned sessions, and the deadlines still open. */
@Injectable()
export class ObjectiveAgendaService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: ObjectiveAccessService,
    private readonly recurrence: ObjectiveRecurrenceService,
  ) {}

  async find(userId: string): Promise<ObjectiveAgendaItem[]> {
    await this.recurrence.restartDue(
      (await this.access.findTops(userId)).map(({ tree }) => tree.root.id),
    );
    const nodes = (await this.access.findTops(userId)).flatMap(
      ({ tree, node }) => this.unarchivedFrom(tree, node),
    );
    if (!nodes.length) return [];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const planned = await this.dataSource.manager.find(ObjectiveSession, {
      where: { objectiveId: In([...byId.keys()]), status: 'planned' },
    });

    return [
      ...planned.map((session): ObjectiveAgendaItem => {
        const node = byId.get(session.objectiveId)!;
        return {
          kind: 'session',
          key: `session:${session.id}`,
          objectiveId: node.id,
          objectiveTitle: node.title,
          category: node.category,
          date: session.date,
          label: session.label || node.title,
        };
      }),
      ...nodes
        .filter(({ dueDate, status }) => dueDate && status === 'active')
        .map((node): ObjectiveAgendaItem => ({
          kind: 'deadline',
          key: `deadline:${node.id}`,
          objectiveId: node.id,
          objectiveTitle: node.title,
          category: node.category,
          date: node.dueDate!,
          label: node.title,
        })),
    ];
  }

  /** An archived objective takes everything below it out of the agenda. */
  private unarchivedFrom(tree: ObjectiveTree, node: Objective): Objective[] {
    if (node.archived) return [];
    return [
      node,
      ...tree
        .childrenOf(node.id)
        .flatMap((child) => this.unarchivedFrom(tree, child)),
    ];
  }
}
