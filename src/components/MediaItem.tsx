import { motion, AnimatePresence } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef, useState } from 'react';

interface MediaItemProps {
  title: string;
  date: string;
  photoUrls: string[];
  audioName: string;
}

export default function MediaItem({ title, date, photoUrls, audioName }: MediaItemProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  
  // Если нет фото, не показываем компонент
  if (!photoUrls || photoUrls.length === 0) {
    return null;
  }

  const handleDragEnd = (event: any, info: any) => {
    const threshold = 50;
    
    if (info.offset.x > threshold && currentIndex > 0) {
      // Свайп вправо - предыдущее фото
      setDirection(-1);
      setCurrentIndex(currentIndex - 1);
    } else if (info.offset.x < -threshold && currentIndex < photoUrls.length - 1) {
      // Свайп влево - следующее фото
      setDirection(1);
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToSlide = (index: number) => {
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -300 : 300,
      opacity: 0,
    }),
  };

  return (
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

      {/* Swipeable Photo Gallery */}
      <div className="mb-6 relative">
        {/* Photo Container - фиксированная область для всех фото */}
        <div className="relative overflow-hidden rounded-lg bg-zinc-900/30">
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.img
              key={currentIndex}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
              }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              src={photoUrls[currentIndex]}
              alt={`${title} - ${currentIndex + 1}`}
              className="w-full h-auto object-contain cursor-grab active:cursor-grabbing select-none"
              loading="lazy"
            />
          </AnimatePresence>
        </div>

        {/* Dots Indicator - только если больше 1 фото */}
        {photoUrls.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
            {photoUrls.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`pointer-events-auto transition-all duration-300 ${
                  index === currentIndex 
                    ? 'w-5 h-1.5 bg-white/90 rounded-full' 
                    : 'w-1.5 h-1.5 bg-white/40 rounded-full hover:bg-white/60'
                }`}
                aria-label={`Go to image ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>

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
  );
}
