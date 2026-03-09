import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';

interface MediaItemProps {
  title: string;
  date: string;
  photoUrl: string;
  audioName: string;
}

export default function MediaItem({ title, date, photoUrl, audioName }: MediaItemProps) {
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
        <div className="flex flex-col md:flex-row md:items-baseline md:gap-6 mb-6">
          <h2 className="text-2xl font-semibold text-white mb-2 md:mb-0">
            {title}
          </h2>
          <time className="text-sm text-zinc-500 font-mono">
            {date}
          </time>
        </div>

        {/* Photo */}
        {photoUrl && (
          <div className="mb-6">
            <img 
              src={photoUrl} 
              alt={title}
              className="w-full max-w-2xl rounded-lg"
              loading="lazy"
            />
          </div>
        )}

        {/* Audio Name */}
        {audioName && (
          <div className="flex items-center gap-3 text-zinc-400">
            <svg 
              className="w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" 
              />
            </svg>
            <span className="font-mono text-sm">{audioName}</span>
          </div>
        )}
      </motion.article>
    </>
  );
}
