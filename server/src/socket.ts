import { Server, Socket } from 'socket.io';
import { v4 as uuid } from 'uuid';
import { users, rooms, messagesByRoom } from './index.js';

const wallPostOwners = new Map<string, string>();
const pendingUserCleanup = new Map<string, NodeJS.Timeout>();
const userBlocks = new Map<string, Set<string>>();
const wallReports = new Map<string, Array<{ reporterUserId: string; reason: string; at: number }>>();
const borrowDisabledByUser = new Map<string, boolean>();
const VIBES = ['calm', 'chaos', 'deep', 'funny'] as const;
type Vibe = (typeof VIBES)[number];
const TAGS = ['Crush', 'Hostel', 'Exam', 'Drama', 'Placement'] as const;
type WallTag = (typeof TAGS)[number];
const SCOPES = ['global', 'local'] as const;
type WallScope = (typeof SCOPES)[number];
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
    tag?: WallTag;
    scope?: WallScope;
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
const confessions = new Map<string, {
  id: string;
  userId: string;
  username: string;
  text: string;
  createdAt: number;
  expiresAt: number;
  isAnonymous: boolean;
  anonReputation: number;
  replies: Array<{ id: string; text: string; createdAt: number }>;
}>();
const MAX_DATA_URL_LENGTH = 12_000_000;
const DISCONNECT_GRACE_MS = 8_000;
const MESSAGE_RATE_LIMIT_COUNT = 5;
const MESSAGE_RATE_LIMIT_WINDOW_MS = 10_000;
const CONFESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CONFESSION_CLEANUP_INTERVAL_MS = 60_000;
const DROP_DURATION_MS = 10 * 60 * 1000;
const DROP_INTERVAL_MS = 15 * 60 * 1000;
const DROP_PROMPTS = [
  'Share a midnight thought in one line.',
  'Drop your current obsession.',
  'Tell a hard truth you learned this year.',
  'What are you building in silence?',
];
let activeDrop: { id: string; prompt: string; startedAt: number; expiresAt: number } | null = null;
let huntPresenceLoopStarted = false;
let confessionCleanupStarted = false;
let lastDynamicZoneAt = 0;

const AURA_DROP_DURATION_MS = 30 * 60 * 1000;
const MAX_HUNT_DISTANCE_METERS = 4000;
const AURA_CAPTURE_RADIUS_METERS = 50;
const AURA_SPAWN_RING_MIN_METERS = 800;
const AURA_SPAWN_RING_MAX_METERS = 1000;
const HUNT_PRESENCE_TTL_MS = 90_000;
const MAX_DYNAMIC_ZONES = 6;
const DYNAMIC_ZONE_MIN_SPACING_METERS = 1000;
const DYNAMIC_ZONE_COOLDOWN_MS = 12_000;
const auraPointsByUser = new Map<string, number>();
const pendingBorrowRequests = new Map<string, Set<string>>();
const huntPresence = new Map<
  string,
  {
    userId: string;
    username: string;
    lat: number;
    lng: number;
    shareNearby: boolean;
    runningZoneId: string | null;
    updatedAt: number;
  }
>();
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

function isBlocked(blockerUserId: string, otherUserId: string) {
  return userBlocks.get(blockerUserId)?.has(otherUserId) ?? false;
}

function isBlockedEitherWay(aUserId: string, bUserId: string) {
  return isBlocked(aUserId, bUserId) || isBlocked(bUserId, aUserId);
}

function isRateLimited(socket: Socket, eventKey: string, limit: number, windowMs: number) {
  const now = Date.now();
  const store = (socket.data.rateLimits ??= {}) as Record<string, number[]>;
  const list = (store[eventKey] ?? []).filter((at) => now - at < windowMs);
  if (list.length >= limit) {
    store[eventKey] = list;
    return true;
  }
  list.push(now);
  store[eventKey] = list;
  return false;
}

function serializeConfession(item: {
  id: string;
  userId: string;
  username: string;
  text: string;
  createdAt: number;
  expiresAt: number;
  isAnonymous: boolean;
  anonReputation: number;
  replies: Array<{ id: string; text: string; createdAt: number }>;
}) {
  return {
    id: item.id,
    userId: item.userId,
    username: item.isAnonymous ? 'Anon' : item.username,
    text: item.text,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
    isAnonymous: item.isAnonymous,
    anonReputation: item.anonReputation,
    replies: item.replies,
  };
}

function pruneExpiredConfessions(io: Server) {
  const now = Date.now();
  for (const [confessionId, item] of confessions.entries()) {
    if (item.expiresAt > now) continue;
    confessions.delete(confessionId);
    io.emit('confession:remove', { confessionId });
  }
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
  tag?: WallTag;
  scope?: WallScope;
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
    tag: post.tag,
    scope: post.scope ?? 'global',
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

function offsetPointByMeters(lat: number, lng: number, northMeters: number, eastMeters: number) {
  const earthRadius = 6378137;
  const dLat = northMeters / earthRadius;
  const dLng = eastMeters / (earthRadius * Math.cos((Math.PI * lat) / 180));
  return {
    lat: lat + (dLat * 180) / Math.PI,
    lng: lng + (dLng * 180) / Math.PI,
  };
}

function randomPointInRing(lat: number, lng: number, minMeters: number, maxMeters: number) {
  const distance = minMeters + Math.random() * (maxMeters - minMeters);
  const angle = Math.random() * Math.PI * 2;
  const north = Math.cos(angle) * distance;
  const east = Math.sin(angle) * distance;
  return offsetPointByMeters(lat, lng, north, east);
}

function activeAuraZoneList() {
  const now = Date.now();
  return Array.from(auraZones.values()).filter((zone) => zone.expiresAt > now);
}

function hasZoneInDistanceRange(lat: number, lng: number, minMeters: number, maxMeters: number) {
  const zones = activeAuraZoneList();
  return zones.some((zone) => {
    const d = metersBetween(lat, lng, zone.lat, zone.lng);
    return d >= minMeters && d <= maxMeters;
  });
}

function isTooCloseToExistingZone(lat: number, lng: number, minSpacingMeters: number) {
  const zones = activeAuraZoneList();
  return zones.some((zone) => metersBetween(lat, lng, zone.lat, zone.lng) < minSpacingMeters);
}

function createAuraZoneInRing(
  anchorLat: number,
  anchorLng: number,
  title: string,
  reward: number,
  minMeters = AURA_SPAWN_RING_MIN_METERS,
  maxMeters = AURA_SPAWN_RING_MAX_METERS,
) {
  for (let i = 0; i < 20; i += 1) {
    const candidate = randomPointInRing(anchorLat, anchorLng, minMeters, maxMeters);
    if (isTooCloseToExistingZone(candidate.lat, candidate.lng, DYNAMIC_ZONE_MIN_SPACING_METERS)) continue;
    createAuraZone(candidate.lat, candidate.lng, title, AURA_CAPTURE_RADIUS_METERS, reward);
    return true;
  }
  return false;
}

function ensureAuraCoverageForActiveUsers() {
  pruneHuntPresence();
  const presences = Array.from(huntPresence.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  if (!presences.length) return false;
  let spawned = false;
  for (const p of presences) {
    const activeCount = activeAuraZoneList().length;
    if (activeCount >= MAX_DYNAMIC_ZONES) break;
    const hasRingLoot = hasZoneInDistanceRange(
      p.lat,
      p.lng,
      AURA_SPAWN_RING_MIN_METERS,
      AURA_SPAWN_RING_MAX_METERS + 120,
    );
    if (hasRingLoot) continue;
    const ok = createAuraZoneInRing(
      p.lat,
      p.lng,
      'Nearby Ring Loot',
      70 + Math.floor(Math.random() * 70),
    );
    if (ok) spawned = true;
  }
  return spawned;
}

function distanceBand(meters: number) {
  if (meters < 500) return '<500m';
  if (meters < 1000) return '0.5-1km';
  if (meters < 2000) return '1-2km';
  return '2-4km';
}

function pruneHuntPresence() {
  const now = Date.now();
  for (const [userId, presence] of huntPresence.entries()) {
    if (now - presence.updatedAt > HUNT_PRESENCE_TTL_MS) {
      huntPresence.delete(userId);
    }
  }
}

function getRunnerCountsByZone() {
  pruneHuntPresence();
  const counts = new Map<string, number>();
  for (const presence of huntPresence.values()) {
    if (!presence.runningZoneId) continue;
    counts.set(presence.runningZoneId, (counts.get(presence.runningZoneId) ?? 0) + 1);
  }
  return counts;
}

function serializeAuraZones() {
  const runnerCounts = getRunnerCountsByZone();
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
      borrowDisabled: zone.claimedByUserId ? !!borrowDisabledByUser.get(zone.claimedByUserId) : false,
      runnerCount: runnerCounts.get(zone.id) ?? 0,
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

function emitHuntPresenceForUser(io: Server, userId: string) {
  const self = huntPresence.get(userId);
  const socketId = users.get(userId)?.socketId;
  if (!socketId) return;
  if (!self) {
    io.to(socketId).emit('hunt:presence', { nearbyUsers: [], sharing: false, runningZoneId: null });
    return;
  }
  const nearbyUsers = Array.from(huntPresence.values())
    .filter((p) => p.userId !== userId && p.shareNearby)
    .map((p) => {
      const dist = metersBetween(self.lat, self.lng, p.lat, p.lng);
      return { p, dist };
    })
    .filter((x) => x.dist <= MAX_HUNT_DISTANCE_METERS)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 24)
    .map(({ p, dist }) => {
      const zone = p.runningZoneId ? auraZones.get(p.runningZoneId) : undefined;
      const distanceToZoneMeters = zone ? Math.round(metersBetween(p.lat, p.lng, zone.lat, zone.lng)) : undefined;
      return {
        userId: p.userId,
        username: p.username,
        lat: p.lat,
        lng: p.lng,
        distanceMeters: Math.round(dist),
        distanceBand: distanceBand(dist),
        isRunning: !!p.runningZoneId,
        runningZoneId: p.runningZoneId ?? undefined,
        distanceToZoneMeters,
      };
    });
  io.to(socketId).emit('hunt:presence', {
    nearbyUsers,
    sharing: self.shareNearby,
    runningZoneId: self.runningZoneId,
  });
}

function emitHuntPresenceAll(io: Server) {
  pruneHuntPresence();
  for (const user of users.values()) {
    emitHuntPresenceForUser(io, user.id);
  }
}

function createAuraZone(lat: number, lng: number, title: string, radiusMeters: number, reward: number) {
  const zone = {
    id: uuid(),
    title,
    lat,
    lng,
    radiusMeters,
    reward,
    expiresAt: Date.now() + AURA_DROP_DURATION_MS,
    borrowedBy: new Set<string>(),
  };
  auraZones.set(zone.id, zone);
}

function seedAuraZone() {
  pruneHuntPresence();
  const active = Array.from(huntPresence.values());
  const source = active.length > 0 ? active[Math.floor(Math.random() * active.length)] : null;
  const title = ['Skyline Pulse', 'Street Echo', 'Neon Orbit', 'Hidden Aura'][Math.floor(Math.random() * 4)];
  const reward = 60 + Math.floor(Math.random() * 80);
  if (source) {
    const seeded = createAuraZoneInRing(source.lat, source.lng, title, reward);
    if (seeded) return;
  }
  const base = {
    lat: 40.73061 + (Math.random() - 0.5) * 0.02,
    lng: -73.935242 + (Math.random() - 0.5) * 0.02,
  };
  createAuraZone(base.lat, base.lng, title, AURA_CAPTURE_RADIUS_METERS, reward);
}

function buildPresenceClusters() {
  pruneHuntPresence();
  const points = Array.from(huntPresence.values());
  const clusters: Array<typeof points> = [];
  const visited = new Set<number>();
  for (let i = 0; i < points.length; i += 1) {
    if (visited.has(i)) continue;
    const queue = [i];
    visited.add(i);
    const componentIdx: number[] = [];
    while (queue.length) {
      const idx = queue.shift()!;
      componentIdx.push(idx);
      for (let j = 0; j < points.length; j += 1) {
        if (visited.has(j)) continue;
        const d = metersBetween(points[idx].lat, points[idx].lng, points[j].lat, points[j].lng);
        if (d <= MAX_HUNT_DISTANCE_METERS) {
          visited.add(j);
          queue.push(j);
        }
      }
    }
    const cluster = componentIdx.map((idx) => points[idx]);
    if (cluster.length >= 2) clusters.push(cluster);
  }
  return clusters;
}

function trySpawnClusterZone() {
  const now = Date.now();
  if (now - lastDynamicZoneAt < DYNAMIC_ZONE_COOLDOWN_MS) return false;
  const activeCount = serializeAuraZones().length;
  if (activeCount >= MAX_DYNAMIC_ZONES) return false;
  const clusters = buildPresenceClusters();
  if (!clusters.length) return false;
  clusters.sort((a, b) => b.length - a.length);
  for (const cluster of clusters) {
    const centroid = cluster.reduce(
      (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
      { lat: 0, lng: 0 },
    );
    const baseLat = centroid.lat / cluster.length;
    const baseLng = centroid.lng / cluster.length;
    const reward = Math.min(220, 80 + cluster.length * 18 + Math.floor(Math.random() * 30));
    const created = createAuraZoneInRing(baseLat, baseLng, `Cluster Loot x${cluster.length}`, reward);
    if (!created) continue;
    lastDynamicZoneAt = now;
    return true;
  }
  return false;
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
      trySpawnClusterZone();
      ensureAuraCoverageForActiveUsers();
      if (auraZones.size < 2) seedAuraZone();
      emitAuraUpdate(io);
    }, 60_000);
  }
  if (!huntPresenceLoopStarted) {
    huntPresenceLoopStarted = true;
    setInterval(() => {
      trySpawnClusterZone();
      ensureAuraCoverageForActiveUsers();
      emitHuntPresenceAll(io);
      emitAuraUpdate(io);
    }, 15_000);
  }
  if (!confessionCleanupStarted) {
    confessionCleanupStarted = true;
    setInterval(() => {
      pruneExpiredConfessions(io);
    }, CONFESSION_CLEANUP_INTERVAL_MS);
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
      emitHuntPresenceForUser(io, userId);
      emitAuraUpdate(io);
      pruneExpiredConfessions(io);
      socket.emit(
        'confession:snapshot',
        Array.from(confessions.values())
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 300)
          .map((c) => serializeConfession(c)),
      );
    });

    socket.on('user:block', (payload: { targetUserId: string; blocked: boolean }) => {
      const userId = socket.data.userId;
      if (!userId || !payload.targetUserId || payload.targetUserId === userId) return;
      const set = userBlocks.get(userId) ?? new Set<string>();
      if (payload.blocked) set.add(payload.targetUserId);
      else set.delete(payload.targetUserId);
      if (set.size) userBlocks.set(userId, set);
      else userBlocks.delete(userId);
    });

    socket.on('hunt:borrow:toggle', (payload: { enabled: boolean }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      borrowDisabledByUser.set(userId, !payload.enabled);
      emitAuraUpdate(io);
    });

    socket.on('room:create', (payload: { userId: string; peerId: string }) => {
      if (isBlockedEitherWay(payload.userId, payload.peerId)) return;
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
      if (isRateLimited(socket, 'message:send', MESSAGE_RATE_LIMIT_COUNT, MESSAGE_RATE_LIMIT_WINDOW_MS)) {
        socket.emit('message:rate_limited', { limit: MESSAGE_RATE_LIMIT_COUNT, windowMs: MESSAGE_RATE_LIMIT_WINDOW_MS });
        return;
      }
      const room = rooms.get(payload.roomId);
      if (room) {
        const blocked = room.participantIds.some((participantId) => participantId !== userId && isBlockedEitherWay(userId, participantId));
        if (blocked) return;
      }
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

    socket.on('room:typing', (payload: { roomId: string; isTyping: boolean }) => {
      const userId = socket.data.userId;
      const username = socket.data.username ?? 'Unknown';
      if (!userId) return;
      socket.to(payload.roomId).emit('room:typing', {
        roomId: payload.roomId,
        userId,
        username,
        isTyping: !!payload.isTyping,
        at: Date.now(),
      });
    });

    socket.on('room:seen', (payload: { roomId: string; messageId: string }) => {
      const userId = socket.data.userId;
      if (!userId || !payload.messageId) return;
      socket.to(payload.roomId).emit('room:seen', {
        roomId: payload.roomId,
        userId,
        messageId: payload.messageId,
        at: Date.now(),
      });
    });

    socket.on('call:signal', (payload: { toUserId: string; signal: { type: string; data: unknown } }) => {
      if (socket.data.userId && isBlockedEitherWay(socket.data.userId, payload.toUserId)) return;
      const peer = Array.from(users.values()).find((u) => u.id === payload.toUserId);
      if (peer) io.to(peer.socketId).emit('call:signal', { fromUserId: socket.data.userId, signal: payload.signal });
    });

    socket.on('call:request', (payload: { toUserId: string; type: 'audio' | 'video' }) => {
      if (socket.data.userId && isBlockedEitherWay(socket.data.userId, payload.toUserId)) return;
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
      if (socket.data.userId && isBlockedEitherWay(socket.data.userId, payload.fromUserId)) return;
      const peer = Array.from(users.values()).find((u) => u.id === payload.fromUserId);
      if (peer) io.to(peer.socketId).emit('call:rejected', { byUserId: socket.data.userId });
    });

    socket.on('call:accept', (payload: { callerUserId: string }) => {
      if (socket.data.userId && isBlockedEitherWay(socket.data.userId, payload.callerUserId)) return;
      const caller = Array.from(users.values()).find((u) => u.id === payload.callerUserId);
      if (caller) io.to(caller.socketId).emit('call:accepted', { calleeUserId: socket.data.userId });
    });

    socket.on('call:end', (payload: { toUserId: string }) => {
      if (socket.data.userId && isBlockedEitherWay(socket.data.userId, payload.toUserId)) return;
      const peer = Array.from(users.values()).find((u) => u.id === payload.toUserId);
      if (peer) io.to(peer.socketId).emit('call:ended', { byUserId: socket.data.userId });
    });

    socket.on('wall:post', (payload: { text?: string; imageDataUrl?: string; videoDataUrl?: string; isAnonymous?: boolean; tag?: WallTag; scope?: WallScope }) => {
      const userId = socket.data.userId;
      const username = socket.data.username;
      if (!userId || !username) return;
      const text = payload.text?.trim();
      const imageDataUrl = isAllowedDataUrl(payload.imageDataUrl, 'image') ? payload.imageDataUrl : undefined;
      const videoDataUrl = isAllowedDataUrl(payload.videoDataUrl, 'video') ? payload.videoDataUrl : undefined;
      if (!text && !imageDataUrl && !videoDataUrl) return;
      const tag = payload.tag && TAGS.includes(payload.tag) ? payload.tag : 'Crush';
      const scope = payload.scope && SCOPES.includes(payload.scope) ? payload.scope : 'global';
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
        tag,
        scope,
        vibeCounts: { calm: 0, chaos: 0, deep: 0, funny: 0 },
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

    socket.on('wall:extend', (payload: { parentPostId: string; text?: string; imageDataUrl?: string; videoDataUrl?: string; isAnonymous?: boolean; tag?: WallTag; scope?: WallScope }) => {
      const userId = socket.data.userId;
      const username = socket.data.username;
      if (!userId || !username) return;
      const parent = wallPosts.get(payload.parentPostId);
      if (!parent) return;
      const text = payload.text?.trim();
      const imageDataUrl = isAllowedDataUrl(payload.imageDataUrl, 'image') ? payload.imageDataUrl : undefined;
      const videoDataUrl = isAllowedDataUrl(payload.videoDataUrl, 'video') ? payload.videoDataUrl : undefined;
      if (!text && !imageDataUrl && !videoDataUrl) return;
      const tag = payload.tag && TAGS.includes(payload.tag) ? payload.tag : (parent.tag ?? 'Crush');
      const scope = payload.scope && SCOPES.includes(payload.scope) ? payload.scope : (parent.scope ?? 'global');
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
        tag,
        scope,
        vibeCounts: { calm: 0, chaos: 0, deep: 0, funny: 0 },
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

    socket.on('wall:vibe:add', (payload: { postId: string; vibe: Vibe }) => {
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

    socket.on('wall:report', (payload: { postId: string; reason?: string }) => {
      const reporterUserId = socket.data.userId;
      if (!reporterUserId) return;
      const post = wallPosts.get(payload.postId);
      if (!post) return;
      const list = wallReports.get(payload.postId) ?? [];
      if (list.some((entry) => entry.reporterUserId === reporterUserId)) return;
      list.push({
        reporterUserId,
        reason: payload.reason?.trim() || 'report',
        at: Date.now(),
      });
      wallReports.set(payload.postId, list);
    });

    socket.on('confession:post', (payload: { text: string; isAnonymous: boolean }) => {
      const userId = socket.data.userId;
      const username = socket.data.username;
      if (!userId || !username) return;
      pruneExpiredConfessions(io);
      const text = payload.text.trim();
      if (!text) return;
      const createdAt = Date.now();
      const item = {
        id: uuid(),
        userId,
        username,
        text,
        createdAt,
        expiresAt: createdAt + CONFESSION_TTL_MS,
        isAnonymous: payload.isAnonymous,
        anonReputation: getAnonReputation(userId),
        replies: [] as Array<{ id: string; text: string; createdAt: number }>,
      };
      confessions.set(item.id, item);
      io.emit('confession:new', serializeConfession(item));
    });

    socket.on('confession:reply', (payload: { confessionId: string; text: string }) => {
      const userId = socket.data.userId;
      if (!userId) return;
      pruneExpiredConfessions(io);
      const item = confessions.get(payload.confessionId);
      if (!item) return;
      const text = payload.text.trim();
      if (!text) return;
      item.replies.push({
        id: uuid(),
        text,
        createdAt: Date.now(),
      });
      io.emit('confession:update', serializeConfession(item));
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
      if (borrowDisabledByUser.get(zone.claimedByUserId)) return;
      if (isBlockedEitherWay(userId, zone.claimedByUserId)) return;
      if (zone.claimedByUserId === userId) return;
      if (zone.borrowedBy.has(userId)) return;
      const distance = metersBetween(payload.lat, payload.lng, zone.lat, zone.lng);
      if (distance > MAX_HUNT_DISTANCE_METERS) return;
      if (distance > zone.radiusMeters) return;
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

    socket.on('hunt:presence:update', (payload: { lat: number; lng: number; shareNearby: boolean }) => {
      const userId = socket.data.userId;
      const username = socket.data.username;
      if (!userId || !username) return;
      if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) return;
      const prev = huntPresence.get(userId);
      huntPresence.set(userId, {
        userId,
        username,
        lat: payload.lat,
        lng: payload.lng,
        shareNearby: !!payload.shareNearby,
        runningZoneId: prev?.runningZoneId ?? null,
        updatedAt: Date.now(),
      });
      trySpawnClusterZone();
      ensureAuraCoverageForActiveUsers();
      emitHuntPresenceAll(io);
      emitAuraUpdate(io);
    });

    socket.on('hunt:run:start', (payload: { zoneId: string; lat: number; lng: number }) => {
      const userId = socket.data.userId;
      const username = socket.data.username;
      if (!userId || !username) return;
      const zone = auraZones.get(payload.zoneId);
      if (!zone || zone.expiresAt <= Date.now()) return;
      const distance = metersBetween(payload.lat, payload.lng, zone.lat, zone.lng);
      if (distance > MAX_HUNT_DISTANCE_METERS) return;
      huntPresence.set(userId, {
        userId,
        username,
        lat: payload.lat,
        lng: payload.lng,
        shareNearby: true,
        runningZoneId: zone.id,
        updatedAt: Date.now(),
      });
      trySpawnClusterZone();
      emitHuntPresenceAll(io);
      emitAuraUpdate(io);
    });

    socket.on('hunt:run:stop', (payload: { lat: number; lng: number }) => {
      const userId = socket.data.userId;
      const username = socket.data.username;
      if (!userId || !username) return;
      const prev = huntPresence.get(userId);
      if (!prev) return;
      huntPresence.set(userId, {
        ...prev,
        username,
        lat: Number.isFinite(payload.lat) ? payload.lat : prev.lat,
        lng: Number.isFinite(payload.lng) ? payload.lng : prev.lng,
        runningZoneId: null,
        updatedAt: Date.now(),
      });
      emitHuntPresenceAll(io);
      emitAuraUpdate(io);
    });

    socket.on('disconnect', () => {
      const userId = socket.data.userId;
      if (userId) {
        const hadRunning = !!huntPresence.get(userId)?.runningZoneId;
        huntPresence.delete(userId);
        if (hadRunning) emitAuraUpdate(io);
        emitHuntPresenceAll(io);
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
