import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import type { CreateGroupDto } from './dto/create-group.dto';
import { GroupsController } from './groups.controller';
import type { GroupsService } from './groups.service';

describe('GroupsController', () => {
  const group = {
    id: 'group-1',
    name: 'Les Explorateurs',
    inviteCode: 'ABC12345',
    role: 'owner' as const,
    createdAt: new Date('2030-01-01T00:00:00Z'),
    members: [],
  };
  let service: Record<string, jest.Mock>;
  let controller: GroupsController;
  let request: AuthenticatedRequest;

  beforeEach(() => {
    service = {
      findForUser: jest.fn().mockResolvedValue(group),
      create: jest.fn().mockResolvedValue(group),
      join: jest.fn().mockResolvedValue(group),
      update: jest.fn().mockResolvedValue(group),
      rotateInviteCode: jest.fn().mockResolvedValue(group),
      transferOwnership: jest.fn().mockResolvedValue(group),
      removeMember: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    controller = new GroupsController(service as unknown as GroupsService);
    request = {
      authUser: {
        id: 'user-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        username: 'ada',
        email: 'ada@example.com',
      },
    } as AuthenticatedRequest;
  });

  it('gets the group belonging to the authenticated user', async () => {
    await expect(controller.getMine(request)).resolves.toEqual(group);
    expect(service.findForUser).toHaveBeenCalledWith('user-1');
  });

  it('creates a group for the authenticated user', async () => {
    const details: CreateGroupDto = { name: 'Les Explorateurs' };

    await expect(controller.create(request, details)).resolves.toEqual(group);
    expect(service.create).toHaveBeenCalledWith('user-1', details);
  });

  it('delegates joining and owner management actions', async () => {
    await controller.join(request, { inviteCode: 'ABC12345' });
    await controller.update(request, { name: 'Nouveau nom' });
    await controller.rotateInviteCode(request);
    await controller.transferOwnership(request, { userId: 'user-2' });
    await controller.removeMember(request, 'user-2');
    await controller.leave(request);
    await controller.delete(request);

    expect(service.join).toHaveBeenCalledWith('user-1', {
      inviteCode: 'ABC12345',
    });
    expect(service.update).toHaveBeenCalledWith('user-1', {
      name: 'Nouveau nom',
    });
    expect(service.rotateInviteCode).toHaveBeenCalledWith('user-1');
    expect(service.transferOwnership).toHaveBeenCalledWith('user-1', 'user-2');
    expect(service.removeMember).toHaveBeenCalledWith('user-1', 'user-2');
    expect(service.leave).toHaveBeenCalledWith('user-1');
    expect(service.delete).toHaveBeenCalledWith('user-1');
  });

  it('rejects a request without an attached authenticated user', () => {
    expect(() => controller.getMine({} as AuthenticatedRequest)).toThrow(
      UnauthorizedException,
    );
  });
});
