import { Server, Socket } from 'socket.io';
import { v4 as uuid } from 'uuid';
import { users, rooms, messagesByRoom } from './index.js';

export function registerSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    socket.on('user:join', (payload: { userId: string; username: string }) => {
      const { userId, username } = payload;
      users.set(userId, { id: userId, username, socketId: socket.id });
      socket.data.userId = userId;
      socket.data.username = username;
      socket.broadcast.emit('user:online', { userId, username });
      io.emit('user:list', Array.from(users.values()).map((u) => ({ id: u.id, username: u.username })));
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

    socket.on('disconnect', () => {
      const userId = socket.data.userId;
      if (userId) {
        users.delete(userId);
        socket.broadcast.emit('user:offline', { userId });
        io.emit('user:list', Array.from(users.values()).map((u) => ({ id: u.id, username: u.username })));
      }
    });
  });
}
