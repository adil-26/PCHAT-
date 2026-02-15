# PULSELY

PULSELY is a **real-time social network + messenger** focused on speed, freedom, and temporary live experiences.

It combines:
- direct chat
- audio/video calling
- a Freedom Wall (ephemeral sharing)
- confessions
- Aura Hunt (location-based loot + live run presence)

No signup/password flow is required. A user is represented as a **device node**.

## Purpose

Most social apps are permanent, profile-heavy, and algorithm-first.

PULSELY is built as a different model:
- **live-first** interaction
- **low-friction identity** (device node)
- **ephemeral social content**
- **real-time ownership transfer and collaboration mechanics**

The goal is to make social interaction feel immediate and participatory instead of static.

## What Makes It Unique

- **Node Identity (no password login):** user identity is generated from device storage.
- **Freedom Wall:** posts can be text/image/video and are handled in real-time.
- **Pulse / ownership mechanics:** engagement changes post state in live sessions.
- **Anonymous mode with hidden reputation signals.**
- **Confessions stream:** lightweight anonymous-style sharing.
- **Aura Hunt:** nearby user clusters can spawn loot zones; users can run, claim, borrow.
- **Real-time chat + call stack:** Socket.io + WebRTC.

## How It Works Without a Database

Current architecture uses **in-memory server state** plus **small local device persistence**.

### In-memory (server)
The backend keeps active data in Maps while the service is running, such as:
- online users
- rooms
- messages in active rooms
- wall posts + pulse/vibe state
- hunt zones and live presence

This means:
- data is fast for real-time interaction
- data resets when server restarts/redeploys
- no long-term persistence by default

### Local device storage (client)
Client keeps local state for node/session behavior (for example device-based identity, streak/profile caches).

This means:
- user returns as same node on same device/browser storage
- no central user/password table is required

## Node Concept (How Nodes Connect)

A **node** = one device/browser identity.

Flow:
1. App opens.
2. If no saved identity exists, a device ID is generated.
3. Client emits `user:join` via Socket.io.
4. Server tracks that node as online and broadcasts presence.
5. Nodes can then open chat, call, wall, confessions, and hunt interactions in real time.

So node connection is simply:
- **Socket connection + device identity + live presence events**.

## Core Features

### 1. Chat Ops
- 1:1 room-based messaging
- typing indicator
- delivered/seen indicators
- custom scrollable chat UI for desktop/mobile

### 2. Calls
- WebRTC audio/video calling
- signaling over Socket.io
- TURN/STUN compatible for internet deployment

### 3. Freedom Wall
- text/image/video posting
- pulse and interaction mechanics
- anonymous posting option (with hidden reputation logic)
- designed for ephemeral, no-DB style interaction

### 4. Confessions
- quick confession feed
- anonymous option
- live updates

### 5. Aura Hunt
- location-based loot zones
- 4km interaction model
- run mode + nearby presence bands
- dynamic loot spawn when nearby user clusters form
- borrow/request interaction model on claimed loot

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Framer Motion
- **Backend:** Node.js, Express, Socket.io
- **Calling:** WebRTC
- **Realtime Transport:** Socket.io

## Project Structure

```text
PCHAT--main/
  client/
    src/
      components/
      context/
      hooks/
      lib/
      types.ts
  server/
    src/
      index.ts
      socket.ts
  README.md
```

## Local Development

### Prerequisites
- Node.js 18+
- npm

### Run backend

```bash
cd server
npm install
npm run dev
```

Default: `http://localhost:3001`

### Run frontend

```bash
cd client
npm install
npm run dev
```

Default: `http://localhost:5173`

## Production Hosting

### Recommended split
- **Frontend:** Render Static Site / Vercel
- **Backend (Socket/WebRTC signaling):** Render Web Service / Railway / similar always-on node host

### Important
WebRTC over internet usually needs TURN for reliable NAT traversal.
Use provider credentials in backend env and expose endpoint/config to client.

## Health Check

`GET /api/health`

## Main Socket Events (High-level)

- user/session: `user:join`, `user:list`
- chat: `room:create`, `room:join`, `message:send`, `message:new`, `room:typing`, `room:seen`
- call: `call:request`, `call:accept`, `call:signal`, `call:reject`, `call:end`
- wall/confession/hunt: multiple live events handled in `server/src/socket.ts`

## Current Limitations

Because there is no persistent DB by design:
- server restart clears in-memory room/wall/hunt state
- no historical guaranteed message storage
- no account/password recovery model

If you want durable data later, add PostgreSQL/Mongo/Redis and persist selected modules.

## License

MIT

