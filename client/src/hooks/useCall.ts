import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';

const iceServers: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useCall() {
  const { socket, currentUser, setIncomingCall, setActiveCall } = useApp();
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const signalHandlerRef = useRef<((payload: { fromUserId: string; signal: { type: string; data: unknown } }) => void) | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setRemoteStream(null);
    pcRef.current?.close();
    pcRef.current = null;
    setActiveCall(null);
    signalHandlerRef.current = null;
  }, [setActiveCall]);

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
      signalHandlerRef.current?.(payload);
    });
    return () => {
      socket.off('call:incoming');
      socket.off('call:rejected');
      socket.off('call:ended');
      socket.off('call:signal');
    };
  }, [socket, setIncomingCall, cleanup]);

  const createPeerConnection = useCallback(
    (toUserId: string) => {
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
    [socket]
  );

  const startCall = useCallback(
    async (toUserId: string, type: 'audio' | 'video') => {
      if (!currentUser || !socket) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
        localStreamRef.current = stream;
        const pc = createPeerConnection(toUserId);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        pendingOfferRef.current = offer;
        socket.emit('call:request', { toUserId, type });
        socket.emit('call:signal', { toUserId, signal: { type: 'offer', data: offer } });
        setActiveCall({ peerUserId: toUserId, type });

        const onAccepted = () => {
          const offer = pendingOfferRef.current;
          if (offer) socket.emit('call:signal', { toUserId, signal: { type: 'offer', data: offer } });
        };
        socket.once('call:accepted', onAccepted);

        signalHandlerRef.current = (payload: { fromUserId: string; signal: { type: string; data: unknown } }) => {
          if (payload.fromUserId !== toUserId || !pcRef.current) return;
          const { type: sigType, data } = payload.signal;
          if (sigType === 'answer') {
            pcRef.current.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
          } else if (sigType === 'ice') {
            pcRef.current.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit)).catch(() => {});
          }
        };
      } catch (err) {
        console.error('Start call failed', err);
        cleanup();
      }
    },
    [currentUser, socket, createPeerConnection, setActiveCall, cleanup]
  );

  const acceptCall = useCallback(
    async (fromUserId: string, type: 'audio' | 'video') => {
      if (!socket) return;
      setIncomingCall(null);
      socket.emit('call:accept', { callerUserId: fromUserId });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
        localStreamRef.current = stream;
        const pc = createPeerConnection(fromUserId);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        signalHandlerRef.current = (payload: { fromUserId: string; signal: { type: string; data: unknown } }) => {
          if (payload.fromUserId !== fromUserId || !pcRef.current) return;
          const { type: sigType, data } = payload.signal;
          if (sigType === 'offer') {
            pcRef.current.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit)).then(() => {
              return pcRef.current?.createAnswer();
            }).then((answer) => {
              pcRef.current?.setLocalDescription(answer);
              socket.emit('call:signal', { toUserId: fromUserId, signal: { type: 'answer', data: answer } });
            });
          } else if (sigType === 'ice') {
            pcRef.current.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit)).catch(() => {});
          }
        };
        setActiveCall({ peerUserId: fromUserId, type });
      } catch (err) {
        console.error('Accept call failed', err);
        cleanup();
      }
    },
    [socket, createPeerConnection, setIncomingCall, setActiveCall, cleanup]
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

  return {
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    localStreamRef,
    remoteStreamRef,
    remoteStream,
    cleanup,
  };
}
