import { motion } from 'framer-motion';

export default function Header() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="mb-20"
    >
      <motion.h1 
        className="text-5xl md:text-7xl font-bold mb-4 tracking-tight"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
      >
        seyran
      </motion.h1>
      
      <motion.p 
        className="text-xl text-zinc-400 max-w-2xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.6 }}
      >
        LIFE
      </motion.p>

      {/* Decorative line */}
      <motion.div
        className="mt-8 h-px bg-gradient-to-r from-white via-zinc-600 to-transparent"
        initial={{ scaleX: 0, transformOrigin: "left" }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.6, duration: 1 }}
      />
    </motion.header>
  );
}
