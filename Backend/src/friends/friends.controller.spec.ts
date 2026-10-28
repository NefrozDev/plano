import type { Mock } from 'vitest';
import { ContactsController } from './contacts.controller';
import type { ContactsService } from './contacts.service';
import { FriendsController } from './friends.controller';
import type { FriendsService } from './friends.service';

describe('FriendsController and ContactsController', () => {
  let friends: Record<string, Mock>;
  let controller: FriendsController;

  beforeEach(() => {
    friends = Object.fromEntries(
      [
        'listFriends',
        'search',
        'listRequests',
        'sendRequest',
        'accept',
        'removeRequest',
        'removeFriend',
      ].map((name) => [name, vi.fn().mockResolvedValue(name)]),
    );
    controller = new FriendsController(friends as unknown as FriendsService);
  });

  it('delegates every friend route for the signed-in user', async () => {
    await expect(controller.findAll('user-1')).resolves.toBe('listFriends');
    await expect(controller.search('user-1', { q: 'bo' })).resolves.toBe(
      'search',
    );
    await expect(controller.findRequests('user-1')).resolves.toBe(
      'listRequests',
    );
    await expect(
      controller.sendRequest('user-1', { userId: 'user-2' }),
    ).resolves.toBe('sendRequest');
    await expect(controller.accept('user-1', 'request-1')).resolves.toBe(
      'accept',
    );
    await controller.removeRequest('user-1', 'request-1');
    await controller.removeFriend('user-1', 'user-2');

    expect(friends.listFriends).toHaveBeenCalledWith('user-1');
    expect(friends.search).toHaveBeenCalledWith('user-1', 'bo');
    expect(friends.listRequests).toHaveBeenCalledWith('user-1');
    expect(friends.sendRequest).toHaveBeenCalledWith('user-1', 'user-2');
    expect(friends.accept).toHaveBeenCalledWith('user-1', 'request-1');
    expect(friends.removeRequest).toHaveBeenCalledWith('user-1', 'request-1');
    expect(friends.removeFriend).toHaveBeenCalledWith('user-1', 'user-2');
    for (const method of Object.values(friends)) {
      expect(method).toHaveBeenCalledTimes(1);
    }
  });

  it('lists the contacts of the signed-in user', async () => {
    const contacts = { findAll: vi.fn().mockResolvedValue([]) };
    const contactsController = new ContactsController(
      contacts as unknown as ContactsService,
    );

    await expect(contactsController.findAll('user-1')).resolves.toEqual([]);
    expect(contacts.findAll).toHaveBeenCalledTimes(1);
    expect(contacts.findAll).toHaveBeenCalledWith('user-1');
  });
});
