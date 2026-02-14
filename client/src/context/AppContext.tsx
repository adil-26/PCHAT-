import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createSocket } from '../lib/socket';
import type { SocketClient } from '../lib/socket';
import type { Message, Room, User } from '../types';

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
};

type AppContextValue = Omit<AppState, 'messagesByRoom'> & {
  messages: Message[];
  login: (username: string) => void;
  logout: () => void;
  selectRoom: (room: Room | null) => void;
  sendMessage: (text: string) => void;
  startChat: (peerId: string) => void;
  setIncomingCall: (call: AppState['incomingCall']) => void;
  setActiveCall: (call: AppState['activeCall']) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState);

  const socket = useMemo(() => createSocket(), []);

  useEffect(() => {
    socket.on('connect', () => setState((s) => ({ ...s, connected: true })));
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
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('user:list');
      socket.off('message:new');
      socket.off('room:invite');
      socket.off('room:joined');
      socket.off('room:user_joined');
    };
  }, [socket]);

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
    },
    [socket, state.activeRoom]
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
      setIncomingCall,
      setActiveCall,
    }),
    [state, messages, socket, login, logout, selectRoom, sendMessage, startChat, setIncomingCall, setActiveCall]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
