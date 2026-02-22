# PULSELY Product Document (Gen-Z Live Anonymous Platform)

## 1. Product Summary
PULSELY is a real-time, anonymous, ephemeral social platform where users join as device-based **Nodes** (no signup/password), interact through live chat and calls, post in a temporary global stream, share confessions, and participate in location-driven Aura Hunt mechanics.

PULSELY is designed to feel like a **live layer of campus/social energy**, not a permanent profile feed.

## 2. Core Positioning
Traditional social media is profile-heavy, permanent, and algorithm-first.  
PULSELY is live-first, low-friction, and moment-first.

Core promise:
- No profile pressure
- No polished identity requirement
- No permanent memory expectation
- High immediacy and participation
- Anonymous continuity through Node identity

## 3. Target User (Gen-Z)
Primary users:
- College/campus users
- Young users who want spontaneous interaction
- Users tired of "follower/perfection" systems
- Users who prefer vibe/mood expression over status competition

Why Gen-Z fit is strong:
- Fast interaction preference
- Real-time social behavior
- Memetic short-cycle engagement
- Interest in anonymous expression
- Comfort with hybrid digital + in-person interaction loops

## 4. Product Philosophy
- **Live over archived**
- **Mood over metrics**
- **Participation over performance**
- **Identity optional, presence essential**
- **Safety without killing anonymity**

## 5. Core Terms (In-App Glossary)
- **Node**: Your device identity in PULSELY.
- **Pulse**: A live post happening now.
- **Vibe**: A mood reaction (not a like).
- **Freedom Wall / Global Pulse**: Real-time post stream.
- **Confession**: Anonymous short post with replies.
- **Aura**: Temporary activity zone created by system or users.
- **Chain Length**: How many nodes an aura connected.
- **Reset**: Natural state wipe on server restart/expiry model.

## 6. Primary Features

### 6.1 Chat Ops
- 1:1 room-based messaging
- Typing indicator
- Delivered/seen states
- Audio/video call actions
- Local block control on users
- Mobile popup chat mode for better small-screen usability

### 6.2 Calls
- WebRTC audio/video calls
- Socket.io signaling
- TURN/STUN support for internet reliability

### 6.3 Freedom Wall (Global Pulse)
- Post types: text/image/video
- Post tags: `Crush`, `Hostel`, `Exam`, `Drama`, `Placement`
- Vibe reactions: `Calm`, `Chaos`, `Deep`, `Funny`
- Witness action and post interaction mechanics
- No dead-state first impression (demo seed + "Drop First Pulse" flow)
- Global/Nearby filter concept

### 6.4 Confessions
- Anonymous confessions
- Threaded anonymous replies
- 24-hour expiry with visible countdown
- Auto-cleanup of expired confessions
- Lightweight emotional expression channel

### 6.5 Aura Hunt
- System-generated auras in active areas
- Nearby interaction model (radius-based)
- Borrow/request mechanics on claimed aura
- Chain length growth with multi-node interaction
- Story-style aura closure summaries
- Future creator unlock: users place their own aura after milestones

## 7. Onboarding (First-Visit Mandatory)
4-step full-screen onboarding:
1. You are now a Node. (No profiles. No history.)
2. This is the Global Pulse. (Share what is happening right now.)
3. Vibes are live reactions. (Feel the mood, not the metrics.)
4. Auras connect strangers. (Some interactions exist only in the moment.)

Final CTA: **Enter Live Layer**  
Persistence key: `localStorage["pulsely_onboarded"] = "true"`.

## 8. UX and Microcopy System
Tone:
- Minimal
- Mysterious
- Campus secret vibe
- Non-corporate

Examples:
- "No users online" -> "The network is quiet."
- "No live shares yet" -> "Be the first to drop a Pulse."
- "Server restarted" -> "The Reset happened."

Goal:
- Remove sterile UI language
- Build emotional atmosphere and identity

## 9. Engagement Loop (Core Retention Loop)
1. User opens app
2. Sees live activity quickly
3. Drops a pulse or reacts
4. Gets instant feedback (vibes/witness/progress)
5. Sees quest progression and subtle node growth
6. Content expires or reset occurs
7. Returns for next live cycle

This loop replaces vanity loops (followers/likes) with presence loops (moments/mood/connections).

## 10. Quest and Progression Design
Quest examples:
- Witness 5 Pulses
- Post 1 Pulse
- Drop 3 Vibes
- Daily streak

Progression principles:
- Immediate feedback
- Visible progress bars
- Tiny completion bursts
- No heavy grinding
- Encourage interaction, not spam

## 11. Safety and Trust Controls
- Local block node
- Report content action
- Borrow disable option
- Socket event rate limiting (example: 5 messages / 10 seconds)
- Anonymous by default in-app
- Optional real-world reveal by user choice only
- Approximate location over exact doxxing-grade precision

## 12. Architecture Overview
Frontend:
- React
- TypeScript
- Vite
- Framer Motion

Backend:
- Node.js
- Express
- Socket.io

Realtime:
- Socket events for chat, wall, confession, aura
- WebRTC signaling for calls

State:
- In-memory server state (Maps/objects)
- Local device storage for Node/session behavior

No database by default:
- Faster live prototyping
- Naturally ephemeral behavior
- Tradeoff: reset clears active state/history

## 13. Event Model (High-Level)
- User/session: `user:join`, `user:list`
- Chat: `room:create`, `room:join`, `message:send`, `message:new`, `room:typing`, `room:seen`
- Call: `call:request`, `call:accept`, `call:signal`, `call:reject`, `call:end`
- Wall: post/create/update + `wall:vibe:add`
- Confession: create/reply/expire cleanup
- Aura: spawn/claim/borrow/chain updates

## 14. Empty State Strategy
Never show dead space without action.  
If stream is empty:
- Show narrative state
- Show primary CTA (`Drop First Pulse`)
- Show one demo-interactive item
- Preserve momentum from first session

## 15. Mobile and Responsive Strategy
- No cramped split panes on small screens
- Chat opens in dedicated popup/sheet on phones
- Unread badge for incoming messages
- Stream and quests remain readable in single-column flow
- Tap-friendly controls, short labels, clear hierarchy

## 16. Differentiation vs Other Platforms
PULSELY avoids:
- Public follower hierarchy
- Permanent profile archive pressure
- Long-term content optimization culture

PULSELY emphasizes:
- Temporary social energy
- Anonymous yet consistent node presence
- Mood reactions and collaborative proximity mechanics
- In-the-moment participation

## 17. Current Limitations
- Server restart clears in-memory room/wall/hunt/confession state
- No durable historical storage by design
- No account recovery/password model
- Real-world safety requires conservative defaults and moderation controls

## 18. Future Roadmap
- Optional durable modules (Redis/Postgres) for selected features
- Better moderation automation (abuse thresholds)
- Aura creator unlock progression system
- Campus mode and geo-community curation
- Analytics dashboards for retention and loop health
- Architecture and event-sequence diagrams in README/docs

## 19. One-Line Product Definition
**PULSELY is a live anonymous social layer where Nodes share temporary pulses, react through vibes, confess without profile pressure, and connect through real-time aura mechanics that prioritize moment, mood, and participation.**
