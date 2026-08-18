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
  };
  let service: { findForUser: jest.Mock; create: jest.Mock };
  let controller: GroupsController;
  let request: AuthenticatedRequest;

  beforeEach(() => {
    service = {
      findForUser: jest.fn().mockResolvedValue(group),
      create: jest.fn().mockResolvedValue(group),
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

  it('rejects a request without an attached authenticated user', () => {
    expect(() => controller.getMine({} as AuthenticatedRequest)).toThrow(
      UnauthorizedException,
    );
  });
});
