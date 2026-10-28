import { CreateAuthTables1786940000000 } from './1786940000000-create-auth-tables';
import { CreateGroupTables1787020000000 } from './1787020000000-create-group-tables';
import { CreateListTables1787100000000 } from './1787100000000-create-list-tables';
import { AllowSeveralGroups1787180000000 } from './1787180000000-allow-several-groups';
import { CreateFriendships1787260000000 } from './1787260000000-create-friendships';

/** Every migration, oldest first; shared by the app and the in-memory test database. */
export const MIGRATIONS = [
  CreateAuthTables1786940000000,
  CreateGroupTables1787020000000,
  CreateListTables1787100000000,
  AllowSeveralGroups1787180000000,
  CreateFriendships1787260000000,
];
