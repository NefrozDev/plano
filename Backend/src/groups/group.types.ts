import type { GroupRole } from './group-membership.entity';

export interface GroupSummary {
  id: string;
  name: string;
  inviteCode: string;
  role: GroupRole;
  createdAt: Date;
}

export interface GroupMemberSummary {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  avatarVersion: number | null;
  role: GroupRole;
  joinedAt: Date;
}

export interface GroupDetails extends GroupSummary {
  members: GroupMemberSummary[];
}
