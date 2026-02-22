export const pulselyCopy = {
  onboarding: {
    title: "Welcome to PULSELY",
    subtitle: "No signup. No facecards. Only live traces.",
    cards: [
      {
        title: "You are a Node",
        description: "Your device becomes your anonymous identity."
      },
      {
        title: "Pulse = Live post",
        description: "Share text, image, or short video in real time."
      },
      {
        title: "Vibe = Reaction",
        description: "React to pulses with mood, not likes."
      },
      {
        title: "Aura Hunt = Real-world game",
        description: "Find nearby loot, connect with people, grow chain length."
      }
    ],
    cta: "Start Live"
  },
  emptyStates: {
    globalShare: {
      title: "Be the first to drop a Pulse.",
      hint: "The stream is waiting for a voice.",
      actions: {
        primary: "Drop First Pulse",
        secondary: "Open Confessions"
      }
    },
    auraHunt: {
      title: "No aura has awakened.",
      hint: "Stay nearby or bring more nodes together.",
      actions: {
        primary: "Start Run"
      }
    },
    chat: {
      title: "The network is quiet.",
      hint: "Try Global Pulse or Aura Hunt while you wait."
    }
  },
  aura: {
    card: {
      chainLengthLabel: "Chain Length",
      huntersJoinedLabel: "Hunters Joined",
      timeLeftLabel: "Time Left",
      tags: {
        hot: "Hot Aura",
        fresh: "New Aura"
      },
      actions: {
        run: "Run to Aura",
        requestBorrow: "Request Borrow"
      }
    },
    actionFeedback: {
      runSuccessTitle: "Nice run. Chain +1",
      runSuccessBody: "You helped this aura reach more people."
    },
    borrowFlow: {
      requester: {
        title: "Owner is nearby as {nodeId}.",
        hint: "Ask in person only if comfortable."
      },
      owner: {
        title: "{count} nearby nodes requested borrow.",
        actions: {
          allow: "Allow",
          decline: "Decline",
          privateAura: "Private Aura",
          blockNode: "Block Node"
        }
      }
    },
    creator: {
      unlockTitle: "You unlocked Aura Creator.",
      unlockBody: "You can now drop 1 custom aura per day.",
      form: {
        nameLabel: "Aura name",
        moodLabel: "Mood",
        durationLabel: "Duration",
        durationOptions: ["30m", "2h", "24h"],
        action: "Drop Aura Here"
      }
    }
  },
  quests: {
    postFirstPulse: {
      title: "Post 1 Pulse",
      description: "Share your first live post"
    },
    dropThreeVibes: {
      title: "Drop 3 Vibes",
      description: "React to 3 pulses"
    },
    witnessFivePulses: {
      title: "Witness 5 Pulses",
      description: "View 5 live posts"
    },
    joinOneAuraRun: {
      title: "Join 1 Aura Run",
      description: "Reach one active aura zone"
    }
  },
  navTooltips: {
    chatOps: "Private 1:1 live chat",
    freedomWall: "Ephemeral public pulses",
    confessions: "Anonymous thought stream",
    auraHunt: "Nearby live loot and chain runs"
  }
} as const;
