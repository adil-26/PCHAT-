export type WallTag = 'Crush' | 'Hostel' | 'Exam' | 'Drama' | 'Placement';
export type WallVibe = 'calm' | 'chaos' | 'deep' | 'funny';

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
  tag?: WallTag;
  vibeCounts: Record<WallVibe, number>;
  isAnonymous?: boolean;
  anonReputation?: number;
  chainRootId?: string;
  chainDepth?: number;
  contributors?: string[];
  dropId?: string;
  firstWitnessUserId?: string;
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
  createdAt: number;
  expiresAt: number;
  isAnonymous: boolean;
  anonReputation: number;
  replies: { id: string; text: string; createdAt: number }[];
}

export interface NodeProfile {
  nodeId: string;
  displayName: string;
  xp: number;
  level: number;
  energy: number;
  lastSeenAt: number;
  lastDailyClaimDate: string | null;
}

export interface AuraZone {
  id: string;
  title: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  reward: number;
  expiresAt: number;
  claimedByUserId?: string;
  claimedByUsername?: string;
  borrowedCount?: number;
  borrowedByMe?: boolean;
  runnerCount?: number;
  borrowDisabled?: boolean;
}

export interface BorrowRequest {
  zoneId: string;
  fromUserId: string;
  fromUsername: string;
}

export interface NearbyHunter {
  userId: string;
  username: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  distanceBand: string;
  isRunning: boolean;
  runningZoneId?: string;
  distanceToZoneMeters?: number;
}

export type CallType = 'audio' | 'video';
