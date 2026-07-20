import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Lock, ShieldAlert, Loader2, Fingerprint } from 'lucide-react';
import { googleSignIn, logout } from '../firebase';

interface LoginGateProps {
  onAuthSuccess: (user: any) => void;
  onBiometricSuccess: () => void;
}

export default function LoginGate({ onAuthSuccess, onBiometricSuccess }: LoginGateProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storedCredId = localStorage.getItem('auditai_biometria_credId');

  const base64urlToBuffer = (base64url: string): ArrayBuffer => {
    let base64 = base64url
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        const { user } = result;
        const email = user.email?.toLowerCase();
        
        if (email !== 'thifcms@gmail.com') {
          setError(`Acesso não autorizado: O e-mail ${user.email} não possui privilégios de administrador para este painel.`);
          await logout();
        } else {
          onAuthSuccess(user);
        }
      }
    } catch (err: any) {
      console.error('Erro de login:', err);
      setError(err.message || 'Erro ao realizar login com o Google.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricSignIn = async () => {
    if (!storedCredId) return;
    setIsBiometricLoading(true);
    setError(null);
    try {
      const credIdBuffer = base64urlToBuffer(storedCredId);
      
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const assertionOptions: CredentialRequestOptions = {
        publicKey: {
          challenge: challenge,
          allowCredentials: [{
            id: credIdBuffer,
            type: "public-key"
          }],
          userVerification: "required",
          timeout: 60000
        }
      };

      const assertion = await navigator.credentials.get(assertionOptions);
      if (assertion) {
        onBiometricSuccess();
      }
    } catch (err: any) {
      console.error('Erro de login biométrico:', err);
      setError('A validação biométrica falhou ou foi cancelada pelo usuário. Por favor, tente novamente ou use o login com o Google.');
    } finally {
      setIsBiometricLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#070b13] flex items-center justify-center p-4">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.04),transparent_50%)] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md bg-[#0b1120] border border-slate-900/60 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] rounded-3xl p-8 sm:p-10 flex flex-col items-center text-center overflow-hidden"
      >
        {/* Top glowing line */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25 mb-6 relative">
          <Search className="w-8 h-8" />
          <div className="absolute inset-0 rounded-2xl bg-cyan-500/10 blur animate-pulse" />
        </div>

        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2 font-sans">
          Painel de Controle AuditAI
        </h2>
        
        {/* Subtitle */}
        <p className="text-slate-400 text-xs sm:text-sm mb-8 leading-relaxed font-normal">
          Acesse a central administrativa de auditoria médica e treinamento cognitivo de modelos.
        </p>

        {/* Authorization Alert / Error */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="w-full bg-red-950/30 border border-red-500/20 rounded-2xl p-4 mb-6 text-left overflow-hidden"
            >
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-red-200">Restrição de Segurança</h4>
                  <p className="text-[11px] text-red-300/90 leading-relaxed font-normal">
                    {error}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Sign In Action */}
        <div className="w-full space-y-3 mb-8">
          {/* Biometrics login button if registered */}
          {storedCredId && (
            <button
              onClick={handleBiometricSignIn}
              disabled={isBiometricLoading || isLoading}
              className="w-full relative group transition-all duration-200 ease-in-out cursor-pointer hover:scale-[1.01] active:scale-[0.99] disabled:opacity-75 disabled:cursor-not-allowed"
              aria-label="Fazer login por biometria"
            >
              <div className="w-full bg-gradient-to-r from-cyan-650 to-blue-650 hover:from-cyan-600 hover:to-blue-600 border border-cyan-500/30 text-white rounded-xl py-3.5 px-4 flex items-center justify-center font-semibold text-xs uppercase tracking-wider transition-all shadow-md gap-3 shadow-cyan-950/20">
                {isBiometricLoading ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <Fingerprint className="w-4 h-4 text-cyan-300 group-hover:scale-110 transition-transform" />
                )}
                <span>{isBiometricLoading ? 'Validando...' : 'Entrar com Biometria'}</span>
              </div>
            </button>
          )}

          {/* Google Sign In button */}
          <button
            onClick={handleSignIn}
            disabled={isLoading || isBiometricLoading}
            className="w-full relative group transition-all duration-200 ease-in-out cursor-pointer hover:scale-[1.01] active:scale-[0.99] disabled:opacity-75 disabled:cursor-not-allowed"
            aria-label="Fazer login com o Google"
          >
            <div className="w-full bg-[#0f172a] hover:bg-[#15203b] border border-slate-800 text-white rounded-xl py-3.5 px-4 flex items-center justify-center font-semibold text-xs uppercase tracking-wider transition-all shadow-md group-hover:border-slate-700/80 gap-3">
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              ) : (
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 block group-hover:scale-105 transition-transform">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
              )}
              <span>{isLoading ? 'Conectando...' : 'Entrar com o Google'}</span>
            </div>
          </button>
        </div>

        {/* Footer info */}
        <p className="flex items-center justify-center gap-1.5 text-slate-500 text-[11px] font-normal">
          <Lock className="w-3.5 h-3.5 text-slate-600" />
          Acesso restrito a administradores autorizados.
        </p>
      </motion.div>
    </div>
  );
}
