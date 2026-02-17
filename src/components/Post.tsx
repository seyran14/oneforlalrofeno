import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface PostProps {
  title: string;
  date: string;
  children: ReactNode;
}

export default function Post({ title, date, children }: PostProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="mb-16 last:mb-0"
    >
      {/* Post Header */}
      <div className="mb-6 space-y-2">
        <motion.time 
          className="block text-sm text-zinc-500 font-mono"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {date}
        </motion.time>
        <motion.h2 
          className="text-3xl md:text-4xl font-bold tracking-tight"
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          {title}
        </motion.h2>
      </div>

      {/* Post Content */}
      <motion.div
        className="prose prose-invert prose-lg max-w-none"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
      >
        {children}
      </motion.div>

      {/* Divider */}
      <motion.div 
        className="mt-12 h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.5, duration: 0.8 }}
      />
    </motion.article>
  );
}
