import React, { useState, useEffect } from 'react';
import { VaultConnection, LogEntry } from './types/vault';
import { TopBar } from './components/TopBar';
import { SecretExplorer } from './components/SecretExplorer';
import { BatchUploader } from './components/BatchUploader';
import { ConnectionSettings } from './components/ConnectionSettings';
import { LogViewer } from './components/LogViewer';
import { Sparkles, Server, ShieldCheck, ArrowRight } from 'lucide-react';

const STORAGE_CONN_KEY = 'vault_app_connection_config_v2';
const STORAGE_LOGS_KEY = 'vault_app_logs_history_v2';

const defaultConnection: VaultConnection = {
  url: 'http://10.240.52.54:8200',
  token: '',
  engine: 'asis',
  appName: 'afc-saas',
  username: 'test-user',
  selectedEnv: 'dev',
  serverType: 'dual_path_108',
  isConnected: false,
  isDemoMode: true, // Default to demo mode so user immediately sees live interactive data!
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'explorer' | 'batch' | 'settings' | 'logs'>('explorer');

  // Load saved connection or default
  const [connection, setConnection] = useState<VaultConnection>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CONN_KEY);
      if (saved) {
        return { ...defaultConnection, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return defaultConnection;
  });

  // Logs
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LOGS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return [
      {
        id: '1',
        timestamp: new Date().toLocaleTimeString(),
        type: 'info',
        message: 'Vault Yönetim Platformu başlatıldı.',
        details: 'HashiCorp Vault KV v2 secret yöneticisi ve toplu appsettings dağıtım arayüzü aktif.',
      },
    ];
  });

  // Save connection changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CONN_KEY, JSON.stringify(connection));
    } catch {
      // ignore
    }
  }, [connection]);

  // Save logs changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(logs.slice(-200)));
    } catch {
      // ignore
    }
  }, [logs]);

  // Add Log Entry
  const addLog = (
    type: 'info' | 'success' | 'warning' | 'error',
    message: string,
    details?: string
  ) => {
    const newEntry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      details,
    };
    setLogs((prev) => [newEntry, ...prev.slice(0, 199)]);
  };

  const updateConnection = (updated: Partial<VaultConnection>) => {
    setConnection((prev) => ({ ...prev, ...updated }));
  };

  const toggleDemoMode = () => {
    const nextMode = !connection.isDemoMode;
    setConnection((prev) => ({
      ...prev,
      isDemoMode: nextMode,
      isConnected: nextMode ? true : prev.isConnected,
    }));
    addLog(
      'info',
      nextMode
        ? 'Demo / Simülasyon moduna geçildi (Hazır KV verileri aktif).'
        : 'Canlı Vault sunucu moduna geçildi.'
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-200">
      {/* Top Bar with Navigation and Status */}
      <TopBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        connection={connection}
        onToggleDemoMode={toggleDemoMode}
        logCount={logs.length}
      />

      {/* Demo Mode Notice Banner (Subtle & Dismissible) */}
      {connection.isDemoMode && activeTab === 'explorer' && (
        <div className="bg-amber-950/40 border-b border-amber-800/40 px-4 py-2 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-amber-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Demo Sandbox Aktif:</strong> Hazır İstanbul, Ankara ve İzmir appsettings secret'ları yüklendi.
              Değerleri değiştirebilir, yeni versiyon kaydedebilir ve toplu yükleme yapabilirsiniz.
            </span>
          </div>

          <button
            onClick={() => setActiveTab('settings')}
            className="text-amber-400 hover:text-amber-300 font-medium underline flex items-center gap-1 self-start sm:self-auto shrink-0"
          >
            <span>Canlı Vault Sunucusuna Bağlan</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Main View Port */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'explorer' && (
          <SecretExplorer connection={connection} onAddLog={addLog} />
        )}

        {activeTab === 'batch' && (
          <div className="flex-1 overflow-y-auto">
            <BatchUploader
              connection={connection}
              onUpdateConnection={updateConnection}
              onAddLog={addLog}
              onNavigateToExplorer={() => setActiveTab('explorer')}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto">
            <ConnectionSettings
              connection={connection}
              onUpdateConnection={updateConnection}
              onAddLog={addLog}
              onConnectedSuccess={() => setActiveTab('explorer')}
            />
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="flex-1 overflow-y-auto">
            <LogViewer logs={logs} onClearLogs={() => setLogs([])} />
          </div>
        )}
      </main>
    </div>
  );
}
