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

type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

async function getCloudflareIceServers() {
  const keyId = process.env.CF_TURN_KEY_ID;
  const apiToken = process.env.CF_TURN_API_TOKEN;

  if (!keyId || !apiToken) return null;

  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: 86400 }),
    },
  );

  if (!response.ok) throw new Error(`Cloudflare TURN request failed (${response.status})`);

  const payload = await response.json() as
    | { iceServers?: IceServerConfig[]; result?: { iceServers?: IceServerConfig[] } }
    | undefined;

  const iceServers = payload?.iceServers ?? payload?.result?.iceServers;
  if (!Array.isArray(iceServers) || iceServers.length === 0) {
    throw new Error('Cloudflare TURN response missing iceServers');
  }

  return iceServers;
}

// In-memory store (use a DB in production)
export const users = new Map<string, { id: string; username: string; socketId: string }>();
export const rooms = new Map<string, { id: string; name: string; participantIds: string[] }>();
export const messagesByRoom = new Map<string, Array<{ id: string; roomId: string; userId: string; username: string; text: string; at: number }>>();

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.get('/api/turn-credentials', async (_, res) => {
  try {
    const iceServers = await getCloudflareIceServers();
    if (!iceServers) {
      return res.status(500).json({ ok: false, error: 'TURN env vars are not configured on server' });
    }
    return res.json({ ok: true, iceServers });
  } catch (error) {
    console.error('TURN credential generation failed', error);
    return res.status(502).json({ ok: false, error: 'Failed to generate TURN credentials' });
  }
});

registerSocketHandlers(io);

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
