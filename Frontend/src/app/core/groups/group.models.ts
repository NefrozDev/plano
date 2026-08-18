export type GroupRole = 'owner' | 'member';

export interface GroupSummary {
  id: string;
  name: string;
  inviteCode: string;
  role: GroupRole;
  createdAt: string;
}

export interface CreateGroupRequest {
  name: string;
}
