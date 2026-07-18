import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import LogoImage from '../assets/images/audit_ai_new_concept_logo_1784392119390.jpg';

interface CyberChipProps {
  name: string;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
}

function CyberChip({ name, className = "", style, delay = 0 }: CyberChipProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5, z: -200 }}
      animate={{ opacity: 1, scale: 1, z: 0 }}
      transition={{ delay, duration: 1.2, ease: "easeOut" }}
      style={{
        ...style,
        transformStyle: 'preserve-3d',
      }}
      className={`absolute bg-[#0b1322]/95 border border-cyan-500/35 rounded px-2 py-1 flex flex-col items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.15)] ${className}`}
    >
      {/* Pin design - Left */}
      <div className="absolute -left-[3px] top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
        <div className="w-[3px] h-[1.5px] bg-cyan-400/40 rounded-l-sm" />
        <div className="w-[3px] h-[1.5px] bg-cyan-400/40 rounded-l-sm" />
        <div className="w-[3px] h-[1.5px] bg-cyan-400/40 rounded-l-sm" />
      </div>
      {/* Pin design - Right */}
      <div className="absolute -right-[3px] top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
        <div className="w-[3px] h-[1.5px] bg-cyan-400/40 rounded-r-sm" />
        <div className="w-[3px] h-[1.5px] bg-cyan-400/40 rounded-r-sm" />
        <div className="w-[3px] h-[1.5px] bg-cyan-400/40 rounded-r-sm" />
      </div>
      {/* Pin design - Top */}
      <div className="absolute -top-[3px] left-1/2 -translate-x-1/2 flex gap-0.5">
        <div className="w-[1.5px] h-[3px] bg-cyan-400/40 rounded-t-sm" />
        <div className="w-[1.5px] h-[3px] bg-cyan-400/40 rounded-t-sm" />
      </div>
      {/* Pin design - Bottom */}
      <div className="absolute -bottom-[3px] left-1/2 -translate-x-1/2 flex gap-0.5">
        <div className="w-[1.5px] h-[3px] bg-cyan-400/40 rounded-b-sm" />
        <div className="w-[1.5px] h-[3px] bg-cyan-400/40 rounded-b-sm" />
      </div>

      <span className="text-[6px] font-mono tracking-widest text-cyan-400/90 uppercase font-bold select-none">{name}</span>
      <div className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse mt-0.5 shadow-[0_0_3px_#22d3ee]" />
    </motion.div>
  );
}

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
              {/* Circuit Connecting Lines (SVG inside 3D stage) */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="beamGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.1" />
                    <stop offset="50%" stopColor="#38bdf8" stopOpacity="1" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
                
                {/* Circuit Lines - Base Static Layout */}
                {[
                  "M 5 5 L 50 50", "M 95 10 L 50 50", "M 4 88 L 50 50", "M 92 92 L 50 50",
                  "M -10 45 L 50 50", "M 110 48 L 50 50", "M 5 5 L -10 45", "M 95 10 L 110 48",
                  "M 4 88 L -10 45", "M 92 92 L 110 48"
                ].map((d, i) => (
                  <path key={`static-${i}`} d={d} fill="none" stroke="rgba(34, 211, 238, 0.12)" strokeWidth="1" />
                ))}

                {/* Circuit Lines - Pulsing Beams */}
                {[
                  { d: "M 5 5 L 50 50", dur: 2.8, rev: false },
                  { d: "M 95 10 L 50 50", dur: 3.2, rev: true },
                  { d: "M 4 88 L 50 50", dur: 2.5, rev: false },
                  { d: "M 92 92 L 50 50", dur: 3.0, rev: true },
                  { d: "M -10 45 L 50 50", dur: 2.2, rev: false },
                  { d: "M 110 48 L 50 50", dur: 2.7, rev: true }
                ].map((beam, i) => (
                  <motion.path
                    key={`beam-${i}`}
                    d={beam.d}
                    fill="none"
                    stroke="url(#beamGradient)"
                    strokeWidth="1.2"
                    strokeDasharray="8 32"
                    animate={{ strokeDashoffset: beam.rev ? [-40, 0] : [40, 0] }}
                    transition={{ duration: beam.dur, repeat: Infinity, ease: "linear" }}
                  />
                ))}
                
                {/* Inter-chip connections */}
                {[
                  { d: "M 5 5 L -10 45", dur: 2.0, rev: true },
                  { d: "M 95 10 L 110 48", dur: 2.4, rev: false },
                  { d: "M 4 88 L -10 45", dur: 2.1, rev: false },
                  { d: "M 92 92 L 110 48", dur: 2.5, rev: true }
                ].map((conn, i) => (
                  <motion.path
                    key={`conn-${i}`}
                    d={conn.d}
                    fill="none"
                    stroke="url(#beamGradient)"
                    strokeWidth="1"
                    strokeDasharray="6 24"
                    animate={{ strokeDashoffset: conn.rev ? [-30, 0] : [30, 0] }}
                    transition={{ duration: conn.dur, repeat: Infinity, ease: "linear" }}
                  />
                ))}
              </svg>

              {/* Surrounding Cybernetic Chips with 3D depths */}
              <CyberChip 
                name="AI_CORE" 
                className="top-[5%] left-[5%]" 
                style={{ transform: 'translateZ(-140px) scale(0.85)' }} 
                delay={0.2} 
              />
              <CyberChip 
                name="MEM_L3" 
                className="top-[10%] right-[5%]" 
                style={{ transform: 'translateZ(-90px) scale(0.9)' }} 
                delay={0.4} 
              />
              <CyberChip 
                name="SEC_GATE" 
                className="bottom-[12%] left-[4%]" 
                style={{ transform: 'translateZ(-110px) scale(0.85)' }} 
                delay={0.3} 
              />
              <CyberChip 
                name="BUS_SYNC" 
                className="bottom-[8%] right-[8%]" 
                style={{ transform: 'translateZ(-130px) scale(0.85)' }} 
                delay={0.5} 
              />
              <CyberChip 
                name="CLK_CTRL" 
                className="top-[45%] -left-[10%] md:-left-[15%]" 
                style={{ transform: 'translateZ(-70px) scale(0.9)' }} 
                delay={0.1} 
              />
              <CyberChip 
                name="IO_TRANS" 
                className="top-[48%] -right-[10%] md:-right-[15%]" 
                style={{ transform: 'translateZ(-80px) scale(0.9)' }} 
                delay={0.6} 
              />

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
                className="relative w-40 h-40 md:w-48 md:h-48 rounded-full p-1 shadow-2xl shadow-cyan-900/40 border border-slate-800/50 flex items-center justify-center overflow-hidden bg-[#070b13]"
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* Outer scanning ring */}
                <motion.div 
                  className="absolute inset-0 rounded-full border border-cyan-500/30"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                />
                {/* Inner ring */}
                <motion.div 
                  className="absolute inset-2 rounded-full border-t border-b border-blue-400/40"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                />
                
                <img 
                  src={LogoImage} 
                  alt="Audit AI Engine" 
                  className="w-full h-full object-cover rounded-full mix-blend-lighten relative z-10"
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
