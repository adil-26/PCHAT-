export interface User {
  id: string;
  username: string;
}

export interface Room {
  id: string;
  name: string;
  participantIds: string[];
}

export interface Message {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  text: string;
  at: number;
}

export interface FreedomPost {
  id: string;
  userId: string;
  username: string;
  text?: string;
  imageDataUrl?: string;
  videoDataUrl?: string;
  at: number;
  currentOwnerUserId: string;
  pulseCount: number;
  viewerIds: string[];
  vibeCounts: Record<string, number>;
  isAnonymous?: boolean;
  anonReputation?: number;
  chainRootId?: string;
  chainDepth?: number;
  contributors?: string[];
  dropId?: string;
}

export interface PulseScore {
  userId: string;
  username: string;
  score: number;
}

export interface CreatorSpotlight {
  userId: string;
  username: string;
  score: number;
}

export interface QuestProgress {
  witnessCount: number;
  postsCount: number;
  vibesCount: number;
}

export interface StreakState {
  current: number;
  best: number;
  lastCompletedDate: string | null;
  today: { witness: boolean; handoff: boolean; room: boolean };
}

export interface DropEvent {
  id: string;
  prompt: string;
  startedAt: number;
  expiresAt: number;
}

export interface Confession {
  id: string;
  userId: string;
  username?: string;
  text: string;
  at: number;
  isAnonymous: boolean;
  anonReputation: number;
}

export type CallType = 'audio' | 'video';
