export type GroupRole = 'owner' | 'member';

export interface GroupSummary {
  id: string;
  name: string;
  inviteCode: string;
  role: GroupRole;
  createdAt: string;
}

export interface GroupMember {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: GroupRole;
  joinedAt: string;
  avatarVersion: number | null;
}

export interface GroupDetails extends GroupSummary {
  members: GroupMember[];
}

export interface CreateGroupRequest {
  name: string;
}

export interface JoinGroupRequest {
  inviteCode: string;
}
