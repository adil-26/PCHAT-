import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { registerSocketHandlers } from './socket.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true },
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
