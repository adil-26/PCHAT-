# Realtime Messenger

A real-time messaging and calling web app (similar to WhatsApp/Signal) built with **TypeScript**, **React**, **Socket.io**, and **WebRTC**. All communication uses free APIs and tools.

## Features

- **Real-time messaging** – Instant text chat between two users via Socket.io
- **Voice calls** – WebRTC peer-to-peer audio (using free Google STUN)
- **Video calls** – WebRTC peer-to-peer video
- **Animated UI** – Framer Motion for smooth transitions and feedback
- **Online users** – See who’s online and start a chat or call with one click

## Tech Stack

| Layer   | Technology |
|--------|------------|
| Frontend | React 19, TypeScript, Vite, Framer Motion |
| Backend  | Node.js, Express, Socket.io |
| Real-time | Socket.io (messaging + WebRTC signaling) |
| Calling  | WebRTC (P2P, no paid TURN required for same network) |

## Project Structure

```
realtime-messenger/
├── client/          # React + TypeScript frontend
│   ├── src/
│   │   ├── components/   # Login, ChatList, ChatRoom, IncomingCall, ActiveCall
│   │   ├── context/      # AppContext (auth, socket, rooms, messages)
│   │   ├── hooks/        # useCall (WebRTC + signaling)
│   │   └── lib/          # socket.io client
│   └── ...
├── server/          # Node.js + Express + Socket.io backend
│   └── src/
│       ├── index.ts     # HTTP server + Socket.io
│       ├── socket.ts     # Socket events (rooms, messages, call signaling)
│       └── types.ts
└── README.md
```

## Prerequisites

- Node.js 18+
- npm

## Quick Start

### 1. Install dependencies

```bash
# Server
cd server
npm install

# Client (in another terminal)
cd client
npm install
```

### 2. Start the backend

```bash
cd server
npm run dev
```

Server runs at **http://localhost:3001**.

### 3. Start the frontend

```bash
cd client
npm run dev
```

App runs at **http://localhost:5173**. Vite proxies `/api` and `/socket.io` to the server.

### 4. Test with two users

1. Open **http://localhost:5173** in two browser windows (or one normal + one incognito).
2. Enter different names and click **Join** in each.
3. In one window, click the chat icon next to the other user to start a chat.
4. Send messages; they appear in real time in the other window.
5. Use the phone icon for a **voice call** or the video icon for a **video call**. Accept in the other window.

## Environment (optional)

- **Server:** create `server/.env` and set `PORT=3001` if you want a different port.
- **Client:** create `client/.env` and set `VITE_WS_URL=http://localhost:3001` if the backend is not on the same host (e.g. for deployment).
- **Client (recommended for deployed calling):** set `VITE_ICE_SERVERS` as JSON to include TURN in production.

Example:

```env
VITE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:global.relay.metered.ca:80","username":"YOUR_USER","credential":"YOUR_PASS"},{"urls":"turn:global.relay.metered.ca:443?transport=tcp","username":"YOUR_USER","credential":"YOUR_PASS"}]
```

## API Overview

- **REST:** `GET /api/health` – health check.
- **Socket.io events:**
  - `user:join` – register username, get `user:list`
  - `room:create` – create DM room; peer gets `room:invite`
  - `room:join` – join room, get `room:joined` with messages
  - `message:send` – send message; room gets `message:new`
  - `call:request` – start call; peer gets `call:incoming`
  - `call:accept` – accept call; caller gets `call:accepted` and re-sends offer
  - `call:signal` – WebRTC offer/answer/ICE
  - `call:reject` / `call:end` – decline or hang up

## License

MIT.
