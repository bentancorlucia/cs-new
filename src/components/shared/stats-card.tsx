"use client";

import { motion, useInView, useSpring, useTransform } from "framer-motion";
import { useRef, useEffect, useState } from "react";

interface StatsCardProps {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  description?: string;
}

function AnimatedNumber({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(0);

  const spring = useSpring(0, { stiffness: 50, damping: 30 });

  useEffect(() => {
    if (isInView) {
      spring.set(value);
    }
  }, [isInView, spring, value]);

  useEffect(() => {
    const unsubscribe = spring.on("change", (v) => {
      setDisplay(Math.round(v));
    });
    return unsubscribe;
  }, [spring]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}{display.toLocaleString("es-UY")}{suffix}
    </span>
  );
}

export function StatsCard({ value, suffix, prefix, label, description }: StatsCardProps) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="text-center"
    >
      <div className="font-display text-hero uppercase tracking-tightest text-bordo-800">
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} />
      </div>
      <p className="mt-2 font-heading text-sm uppercase tracking-editorial text-muted-foreground">
        {label}
      </p>
      {description && (
        <p className="mt-1 font-body text-sm text-muted-foreground/70">
          {description}
        </p>
      )}
    </motion.div>
  );
}
