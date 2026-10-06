import React, { useState } from 'react';
import { LogEntry } from '../types/vault';
import { Terminal, Copy, Trash2, Check, CheckCircle2, AlertTriangle, AlertCircle, Info, Download } from 'lucide-react';

interface LogViewerProps {
  logs: LogEntry[];
  onClearLogs: () => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs, onClearLogs }) => {
  const [filter, setFilter] = useState<'all' | 'info' | 'success' | 'warning' | 'error'>('all');
  const [copied, setCopied] = useState(false);

  const filteredLogs = logs.filter((l) => (filter === 'all' ? true : l.type === filter));

  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message} ${l.details ? `\nDetails: ${l.details}` : ''}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message} ${l.details ? `\nDetails: ${l.details}` : ''}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vault-logs-${new Date().toISOString().slice(0, 19)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Terminal className="w-5 h-5 text-cyan-400" />
            Sistem ve Vault İşlem Günlükleri
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Tüm Vault KV v2 okuma, yazma, versiyonlama ve toplu yükleme işlemlerinin detaylı log kayıtları.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLogs}
            disabled={logs.length === 0}
            className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
          </button>
          <button
            onClick={handleExportLogs}
            disabled={logs.length === 0}
            className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Dışa Aktar</span>
          </button>
          <button
            onClick={onClearLogs}
            disabled={logs.length === 0}
            className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border border-slate-700 rounded transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Temizle</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg w-fit">
        {(['all', 'info', 'success', 'warning', 'error'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors capitalize ${
              filter === t
                ? 'bg-slate-800 text-cyan-300 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t === 'all' ? 'Tümü' : t}
          </button>
        ))}
      </div>

      {/* Logs Table / List */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Kayıtlı işlem günlüğü bulunmuyor.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 font-mono text-xs">
            {filteredLogs.map((entry) => {
              let badgeColor = 'text-cyan-400';
              let Icon = Info;
              if (entry.type === 'success') {
                badgeColor = 'text-emerald-400';
                Icon = CheckCircle2;
              } else if (entry.type === 'warning') {
                badgeColor = 'text-amber-400';
                Icon = AlertTriangle;
              } else if (entry.type === 'error') {
                badgeColor = 'text-rose-400';
                Icon = AlertCircle;
              }

              return (
                <div key={entry.id} className="p-3 hover:bg-slate-800/40 transition-colors flex items-start gap-3">
                  <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${badgeColor}`} />

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        {entry.timestamp}
                      </span>
                      <span className={`text-[10px] uppercase font-semibold px-1 rounded ${badgeColor} bg-slate-950`}>
                        {entry.type}
                      </span>
                    </div>

                    <div className="text-slate-200 break-words leading-relaxed">
                      {entry.message}
                    </div>

                    {entry.details && (
                      <pre className="p-2 bg-slate-950 border border-slate-800/70 rounded text-[11px] text-slate-400 overflow-x-auto whitespace-pre-wrap">
                        {entry.details}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
