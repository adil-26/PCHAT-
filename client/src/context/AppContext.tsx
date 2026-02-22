import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createSocket } from '../lib/socket';
import type { SocketClient } from '../lib/socket';
import type { AuraZone, BorrowRequest, Confession, CreatorSpotlight, DropEvent, FreedomPost, Message, NearbyHunter, NodeProfile, PulseScore, QuestProgress, Room, StreakState, User, WallTag, WallVibe } from '../types';

interface AppState {
  currentUser: User | null;
  users: User[];
  rooms: Room[];
  activeRoom: Room | null;
  messagesByRoom: Record<string, Message[]>;
  socket: SocketClient | null;
  connected: boolean;
  incomingCall: { fromUserId: string; fromUsername: string; type: 'audio' | 'video' } | null;
  activeCall: { peerUserId: string; type: 'audio' | 'video' } | null;
  freedomPosts: FreedomPost[];
  pulseLeaderboard: PulseScore[];
  creatorSpotlight: CreatorSpotlight[];
  questProgress: QuestProgress;
  streak: StreakState;
  activeDrop: DropEvent | null;
  confessions: Confession[];
  nodeProfile: NodeProfile | null;
  auraZones: AuraZone[];
  auraPoints: number;
  incomingBorrowRequests: BorrowRequest[];
  nearbyHunters: NearbyHunter[];
  huntSharing: boolean;
  runningZoneId: string | null;
  typingByRoom: Record<string, { userId: string; username: string; isTyping: boolean; at: number } | undefined>;
  seenByRoom: Record<string, { userId: string; messageId: string; at: number } | undefined>;
  blockedNodeIds: string[];
}

const defaultState: AppState = {
  currentUser: null,
  users: [],
  rooms: [],
  activeRoom: null,
  messagesByRoom: {},
  socket: null,
  connected: false,
  incomingCall: null,
  activeCall: null,
  freedomPosts: [],
  pulseLeaderboard: [],
  creatorSpotlight: [],
  questProgress: { witnessCount: 0, postsCount: 0, vibesCount: 0 },
  streak: { current: 0, best: 0, lastCompletedDate: null, today: { witness: false, handoff: false, room: false } },
  activeDrop: null,
  confessions: [],
  nodeProfile: null,
  auraZones: [],
  auraPoints: 0,
  incomingBorrowRequests: [],
  nearbyHunters: [],
  huntSharing: false,
  runningZoneId: null,
  typingByRoom: {},
  seenByRoom: {},
  blockedNodeIds: [],
};

type AppContextValue = Omit<AppState, 'messagesByRoom'> & {
  messages: Message[];
  login: (username: string) => void;
  logout: () => void;
  selectRoom: (room: Room | null) => void;
  sendMessage: (text: string) => void;
  startChat: (peerId: string) => void;
  postFreedom: (payload: { text?: string; imageDataUrl?: string; videoDataUrl?: string; isAnonymous?: boolean; parentPostId?: string; tag?: WallTag }) => void;
  viewFreedomPost: (postId: string) => void;
  reactToFreedomPost: (postId: string, vibe: WallVibe) => void;
  claimDailyNodeCharge: () => void;
  postConfession: (text: string, isAnonymous: boolean) => void;
  replyConfession: (confessionId: string, text: string) => void;
  removeConfession: (confessionId: string) => void;
  toggleBlockNode: (targetUserId: string) => void;
  reportFreedomPost: (postId: string, reason?: string) => void;
  setBorrowRequestsEnabled: (enabled: boolean) => void;
  claimAuraZone: (zoneId: string, lat: number, lng: number) => void;
  requestBorrowAura: (zoneId: string, lat: number, lng: number) => void;
  respondBorrowAura: (zoneId: string, requesterId: string, approve: boolean) => void;
  updateHuntPresence: (lat: number, lng: number, shareNearby: boolean) => void;
  startAuraRun: (zoneId: string, lat: number, lng: number) => void;
  stopAuraRun: (lat: number, lng: number) => void;
  setTyping: (roomId: string, isTyping: boolean) => void;
  markRoomSeen: (roomId: string, messageId: string) => void;
  removeFreedomPost: (postId: string) => void;
  setIncomingCall: (call: AppState['incomingCall']) => void;
  setActiveCall: (call: AppState['activeCall']) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

const STREAK_KEY = 'fchat_streak_v1';
const NODE_KEY = 'fchat_node_v1';
const SESSION_KEY = 'fchat_session_user_v1';
const DEVICE_ID_KEY = 'fchat_device_id_v1';
const BLOCKED_NODES_KEY = 'fchat_blocked_nodes_v1';
const EMPTY_VIBE_COUNTS: Record<WallVibe, number> = { calm: 0, chaos: 0, deep: 0, funny: 0 };
const todayKey = () => new Date().toISOString().slice(0, 10);
const isSameDate = (a: string | null, b: string) => a === b;
const makeNodeId = () => `node_${Math.random().toString(36).slice(2, 10)}`;

function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    if (!parsed?.id || !parsed?.username) return null;
    return parsed;
  } catch {
    return null;
  }
}

function createDeviceIdentity(): User {
  const existingDeviceId = localStorage.getItem(DEVICE_ID_KEY);
  const deviceId = existingDeviceId ?? `d_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  const handle = `Node-${deviceId.slice(-4).toUpperCase()}`;
  const user = { id: `device_${deviceId}`, username: handle };
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

function getOrCreateDeviceUser(): User | null {
  if (typeof window === 'undefined') return null;
  const stored = getStoredUser();
  if (stored) return stored;
  return createDeviceIdentity();
}

function applyNodeDecay(profile: NodeProfile): NodeProfile {
  const now = Date.now();
  const elapsedHours = Math.floor((now - profile.lastSeenAt) / (1000 * 60 * 60));
  if (elapsedHours <= 0) return { ...profile, lastSeenAt: now };
  return {
    ...profile,
    energy: Math.max(0, profile.energy - elapsedHours * 4),
    lastSeenAt: now,
  };
}

function applyNodeReward(profile: NodeProfile, displayName: string, xpGain: number, energyGain: number): NodeProfile {
  const decayed = applyNodeDecay(profile);
  const xp = decayed.xp + xpGain;
  return {
    ...decayed,
    displayName,
    xp,
    level: 1 + Math.floor(xp / 120),
    energy: Math.min(100, decayed.energy + energyGain),
    lastSeenAt: Date.now(),
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => {
    const user = getOrCreateDeviceUser();
    return { ...defaultState, currentUser: user };
  });
  const currentUserRef = useRef<User | null>(null);
  const vibeQuestPostIdsRef = useRef<Set<string>>(new Set());

  const socket = useMemo(() => createSocket(), []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STREAK_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StreakState;
        setState((s) => ({ ...s, streak: parsed }));
      }
    } catch {
      // ignore invalid local cache
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BLOCKED_NODES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      if (!Array.isArray(parsed)) return;
      setState((s) => ({ ...s, blockedNodeIds: parsed.filter((v) => typeof v === 'string') }));
    } catch {
      // ignore invalid local cache
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NODE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as NodeProfile;
        const hydrated = applyNodeDecay(parsed);
        setState((s) => ({ ...s, nodeProfile: hydrated }));
      }
    } catch {
      // ignore invalid local cache
    }
  }, []);

  useEffect(() => {
    const user = getOrCreateDeviceUser();
    if (!user) return;
    setState((s) => ({ ...s, currentUser: user, socket }));
    if (socket.connected) socket.emit('user:join', { userId: user.id, username: user.username });
  }, [socket]);

  const persistStreak = useCallback((next: StreakState) => {
    localStorage.setItem(STREAK_KEY, JSON.stringify(next));
  }, []);

  const persistNode = useCallback((next: NodeProfile) => {
    localStorage.setItem(NODE_KEY, JSON.stringify(next));
  }, []);

  const grantNodeReward = useCallback(
    (xpGain: number, energyGain: number) => {
      setState((s) => {
        if (!s.currentUser) return s;
        const base: NodeProfile =
          s.nodeProfile ?? {
            nodeId: makeNodeId(),
            displayName: s.currentUser.username,
            xp: 0,
            level: 1,
            energy: 70,
            lastSeenAt: Date.now(),
            lastDailyClaimDate: null,
          };
        const next = applyNodeReward(base, s.currentUser.username, xpGain, energyGain);
        persistNode(next);
        return { ...s, nodeProfile: next };
      });
    },
    [persistNode],
  );

  const markStreakAction = useCallback(
    (action: 'witness' | 'handoff' | 'room') => {
      setState((s) => {
        const date = todayKey();
        let streak = s.streak;
        if (!isSameDate(streak.lastCompletedDate, date) && streak.lastCompletedDate !== null) {
          streak = { ...streak, today: { witness: false, handoff: false, room: false } };
        }
        const today = { ...streak.today, [action]: true };
        let current = streak.current;
        let best = streak.best;
        let lastCompletedDate = streak.lastCompletedDate;
        if (today.witness && today.handoff && today.room && !isSameDate(streak.lastCompletedDate, date)) {
          current += 1;
          best = Math.max(best, current);
          lastCompletedDate = date;
        }
        const next = { current, best, lastCompletedDate, today };
        persistStreak(next);
        return { ...s, streak: next };
      });
    },
    [persistStreak],
  );

  useEffect(() => {
    socket.on('connect', () => {
      setState((s) => ({ ...s, connected: true }));
      const user = currentUserRef.current;
      if (user) {
        socket.emit('user:join', { userId: user.id, username: user.username });
      }
    });
    socket.on('disconnect', () => setState((s) => ({ ...s, connected: false })));
    socket.on('user:list', (users: User[]) => setState((s) => ({ ...s, users })));
    socket.on('message:new', (msg: Message) =>
      setState((s) => ({
        ...s,
        messagesByRoom: {
          ...s.messagesByRoom,
          [msg.roomId]: [...(s.messagesByRoom[msg.roomId] ?? []), msg],
        },
      }))
    );
    socket.on('room:invite', ({ roomId }: { roomId: string }) => {
      socket.emit('room:join', roomId);
    });
    socket.on('room:joined', ({ room, messages }: { room: Room; messages: Message[] }) => {
      setState((s) => ({
        ...s,
        rooms: s.rooms.some((r) => r.id === room.id) ? s.rooms : [...s.rooms, room],
        messagesByRoom: { ...s.messagesByRoom, [room.id]: messages },
        activeRoom: room,
      }));
    });
    socket.on('room:user_joined', ({ roomId }: { roomId: string }) => {
      setState((s) => (s.activeRoom?.id === roomId ? s : s));
    });
    socket.on('room:typing', (payload: { roomId: string; userId: string; username: string; isTyping: boolean; at: number }) => {
      setState((s) => ({
        ...s,
        typingByRoom: {
          ...s.typingByRoom,
          [payload.roomId]: payload.isTyping ? payload : undefined,
        },
      }));
    });
    socket.on('room:seen', (payload: { roomId: string; userId: string; messageId: string; at: number }) => {
      setState((s) => ({
        ...s,
        seenByRoom: {
          ...s.seenByRoom,
          [payload.roomId]: payload,
        },
      }));
    });
    socket.on('wall:new', (post: FreedomPost) => {
      const normalized = { ...post, vibeCounts: { ...EMPTY_VIBE_COUNTS, ...(post.vibeCounts ?? {}) } };
      setState((s) => {
        if (s.blockedNodeIds.includes(normalized.userId)) return s;
        return { ...s, freedomPosts: [normalized, ...s.freedomPosts].slice(0, 250) };
      });
    });
    socket.on('wall:snapshot', (posts: FreedomPost[]) => {
      const normalized = posts
        .map((post) => ({ ...post, vibeCounts: { ...EMPTY_VIBE_COUNTS, ...(post.vibeCounts ?? {}) } }))
        .filter((post) => !state.blockedNodeIds.includes(post.userId))
        .slice(0, 250);
      setState((s) => ({ ...s, freedomPosts: normalized }));
    });
    socket.on('wall:update', (payload: { postId: string; currentOwnerUserId: string; pulseCount: number; viewerIds: string[]; vibeCounts?: Record<WallVibe, number>; firstWitnessUserId?: string }) => {
      setState((s) => ({
        ...s,
        freedomPosts: s.freedomPosts.map((post) =>
          post.id === payload.postId
            ? {
                ...post,
                currentOwnerUserId: payload.currentOwnerUserId,
                pulseCount: payload.pulseCount,
                viewerIds: payload.viewerIds,
                vibeCounts: payload.vibeCounts ? { ...EMPTY_VIBE_COUNTS, ...payload.vibeCounts } : post.vibeCounts,
                firstWitnessUserId: payload.firstWitnessUserId ?? post.firstWitnessUserId,
              }
            : post
        ),
      }));
    });
    socket.on('wall:pulse:leaderboard', (scores: PulseScore[]) => {
      setState((s) => ({ ...s, pulseLeaderboard: scores }));
    });
    socket.on('wall:handoff', (payload: { toUserId: string }) => {
      if (currentUserRef.current?.id === payload.toUserId) markStreakAction('handoff');
    });
    socket.on('wall:drop', (drop: DropEvent | null) => {
      setState((s) => ({ ...s, activeDrop: drop }));
    });
    socket.on('wall:spotlight', (list: CreatorSpotlight[]) => {
      setState((s) => ({ ...s, creatorSpotlight: list }));
    });
    socket.on('wall:remove', ({ postId }: { postId: string }) => {
      setState((s) => ({ ...s, freedomPosts: s.freedomPosts.filter((p) => p.id !== postId) }));
    });
    socket.on('confession:snapshot', (items: Confession[]) => {
      setState((s) => ({ ...s, confessions: items.filter((c) => !s.blockedNodeIds.includes(c.userId)).slice(0, 300) }));
    });
    socket.on('confession:new', (item: Confession) => {
      setState((s) => {
        if (s.blockedNodeIds.includes(item.userId)) return s;
        return { ...s, confessions: [item, ...s.confessions].slice(0, 300) };
      });
    });
    socket.on('confession:update', (item: Confession) => {
      setState((s) => ({
        ...s,
        confessions: s.confessions.map((c) => (c.id === item.id ? item : c)),
      }));
    });
    socket.on('confession:remove', ({ confessionId }: { confessionId: string }) => {
      setState((s) => ({ ...s, confessions: s.confessions.filter((c) => c.id !== confessionId) }));
    });
    socket.on('hunt:snapshot', (payload: { zones: AuraZone[]; points: number }) => {
      setState((s) => ({ ...s, auraZones: payload.zones, auraPoints: payload.points }));
    });
    socket.on('hunt:points', (payload: { points: number }) => {
      setState((s) => ({ ...s, auraPoints: payload.points }));
    });
    socket.on('hunt:update', (payload: { zones: AuraZone[] }) => {
      setState((s) => ({ ...s, auraZones: payload.zones }));
    });
    socket.on('hunt:borrow:incoming', (req: BorrowRequest) => {
      setState((s) => ({ ...s, incomingBorrowRequests: [req, ...s.incomingBorrowRequests].slice(0, 25) }));
    });
    socket.on('hunt:borrow:result', (payload: { zoneId: string; requesterId: string; approved: boolean }) => {
      setState((s) => ({
        ...s,
        incomingBorrowRequests: s.incomingBorrowRequests.filter(
          (r) => !(r.zoneId === payload.zoneId && r.fromUserId === payload.requesterId),
        ),
      }));
    });
    socket.on('hunt:presence', (payload: { nearbyUsers: NearbyHunter[]; sharing: boolean; runningZoneId: string | null }) => {
      setState((s) => ({
        ...s,
        nearbyHunters: payload.nearbyUsers,
        huntSharing: payload.sharing,
        runningZoneId: payload.runningZoneId,
      }));
    });
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('user:list');
      socket.off('message:new');
      socket.off('room:invite');
      socket.off('room:joined');
      socket.off('room:user_joined');
      socket.off('room:typing');
      socket.off('room:seen');
      socket.off('wall:new');
      socket.off('wall:snapshot');
      socket.off('wall:update');
      socket.off('wall:pulse:leaderboard');
      socket.off('wall:handoff');
      socket.off('wall:drop');
      socket.off('wall:spotlight');
      socket.off('wall:remove');
      socket.off('confession:snapshot');
      socket.off('confession:new');
      socket.off('confession:update');
      socket.off('confession:remove');
      socket.off('hunt:snapshot');
      socket.off('hunt:points');
      socket.off('hunt:update');
      socket.off('hunt:borrow:incoming');
      socket.off('hunt:borrow:result');
      socket.off('hunt:presence');
    };
  }, [socket, markStreakAction, state.blockedNodeIds]);

  useEffect(() => {
    currentUserRef.current = state.currentUser;
  }, [state.currentUser]);

  const login = useCallback(
    (username: string) => {
      // Keep compatibility with explicit rename, but identity stays device-based.
      const base = getOrCreateDeviceUser();
      if (!base) return;
      const user: User = { id: base.id, username: username || base.username };
      if (!socket.connected) socket.connect();
      socket.emit('user:join', { userId: user.id, username: user.username });
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      setState((s) => {
        const base: NodeProfile =
          s.nodeProfile ?? {
            nodeId: makeNodeId(),
            displayName: username,
            xp: 0,
            level: 1,
            energy: 70,
            lastSeenAt: Date.now(),
            lastDailyClaimDate: null,
          };
        const nextNode = applyNodeDecay({ ...base, displayName: username });
        persistNode(nextNode);
        return { ...s, currentUser: user, socket, nodeProfile: nextNode };
      });
    },
    [socket, persistNode]
  );

  const logout = useCallback(() => {
    // Reset only transient state and create a fresh anonymous device handle.
    const fresh = createDeviceIdentity();
    setState({ ...defaultState, currentUser: fresh });
    socket.disconnect();
    socket.connect();
    socket.emit('user:join', { userId: fresh.id, username: fresh.username });
  }, [socket]);

  const selectRoom = useCallback((room: Room | null) => {
    setState((s) => ({ ...s, activeRoom: room }));
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (!state.activeRoom || !text.trim()) return;
      socket.emit('message:send', { roomId: state.activeRoom.id, text: text.trim() });
      markStreakAction('room');
      grantNodeReward(4, 2);
    },
    [socket, state.activeRoom, markStreakAction, grantNodeReward]
  );

  const messages = state.activeRoom ? (state.messagesByRoom[state.activeRoom.id] ?? []) : [];

  const startChat = useCallback(
    (peerId: string) => {
      if (!state.currentUser) return;
      socket.emit('room:create', { userId: state.currentUser.id, peerId });
      socket.once('room:created', ({ roomId }: { roomId: string }) => {
        socket.emit('room:join', roomId);
      });
    },
    [socket, state.currentUser]
  );

  const postFreedom = useCallback(
    (payload: { text?: string; imageDataUrl?: string; videoDataUrl?: string; isAnonymous?: boolean; parentPostId?: string; tag?: WallTag }) => {
      const text = payload.text?.trim();
      const imageDataUrl = payload.imageDataUrl;
      const videoDataUrl = payload.videoDataUrl;
      if (!text && !imageDataUrl && !videoDataUrl) return;
      if (payload.parentPostId) {
        socket.emit('wall:extend', { parentPostId: payload.parentPostId, text, imageDataUrl, videoDataUrl, isAnonymous: !!payload.isAnonymous, tag: payload.tag });
      } else {
        socket.emit('wall:post', { text, imageDataUrl, videoDataUrl, isAnonymous: !!payload.isAnonymous, tag: payload.tag });
      }
      setState((s) => ({
        ...s,
        questProgress: { ...s.questProgress, postsCount: s.questProgress.postsCount + 1 },
      }));
      grantNodeReward(12, 8);
    },
    [socket, grantNodeReward]
  );

  const removeFreedomPost = useCallback(
    (postId: string) => {
      socket.emit('wall:remove', { postId });
    },
    [socket]
  );

  const viewFreedomPost = useCallback(
    (postId: string) => {
      socket.emit('wall:view', { postId });
      setState((s) => ({
        ...s,
        questProgress: { ...s.questProgress, witnessCount: s.questProgress.witnessCount + 1 },
      }));
      markStreakAction('witness');
      grantNodeReward(6, 4);
    },
    [socket, markStreakAction, grantNodeReward]
  );

  const reactToFreedomPost = useCallback(
    (postId: string, vibe: WallVibe) => {
      socket.emit('wall:vibe:add', { postId, vibe });
      const isFirstVibeOnPost = !vibeQuestPostIdsRef.current.has(postId);
      if (isFirstVibeOnPost) {
        vibeQuestPostIdsRef.current.add(postId);
        setState((s) => ({
          ...s,
          questProgress: { ...s.questProgress, vibesCount: s.questProgress.vibesCount + 1 },
        }));
        // Prevent XP farming by reaction switching on the same post.
        grantNodeReward(3, 2);
      }
    },
    [socket, grantNodeReward]
  );

  const postConfession = useCallback(
    (text: string, isAnonymous: boolean) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      socket.emit('confession:post', { text: cleaned, isAnonymous });
      grantNodeReward(8, 5);
    },
    [socket, grantNodeReward]
  );

  const replyConfession = useCallback(
    (confessionId: string, text: string) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      socket.emit('confession:reply', { confessionId, text: cleaned });
      grantNodeReward(4, 3);
    },
    [socket, grantNodeReward]
  );

  const claimDailyNodeCharge = useCallback(() => {
    setState((s) => {
      if (!s.currentUser) return s;
      const date = todayKey();
      const base: NodeProfile =
        s.nodeProfile ?? {
          nodeId: makeNodeId(),
          displayName: s.currentUser.username,
          xp: 0,
          level: 1,
          energy: 70,
          lastSeenAt: Date.now(),
          lastDailyClaimDate: null,
        };
      if (base.lastDailyClaimDate === date) return s;
      const rewarded = applyNodeReward(base, s.currentUser.username, 25, 30);
      const next = { ...rewarded, lastDailyClaimDate: date };
      persistNode(next);
      return { ...s, nodeProfile: next };
    });
  }, [persistNode]);

  const removeConfession = useCallback(
    (confessionId: string) => {
      socket.emit('confession:remove', { confessionId });
    },
    [socket]
  );

  const toggleBlockNode = useCallback(
    (targetUserId: string) => {
      if (!targetUserId) return;
      setState((s) => {
        if (!s.currentUser || s.currentUser.id === targetUserId) return s;
        const nextSet = new Set(s.blockedNodeIds);
        const willBlock = !nextSet.has(targetUserId);
        if (willBlock) nextSet.add(targetUserId);
        else nextSet.delete(targetUserId);
        const next = Array.from(nextSet);
        localStorage.setItem(BLOCKED_NODES_KEY, JSON.stringify(next));
        socket.emit('user:block', { targetUserId, blocked: willBlock });
        return {
          ...s,
          blockedNodeIds: next,
          confessions: s.confessions.filter((c) => !nextSet.has(c.userId)),
          freedomPosts: s.freedomPosts.filter((p) => !nextSet.has(p.userId)),
        };
      });
    },
    [socket],
  );

  const reportFreedomPost = useCallback(
    (postId: string, reason = 'unsafe') => {
      if (!postId) return;
      socket.emit('wall:report', { postId, reason });
    },
    [socket],
  );

  const setBorrowRequestsEnabled = useCallback(
    (enabled: boolean) => {
      socket.emit('hunt:borrow:toggle', { enabled: !!enabled });
    },
    [socket],
  );

  const claimAuraZone = useCallback(
    (zoneId: string, lat: number, lng: number) => {
      socket.emit('hunt:claim', { zoneId, lat, lng });
    },
    [socket],
  );

  const requestBorrowAura = useCallback(
    (zoneId: string, lat: number, lng: number) => {
      socket.emit('hunt:borrow:request', { zoneId, lat, lng });
    },
    [socket],
  );

  const respondBorrowAura = useCallback(
    (zoneId: string, requesterId: string, approve: boolean) => {
      socket.emit('hunt:borrow:respond', { zoneId, requesterId, approve });
      setState((s) => ({
        ...s,
        incomingBorrowRequests: s.incomingBorrowRequests.filter(
          (r) => !(r.zoneId === zoneId && r.fromUserId === requesterId),
        ),
      }));
    },
    [socket],
  );

  const updateHuntPresence = useCallback(
    (lat: number, lng: number, shareNearby: boolean) => {
      socket.emit('hunt:presence:update', { lat, lng, shareNearby });
    },
    [socket],
  );

  const startAuraRun = useCallback(
    (zoneId: string, lat: number, lng: number) => {
      socket.emit('hunt:run:start', { zoneId, lat, lng });
    },
    [socket],
  );

  const stopAuraRun = useCallback(
    (lat: number, lng: number) => {
      socket.emit('hunt:run:stop', { lat, lng });
    },
    [socket],
  );

  const setTyping = useCallback(
    (roomId: string, isTyping: boolean) => {
      socket.emit('room:typing', { roomId, isTyping });
    },
    [socket],
  );

  const markRoomSeen = useCallback(
    (roomId: string, messageId: string) => {
      socket.emit('room:seen', { roomId, messageId });
    },
    [socket],
  );

  const setIncomingCall = useCallback((incomingCall: AppState['incomingCall']) => {
    setState((s) => ({ ...s, incomingCall }));
  }, []);

  const setActiveCall = useCallback((activeCall: AppState['activeCall']) => {
    setState((s) => ({ ...s, activeCall }));
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      messages,
      socket,
      login,
      logout,
      selectRoom,
      sendMessage,
      startChat,
      postFreedom,
      viewFreedomPost,
      reactToFreedomPost,
      claimDailyNodeCharge,
      postConfession,
      replyConfession,
      removeConfession,
      toggleBlockNode,
      reportFreedomPost,
      setBorrowRequestsEnabled,
      claimAuraZone,
      requestBorrowAura,
      respondBorrowAura,
      updateHuntPresence,
      startAuraRun,
      stopAuraRun,
      setTyping,
      markRoomSeen,
      removeFreedomPost,
      setIncomingCall,
      setActiveCall,
    }),
    [state, messages, socket, login, logout, selectRoom, sendMessage, startChat, postFreedom, viewFreedomPost, reactToFreedomPost, claimDailyNodeCharge, postConfession, replyConfession, removeConfession, toggleBlockNode, reportFreedomPost, setBorrowRequestsEnabled, claimAuraZone, requestBorrowAura, respondBorrowAura, updateHuntPresence, startAuraRun, stopAuraRun, setTyping, markRoomSeen, removeFreedomPost, setIncomingCall, setActiveCall]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
