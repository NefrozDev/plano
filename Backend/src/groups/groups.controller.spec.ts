import type { Mock } from 'vitest';
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
  let service: Record<string, Mock>;
  let controller: GroupsController;

  beforeEach(() => {
    service = {
      findAllForUser: vi.fn().mockResolvedValue([group]),
      findOneForUser: vi.fn().mockResolvedValue(group),
      create: vi.fn().mockResolvedValue(group),
      join: vi.fn().mockResolvedValue(group),
      update: vi.fn().mockResolvedValue(group),
      rotateInviteCode: vi.fn().mockResolvedValue(group),
      transferOwnership: vi.fn().mockResolvedValue(group),
      removeMember: vi.fn().mockResolvedValue(undefined),
      leave: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    controller = new GroupsController(service as unknown as GroupsService);
  });

  it('lists and reads the groups of the given user', async () => {
    await expect(controller.findAll('user-1')).resolves.toEqual([group]);
    await expect(controller.findOne('user-1', 'group-1')).resolves.toEqual(
      group,
    );
    expect(service.findAllForUser).toHaveBeenCalledWith('user-1');
    expect(service.findOneForUser).toHaveBeenCalledWith('user-1', 'group-1');
  });

  it('creates a group for the given user', async () => {
    const details: CreateGroupDto = { name: 'Les Explorateurs' };

    await expect(controller.create('user-1', details)).resolves.toEqual(group);
    expect(service.create).toHaveBeenCalledWith('user-1', details);
  });

  it('delegates joining and owner management actions on the given group', async () => {
    await controller.join('user-1', { inviteCode: 'ABC12345' });
    await controller.update('user-1', 'group-1', { name: 'Nouveau nom' });
    await controller.rotateInviteCode('user-1', 'group-1');
    await controller.transferOwnership('user-1', 'group-1', {
      userId: 'user-2',
    });
    await controller.removeMember('user-1', 'group-1', 'user-2');
    await controller.leave('user-1', 'group-1');
    await controller.delete('user-1', 'group-1');

    expect(service.join).toHaveBeenCalledWith('user-1', {
      inviteCode: 'ABC12345',
    });
    expect(service.update).toHaveBeenCalledWith('user-1', 'group-1', {
      name: 'Nouveau nom',
    });
    expect(service.rotateInviteCode).toHaveBeenCalledWith('user-1', 'group-1');
    expect(service.transferOwnership).toHaveBeenCalledWith(
      'user-1',
      'group-1',
      'user-2',
    );
    expect(service.removeMember).toHaveBeenCalledWith(
      'user-1',
      'group-1',
      'user-2',
    );
    expect(service.leave).toHaveBeenCalledWith('user-1', 'group-1');
    expect(service.delete).toHaveBeenCalledWith('user-1', 'group-1');
  });
});
