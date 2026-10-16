// Loud alert for task cards that are waiting for the person.
//
// Task cards are accepted for the person after an hour, so an unnoticed card
// quietly becomes work they never chose. This plays a loud chime, shows a
// browser notification and flashes the tab title until the card is answered.
// Sound only plays while PMT is open (browsers do not allow more); the
// notification needs the permission PMT already asks for in PushNotifications.

const SOUND_URL = `${process.env.PUBLIC_URL || ""}/sounds/pmt-notification.mp3`;
const ICON_URL = `${process.env.PUBLIC_URL || ""}/pmt-notification-icon.png`;

// 1 is the loudest an <audio> element goes; the Web Audio path boosts past
// that, with a limiter so the boost does not distort.
const GAIN = 2.5;
const REPEATS = 3;
const NOTIFICATION_TAG = "pmt-task-card";

// While cards stay unanswered, alert again this often.
export const REMINDER_EVERY_MS = 10 * 60 * 1000;

let audioContext = null;
let soundBuffer = null;

async function loadBuffer(context) {
  if (soundBuffer) return soundBuffer;
  const response = await fetch(SOUND_URL);
  const bytes = await response.arrayBuffer();
  soundBuffer = await context.decodeAudioData(bytes);
  return soundBuffer;
}

async function playBoosted() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Web Audio not available");

  if (!audioContext) audioContext = new AudioContextClass();
  if (audioContext.state === "suspended") await audioContext.resume();
  if (audioContext.state !== "running") throw new Error("Audio is blocked until the page is used");

  const buffer = await loadBuffer(audioContext);

  const gain = audioContext.createGain();
  gain.gain.value = GAIN;

  const limiter = audioContext.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;

  gain.connect(limiter);
  limiter.connect(audioContext.destination);

  let at = audioContext.currentTime;
  for (let i = 0; i < REPEATS; i += 1) {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(at);
    at += buffer.duration + 0.15;
  }
}

function playPlain() {
  const audio = new Audio(SOUND_URL);
  audio.volume = 1;
  let plays = 1;
  audio.addEventListener("ended", () => {
    if (plays >= REPEATS) return;
    plays += 1;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  });
  audio.play().catch(() => {});
}

export async function playLoudAlert() {
  try {
    await playBoosted();
  } catch (_) {
    try {
      playPlain();
    } catch (__) {
      // A sound problem must never interrupt PMT.
    }
  }
}

export function taskAlertText(count) {
  return count === 1
    ? "1 task is waiting for you"
    : `${count} tasks are waiting for you`;
}

export function showTaskNotification(count) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const notification = new Notification(taskAlertText(count), {
      body: "Accept or decline it in PMT. Unanswered tasks are accepted for you after an hour.",
      icon: ICON_URL,
      tag: NOTIFICATION_TAG,
      renotify: true,
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (_) {
    // Notifications are best effort.
  }
}

// Card ids that have not been alerted about yet.
export function unseenIds(ids, seen) {
  return ids.filter((id) => !seen.has(id));
}

let originalTitle = null;
let flashTimer = null;

export function stopTitleFlash() {
  if (flashTimer) {
    clearInterval(flashTimer);
    flashTimer = null;
  }
  if (originalTitle !== null) {
    document.title = originalTitle;
    originalTitle = null;
  }
}

// Flash the tab title while the tab is in the background.
export function startTitleFlash(count) {
  if (flashTimer || typeof document === "undefined" || !document.hidden) return;

  originalTitle = document.title;
  let on = false;
  flashTimer = setInterval(() => {
    if (!document.hidden) {
      stopTitleFlash();
      return;
    }
    on = !on;
    document.title = on ? `🔔 ${taskAlertText(count)}` : originalTitle;
  }, 1000);
}
