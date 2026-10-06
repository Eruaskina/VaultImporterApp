import React from 'react';
import { VaultConnection } from '../types/vault';
import { ShieldCheck, ShieldAlert, Database, Server, RefreshCw, Terminal, Layers, UploadCloud } from 'lucide-react';

interface TopBarProps {
  activeTab: 'explorer' | 'batch' | 'settings' | 'logs';
  setActiveTab: (tab: 'explorer' | 'batch' | 'settings' | 'logs') => void;
  connection: VaultConnection;
  onToggleDemoMode: () => void;
  logCount: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  connection,
  onToggleDemoMode,
  logCount,
}) => {
  return (
    <header className="h-14 bg-slate-900/90 border-b border-slate-800 px-4 md:px-6 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md">
      {/* Zone 1: Wordmark */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-cyan-400 font-semibold tracking-tight text-base select-none">
          <Database className="w-5 h-5 text-cyan-400" />
          <span className="text-white font-bold">VaultConfig</span>
          <span className="text-slate-500 font-normal text-xs tracking-normal">v2.4</span>
        </div>
      </div>

      {/* Zone 2: Navigation Links */}
      <nav className="flex items-center gap-1 md:gap-2">
        <button
          onClick={() => setActiveTab('explorer')}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'explorer'
              ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Secret Gezgini & Düzenleyici</span>
        </button>

        <button
          onClick={() => setActiveTab('batch')}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'batch'
              ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>Toplu appsettings Yükleme</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'settings'
              ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>Bağlantı & Ortam</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'logs'
              ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Günlükler</span>
          {logCount > 0 && (
            <span className="font-mono text-[10px] text-slate-400 tabular-nums">({logCount})</span>
          )}
        </button>
      </nav>

      {/* Zone 3: Actions */}
      <div className="flex items-center gap-3">
        {/* Connection status tag */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
          {connection.isDemoMode ? (
            <span className="flex items-center gap-1.5 text-amber-400 font-mono text-[11px]">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Demo / Sandbox
            </span>
          ) : connection.isConnected ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5" />
              Bağlı ({connection.engine})
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-rose-400 font-mono text-[11px]">
              <ShieldAlert className="w-3.5 h-3.5" />
              Bağlantı Bekleniyor
            </span>
          )}
          <span className="text-slate-600">·</span>
          <span className="font-mono text-slate-400 text-[11px] truncate max-w-[140px]">
            {connection.isDemoMode ? 'Yerel Simülasyon' : connection.url.replace(/^https?:\/\//, '')}
          </span>
        </div>

        <button
          onClick={onToggleDemoMode}
          title={connection.isDemoMode ? 'Canlı Vault Moduna Geç' : 'Demo / Sandbox Moduna Geç'}
          className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            connection.isDemoMode
              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20'
              : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
          }`}
        >
          <RefreshCw className="w-3 h-3" />
          <span>{connection.isDemoMode ? 'Canlı Mod' : 'Demo Modu'}</span>
        </button>
      </div>
    </header>
  );
};
