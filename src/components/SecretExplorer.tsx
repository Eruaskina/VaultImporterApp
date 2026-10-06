import React, { useState, useEffect, useCallback } from 'react';
import { VaultConnection, SecretData } from '../types/vault';
import { VaultApiService } from '../services/vaultApi';
import { SecretEditor } from './SecretEditor';
import {
  Folder,
  FileText,
  Plus,
  RefreshCw,
  Search,
  ChevronRight,
  Trash2,
  Database,
  ArrowLeft,
  KeyRound,
  FileCode,
  Layers,
  Sparkles,
} from 'lucide-react';

interface SecretExplorerProps {
  connection: VaultConnection;
  onAddLog: (type: 'info' | 'success' | 'warning' | 'error', message: string, details?: string) => void;
}

export const SecretExplorer: React.FC<SecretExplorerProps> = ({ connection, onAddLog }) => {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Selected Secret for editing
  const [selectedSecretPath, setSelectedSecretPath] = useState<string | null>(null);
  const [secretData, setSecretData] = useState<SecretData | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(false);

  // New Secret Modal
  const [showNewSecretModal, setShowNewSecretModal] = useState(false);
  const [newSecretPathInput, setNewSecretPathInput] = useState('');
  const [newSecretTemplate, setNewSecretTemplate] = useState<'appsettings' | 'simple' | 'empty'>('appsettings');
  const [isCreatingSecret, setIsCreatingSecret] = useState(false);

  // Load items at current path
  const loadPath = useCallback(
    async (path: string) => {
      setLoading(true);
      try {
        const res = await VaultApiService.listPath(connection, path);
        if (res.success) {
          setItems(res.keys || []);
        } else {
          setItems([]);
          onAddLog('warning', `Dizin listelenemedi (${path || 'root'}): ${res.error}`);
        }
      } catch (err: any) {
        onAddLog('error', `Hata: ${err.message}`);
      } finally {
        setLoading(false);
      }
    },
    [connection, onAddLog]
  );

  // Initial load and reload on engine change
  useEffect(() => {
    loadPath(currentPath);
  }, [loadPath, currentPath, connection.engine]);

  // Load specific secret
  const handleSelectSecret = async (fullPath: string, targetVersion?: number) => {
    setSelectedSecretPath(fullPath);
    setLoadingSecret(true);
    onAddLog('info', `Secret okunuyor: ${connection.engine}/${fullPath}${targetVersion ? ` (v${targetVersion})` : ''}`);

    try {
      const res = await VaultApiService.readSecret(connection, fullPath, targetVersion);
      if (res.success && res.secret) {
        setSecretData(res.secret);
        onAddLog(
          'success',
          `Secret yüklendi: ${fullPath} (v${res.secret.selectedVersion || res.secret.currentVersion})`
        );
      } else {
        onAddLog('error', `Secret okunamadı: ${res.error}`);
      }
    } catch (err: any) {
      onAddLog('error', `Okuma hatası: ${err.message}`);
    } finally {
      setLoadingSecret(false);
    }
  };

  // Navigate into folder
  const handleItemClick = (item: string) => {
    if (item.endsWith('/')) {
      const nextPath = currentPath ? `${currentPath}/${item.slice(0, -1)}` : item.slice(0, -1);
      setCurrentPath(nextPath);
    } else {
      const fullPath = currentPath ? `${currentPath}/${item}` : item;
      handleSelectSecret(fullPath);
    }
  };

  // Navigate up one level
  const handleGoUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  // Create new secret
  const handleCreateSecret = async () => {
    if (!newSecretPathInput.trim()) return;

    let initialData: Record<string, any> = {};
    if (newSecretTemplate === 'appsettings') {
      initialData = {
        appsettings: {
          Logging: {
            LogLevel: {
              Default: 'Information',
              'Microsoft.AspNetCore': 'Warning',
            },
          },
          ConnectionStrings: {
            DefaultConnection: 'Server=10.240.x.x;Database=AppDb;User Id=usr;Password=SecretP@ss;',
          },
          AppSettings: {
            CityName: 'Istanbul',
            Environment: connection.selectedEnv || 'Production',
            CreatedBy: 'VaultConfigHub',
          },
        },
      };
    } else if (newSecretTemplate === 'simple') {
      initialData = {
        api_key: 'sample-api-key-value',
        username: 'service-account',
        password: 'ChangeMeSecurely!',
      };
    }

    setIsCreatingSecret(true);
    try {
      const fullPath = currentPath
        ? `${currentPath}/${newSecretPathInput.trim().replace(/^\/+|\/+$/g, '')}`
        : newSecretPathInput.trim().replace(/^\/+|\/+$/g, '');

      const res = await VaultApiService.writeSecret(connection, fullPath, initialData);
      if (res.success) {
        onAddLog('success', `Yeni secret oluşturuldu: ${connection.engine}/${fullPath}`);
        setShowNewSecretModal(false);
        setNewSecretPathInput('');
        loadPath(currentPath);
        handleSelectSecret(fullPath);
      } else {
        alert(`Oluşturma hatası: ${res.message}`);
      }
    } catch (err: any) {
      alert(`Hata: ${err.message}`);
    } finally {
      setIsCreatingSecret(false);
    }
  };

  // Delete secret
  const handleDeleteCurrentSecret = async () => {
    if (!selectedSecretPath) return;
    const confirmDelete = window.confirm(
      `'${connection.engine}/${selectedSecretPath}' secret'ını silmek istediğinize emin misiniz?`
    );
    if (!confirmDelete) return;

    try {
      const res = await VaultApiService.deleteSecret(connection, selectedSecretPath, true);
      if (res.success) {
        onAddLog('success', `Secret silindi: ${selectedSecretPath}`);
        setSelectedSecretPath(null);
        setSecretData(null);
        loadPath(currentPath);
      } else {
        alert(`Silme başarısız: ${res.message}`);
      }
    } catch (err: any) {
      alert(`Hata: ${err.message}`);
    }
  };

  // Filter items
  const filteredItems = items.filter((item) =>
    item.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col md:flex-row overflow-hidden">
      {/* Left Sidebar: Path & Secret Tree */}
      <div className="w-full md:w-80 lg:w-96 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        {/* Header toolbar */}
        <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Database className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="font-mono text-xs font-semibold text-slate-200 truncate">
              {connection.engine}
            </span>
            <span className="text-slate-600">/</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => loadPath(currentPath)}
              title="Yenile"
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowNewSecretModal(true)}
              title="Yeni Secret Ekle"
              className="p-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-slate-800 rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="p-2 border-b border-slate-800 bg-slate-950/40">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Anahtar veya dizin ara..."
              className="w-full bg-slate-900 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 placeholder:text-slate-600"
            />
          </div>
        </div>

        {/* Breadcrumb row */}
        <div className="px-3 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-1 text-[11px] overflow-x-auto whitespace-nowrap text-slate-400">
          <button
            onClick={() => setCurrentPath('')}
            className="hover:text-cyan-300 font-mono transition-colors"
          >
            kök (root)
          </button>
          {currentPath.split('/').filter(Boolean).map((part, index, arr) => {
            const subPath = arr.slice(0, index + 1).join('/');
            return (
              <React.Fragment key={subPath}>
                <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                <button
                  onClick={() => setCurrentPath(subPath)}
                  className={`hover:text-cyan-300 font-mono transition-colors ${
                    index === arr.length - 1 ? 'text-cyan-300 font-medium' : ''
                  }`}
                >
                  {part}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* List of items in current directory */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {currentPath && (
            <button
              onClick={handleGoUp}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-mono">.. (Üst Dizine Dön)</span>
            </button>
          )}

          {loading ? (
            <div className="p-6 text-center text-xs text-slate-500 font-mono">
              Secret listesi yükleniyor...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Bu dizinde listelenecek secret bulunamadı.
            </div>
          ) : (
            filteredItems.map((item) => {
              const isFolder = item.endsWith('/');
              const cleanItemName = isFolder ? item.slice(0, -1) : item;
              const fullItemPath = currentPath ? `${currentPath}/${cleanItemName}` : cleanItemName;
              const isSelected = selectedSecretPath === fullItemPath;

              return (
                <button
                  key={item}
                  onClick={() => handleItemClick(item)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded transition-colors text-left group ${
                    isSelected
                      ? 'bg-cyan-950/50 text-cyan-200 border border-cyan-800/60'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {isFolder ? (
                      <Folder className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-slate-400 group-hover:text-cyan-300 shrink-0" />
                    )}
                    <span className="font-mono truncate">{cleanItemName}</span>
                  </div>

                  {isFolder ? (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 shrink-0" />
                  ) : (
                    <span className="text-[10px] text-slate-600 group-hover:text-slate-400 font-mono shrink-0">
                      secret
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer info in sidebar */}
        <div className="p-2.5 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <span className="tabular-nums font-mono">{filteredItems.length} öğe listelendi</span>
          <span className="font-mono text-slate-600">KV v2</span>
        </div>
      </div>

      {/* Right Content Area: Secret Editor or Empty Selection state */}
      <div className="flex-1 bg-slate-950 flex flex-col overflow-hidden">
        {loadingSecret ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <p className="text-xs font-mono">Secret verisi ve versiyon geçmişi getiriliyor...</p>
          </div>
        ) : secretData && selectedSecretPath ? (
          <div className="flex-1 p-4 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between pb-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-200">
                  Secret Detayı & Konfigürasyon
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-xs text-slate-400 font-mono truncate">{selectedSecretPath}</span>
              </div>
              <button
                onClick={handleDeleteCurrentSecret}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded transition-colors"
                title="Secret'ı Sil"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Secret'ı Sil</span>
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
              <SecretEditor
                secret={secretData}
                connection={connection}
                onRefresh={(ver) => handleSelectSecret(selectedSecretPath, ver)}
                onAddLog={onAddLog}
              />
            </div>
          </div>
        ) : (
          /* Empty state when no secret is selected */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto space-y-4">
            <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400">
              <FileCode className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-white">Bir Secret Seçin veya Yeni Oluşturun</h2>
              <p className="text-xs text-slate-400">
                Sol paneldeki dizin ağacından istediğiniz secret'ı tıklayarak içerisindeki JSON anahtarlarını
                görüntüleyebilir, düzenleyebilir ve yeni versiyon olarak kaydedebilirsiniz.
              </p>
            </div>

            {/* Quick path access suggestions */}
            <div className="w-full pt-4 border-t border-slate-900 space-y-2 text-left">
              <span className="text-xs font-medium text-slate-400">Hızlı Erişim Örnekleri:</span>
              <div className="space-y-1 font-mono text-[11px]">
                <button
                  onClick={() => handleSelectSecret('prod/apps-istanbul/afc-saas/istanbul')}
                  className="w-full px-2.5 py-1.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded text-cyan-300 flex items-center justify-between transition-colors"
                >
                  <span>prod/apps-istanbul/afc-saas/istanbul</span>
                  <span className="text-slate-500 text-[10px]">appsettings.json</span>
                </button>
                <button
                  onClick={() => handleSelectSecret('dev/apps-ankara/afc-saas/ankara/user/test-user')}
                  className="w-full px-2.5 py-1.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded text-cyan-300 flex items-center justify-between transition-colors"
                >
                  <span>dev/apps-ankara/afc-saas/ankara/user/test-user</span>
                  <span className="text-slate-500 text-[10px]">user-config</span>
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowNewSecretModal(true)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-cyan-800/40 rounded text-xs font-medium flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Secret Tanımla</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal: New Secret Dialog */}
      {showNewSecretModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-400" />
                Yeni Secret Oluştur
              </h3>
              <button
                onClick={() => setShowNewSecretModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                Kapat
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">Secret Yolu (Path):</label>
                <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5">
                  <span className="text-slate-500 font-mono text-xs">
                    {connection.engine}/{currentPath ? `${currentPath}/` : ''}
                  </span>
                  <input
                    type="text"
                    value={newSecretPathInput}
                    onChange={(e) => setNewSecretPathInput(e.target.value)}
                    placeholder="ornek-servis/ayarlar"
                    className="flex-1 bg-transparent text-xs font-mono text-cyan-300 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">Başlangıç Şablonu:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewSecretTemplate('appsettings')}
                    className={`p-2 border rounded text-xs font-mono text-center transition-colors ${
                      newSecretTemplate === 'appsettings'
                        ? 'bg-cyan-950/50 border-cyan-500 text-cyan-300'
                        : 'border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    appsettings
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSecretTemplate('simple')}
                    className={`p-2 border rounded text-xs font-mono text-center transition-colors ${
                      newSecretTemplate === 'simple'
                        ? 'bg-cyan-950/50 border-cyan-500 text-cyan-300'
                        : 'border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Key-Value
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSecretTemplate('empty')}
                    className={`p-2 border rounded text-xs font-mono text-center transition-colors ${
                      newSecretTemplate === 'empty'
                        ? 'bg-cyan-950/50 border-cyan-500 text-cyan-300'
                        : 'border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Boş
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowNewSecretModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleCreateSecret}
                disabled={isCreatingSecret || !newSecretPathInput.trim()}
                className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded transition-colors disabled:opacity-50"
              >
                {isCreatingSecret ? 'Oluşturuluyor...' : 'Oluştur ve Düzenle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
