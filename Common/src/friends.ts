/** What any signed-in user may see of another account: never the e-mail address. */
export interface PublicUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  /** Changes with each new profile picture, null without one: see GET /users/:id/avatar?v=. */
  avatarVersion: number | null;
}

/** Where the viewer stands with a user: `outgoing` = the viewer asked, `incoming` = the user asked. */
export type FriendRelation = 'none' | 'friend' | 'outgoing' | 'incoming';

export interface UserSearchResult extends PublicUser {
  relation: FriendRelation;
}

export interface Friend extends PublicUser {
  /** When the request was accepted (ISO 8601). */
  since: string;
}

export interface FriendRequest {
  id: string;
  /** The other person: the sender of an incoming request, the recipient of an outgoing one. */
  user: PublicUser;
  createdAt: string;
}

export interface FriendRequests {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

export interface SendFriendRequestRequest {
  userId: string;
}

/** Asking someone who already asked you makes you friends at once. */
export interface SendFriendRequestResult {
  status: 'pending' | 'accepted';
}

/** Someone the user can invite to events and share lists with: a friend, a group mate, or both. */
export interface Contact extends PublicUser {
  friend: boolean;
  /** The user's groups this person is in. */
  groups: { id: string; name: string }[];
}
