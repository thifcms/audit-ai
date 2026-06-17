import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState<'entry' | 'loop' | 'exit'>('entry');

  useEffect(() => {
    // 1.2s para a animação de entrada ("montagem")
    const entryTimer = setTimeout(() => {
      setStage('loop');
    }, 1200);

    // Exibe por mais algum tempo antes de sumir
    const exitTimer = setTimeout(() => {
      setStage('exit');
    }, 2200);

    // Avisa o app para montar a home após o fade out
    const unmountTimer = setTimeout(() => {
      onComplete();
    }, 2800);

    return () => {
      clearTimeout(entryTimer);
      clearTimeout(exitTimer);
      clearTimeout(unmountTimer);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {stage !== 'exit' && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden"
          style={{
            background: 'radial-gradient(circle at center 30%, #050e0d 0%, #02050a 70%, #010204 100%)'
          }}
        >
          {/* Inject inner CSS for pure CSS keyframes */}
          <style>{`
            @keyframes ringRotateSlow {
              0% { transform: rotateX(60deg) rotateY(15deg) rotate(0deg); }
              100% { transform: rotateX(60deg) rotateY(15deg) rotate(360deg); }
            }
            @keyframes ringRotateMedium {
              0% { transform: rotateX(60deg) rotateY(-15deg) rotate(0deg); }
              100% { transform: rotateX(60deg) rotateY(-15deg) rotate(-360deg); }
            }
            @keyframes ringRotateFast {
              0% { transform: rotateX(60deg) rotateY(0deg) rotate(0deg); }
              100% { transform: rotateX(60deg) rotateY(0deg) rotate(360deg); }
            }
            @keyframes pulseCore {
              0%, 100% { transform: scale(1); opacity: 0.8; filter: drop-shadow(0 0 8px #5eead4); }
              50% { transform: scale(1.08); opacity: 1; filter: drop-shadow(0 0 16px #5eead4); }
            }
            @keyframes scanLine {
              0% { top: -20%; opacity: 0; }
              10% { opacity: 1; }
              90% { opacity: 1; }
              100% { top: 120%; opacity: 0; }
            }
          `}</style>

          {/* Holographic 3D Container */}
          <div className="relative w-64 h-64 flex items-center justify-center perspective-[800px] mb-8">
            
            {/* Scan Line Effect */}
            {stage !== 'entry' && (
              <div 
                className="absolute left-0 right-0 h-1 z-50 pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, transparent, #5eead4, transparent)',
                  boxShadow: '0 0 15px 2px rgba(94, 234, 212, 0.5)',
                  animation: 'scanLine 3s linear infinite'
                }}
              />
            )}
            {stage === 'entry' && (
              <motion.div 
                initial={{ top: '-20%', opacity: 0 }}
                animate={{ top: '120%', opacity: 1 }}
                transition={{ duration: 1.2, ease: 'linear' }}
                className="absolute left-0 right-0 h-1 z-50 pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, transparent, #5eead4, transparent)',
                  boxShadow: '0 0 15px 2px rgba(94, 234, 212, 0.5)',
                }}
              />
            )}

            {/* Core / Nucleus */}
            <motion.div
              initial={stage === 'entry' ? { scale: 0, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.8, type: 'spring', bounce: 0.6 }}
              className="absolute z-30 w-8 h-8 rounded-full bg-cyan-300/20 flex items-center justify-center border border-cyan-200/50"
              style={{
                animation: stage === 'loop' ? 'pulseCore 2.5s ease-in-out infinite' : 'none'
              }}
            >
              <div className="w-4 h-4 rounded-full bg-cyan-200 shadow-[0_0_12px_#5eead4]" />
              <div className="absolute inset-0 rounded-full border border-white/80 scale-[1.3]" />
              <div className="absolute inset-0 rounded-full border border-white/40 scale-[1.8]" />
            </motion.div>

            {/* Outer Ring */}
            <motion.div
              initial={stage === 'entry' ? { scale: 2, rotateX: 90, rotateY: 50, opacity: 0 } : false}
              animate={{ scale: 1, rotateX: 60, rotateY: 15, opacity: 1 }}
              transition={{ duration: 1.2, type: 'spring', bounce: 0.4 }}
              className="absolute inset-0 z-10 rounded-full border border-cyan-400"
              style={{
                borderWidth: '4px',
                borderStyle: 'dashed',
                animation: stage === 'loop' ? 'ringRotateSlow 40s linear infinite' : 'none',
                transformStyle: 'preserve-3d'
              }}
            >
              {/* Outer white segments simulated by an inner ring */}
              <div className="absolute inset-[-8px] rounded-full border border-white/80 border-dotted opacity-50" style={{ borderWidth: '2px' }} />
            </motion.div>

            {/* Middle Ring */}
            <motion.div
              initial={stage === 'entry' ? { scale: 0.2, rotateX: -90, rotateY: -50, opacity: 0 } : false}
              animate={{ scale: 0.75, rotateX: 60, rotateY: -15, opacity: 1 }}
              transition={{ duration: 1.0, delay: 0.1, type: 'spring', bounce: 0.5 }}
              className="absolute inset-0 z-20 m-auto rounded-full border-4 border-[#5eead4]"
              style={{
                borderStyle: 'dashed',
                animation: stage === 'loop' ? 'ringRotateMedium 25s linear infinite' : 'none',
                transformStyle: 'preserve-3d'
              }}
            >
              {/* Solid Thin Ring attached between middle and inner */}
              <div className="absolute inset-4 rounded-full border-[1.5px] border-[#5eead4] opacity-50" />
            </motion.div>

            {/* Inner Ring */}
            <motion.div
              initial={stage === 'entry' ? { scale: 3, rotateX: 0, rotateY: 90, opacity: 0 } : false}
              animate={{ scale: 0.45, rotateX: 60, rotateY: 0, opacity: 1 }}
              transition={{ duration: 1.1, delay: 0.2, type: 'spring', bounce: 0.6 }}
              className="absolute inset-0 z-20 m-auto rounded-full border-[3px] border-[#5eead4]"
              style={{
                borderStyle: 'dashed',
                borderWidth: '3px',
                animation: stage === 'loop' ? 'ringRotateFast 12s linear infinite' : 'none',
                transformStyle: 'preserve-3d'
              }}
            />

            {/* Circuit endpoints visible in the background */}
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 0.6 }}
               transition={{ delay: 1 }}
               className="absolute inset-[-40px] z-0"
            >
              <svg width="100%" height="100%" viewBox="0 0 100 100">
                <path d="M50 20 L50 5" stroke="#5eead4" strokeWidth="1" fill="none" />
                <circle cx="50" cy="5" r="2" fill="#5eead4" />
                <path d="M50 80 L50 95" stroke="#5eead4" strokeWidth="1" fill="none" />
                <circle cx="50" cy="95" r="2" fill="#5eead4" />
                <path d="M20 50 L5 50" stroke="#5eead4" strokeWidth="1" fill="none" />
                <circle cx="5" cy="50" r="2" fill="#5eead4" />
                <path d="M80 50 L95 50" stroke="#5eead4" strokeWidth="1" fill="none" />
                <circle cx="95" cy="50" r="2" fill="#5eead4" />
              </svg>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="flex flex-col items-center z-50 relative"
          >
            <h1 className="text-4xl font-extrabold tracking-tight text-[#e1fcf8] drop-shadow-[0_0_10px_rgba(225,252,248,0.3)]">
              AuditAI
            </h1>
            <h2 className="text-sm font-bold tracking-[0.3em] uppercase text-[#508fa0] mt-1 relative">
              Doc Engine Suite
              <div className="absolute left-0 right-0 bottom-[-6px] h-px bg-gradient-to-r from-transparent via-[#508fa0] to-transparent opacity-50" />
            </h2>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
