"use client";

import { motion } from "framer-motion";
import { fadeInUp, easeSmooth, springBouncy } from "@/lib/motion";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type LucideIcon, PackageOpen } from "lucide-react";
import Link from "next/link";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16 px-4"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.08 },
        },
      }}
    >
      <motion.div
        variants={fadeInUp}
        transition={easeSmooth}
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-superficie"
      >
        <Icon className="h-8 w-8 text-muted-foreground" />
      </motion.div>

      <motion.h3
        variants={fadeInUp}
        transition={easeSmooth}
        className="font-heading text-lg font-semibold text-foreground mb-1"
      >
        {title}
      </motion.h3>

      <motion.p
        variants={fadeInUp}
        transition={easeSmooth}
        className="text-muted-foreground text-sm text-center max-w-sm mb-6"
      >
        {description}
      </motion.p>

      {action && (
        <motion.div variants={fadeInUp} transition={easeSmooth}>
          {action.href ? (
            <motion.div
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={springBouncy}
            >
              <Link
                href={action.href}
                className={cn(buttonVariants(), "inline-flex items-center")}
              >
                {action.label}
              </Link>
            </motion.div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={springBouncy}
              onClick={action.onClick}
              className={cn(buttonVariants(), "inline-flex items-center")}
            >
              {action.label}
            </motion.button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
