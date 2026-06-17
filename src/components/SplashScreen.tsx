import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import LogoImage from '../assets/images/audit_ai_logo_1781728511867.jpg';

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

          {/* Holographic 3D Container with static image */}
          <div className="relative w-72 h-72 flex items-center justify-center perspective-[800px] mb-8">
            
            {/* Scan Line Effect over image */}
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

            {/* Generated Image Container */}
            <motion.div
              initial={stage === 'entry' ? { scale: 1.5, rotateX: 60, rotateY: 30, opacity: 0 } : false}
              animate={{ scale: 1, rotateX: 0, rotateY: 0, opacity: 1 }}
              transition={{ duration: 1.2, type: 'spring', bounce: 0.4 }}
              className="absolute inset-0 z-10 w-full h-full rounded-2xl overflow-hidden shadow-2xl"
              style={{
                animation: stage === 'loop' ? 'pulseCore 2.5s ease-in-out infinite' : 'none',
                transformStyle: 'preserve-3d'
              }}
            >
              <img 
                src={LogoImage} 
                alt="Audit AI Logo" 
                className="w-full h-full object-cover rounded-2xl"
              />
              
              {/* Overlay highlight to match HUD glow */}
              <div className="absolute inset-0 bg-cyan-400/10 pointer-events-none" style={{ mixBlendMode: 'screen' }} />
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
