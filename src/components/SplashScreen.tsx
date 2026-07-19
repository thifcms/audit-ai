import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import LogoImage from '../assets/images/audit_ai_motherboard_brain_logo_1784399483889.jpg';

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState<'entry' | 'loop' | 'exit'>('entry');

  useEffect(() => {
    // Stage timing
    const entryTimer = setTimeout(() => {
      setStage('loop');
    }, 1500);

    const exitTimer = setTimeout(() => {
      setStage('exit');
    }, 4500);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 5500);

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
            className="absolute w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none"
          />

          <div className="relative flex flex-col items-center">
            {/* 3D Perspective Stage Container */}
            <div 
              className="relative w-64 h-64 md:w-72 md:h-72 flex items-center justify-center"
              style={{
                perspective: "1000px",
                transformStyle: "preserve-3d"
              }}
            >
              {/* Central Logo Container with depth and rotate 3D entry */}
              <motion.div
                initial={{ 
                  opacity: 0, 
                  scale: 0.3, 
                  rotateY: 65, 
                  rotateX: 25, 
                  z: -300 
                }}
                animate={{ 
                  opacity: 1, 
                  scale: stage === 'loop' ? [1, 1.03, 1] : 1,
                  rotateY: stage === 'loop' ? 0 : 0,
                  rotateX: stage === 'loop' ? 0 : 0,
                  z: stage === 'loop' ? 10 : 0,
                }}
                transition={{
                  duration: stage === 'loop' ? 4 : 1.6,
                  repeat: stage === 'loop' ? Infinity : 0,
                  ease: "easeOut"
                }}
                className="relative w-44 h-44 md:w-52 md:h-52 flex items-center justify-center bg-[#070b13]"
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* Ambient pulsing glow behind the image */}
                <motion.div 
                  className="absolute inset-4 rounded-full bg-cyan-500/10"
                  animate={{
                    boxShadow: [
                      "0 0 45px 15px rgba(34, 211, 238, 0.25)",
                      "0 0 85px 30px rgba(34, 211, 238, 0.6)",
                      "0 0 45px 15px rgba(34, 211, 238, 0.25)"
                    ]
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  style={{ transform: 'translateZ(-15px)' }}
                />

                {/* Outer scanning ring */}
                <motion.div 
                  className="absolute inset-4 rounded-full border border-cyan-500/20"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                />
                {/* Inner ring */}
                <motion.div 
                  className="absolute inset-8 rounded-full border-t border-b border-blue-400/30"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
                />
                
                <img 
                  src={LogoImage} 
                  alt="Audit AI Engine" 
                  className="w-[85%] h-[85%] object-cover mix-blend-lighten relative z-10"
                  style={{
                    maskImage: 'radial-gradient(circle, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)',
                    WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)'
                  }}
                />
              </motion.div>
            </div>

            {/* Application Name */}
            <motion.div
              initial={{ opacity: 0, y: 15, filter: "blur(5px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="mt-10 text-center relative"
            >
               <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -inset-4 bg-cyan-500/10 blur-xl rounded-full"
              />
              <h1 className="text-4xl md:text-5xl font-bold tracking-tighter text-white relative z-10">
                AUDIT <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">IA</span>
              </h1>
              <p className="mt-3 text-[10px] md:text-xs font-medium tracking-[0.4em] uppercase text-cyan-200/60 shadow-cyan-500/50 drop-shadow-md">
                Protocolo de Conectividade
              </p>
            </motion.div>

            {/* Cybernetic Progress Bar */}
            <div className="mt-16 relative w-64 h-1.5 bg-slate-900/80 rounded-full overflow-hidden border border-slate-800">
              {/* Shimmer effect */}
              <motion.div 
                initial={{ x: "-100%" }}
                animate={{ x: "200%" }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent z-10"
              />
              <motion.div 
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 4.5, ease: "easeInOut" }}
                className="h-full bg-gradient-to-r from-cyan-600 to-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.8)]"
              />
            </div>
            {/* Status Text under progress bar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 0.5 }}
              className="mt-3 font-mono text-[9px] text-cyan-500/50 uppercase tracking-widest"
            >
              Inicializando Conectividade Neural...
            </motion.div>
          </div>

          {/* Version / Signature */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: 2, duration: 1 }}
            className="absolute bottom-8 flex flex-col items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-slate-500 font-mono"
          >
            <span>v3.2 Secure Link</span>
            <span className="text-slate-700">Audit IA Eco-System</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
