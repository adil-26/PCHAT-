import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';

const defaultIceServers: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const getTurnCredentialsUrl = () => {
  const explicit = import.meta.env.VITE_TURN_CREDENTIALS_URL ?? '';
  if (explicit) return explicit;
  const wsBase = (import.meta.env.VITE_WS_URL ?? '').replace(/\/+$/, '');
  if (wsBase) return `${wsBase}/api/turn-credentials`;
  return '/api/turn-credentials';
};

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}

type CallContextValue = {
  startCall: (toUserId: string, type: 'audio' | 'video') => Promise<void>;
  acceptCall: (fromUserId: string, type: 'audio' | 'video') => Promise<void>;
  rejectCall: (fromUserId: string) => void;
  endCall: (peerUserId: string) => void;
  localStreamRef: React.MutableRefObject<MediaStream | null>;
  remoteStreamRef: React.MutableRefObject<MediaStream | null>;
  remoteStream: MediaStream | null;
  cleanup: () => void;
};

const CallContext = createContext<CallContextValue | null>(null);

function useProvideCall(): CallContextValue {
  const { socket, currentUser, setIncomingCall, setActiveCall } = useApp();
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const signalHandlerRef = useRef<((payload: { fromUserId: string; signal: { type: string; data: unknown } }) => void) | null>(null);
  const pendingSignalsRef = useRef<Array<{ fromUserId: string; signal: { type: string; data: unknown } }>>([]);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const isHandlingOfferRef = useRef(false);
  const iceServersRef = useRef<RTCIceServer[] | null>(null);

  const getIceServers = useCallback(async (): Promise<RTCIceServer[]> => {
    if (iceServersRef.current) return iceServersRef.current;
    const raw = import.meta.env.VITE_ICE_SERVERS;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as RTCIceServer[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          iceServersRef.current = parsed;
          return parsed;
        }
      } catch {
        console.warn('Invalid VITE_ICE_SERVERS JSON; falling back to TURN credentials endpoint.');
      }
    }

    try {
      const response = await fetch(getTurnCredentialsUrl());
      if (!response.ok) throw new Error(`TURN endpoint failed with ${response.status}`);
      const payload = await response.json() as { iceServers?: RTCIceServer[] };
      if (Array.isArray(payload.iceServers) && payload.iceServers.length > 0) {
        iceServersRef.current = payload.iceServers;
        return payload.iceServers;
      }
    } catch (error) {
      console.warn('Using default STUN servers because TURN credentials are unavailable.', error);
    }

    iceServersRef.current = defaultIceServers;
    return defaultIceServers;
  }, []);

  const setSignalHandler = useCallback((handler: ((payload: { fromUserId: string; signal: { type: string; data: unknown } }) => void) | null) => {
    signalHandlerRef.current = handler;
    if (!handler) return;
    const queued = pendingSignalsRef.current.splice(0);
    queued.forEach((payload) => handler(payload));
  }, []);

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingOfferRef.current = null;
    pendingSignalsRef.current = [];
    isHandlingOfferRef.current = false;
    setRemoteStream(null);
    pcRef.current?.close();
    pcRef.current = null;
    setActiveCall(null);
    setSignalHandler(null);
  }, [setActiveCall, setSignalHandler]);

  useEffect(() => {
    if (!socket) return;
    socket.on('call:incoming', (payload: { fromUserId: string; fromUsername: string; type: 'audio' | 'video' }) => {
      setIncomingCall({
        fromUserId: payload.fromUserId,
        fromUsername: payload.fromUsername,
        type: payload.type,
      });
    });
    socket.on('call:rejected', () => {
      setIncomingCall(null);
      cleanup();
    });
    socket.on('call:ended', () => {
      setIncomingCall(null);
      cleanup();
    });
    socket.on('call:signal', (payload: { fromUserId: string; signal: { type: string; data: unknown } }) => {
      if (signalHandlerRef.current) {
        signalHandlerRef.current(payload);
      } else {
        pendingSignalsRef.current.push(payload);
      }
    });
    return () => {
      socket.off('call:incoming');
      socket.off('call:rejected');
      socket.off('call:ended');
      socket.off('call:signal');
    };
  }, [socket, setIncomingCall, cleanup]);

  const createPeerConnection = useCallback(
    async (toUserId: string) => {
      const iceServers = await getIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      pc.ontrack = (e) => {
        if (e.streams[0]) {
          remoteStreamRef.current = e.streams[0];
          setRemoteStream(e.streams[0]);
        }
      };
      pc.onicecandidate = (e) => {
        if (e.candidate)
          socket?.emit('call:signal', { toUserId, signal: { type: 'ice', data: e.candidate.toJSON() } });
      };
      return pc;
    },
    [socket, getIceServers]
  );

  const getLocalStream = useCallback(async (type: 'audio' | 'video') => {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
    } catch (err) {
      if (
        type === 'video' &&
        err instanceof DOMException &&
        (err.name === 'NotReadableError' || err.name === 'AbortError')
      ) {
        console.warn('Camera unavailable, falling back to audio-only call.', err);
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      throw err;
    }
  }, []);

  const startCall = useCallback(
    async (toUserId: string, type: 'audio' | 'video') => {
      if (!currentUser || !socket) return;
      try {
        const stream = await getLocalStream(type);
        const negotiatedType: 'audio' | 'video' = stream.getVideoTracks().length > 0 ? 'video' : 'audio';
        localStreamRef.current = stream;
        const pc = await createPeerConnection(toUserId);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        pendingOfferRef.current = offer;
        socket.emit('call:request', { toUserId, type: negotiatedType });
        socket.emit('call:signal', { toUserId, signal: { type: 'offer', data: offer } });
        setActiveCall({ peerUserId: toUserId, type: negotiatedType });

        const onAccepted = () => {
          const offer = pendingOfferRef.current;
          if (offer) socket.emit('call:signal', { toUserId, signal: { type: 'offer', data: offer } });
        };
        socket.once('call:accepted', onAccepted);

        setSignalHandler(async (payload: { fromUserId: string; signal: { type: string; data: unknown } }) => {
          if (payload.fromUserId !== toUserId || !pcRef.current) return;
          const { type: sigType, data } = payload.signal;
          if (sigType === 'answer') {
            if (pcRef.current.signalingState !== 'have-local-offer') return;
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
          } else if (sigType === 'ice') {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit)).catch(() => {});
          }
        });
      } catch (err) {
        console.error('Start call failed', err);
        cleanup();
      }
    },
    [currentUser, socket, createPeerConnection, setActiveCall, cleanup, getLocalStream, setSignalHandler]
  );

  const acceptCall = useCallback(
    async (fromUserId: string, type: 'audio' | 'video') => {
      if (!socket) return;
      setIncomingCall(null);
      socket.emit('call:accept', { callerUserId: fromUserId });
      try {
        const stream = await getLocalStream(type);
        const negotiatedType: 'audio' | 'video' = stream.getVideoTracks().length > 0 ? 'video' : 'audio';
        localStreamRef.current = stream;
        const pc = await createPeerConnection(fromUserId);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        setSignalHandler(async (payload: { fromUserId: string; signal: { type: string; data: unknown } }) => {
          if (payload.fromUserId !== fromUserId || !pcRef.current) return;
          const pc = pcRef.current;
          const { type: sigType, data } = payload.signal;
          if (sigType === 'offer') {
            if (isHandlingOfferRef.current) return;
            isHandlingOfferRef.current = true;
            // Ignore duplicate offer packets once a call is already established.
            try {
              if (pc.currentRemoteDescription && pc.signalingState === 'stable') return;
              await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
              if (pc.signalingState !== 'have-remote-offer') return;
              const answer = await pc.createAnswer();
              if (pc.signalingState !== 'have-remote-offer') return;
              await pc.setLocalDescription(answer);
              socket.emit('call:signal', { toUserId: fromUserId, signal: { type: 'answer', data: answer } });
            } finally {
              isHandlingOfferRef.current = false;
            }
          } else if (sigType === 'ice') {
            await pc.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit)).catch(() => {});
          }
        });
        setActiveCall({ peerUserId: fromUserId, type: negotiatedType });
      } catch (err) {
        console.error('Accept call failed', err);
        cleanup();
      }
    },
    [socket, createPeerConnection, setIncomingCall, setActiveCall, cleanup, getLocalStream, setSignalHandler]
  );

  const rejectCall = useCallback(
    (fromUserId: string) => {
      socket?.emit('call:reject', { fromUserId });
      setIncomingCall(null);
    },
    [socket, setIncomingCall]
  );

  const endCall = useCallback(
    (peerUserId: string) => {
      socket?.emit('call:end', { toUserId: peerUserId });
      cleanup();
    },
    [socket, cleanup]
  );

  return useMemo(
    () => ({
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      localStreamRef,
      remoteStreamRef,
      remoteStream,
      cleanup,
    }),
    [startCall, acceptCall, rejectCall, endCall, remoteStream, cleanup]
  );
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const value = useProvideCall();
  return React.createElement(CallContext.Provider, { value }, children);
}
