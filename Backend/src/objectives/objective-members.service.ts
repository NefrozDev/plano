import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ObjectiveDetail, ObjectiveMemberRole } from '@plano/common';
import { randomUUID } from 'node:crypto';
import { EntityManager, In } from 'typeorm';
import { ContactsService } from '../friends/contacts.service';
import type { AddObjectiveMemberDto } from './dto/objective.dto';
import { ObjectiveMember } from './entities/objective-member.entity';
import { Objective } from './entities/objective.entity';
import { displayName } from '../lists/list.mapper';
import { User } from '../users/user.entity';
import { recordActivity } from './objective-activity.record';
import { ObjectiveAccessService } from './objective-access.service';
import { ObjectiveChangesService } from './objective-changes.service';
import { ObjectiveViewService } from './objective-view.service';
import { ObjectiveWriterService } from './objective-writer.service';

/** Who an objective is shared with: only its owner decides, and only among their contacts. */
@Injectable()
export class ObjectiveMembersService {
  constructor(
    private readonly access: ObjectiveAccessService,
    private readonly writer: ObjectiveWriterService,
    private readonly view: ObjectiveViewService,
    private readonly contacts: ContactsService,
    private readonly changes: ObjectiveChangesService,
  ) {}

  async add(
    id: string,
    userId: string,
    details: AddObjectiveMemberDto,
  ): Promise<ObjectiveDetail> {
    await this.writer.change(id, userId, 'own', (_, manager) =>
      this.addTo(id, userId, details, manager),
    );
    await this.changes.invited(id, userId, [details.userId]);
    return this.detail(id, userId);
  }

  /** Also used while creating an objective, in the same transaction. */
  async addTo(
    id: string,
    userId: string,
    details: AddObjectiveMemberDto,
    manager: EntityManager,
  ): Promise<void> {
    if (details.userId === userId) {
      throw new BadRequestException(
        'Vous êtes déjà propriétaire de cet objectif.',
      );
    }
    if (!(await this.contacts.areContacts(userId, details.userId))) {
      throw new BadRequestException(
        'Vous ne pouvez partager un objectif qu’avec vos amis et les membres de vos groupes.',
      );
    }
    const { tree } = await this.access.require(id, userId, 'own', manager);
    const inherited = tree.roleOf(id, details.userId);
    // Stronger than what is inherited is allowed: contributing to one branch of
    // something only followed. Anything else would change nothing.
    if (
      inherited === 'contributor' ||
      inherited === details.role ||
      tree
        .membershipsOn(id)
        .some((membership) => membership.userId === details.userId)
    ) {
      throw new ConflictException(
        'Cette personne a déjà accès à cet objectif.',
      );
    }
    await manager.save(
      manager.create(ObjectiveMember, {
        id: randomUUID(),
        objectiveId: id,
        userId: details.userId,
        role: details.role,
      }),
    );
    await recordActivity(
      manager,
      id,
      userId,
      'member_added',
      await this.nameOf(details.userId, manager),
    );
  }

  async updateRole(
    id: string,
    memberUserId: string,
    userId: string,
    role: ObjectiveMemberRole,
  ): Promise<ObjectiveDetail> {
    await this.writer.change(id, userId, 'own', async (_, manager) => {
      const member = await this.requireMember(id, memberUserId, manager);
      member.role = role;
      await manager.save(member);
    });
    return this.detail(id, userId);
  }

  /** The invitation on this objective; one from higher up is removed up there. */
  async remove(
    id: string,
    memberUserId: string,
    userId: string,
  ): Promise<ObjectiveDetail> {
    await this.writer.change(id, userId, 'own', async (_, manager) => {
      const member = await this.requireMember(id, memberUserId, manager);
      await manager.delete(ObjectiveMember, { id: member.id });
      await recordActivity(
        manager,
        id,
        userId,
        'member_removed',
        await this.nameOf(memberUserId, manager),
      );
    });
    return this.detail(id, userId);
  }

  /** Everything the person was invited to in this tree, wherever they leave from. */
  async leave(id: string, userId: string): Promise<void> {
    await this.writer.change(
      id,
      userId,
      'read',
      async ({ tree, role }, manager) => {
        if (role === 'owner') {
          throw new ForbiddenException(
            'Le propriétaire ne peut pas quitter son objectif.',
          );
        }
        await manager.delete(ObjectiveMember, {
          userId,
          objectiveId: In(tree.nodes.map((node: Objective) => node.id)),
        });
        await recordActivity(manager, id, userId, 'member_left');
      },
    );
  }

  private async nameOf(
    userId: string,
    manager: EntityManager,
  ): Promise<string> {
    const user = await manager.findOne(User, { where: { id: userId } });
    return user ? displayName(user) : '';
  }

  private async requireMember(
    objectiveId: string,
    userId: string,
    manager: EntityManager,
  ): Promise<ObjectiveMember> {
    const member = await manager.findOne(ObjectiveMember, {
      where: { objectiveId, userId },
    });
    if (!member) {
      throw new NotFoundException(
        'Cette personne n’a pas été invitée à cet objectif.',
      );
    }
    return member;
  }

  private async detail(id: string, userId: string): Promise<ObjectiveDetail> {
    return this.view.detail(
      await this.access.require(id, userId, 'read'),
      userId,
    );
  }
}
