import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';

interface ThoughtProps {
  title: string;
  date: string;
  children: React.ReactNode;
}

export default function Thought({ title, date, children }: ThoughtProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <>
      <motion.article
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="py-12 border-b border-zinc-800/50 last:border-0"
      >
        <div className="flex flex-col md:flex-row md:items-baseline md:gap-6 mb-4">
          <h2 className="text-2xl font-semibold text-white mb-2 md:mb-0">
            {title}
          </h2>
          <time className="text-sm text-zinc-500 font-mono">
            {date}
          </time>
        </div>

        <div className="prose prose-invert prose-zinc max-w-none">
          <div className="text-zinc-300 leading-relaxed space-y-4">
            {children}
          </div>
        </div>
      </motion.article>
    </>
  );
}
