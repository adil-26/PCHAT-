import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { registerSocketHandlers } from './socket.js';

const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = [FRONTEND_URL, 'http://localhost:5173'];
const isAllowedOrigin = (origin?: string) => !origin || allowedOrigins.includes(origin);

app.use(
  cors({
    origin(origin, callback) {
      callback(isAllowedOrigin(origin) ? null : new Error('Not allowed by CORS'), true);
    },
    credentials: true,
  }),
);
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      callback(isAllowedOrigin(origin) ? null : new Error('Not allowed by CORS'), true);
    },
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// In-memory store (use a DB in production)
export const users = new Map<string, { id: string; username: string; socketId: string }>();
export const rooms = new Map<string, { id: string; name: string; participantIds: string[] }>();
export const messagesByRoom = new Map<string, Array<{ id: string; roomId: string; userId: string; username: string; text: string; at: number }>>();

app.get('/api/health', (_, res) => res.json({ ok: true }));

registerSocketHandlers(io);

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
