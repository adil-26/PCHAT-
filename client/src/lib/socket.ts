import { io } from 'socket.io-client';

const getSocketUrl = () => {
  const base = import.meta.env.VITE_WS_URL ?? '';
  return base || (window.location.port === '5173' ? 'http://localhost:3001' : window.location.origin);
};

export function createSocket() {
  return io(getSocketUrl(), {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });
}

export type SocketClient = ReturnType<typeof createSocket>;
