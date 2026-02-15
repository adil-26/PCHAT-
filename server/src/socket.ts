import { Server, Socket } from 'socket.io';
import { v4 as uuid } from 'uuid';
import { users, rooms, messagesByRoom } from './index.js';

const wallPostOwners = new Map<string, string>();
const pendingUserCleanup = new Map<string, NodeJS.Timeout>();
const VIBES = ['real', 'wild', 'deep', 'w'] as const;
type Vibe = (typeof VIBES)[number];
const wallPosts = new Map<
  string,
  {
    id: string;
    userId: string;
    username: string;
    text?: string;
    imageDataUrl?: string;
    videoDataUrl?: string;
    at: number;
    currentOwnerUserId: string;
    pulseCount: number;
    viewerIds: Set<string>;
    vibeCounts: Record<Vibe, number>;
    userVibes: Map<string, Vibe>;
    isAnonymous?: boolean;
    anonReputation?: number;
    chainRootId?: string;
    chainDepth?: number;
    contributors?: string[];
    dropId?: string;
    firstWitnessUserId?: string;
  }
>();
const pulseScores = new Map<string, { username: string; score: number }>();
const anonReputation = new Map<string, number>();
const confessions = new Map<string, { id: string; userId: string; username: string; text: string; at: number; isAnonymous: boolean; anonReputation: number }>();
const MAX_DATA_URL_LENGTH = 12_000_000;
const DISCONNECT_GRACE_MS = 8_000;
const DROP_DURATION_MS = 10 * 60 * 1000;
const DROP_INTERVAL_MS = 15 * 60 * 1000;
const DROP_PROMPTS = [
  'Share a midnight thought in one line.',
  'Drop your current obsession.',
  'Tell a hard truth you learned this year.',
  'What are you building in silence?',
];
let activeDrop: { id: string; prompt: string; startedAt: number; expiresAt: number } | null = null;

const AURA_DROP_DURATION_MS = 30 * 60 * 1000;
const MAX_HUNT_DISTANCE_METERS = 4000;
const auraPointsByUser = new Map<string, number>();
const pendingBorrowRequests = new Map<string, Set<string>>();
const auraZones = new Map<
  string,
  {
    id: string;
    title: string;
    lat: number;
    lng: number;
    radiusMeters: number;
    reward: number;
    expiresAt: number;
    claimedByUserId?: string;
    claimedByUsername?: string;
    borrowedBy: Set<string>;
  }
>();

function isAllowedDataUrl(value?: string, kind?: 'image' | 'video') {
  if (!value) return false;
  if (value.length > MAX_DATA_URL_LENGTH) return false;
  if (kind === 'image') return value.startsWith('data:image/');
  if (kind === 'video') return value.startsWith('data:video/');
  return false;
}

function emitPulseLeaderboard(io: Server) {
  const list = Array.from(pulseScores.entries())
    .map(([userId, value]) => ({ userId, username: value.username, score: value.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  io.emit('wall:pulse:leaderboard', list);
}

function emitCreatorSpotlight(io: Server) {
  const byCreator = new Map<string, { username: string; score: number }>();
  for (const post of wallPosts.values()) {
    const vibeTotal = Object.values(post.vibeCounts).reduce((sum, val) => sum + val, 0);
    const score = post.pulseCount * 2 + vibeTotal + post.viewerIds.size;
    const existing = byCreator.get(post.userId) ?? { username: post.username, score: 0 };
    byCreator.set(post.userId, { username: existing.username, score: existing.score + score });
  }
  const top = Array.from(byCreator.entries())
    .map(([userId, value]) => ({ userId, username: value.username, score: value.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  io.emit('wall:spotlight', top);
}

function getAnonReputation(userId: string) {
  return anonReputation.get(userId) ?? 0;
}

function addAnonReputation(userId: string, delta: number) {
  const prev = anonReputation.get(userId) ?? 0;
  anonReputation.set(userId, Math.max(0, prev + delta));
}

function serializePost(post: {
  id: string;
  userId: string;
  username: string;
  text?: string;
  imageDataUrl?: string;
  videoDataUrl?: string;
  at: number;
  currentOwnerUserId: string;
  pulseCount: number;
  viewerIds: Set<string>;
  vibeCounts: Record<Vibe, number>;
  isAnonymous?: boolean;
  anonReputation?: number;
  chainRootId?: string;
  chainDepth?: number;
  contributors?: string[];
  dropId?: string;
  firstWitnessUserId?: string;
}) {
  return {
    id: post.id,
    userId: post.userId,
    username: post.isAnonymous ? `Anon` : post.username,
    text: post.text,
    imageDataUrl: post.imageDataUrl,
    videoDataUrl: post.videoDataUrl,
    at: post.at,
    currentOwnerUserId: post.currentOwnerUserId,
    pulseCount: post.pulseCount,
    viewerIds: Array.from(post.viewerIds),
    vibeCounts: post.vibeCounts,
    isAnonymous: !!post.isAnonymous,
    anonReputation: post.anonReputation ?? 0,
    chainRootId: post.chainRootId,
    chainDepth: post.chainDepth ?? 0,
    contributors: post.contributors ?? [post.userId],
    dropId: post.dropId,
    firstWitnessUserId: post.firstWitnessUserId,
  };
}

function pushDrop(io: Server) {
  const now = Date.now();
  const id = uuid();
  const prompt = DROP_PROMPTS[Math.floor(Math.random() * DROP_PROMPTS.length)];
  activeDrop = { id, prompt, startedAt: now, expiresAt: now + DROP_DURATION_MS };
  io.emit('wall:drop', activeDrop);
}

function metersBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

function serializeAuraZones() {
  return Array.from(auraZones.values())
    .filter((zone) => zone.expiresAt > Date.now())
    .map((zone) => ({
      id: zone.id,
      title: zone.title,
      lat: zone.lat,
      lng: zone.lng,
      radiusMeters: zone.radiusMeters,
      reward: zone.reward,
      expiresAt: zone.expiresAt,
      claimedByUserId: zone.claimedByUserId,
      claimedByUsername: zone.claimedByUsername,
      borrowedCount: zone.borrowedBy.size,
    }));
}

function serializeAuraZonesForUser(userId?: string) {
  return serializeAuraZones().map((zone) => ({
    ...zone,
    borrowedByMe: userId ? auraZones.get(zone.id)?.borrowedBy.has(userId) ?? false : false,
  }));
}

function emitAuraUpdate(io: Server) {
  for (const user of users.values()) {
    io.to(user.socketId).emit('hunt:update', { zones: serializeAuraZonesForUser(user.id) });
  }
}

function seedAuraZone() {
  const now = Date.now();
  const zone = {
    id: uuid(),
    title: ['Skyline Pulse', 'Street Echo', 'Neon Orbit', 'Hidden Aura'][Math.floor(Math.random() * 4)],
    // Default sample coordinates (NYC area); replace with your own drops as needed.
    lat: 40.73061 + (Math.random() - 0.5) * 0.02,
    lng: -73.935242 + (Math.random() - 0.5) * 0.02,
    radiusMeters: 220,
    reward: 60 + Math.floor(Math.random() * 80),
    expiresAt: now + AURA_DROP_DURATION_MS,
    borrowedBy: new Set<string>(),
  };
  auraZones.set(zone.id, zone);
}

function transferPulse(io: Server, postId: string, nextOwnerUserId: string) {
  const post = wallPosts.get(postId);
  if (!post || post.currentOwnerUserId === nextOwnerUserId) return;
  post.currentOwnerUserId = nextOwnerUserId;
  post.pulseCount += 1;
  const owner = users.get(nextOwnerUserId);
  const username = owner?.username ?? pulseScores.get(nextOwnerUserId)?.username ?? 'Unknown';
  const previous = pulseScores.get(nextOwnerUserId)?.score ?? 0;
  pulseScores.set(nextOwnerUserId, { username, score: previous + 1 });
  wallPostOwners.set(postId, nextOwnerUserId);
  io.emit('wall:update', {
    postId,
    currentOwnerUserId: post.currentOwnerUserId,
    pulseCount: post.pulseCount,
    viewerIds: Array.from(post.viewerIds),
    vibeCounts: post.vibeCounts,
    firstWitnessUserId: post.firstWitnessUserId,
  });
  emitPulseLeaderboard(io);
  emitCreatorSpotlight(io);
  io.emit('wall:handoff', { postId, toUserId: nextOwnerUserId });
  addAnonReputation(nextOwnerUserId, 1);
}

export function registerSocketHandlers(io: Server) {
  if (!activeDrop) {
    pushDrop(io);
    setInterval(() => pushDrop(io), DROP_INTERVAL_MS);
  }
  if (auraZones.size === 0) {
    seedAuraZone();
    setInterval(() => {
      for (const [zoneId, zone] of auraZones.entries()) {
        if (zone.expiresAt <= Date.now()) auraZones.delete(zoneId);
      }
      if (auraZones.size < 2) seedAuraZone();
      emitAuraUpdate(io);
    }, 60_000);
  }
  io.on('connection', (socket: Socket) => {
    socket.on('user:join', (payload: { userId: string; username: string }) => {
      const { userId, username } = payload;
      const pending = pendingUserCleanup.get(userId);
      if (pending) {
        clearTimeout(pending);
        pendingUserCleanup.delete(userId);
      }
      users.set(userId, { id: userId, username, socketId: socket.id });
      socket.data.userId = userId;
      socket.data.username = username;
      socket.broadcast.emit('user:online', { userId, username });
      io.emit('user:list', Array.from(users.values()).map((u) => ({ id: u.id, username: u.username })));
      socket.emit(
        'wall:snapshot',
        Array.from(wallPosts.values())
          .sort((a, b) => b.at - a.at)
          .map((post) => serializePost(post))
          .slice(0, 250),
      );
      emitPulseLeaderboard(io);
      emitCreatorSpotlight(io);
      socket.emit('wall:drop', activeDrop);
      socket.emit('hunt:snapshot', {
        zones: serializeAuraZonesForUser(userId),
        points: auraPointsByUser.get(userId) ?? 0,
      });
      socket.emit('confession:snapshot', Array.from(confessions.values()).sort((a, b) => b.at - a.at).slice(0, 300).map((c) => ({
        ...c,
      })));
    });

    socket.on('room:create', (payload: { userId: string; peerId: string }) => {
      const roomId = uuid();
      const participantIds = [payload.userId, payload.peerId];
      rooms.set(roomId, { id: roomId, name: '', participantIds });
      messagesByRoom.set(roomId, []);
      socket.join(roomId);
      const peer = Array.from(users.values()).find((u) => u.id === payload.peerId);
      if (peer) {
        io.to(peer.socketId).emit('room:invite', { roomId, from: payload.userId });
      }
      socket.emit('room:created', { roomId });
    });

    socket.on('room:join', (roomId: string) => {
      socket.join(roomId);
      const room = rooms.get(roomId);
      if (room) {
        const messages = messagesByRoom.get(roomId) ?? [];
        socket.emit('room:joined', { room, messages });
        socket.to(roomId).emit('room:user_joined', { roomId, userId: socket.data.userId, username: socket.data.username });
      }
    });

    socket.on('message:send', (payload: { roomId: string; text: string }) => {
      const userId = socket.data.userId;
      const username = socket.data.username ?? 'Unknown';
      if (!userId) return;
      const msg = {
        id: uuid(),
        roomId: payload.roomId,
        userId,
        username,
        text: payload.text,
        at: Date.now(),
      };
      const list = messagesByRoom.get(payload.roomId) ?? [];
      list.push(msg);
      messagesByRoom.set(payload.roomId, list);
      io.to(payload.roomId).emit('message:new', msg);
    });

    socket.on('call:signal', (payload: { toUserId: string; signal: { type: string; data: unknown } }) => {
      const peer = Array.from(users.values()).find((u) => u.id === payload.toUserId);
      if (peer) io.to(peer.socketId).emit('call:signal', { fromUserId: socket.data.userId, signal: payload.signal });
    });

    socket.on('call:request', (payload: { toUserId: string; type: 'audio' | 'video' }) => {
      const peer = Array.from(users.values()).find((u) => u.id === payload.toUserId);
      if (peer) {
        io.to(peer.socketId).emit('call:incoming', {
          fromUserId: socket.data.userId,
          fromUsername: socket.data.username,
          type: payload.type,
        });
      }
    });

    socket.on('call:reject', (payload: { fromUserId: string }) => {
      const peer = Array.from(users.values()).find((u) => u.id === payload.fromUserId);
      if (peer) io.to(peer.socketId).emit('call:rejected', { byUserId: socket.data.userId });
    });

    socket.on('call:accept', (payload: { callerUserId: string }) => {
      const caller = Array.from(users.values()).find((u) => u.id === payload.callerUserId);
      if (caller) io.to(caller.socketId).emit('call:accepted', { calleeUserId: socket.data.userId });
    });

    socket.on('call:end', (payload: { toUserId: string }) => {
      const peer = Array.from(users.values()).find((u) => u.id === payload.toUserId);
      if (peer) io.to(peer.socketId).emit('call:ended', { byUserId: socket.data.userId });
    });

    socket.on('wall:post', (payload: { text?: string; imageDataUrl?: string; videoDataUrl?: string; isAnonymous?: boolean }) => {
      const userId = socket.data.userId;
      const username = socket.data.username;
      if (!userId || !username) return;
      const text = payload.text?.trim();
      const imageDataUrl = isAllowedDataUrl(payload.imageDataUrl, 'image') ? payload.imageDataUrl : undefined;
      const videoDataUrl = isAllowedDataUrl(payload.videoDataUrl, 'video') ? payload.videoDataUrl : undefined;
      if (!text && !imageDataUrl && !videoDataUrl) return;
      const postId = uuid();
      const post = {
        id: postId,
        userId,
        username,
        text,
        imageDataUrl,
        videoDataUrl,
        at: Date.now(),
        currentOwnerUserId: userId,
        pulseCount: 0,
        viewerIds: new Set<string>([userId]),
        vibeCounts: { real: 0, wild: 0, deep: 0, w: 0 },
        userVibes: new Map<string, Vibe>(),
        isAnonymous: !!payload.isAnonymous,
        anonReputation: getAnonReputation(userId),
        chainRootId: postId,
        chainDepth: 0,
        contributors: [userId],
        dropId: activeDrop && activeDrop.expiresAt > Date.now() ? activeDrop.id : undefined,
        firstWitnessUserId: undefined as string | undefined,
      };
      wallPosts.set(postId, post);
      wallPostOwners.set(postId, userId);
      io.emit('wall:new', serializePost(post));
      emitCreatorSpotlight(io);
    });

    socket.on('wall:extend', (payload: { parentPostId: string; text?: string; imageDataUrl?: string; videoDataUrl?: string; isAnonymous?: boolean }) => {
      const userId = socket.data.userId;
      const username = socket.data.username;
      if (!userId || !username) return;
      const parent = wallPosts.get(payload.parentPostId);
      if (!parent) return;
      const text = payload.text?.trim();
      const imageDataUrl = isAllowedDataUrl(payload.imageDataUrl, 'image') ? payload.imageDataUrl : undefined;
      const videoDataUrl = isAllowedDataUrl(payload.videoDataUrl, 'video') ? payload.videoDataUrl : undefined;
      if (!text && !imageDataUrl && !videoDataUrl) return;
      const postId = uuid();
      const contributors = Array.from(new Set([...(parent.contributors ?? [parent.userId]), userId]));
      const post = {
        id: postId,
        userId,
        username,
        text,
        imageDataUrl,
        videoDataUrl,
        at: Date.now(),
        currentOwnerUserId: userId,
        pulseCount: parent.pulseCount,
        viewerIds: new Set<string>([...parent.viewerIds, userId]),
        vibeCounts: { real: 0, wild: 0, deep: 0, w: 0 },
        userVibes: new Map<string, Vibe>(),
        isAnonymous: !!payload.isAnonymous,
        anonReputation: getAnonReputation(userId),
        chainRootId: parent.chainRootId ?? parent.id,
        chainDepth: (parent.chainDepth ?? 0) + 1,
        contributors,
        dropId: activeDrop && activeDrop.expiresAt > Date.now() ? activeDrop.id : parent.dropId,
        firstWitnessUserId: undefined as string | undefined,
      };
      wallPosts.set(postId, post);
      wallPostOwners.set(postId, userId);
      io.emit('wall:new', serializePost(post));
      emitCreatorSpotlight(io);
    });

    socket.on('wall:view', (payload: { postId: string }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      const post = wallPosts.get(payload.postId);
      if (!post) return;
      const isNewViewer = !post.viewerIds.has(userId);
      if (isNewViewer) post.viewerIds.add(userId);
      // First witness lock: only the first non-creator witness can trigger a takeover.
      if (isNewViewer && post.currentOwnerUserId !== userId && !post.firstWitnessUserId) {
        post.firstWitnessUserId = userId;
        transferPulse(io, post.id, userId);
        return;
      }
      io.emit('wall:update', {
        postId: post.id,
        currentOwnerUserId: post.currentOwnerUserId,
        pulseCount: post.pulseCount,
        viewerIds: Array.from(post.viewerIds),
        vibeCounts: post.vibeCounts,
        firstWitnessUserId: post.firstWitnessUserId,
      });
    });

    socket.on('wall:react', (payload: { postId: string; vibe: Vibe }) => {
      const userId = socket.data.userId;
      if (!userId || !VIBES.includes(payload.vibe)) return;
      const post = wallPosts.get(payload.postId);
      if (!post) return;
      const previous = post.userVibes.get(userId);
      if (previous === payload.vibe) return;
      if (previous) post.vibeCounts[previous] = Math.max(0, post.vibeCounts[previous] - 1);
      post.userVibes.set(userId, payload.vibe);
      post.vibeCounts[payload.vibe] += 1;
      io.emit('wall:update', {
        postId: post.id,
        currentOwnerUserId: post.currentOwnerUserId,
        pulseCount: post.pulseCount,
        viewerIds: Array.from(post.viewerIds),
        vibeCounts: post.vibeCounts,
        firstWitnessUserId: post.firstWitnessUserId,
      });
      emitCreatorSpotlight(io);
      addAnonReputation(post.userId, 1);
    });

    socket.on('wall:remove', (payload: { postId: string }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      if (wallPostOwners.get(payload.postId) !== userId) return;
      wallPostOwners.delete(payload.postId);
      wallPosts.delete(payload.postId);
      io.emit('wall:remove', { postId: payload.postId, byUserId: socket.data.userId });
      emitCreatorSpotlight(io);
    });

    socket.on('confession:post', (payload: { text: string; isAnonymous: boolean }) => {
      const userId = socket.data.userId;
      const username = socket.data.username;
      if (!userId || !username) return;
      const text = payload.text.trim();
      if (!text) return;
      const item = {
        id: uuid(),
        userId,
        username,
        text,
        at: Date.now(),
        isAnonymous: payload.isAnonymous,
        anonReputation: getAnonReputation(userId),
      };
      confessions.set(item.id, item);
      io.emit('confession:new', item);
    });

    socket.on('confession:remove', (payload: { confessionId: string }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      const item = confessions.get(payload.confessionId);
      if (!item || item.userId !== userId) return;
      confessions.delete(payload.confessionId);
      io.emit('confession:remove', { confessionId: payload.confessionId });
    });

    socket.on('hunt:claim', (payload: { zoneId: string; lat: number; lng: number }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      const zone = auraZones.get(payload.zoneId);
      if (!zone || zone.expiresAt <= Date.now()) return;
      if (zone.claimedByUserId) return;
      const distance = metersBetween(payload.lat, payload.lng, zone.lat, zone.lng);
      if (distance > MAX_HUNT_DISTANCE_METERS) return;
      if (distance > zone.radiusMeters) return;
      zone.claimedByUserId = userId;
      zone.claimedByUsername = socket.data.username;
      const next = (auraPointsByUser.get(userId) ?? 0) + zone.reward;
      auraPointsByUser.set(userId, next);
      io.to(socket.id).emit('hunt:points', { points: next });
      emitAuraUpdate(io);
    });

    socket.on('hunt:borrow:request', (payload: { zoneId: string; lat: number; lng: number }) => {
      const userId = socket.data.userId;
      const username = socket.data.username;
      if (!userId || !username) return;
      const zone = auraZones.get(payload.zoneId);
      if (!zone || !zone.claimedByUserId || zone.expiresAt <= Date.now()) return;
      if (zone.claimedByUserId === userId) return;
      if (zone.borrowedBy.has(userId)) return;
      const distance = metersBetween(payload.lat, payload.lng, zone.lat, zone.lng);
      if (distance > MAX_HUNT_DISTANCE_METERS) return;
      const owner = users.get(zone.claimedByUserId);
      if (!owner) return;
      const set = pendingBorrowRequests.get(zone.id) ?? new Set<string>();
      if (set.has(userId)) return;
      set.add(userId);
      pendingBorrowRequests.set(zone.id, set);
      io.to(owner.socketId).emit('hunt:borrow:incoming', {
        zoneId: zone.id,
        fromUserId: userId,
        fromUsername: username,
      });
    });

    socket.on('hunt:borrow:respond', (payload: { zoneId: string; requesterId: string; approve: boolean }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      const zone = auraZones.get(payload.zoneId);
      if (!zone || zone.claimedByUserId !== userId) return;
      const pending = pendingBorrowRequests.get(zone.id);
      if (!pending || !pending.has(payload.requesterId)) return;
      pending.delete(payload.requesterId);
      if (pending.size === 0) pendingBorrowRequests.delete(zone.id);
      if (!payload.approve) {
        io.emit('hunt:borrow:result', { zoneId: zone.id, requesterId: payload.requesterId, approved: false });
        return;
      }
      zone.borrowedBy.add(payload.requesterId);
      const borrowerGain = Math.max(1, Math.floor(zone.reward * 0.6));
      const ownerGain = Math.max(1, Math.floor(zone.reward * 0.2));
      auraPointsByUser.set(payload.requesterId, (auraPointsByUser.get(payload.requesterId) ?? 0) + borrowerGain);
      auraPointsByUser.set(userId, (auraPointsByUser.get(userId) ?? 0) + ownerGain);
      const owner = users.get(userId);
      const borrower = users.get(payload.requesterId);
      if (owner) io.to(owner.socketId).emit('hunt:points', { points: auraPointsByUser.get(userId) ?? 0 });
      if (borrower) io.to(borrower.socketId).emit('hunt:points', { points: auraPointsByUser.get(payload.requesterId) ?? 0 });
      io.emit('hunt:borrow:result', { zoneId: zone.id, requesterId: payload.requesterId, approved: true });
      emitAuraUpdate(io);
    });

    socket.on('disconnect', () => {
      const userId = socket.data.userId;
      if (userId) {
        const timer = setTimeout(() => {
          const activeSocket = users.get(userId)?.socketId;
          if (activeSocket && activeSocket !== socket.id) return;
          users.delete(userId);
          socket.broadcast.emit('user:offline', { userId });
          io.emit('user:list', Array.from(users.values()).map((u) => ({ id: u.id, username: u.username })));
          for (const post of wallPosts.values()) {
            if (post.currentOwnerUserId !== userId) continue;
            const nextViewer = Array.from(post.viewerIds).find((viewerId) => viewerId !== userId && users.has(viewerId));
            if (nextViewer) {
              // Keep first-witness lock strict: handoff only if first witness was never claimed.
              if (!post.firstWitnessUserId) transferPulse(io, post.id, nextViewer);
            } else {
              io.emit('wall:update', {
                postId: post.id,
                currentOwnerUserId: userId,
                pulseCount: post.pulseCount,
                viewerIds: Array.from(post.viewerIds),
                vibeCounts: post.vibeCounts,
                firstWitnessUserId: post.firstWitnessUserId,
              });
            }
          }
          pendingUserCleanup.delete(userId);
        }, DISCONNECT_GRACE_MS);
        pendingUserCleanup.set(userId, timer);
      }
    });
  });
}
