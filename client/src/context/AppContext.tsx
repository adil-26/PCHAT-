import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createSocket } from '../lib/socket';
import type { SocketClient } from '../lib/socket';
import type { Confession, CreatorSpotlight, DropEvent, FreedomPost, Message, PulseScore, QuestProgress, Room, StreakState, User } from '../types';

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
};

type AppContextValue = Omit<AppState, 'messagesByRoom'> & {
  messages: Message[];
  login: (username: string) => void;
  logout: () => void;
  selectRoom: (room: Room | null) => void;
  sendMessage: (text: string) => void;
  startChat: (peerId: string) => void;
  postFreedom: (payload: { text?: string; imageDataUrl?: string; videoDataUrl?: string; isAnonymous?: boolean; parentPostId?: string }) => void;
  viewFreedomPost: (postId: string) => void;
  reactToFreedomPost: (postId: string, vibe: 'real' | 'wild' | 'deep' | 'w') => void;
  postConfession: (text: string, isAnonymous: boolean) => void;
  removeConfession: (confessionId: string) => void;
  removeFreedomPost: (postId: string) => void;
  setIncomingCall: (call: AppState['incomingCall']) => void;
  setActiveCall: (call: AppState['activeCall']) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

const STREAK_KEY = 'fchat_streak_v1';
const todayKey = () => new Date().toISOString().slice(0, 10);
const isSameDate = (a: string | null, b: string) => a === b;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState);
  const currentUserRef = useRef<User | null>(null);

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

  const persistStreak = useCallback((next: StreakState) => {
    localStorage.setItem(STREAK_KEY, JSON.stringify(next));
  }, []);

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
    socket.on('wall:new', (post: FreedomPost) => {
      const normalized = { ...post, vibeCounts: post.vibeCounts ?? { real: 0, wild: 0, deep: 0, w: 0 } };
      setState((s) => ({ ...s, freedomPosts: [normalized, ...s.freedomPosts].slice(0, 250) }));
    });
    socket.on('wall:snapshot', (posts: FreedomPost[]) => {
      const normalized = posts
        .map((post) => ({ ...post, vibeCounts: post.vibeCounts ?? { real: 0, wild: 0, deep: 0, w: 0 } }))
        .slice(0, 250);
      setState((s) => ({ ...s, freedomPosts: normalized }));
    });
    socket.on('wall:update', (payload: { postId: string; currentOwnerUserId: string; pulseCount: number; viewerIds: string[]; vibeCounts?: Record<string, number> }) => {
      setState((s) => ({
        ...s,
        freedomPosts: s.freedomPosts.map((post) =>
          post.id === payload.postId
            ? {
                ...post,
                currentOwnerUserId: payload.currentOwnerUserId,
                pulseCount: payload.pulseCount,
                viewerIds: payload.viewerIds,
                vibeCounts: payload.vibeCounts ?? post.vibeCounts,
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
      setState((s) => ({ ...s, confessions: items.slice(0, 300) }));
    });
    socket.on('confession:new', (item: Confession) => {
      setState((s) => ({ ...s, confessions: [item, ...s.confessions].slice(0, 300) }));
    });
    socket.on('confession:remove', ({ confessionId }: { confessionId: string }) => {
      setState((s) => ({ ...s, confessions: s.confessions.filter((c) => c.id !== confessionId) }));
    });
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('user:list');
      socket.off('message:new');
      socket.off('room:invite');
      socket.off('room:joined');
      socket.off('room:user_joined');
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
      socket.off('confession:remove');
    };
  }, [socket, markStreakAction]);

  useEffect(() => {
    currentUserRef.current = state.currentUser;
  }, [state.currentUser]);

  const login = useCallback(
    (username: string) => {
      const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const user: User = { id: userId, username };
      socket.emit('user:join', { userId, username });
      setState((s) => ({ ...s, currentUser: user, socket }));
    },
    [socket]
  );

  const logout = useCallback(() => {
    setState(defaultState);
    socket.disconnect();
  }, [socket]);

  const selectRoom = useCallback((room: Room | null) => {
    setState((s) => ({ ...s, activeRoom: room }));
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (!state.activeRoom || !text.trim()) return;
      socket.emit('message:send', { roomId: state.activeRoom.id, text: text.trim() });
      markStreakAction('room');
    },
    [socket, state.activeRoom, markStreakAction]
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
    (payload: { text?: string; imageDataUrl?: string; videoDataUrl?: string; isAnonymous?: boolean; parentPostId?: string }) => {
      const text = payload.text?.trim();
      const imageDataUrl = payload.imageDataUrl;
      const videoDataUrl = payload.videoDataUrl;
      if (!text && !imageDataUrl && !videoDataUrl) return;
      if (payload.parentPostId) {
        socket.emit('wall:extend', { parentPostId: payload.parentPostId, text, imageDataUrl, videoDataUrl, isAnonymous: !!payload.isAnonymous });
      } else {
        socket.emit('wall:post', { text, imageDataUrl, videoDataUrl, isAnonymous: !!payload.isAnonymous });
      }
      setState((s) => ({
        ...s,
        questProgress: { ...s.questProgress, postsCount: s.questProgress.postsCount + 1 },
      }));
    },
    [socket]
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
    },
    [socket, markStreakAction]
  );

  const reactToFreedomPost = useCallback(
    (postId: string, vibe: 'real' | 'wild' | 'deep' | 'w') => {
      socket.emit('wall:react', { postId, vibe });
      setState((s) => ({
        ...s,
        questProgress: { ...s.questProgress, vibesCount: s.questProgress.vibesCount + 1 },
      }));
    },
    [socket]
  );

  const postConfession = useCallback(
    (text: string, isAnonymous: boolean) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      socket.emit('confession:post', { text: cleaned, isAnonymous });
    },
    [socket]
  );

  const removeConfession = useCallback(
    (confessionId: string) => {
      socket.emit('confession:remove', { confessionId });
    },
    [socket]
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
      postConfession,
      removeConfession,
      removeFreedomPost,
      setIncomingCall,
      setActiveCall,
    }),
    [state, messages, socket, login, logout, selectRoom, sendMessage, startChat, postFreedom, viewFreedomPost, reactToFreedomPost, postConfession, removeConfession, removeFreedomPost, setIncomingCall, setActiveCall]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
