import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useCall } from '../hooks/useCall';

interface ActiveCallProps {
  peerUserId: string;
  type: 'audio' | 'video';
}

export function ActiveCall({ peerUserId }: ActiveCallProps) {
  const { endCall, localStreamRef, remoteStream } = useCall();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const stream = localStreamRef.current;
    const el = localVideoRef.current;
    if (stream && el) el.srcObject = stream;
  }, []);

  useEffect(() => {
    const el = remoteVideoRef.current;
    if (remoteStream && el) el.srcObject = remoteStream;
  }, [remoteStream]);

  const peerName = peerUserId.slice(0, 12);

  return (
    <motion.div
      className="active-call-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="active-call-layout">
        <div className="remote-video-wrap">
          <video ref={remoteVideoRef} autoPlay playsInline muted={false} />
          <span className="label">Remote</span>
        </div>
        <div className="local-video-wrap">
          <video ref={localVideoRef} autoPlay playsInline muted />
          <span className="label">You</span>
        </div>
        <div className="call-controls">
          <span className="peer-label">{peerName}</span>
          <motion.button
            type="button"
            className="hangup"
            onClick={() => endCall(peerUserId)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            End call
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
