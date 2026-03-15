// ============================================
// Scanner feedback — sonido y vibración
// ============================================

type ScanResultado = "valido" | "ya_usado" | "no_encontrado" | "evento_incorrecto" | "cancelada";

const audioContext = typeof window !== "undefined" ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;

function playBeep(frequency: number, duration: number, count = 1) {
  if (!audioContext) return;

  // Resume context if suspended (browser autoplay policy)
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  for (let i = 0; i < count; i++) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration / 1000);

    const startTime = audioContext.currentTime + (i * (duration + 80)) / 1000;
    oscillator.start(startTime);
    oscillator.stop(startTime + duration / 1000);
  }
}

export function playSuccessSound() {
  playBeep(880, 150, 1); // single short high beep
}

export function playWarningSound() {
  playBeep(660, 120, 2); // double beep
}

export function playErrorSound() {
  playBeep(330, 400, 1); // single long low beep
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

export function feedbackForResult(resultado: ScanResultado) {
  switch (resultado) {
    case "valido":
      playSuccessSound();
      vibrate(200);
      break;
    case "ya_usado":
      playWarningSound();
      vibrate([100, 50, 100]);
      break;
    case "no_encontrado":
    case "evento_incorrecto":
    case "cancelada":
      playErrorSound();
      vibrate([100, 50, 100, 50, 100]);
      break;
  }
}

export const resultadoConfig: Record<
  ScanResultado,
  { color: string; bgColor: string; label: string; icon: "check" | "alert" | "x" }
> = {
  valido: {
    color: "#22c55e",
    bgColor: "bg-green-500",
    label: "VÁLIDO",
    icon: "check",
  },
  ya_usado: {
    color: "#f59e0b",
    bgColor: "bg-amber-500",
    label: "YA INGRESÓ",
    icon: "alert",
  },
  no_encontrado: {
    color: "#ef4444",
    bgColor: "bg-red-500",
    label: "QR NO VÁLIDO",
    icon: "x",
  },
  evento_incorrecto: {
    color: "#ef4444",
    bgColor: "bg-red-500",
    label: "ENTRADA DE OTRO EVENTO",
    icon: "x",
  },
  cancelada: {
    color: "#ef4444",
    bgColor: "bg-red-500",
    label: "ENTRADA CANCELADA",
    icon: "x",
  },
};
