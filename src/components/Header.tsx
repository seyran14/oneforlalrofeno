import { motion } from 'framer-motion';

export default function Header() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="mb-16"
    >
      <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
        Seyran
      </h1>
      
      <nav className="flex gap-6 text-sm md:text-base">
        <a 
          href="/" 
          className="text-zinc-400 hover:text-white transition-colors duration-200"
        >
          Home
        </a>
        <a 
          href="/posts" 
          className="text-zinc-400 hover:text-white transition-colors duration-200"
        >
          Posts
        </a>
        <a 
          href="/thoughts" 
          className="text-zinc-400 hover:text-white transition-colors duration-200"
        >
          Thoughts
        </a>
        <a 
          href="/media" 
          className="text-zinc-400 hover:text-white transition-colors duration-200"
        >
          Media
        </a>
      </nav>
    </motion.header>
  );
}
