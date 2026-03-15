// ============================================
// Club Seminario — Motion Design System
// Framer Motion constantes y variantes
// ============================================

// --- Variantes reducidas (prefers-reduced-motion) ---

export const reducedMotion = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

// --- Variantes de entrada ---

export const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

export const fadeInDown = {
  hidden: { opacity: 0, y: -24 },
  visible: { opacity: 1, y: 0 },
};

export const fadeInLeft = {
  hidden: { opacity: 0, x: -32 },
  visible: { opacity: 1, x: 0 },
};

export const fadeInRight = {
  hidden: { opacity: 0, x: 32 },
  visible: { opacity: 1, x: 0 },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1 },
};

export const blurIn = {
  hidden: { opacity: 0, filter: "blur(12px)" },
  visible: { opacity: 1, filter: "blur(0px)" },
};

// --- Stagger containers ---

export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

export const staggerContainerFast = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
};

// --- Springs ---

export const springBouncy = { type: "spring" as const, stiffness: 400, damping: 25 };
export const springSmooth = { type: "spring" as const, stiffness: 300, damping: 30 };
export const springGentle = { type: "spring" as const, stiffness: 200, damping: 20 };

// --- Eases cinematicos ---

export const easeSmooth = { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const };
export const easeSnappy = { duration: 0.3, ease: [0.33, 1, 0.68, 1] as const };
export const easeDramatic = { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const };

// --- Transiciones de pagina ---

export const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: easeSmooth },
  exit: { opacity: 0, y: -8, transition: { duration: 0.25 } },
};
