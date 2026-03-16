'use client';

type WaveType = OscillatorType;

type ToneStep = {
  frequency: number;
  duration: number;
  gain?: number;
  type?: WaveType;
};

let sharedAudioContext: AudioContext | null = null;
let activeRingInterval: ReturnType<typeof setInterval> | null = null;
let hasUserGestureUnlockedAudio = false;
let hasRegisteredUnlockListeners = false;

function registerAudioUnlockListeners() {
  if (typeof window === 'undefined') return;
  if (hasRegisteredUnlockListeners) return;
  hasRegisteredUnlockListeners = true;

  const unlock = () => {
    hasUserGestureUnlockedAudio = true;

    if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
      void sharedAudioContext.resume().catch(() => {});
    }

    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };

  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('touchstart', unlock, { once: true });
}

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  registerAudioUnlockListeners();
  if (!hasUserGestureUnlockedAudio) return null;

  const Ctor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new Ctor();
  }

  if (sharedAudioContext.state === 'suspended') {
    void sharedAudioContext.resume().catch(() => {});
  }

  return sharedAudioContext;
}

function playToneSequence(steps: ToneStep[], gap = 0.03) {
  const context = getAudioContext();
  if (!context) return;

  let offset = context.currentTime;

  steps.forEach((step) => {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = step.type ?? 'sine';
    oscillator.frequency.value = step.frequency;

    const maxGain = step.gain ?? 0.05;
    gainNode.gain.setValueAtTime(0.0001, offset);
    gainNode.gain.exponentialRampToValueAtTime(maxGain, offset + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, offset + step.duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(offset);
    oscillator.stop(offset + step.duration);

    offset += step.duration + gap;
  });
}

export function playMessageSound() {
  // Discord-like short positive ping.
  playToneSequence(
    [
      { frequency: 880, duration: 0.06, gain: 0.05, type: 'triangle' },
      { frequency: 1320, duration: 0.07, gain: 0.045, type: 'triangle' },
    ],
    0.02,
  );
}

export function playCallStartSound() {
  playToneSequence(
    [
      { frequency: 440, duration: 0.07, gain: 0.05, type: 'sine' },
      { frequency: 554, duration: 0.08, gain: 0.05, type: 'sine' },
      { frequency: 659, duration: 0.09, gain: 0.05, type: 'sine' },
    ],
    0.025,
  );
}

export function playCallEndSound() {
  playToneSequence(
    [
      { frequency: 620, duration: 0.08, gain: 0.05, type: 'square' },
      { frequency: 460, duration: 0.09, gain: 0.05, type: 'square' },
      { frequency: 320, duration: 0.12, gain: 0.045, type: 'square' },
    ],
    0.02,
  );
}

export function playCallParticipantJoinSound() {
  playToneSequence([{ frequency: 720, duration: 0.11, gain: 0.045, type: 'sine' }], 0);
}

export function playCallParticipantLeaveSound() {
  playToneSequence([{ frequency: 430, duration: 0.12, gain: 0.045, type: 'sine' }], 0);
}

export function playMuteToggleSound(kind: 'mute' | 'unmute') {
  if (kind === 'mute') {
    playToneSequence([{ frequency: 260, duration: 0.1, gain: 0.04, type: 'square' }], 0);
    return;
  }

  playToneSequence([{ frequency: 560, duration: 0.1, gain: 0.04, type: 'sine' }], 0);
}

function playRingPulse() {
  playToneSequence(
    [
      { frequency: 820, duration: 0.055, gain: 0.04, type: 'triangle' },
      { frequency: 820, duration: 0.055, gain: 0.04, type: 'triangle' },
      { frequency: 820, duration: 0.055, gain: 0.04, type: 'triangle' },
      { frequency: 820, duration: 0.055, gain: 0.04, type: 'triangle' },
    ],
    0.05,
  );
}

export function startCallRingSoundLoop() {
  stopCallRingSoundLoop();
  playRingPulse();
  activeRingInterval = setInterval(playRingPulse, 2000);
}

export function stopCallRingSoundLoop() {
  if (activeRingInterval) {
    clearInterval(activeRingInterval);
    activeRingInterval = null;
  }
}
