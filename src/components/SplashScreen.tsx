import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import LogoImage from '../assets/images/audit_ai_icon_1781732574781.jpg';

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState<'entry' | 'loop' | 'exit'>('entry');

  useEffect(() => {
    // Stage timing
    const entryTimer = setTimeout(() => {
      setStage('loop');
    }, 1200);

    const exitTimer = setTimeout(() => {
      setStage('exit');
    }, 3500);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 4500);

    return () => {
      clearTimeout(entryTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {stage !== 'exit' && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#070b13] overflow-hidden"
        >
          {/* Subtle background glow */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px]"
          />

          <div className="relative flex flex-col items-center">
            {/* Logo Container */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ 
                opacity: 1, 
                y: 0, 
                scale: stage === 'loop' ? [1, 1.02, 1] : 1
              }}
              transition={{
                duration: stage === 'loop' ? 3 : 0.8,
                repeat: stage === 'loop' ? Infinity : 0,
                ease: "easeInOut"
              }}
              className="relative w-32 h-32 md:w-40 md:h-40 rounded-2xl p-1 bg-gradient-to-br from-cyan-500/30 to-blue-600/30 shadow-2xl shadow-cyan-900/40"
            >
              <img 
                src={LogoImage} 
                alt="Audit AI Logo" 
                className="w-full h-full object-cover rounded-xl"
              />
              
              {/* Animated Ring */}
              <motion.div 
                className="absolute inset-0 rounded-2xl border border-cyan-400/50"
                animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.2, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.div>

            {/* Application Name */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="mt-8 text-center"
            >
              <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-white">
                AUDIT <span className="text-cyan-400">AI</span>
              </h1>
              <p className="mt-2 text-xs md:text-sm font-medium tracking-[0.3em] uppercase text-slate-400 opacity-60">
                Doc Engine Suite
              </p>
            </motion.div>

            {/* Progress Bar */}
            <div className="mt-12 w-48 h-1 bg-slate-800 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 3.5, ease: "easeInOut" }}
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_8px_rgba(34,211,238,0.5)]"
              />
            </div>
          </div>

          {/* Version / Signature */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            transition={{ delay: 1, duration: 1 }}
            className="absolute bottom-8 text-[10px] uppercase tracking-[0.2em] text-slate-500 font-mono"
          >
            v3.1 Stable // Eco-System Core
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
