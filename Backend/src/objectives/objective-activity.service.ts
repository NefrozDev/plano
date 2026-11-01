import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ObjectiveActivityEntry,
  ObjectiveCommentEntry,
} from '@plano/common';
import { randomUUID } from 'node:crypto';
import { DataSource, In } from 'typeorm';
import { displayName } from '../lists/list.mapper';
import type { User } from '../users/user.entity';
import type { AddObjectiveCommentDto } from './dto/objective.dto';
import { ObjectiveActivity } from './entities/objective-activity.entity';
import { ObjectiveComment } from './entities/objective-comment.entity';
import { ObjectiveAccessService } from './objective-access.service';
import { ObjectiveWriterService } from './objective-writer.service';

/** Lines of history served per objective. */
export const ACTIVITY_LIMIT = 100;

function person(user: User | null) {
  return user ? { id: user.id, name: displayName(user) } : null;
}

/** What happened on an objective, and what people say about it. */
@Injectable()
export class ObjectiveActivityService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: ObjectiveAccessService,
    private readonly writer: ObjectiveWriterService,
  ) {}

  /** Newest first: this objective and everything below it, which its readers can open too. */
  async history(id: string, userId: string): Promise<ObjectiveActivityEntry[]> {
    const { tree, node } = await this.access.require(id, userId, 'read');
    const nodes = [node, ...tree.descendantsOf(node.id)];
    const titles = new Map(nodes.map(({ id: key, title }) => [key, title]));
    const rows = await this.dataSource.manager.find(ObjectiveActivity, {
      where: { objectiveId: In([...titles.keys()]) },
      relations: { actor: true },
      order: { createdAt: 'DESC' },
      take: ACTIVITY_LIMIT,
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      detail: row.detail,
      actor: person(row.actor),
      objectiveId: row.objectiveId,
      objectiveTitle: titles.get(row.objectiveId) ?? '',
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Oldest first, on this objective only: below, each level has its own. */
  async comments(id: string, userId: string): Promise<ObjectiveCommentEntry[]> {
    await this.access.require(id, userId, 'read');
    const rows = await this.dataSource.manager.find(ObjectiveComment, {
      where: { objectiveId: id },
      relations: { author: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => this.toComment(row));
  }

  /** Anyone who can open an objective can talk about it, viewers included. */
  async addComment(
    id: string,
    userId: string,
    { body }: AddObjectiveCommentDto,
  ): Promise<ObjectiveCommentEntry> {
    const commentId = randomUUID();
    await this.writer.change(
      id,
      userId,
      'read',
      async (_, manager) => {
        await manager.insert(ObjectiveComment, {
          id: commentId,
          objectiveId: id,
          authorId: userId,
          body,
        });
      },
      { news: 'comment' },
    );
    return this.toComment(
      await this.dataSource.manager.findOneOrFail(ObjectiveComment, {
        where: { id: commentId },
        relations: { author: true },
      }),
    );
  }

  /** People take back what they said; the owner can remove anything. */
  async removeComment(
    id: string,
    commentId: string,
    userId: string,
  ): Promise<void> {
    await this.writer.change(id, userId, 'read', async ({ role }, manager) => {
      const comment = await manager.findOne(ObjectiveComment, {
        where: { id: commentId, objectiveId: id },
      });
      if (!comment) throw new NotFoundException('Commentaire introuvable.');
      if (role !== 'owner' && comment.authorId !== userId) {
        throw new ForbiddenException(
          'Vous ne pouvez retirer que vos propres commentaires.',
        );
      }
      await manager.delete(ObjectiveComment, { id: comment.id });
    });
  }

  private toComment(row: ObjectiveComment): ObjectiveCommentEntry {
    return {
      id: row.id,
      body: row.body,
      author: person(row.author),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
