import type { GroupRole } from './group-membership.entity';

export interface GroupSummary {
  id: string;
  name: string;
  inviteCode: string;
  role: GroupRole;
  createdAt: Date;
}
