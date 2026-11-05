import { CreateAuthTables1786940000000 } from './1786940000000-create-auth-tables';
import { CreateGroupTables1787020000000 } from './1787020000000-create-group-tables';
import { CreateListTables1787100000000 } from './1787100000000-create-list-tables';
import { AllowSeveralGroups1787180000000 } from './1787180000000-allow-several-groups';
import { CreateFriendships1787260000000 } from './1787260000000-create-friendships';
import { AddUserLocaleAndAvatar1787340000000 } from './1787340000000-add-user-locale-and-avatar';
import { CreateListPreferences1787420000000 } from './1787420000000-create-list-preferences';
import { CreatePasswordResets1787500000000 } from './1787500000000-create-password-resets';
import { AddListRemoveChecked1787580000000 } from './1787580000000-add-list-remove-checked';
import { CreateObjectives1787660000000 } from './1787660000000-create-objectives';
import { AddObjectiveSharing1787740000000 } from './1787740000000-add-objective-sharing';
import { AddObjectiveActivity1787820000000 } from './1787820000000-add-objective-activity';
import { AddObjectiveRecurrenceAndTemplates1787900000000 } from './1787900000000-add-objective-recurrence-and-templates';
import { CreateNotifications1787980000000 } from './1787980000000-create-notifications';
import { AddListObjective1788060000000 } from './1788060000000-add-list-objective';
import { CreateAgendaEvents1788140000000 } from './1788140000000-create-agenda-events';
import { CreateAccountSettings1788220000000 } from './1788220000000-create-account-settings';

/** Every migration, oldest first; shared by the app and the in-memory test database. */
export const MIGRATIONS = [
  CreateAuthTables1786940000000,
  CreateGroupTables1787020000000,
  CreateListTables1787100000000,
  AllowSeveralGroups1787180000000,
  CreateFriendships1787260000000,
  AddUserLocaleAndAvatar1787340000000,
  CreateListPreferences1787420000000,
  CreatePasswordResets1787500000000,
  AddListRemoveChecked1787580000000,
  CreateObjectives1787660000000,
  AddObjectiveSharing1787740000000,
  AddObjectiveActivity1787820000000,
  AddObjectiveRecurrenceAndTemplates1787900000000,
  CreateNotifications1787980000000,
  AddListObjective1788060000000,
  CreateAgendaEvents1788140000000,
  CreateAccountSettings1788220000000,
];
