import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface ContentAreaProps {
  children: React.ReactNode;
  className?: string;
}

export function ContentArea({ children, className }: ContentAreaProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        "w-full max-w-7xl mx-auto p-4 sm:p-6 md:p-8 space-y-6",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
