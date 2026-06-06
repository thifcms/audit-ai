import React from 'react';
import { motion } from 'motion/react';
import { Database, FileText, Search, DatabaseBackup, Lock } from 'lucide-react';

interface GoogleSignInButtonProps {
  onSignIn: () => void;
  isLoading: boolean;
}

export default function GoogleSignInButton({ onSignIn, isLoading }: GoogleSignInButtonProps) {
  return (
    <div id="sign-in-container" className="flex flex-col items-center justify-center p-6 sm:p-12 w-full max-w-md mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-8 flex flex-col items-center text-center"
      >
        <div id="app-logo-accent" className="w-14 h-14 bg-blue-50 dark:bg-blue-950/40 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 mb-6 border border-blue-100 dark:border-blue-900/30">
          <Database className="w-7 h-7" />
        </div>

        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight mb-2">
          Conectar Google Drive
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">
          Acesse e faça leituras assistidas por inteligência artificial em qualquer arquivo do seu Google Drive.
        </p>

        {/* Feature List */}
        <div id="button-features-list" className="w-full text-left space-y-4 mb-8">
          <div className="flex items-start gap-3">
            <span className="p-1 px-[6px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40 rounded-lg text-emerald-600 dark:text-emerald-400 shrink-0">
              <FileText className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Leitor Inteligente</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-450">Suporta PDFs, Planilhas, Documentos de Texto, Imagens e Áudio.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="p-1 px-[6px] bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 rounded-lg text-blue-600 dark:text-blue-400 shrink-0">
              <Search className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Busca e Filtragem Rápidas</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-450">Encontre arquivos facilmente no Drive por nome ou tipo de formato.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="p-1 px-[6px] bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/40 rounded-lg text-purple-600 dark:text-purple-400 shrink-0">
              <DatabaseBackup className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Processamento Server-Side Seguro</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-450">Download e envio direto do Drive para a API do Gemini de forma segura.</p>
            </div>
          </div>
        </div>

        {/* Brand-compliant Google Sign In Button */}
        <button
          id="gsi-sign-in-button"
          onClick={onSignIn}
          disabled={isLoading}
          className="w-full relative group transition-all duration-200 ease-in-out cursor-pointer hover:scale-[1.01] active:scale-[0.99] disabled:opacity-75 disabled:cursor-not-allowed"
          aria-label="Fazer login com o Google"
        >
          <div className="w-full bg-slate-900 hover:bg-slate-850 dark:bg-slate-800 dark:hover:bg-slate-750 text-white rounded-xl py-3 px-4 flex items-center justify-center font-medium text-sm transition-all shadow-md group-hover:shadow-lg gap-3">
            {isLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 block group-hover:scale-105 transition-transform">
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

        <p className="mt-6 flex items-center justify-center gap-1.5 text-slate-400 text-[11px]">
          <Lock className="w-3.5 h-3.5 text-slate-450" />
          Seus dados são acessados em modo de leitura-apenas.
        </p>
      </motion.div>
    </div>
  );
}
