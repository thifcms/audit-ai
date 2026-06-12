import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  File, 
  FileText, 
  FileSpreadsheet, 
  Tv, 
  Image as ImageIcon, 
  Music, 
  FolderOpen, 
  RefreshCw, 
  Clock, 
  Database,
  ArrowRight
} from 'lucide-react';
import { DriveFile } from '../types';

interface DriveFileBrowserProps {
  token: string | null;
  onFileSelect: (file: DriveFile) => void;
  selectedFileId?: string;
}

type FileCategory = 'all' | 'documents' | 'spreadsheets' | 'presentations' | 'media';

export default function DriveFileBrowser({ token, onFileSelect, selectedFileId }: DriveFileBrowserProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FileCategory>('all');

  const fetchFiles = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // Query to get files that are not trashed and fetch fields we need
      const fields = 'files(id, name, mimeType, iconLink, modifiedTime, size)';
      const query = "trashed = false";
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&orderBy=modifiedTime desc&pageSize=100`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('A autenticação com o Google Drive expirou. Por favor, saia e entre novamente.');
        }
        throw new Error(`Erro API Google Drive: ${response.statusText} (Status ${response.status})`);
      }

      const data = await response.json();
      setFiles(data.files || []);
    } catch (err: any) {
      console.error('Erro fetching files:', err);
      setError(err.message || 'Houve um erro desconhecido ao carregar os arquivos do Google Drive.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchFiles();
    }
  }, [token]);

  // Format file size helper
  const formatSize = (bytesStr?: string) => {
    if (!bytesStr) return '—';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return '—';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Format date helper
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get matching icon based on file mimeType
  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/vnd.google-apps.document' || mimeType === 'application/pdf' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return <FileText className="w-5 h-5 text-blue-500 dark:text-blue-400" />;
    }
    if (mimeType === 'application/vnd.google-apps.spreadsheet' || mimeType === 'text/csv' || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />;
    }
    if (mimeType === 'application/vnd.google-apps.presentation' || mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
      return <Tv className="w-5 h-5 text-amber-500 dark:text-amber-400" />;
    }
    if (mimeType.startsWith('image/')) {
      return <ImageIcon className="w-5 h-5 text-purple-500 dark:text-purple-400" />;
    }
    if (mimeType.startsWith('audio/')) {
      return <Music className="w-5 h-5 text-rose-500 dark:text-rose-400" />;
    }
    return <File className="w-5 h-5 text-slate-400 dark:text-slate-500" />;
  };

  // Get readable file type category label
  const getReadableType = (mimeType: string) => {
    if (mimeType === 'application/vnd.google-apps.document') return 'Documento Google';
    if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Planilha Google';
    if (mimeType === 'application/vnd.google-apps.presentation') return 'Apresentação Google';
    if (mimeType === 'application/pdf') return 'Documento PDF';
    if (mimeType === 'text/plain') return 'Arquivo de Texto';
    if (mimeType === 'text/csv') return 'Planilha CSV';
    if (mimeType.startsWith('image/')) return 'Imagem';
    if (mimeType.startsWith('audio/')) return 'Áudio';
    return 'Arquivo';
  };

  // Category filter predicate
  const isSelectedCategory = (file: DriveFile) => {
    switch (activeCategory) {
      case 'documents':
        return (
          file.mimeType === 'application/vnd.google-apps.document' ||
          file.mimeType === 'application/pdf' ||
          file.mimeType === 'text/plain' ||
          file.mimeType.includes('word')
        );
      case 'spreadsheets':
        return (
          file.mimeType === 'application/vnd.google-apps.spreadsheet' ||
          file.mimeType === 'text/csv' ||
          file.mimeType.includes('excel') ||
          file.mimeType.includes('sheet')
        );
      case 'presentations':
        return (
          file.mimeType === 'application/vnd.google-apps.presentation' ||
          file.mimeType.includes('powerpoint') ||
          file.mimeType.includes('presentation')
        );
      case 'media':
        return file.mimeType.startsWith('image/') || file.mimeType.startsWith('audio/');
      case 'all':
      default:
        return true;
    }
  };

  // Filter and Search list
  const filteredFiles = files.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = isSelectedCategory(file);
    return matchesSearch && matchesCategory;
  });

  return (
    <div id="drive-browser-root" className="w-full flex flex-col h-full bg-slate-50 dark:bg-slate-950/20 border-r border-slate-200 dark:border-slate-800">
      {/* Drawer Header */}
      <div id="browser-header" className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1 px-[6px] bg-blue-50 dark:bg-blue-950/40 rounded-lg text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
              <Database className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 tracking-tight text-sm">
              Meu Google Drive
            </h3>
          </div>
          <button
            id="refresh-drive-btn"
            onClick={fetchFiles}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-750 text-slate-600 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
            title="Recarregar arquivos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <input
            id="drive-search-input"
            type="text"
            placeholder="Buscar arquivos por nome..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-750 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-550 focus:border-blue-550 transition-all"
          />
        </div>

        {/* Category Tabs */}
        <div id="category-tabs" className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-[10px] font-medium">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-2.5 py-1 rounded-full border shrink-0 cursor-pointer transition-all ${
              activeCategory === 'all'
                ? 'bg-slate-800 border-slate-900 text-white dark:bg-slate-200 dark:border-slate-100 dark:text-slate-900 shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-50'
            }`}
          >
            Todos ({files.length})
          </button>
          <button
            onClick={() => setActiveCategory('documents')}
            className={`px-2.5 py-1 rounded-full border shrink-0 cursor-pointer transition-all ${
              activeCategory === 'documents'
                ? 'bg-blue-600 border-blue-650 text-white shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-50'
            }`}
          >
            Documentos
          </button>
          <button
            onClick={() => setActiveCategory('spreadsheets')}
            className={`px-2.5 py-1 rounded-full border shrink-0 cursor-pointer transition-all ${
              activeCategory === 'spreadsheets'
                ? 'bg-emerald-600 border-emerald-650 text-white shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-50'
            }`}
          >
            Planilhas
          </button>
          <button
            onClick={() => setActiveCategory('presentations')}
            className={`px-2.5 py-1 rounded-full border shrink-0 cursor-pointer transition-all ${
              activeCategory === 'presentations'
                ? 'bg-amber-600 border-amber-650 text-white shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-50'
            }`}
          >
            Apresentações
          </button>
          <button
            onClick={() => setActiveCategory('media')}
            className={`px-2.5 py-1 rounded-full border shrink-0 cursor-pointer transition-all ${
              activeCategory === 'media'
                ? 'bg-purple-600 border-purple-650 text-white shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 hover:bg-slate-50'
            }`}
          >
            Mídia
          </button>
        </div>
      </div>

      {/* File List */}
      <div id="file-list-scrollable" className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg className="animate-spin h-6 w-6 text-blue-500 mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z animate-spin" />
            </svg>
            <p className="text-xs">Sincronizando com seu Drive...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-150 text-red-700 dark:text-red-400 text-xs">
            <p className="font-semibold mb-1">Não foi possível carregar</p>
            <p className="mb-3">{error}</p>
            <button
              onClick={fetchFiles}
              className="px-2.5 py-1 rounded bg-red-100 hover:bg-red-150 dark:bg-red-900/40 text-red-800 dark:text-red-300 font-medium transition-colors cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3" />
            <p className="font-semibold text-slate-700 dark:text-slate-350 text-xs">Nenhum arquivo encontrado</p>
            <p className="text-slate-400 text-[10px] max-w-[200px] mt-1">
              {searchQuery ? 'Tente modificar os termos pesquisados' : 'Essa pasta parece estar vazia.'}
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredFiles.map((file) => {
              const isSelected = selectedFileId === file.id;
              return (
                <motion.div
                  key={file.id}
                  id={`file-card-${file.id}`}
                  layoutId={file.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  onClick={() => onFileSelect(file)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex gap-3 text-left items-center group relative hover:shadow-sm ${
                    isSelected
                      ? 'bg-blue-50/70 border-blue-300 dark:bg-blue-950/30 dark:border-blue-800 shadow-sm'
                      : 'bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800 hover:bg-slate-100/50 dark:hover:bg-slate-850'
                  }`}
                >
                  <div className="shrink-0 p-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-750 rounded-lg group-hover:scale-105 transition-transform">
                    {getFileIcon(file.mimeType)}
                  </div>
                  
                  <div className="flex-1 min-w-0 pr-6">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" title={file.name}>
                      {file.name}
                    </p>
                    
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 dark:text-slate-450 font-mono">
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5 text-slate-400" />
                        {file.modifiedTime ? formatDate(file.modifiedTime).split(' às')[0] : '—'}
                      </span>
                      <span>•</span>
                      <span>{formatSize(file.size)}</span>
                    </div>

                    <div className="text-[9px] text-slate-400 dark:text-slate-500 font-medium tracking-tight mt-0.5 uppercase">
                      {getReadableType(file.mimeType)}
                    </div>
                  </div>

                  <div className="absolute right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-100 dark:border-blue-900 text-blue-600 dark:text-blue-400">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
