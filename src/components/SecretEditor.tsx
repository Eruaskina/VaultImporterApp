import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { SecretData, VaultConnection } from '../types/vault';
import { VaultApiService } from '../services/vaultApi';
import {
  extractConfigData,
  flattenToKeyValues,
  unflattenKeyValues,
  isSensitiveKey,
  KeyValueItem,
} from '../utils/appsettingsHelper';
import {
  Save,
  RotateCcw,
  Copy,
  Check,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Code2,
  ListOrdered,
  GitCompare,
  AlertCircle,
  Sparkles,
  History,
  Search,
  ArrowRight,
  Filter,
} from 'lucide-react';

interface SecretEditorProps {
  secret: SecretData;
  connection: VaultConnection;
  onRefresh: (targetVersion?: number) => void;
  onAddLog: (type: 'info' | 'success' | 'warning' | 'error', message: string, details?: string) => void;
}

export const SecretEditor: React.FC<SecretEditorProps> = ({
  secret,
  connection,
  onRefresh,
  onAddLog,
}) => {
  // Tab: Key-Value list, Raw JSON, or Version Diff
  const [activeTab, setActiveTab] = useState<'key_value' | 'raw_json' | 'diff'>('key_value');

  // Separator: ':' (.NET standard) or '.'
  const [separator, setSeparator] = useState<':' | '.'>(':');

  // Wrapper tracking: Does raw data have {"appsettings": {...}} or is it flat?
  const [hasWrapper, setHasWrapper] = useState(false);
  const [wrapperIsString, setWrapperIsString] = useState(false);

  // Key-Value rows state
  const [kvRows, setKvRows] = useState<KeyValueItem[]>([]);

  // Raw JSON state
  const [rawJsonText, setRawJsonText] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Key search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Sensitive mask toggles
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [globalMask, setGlobalMask] = useState(true);

  // Version management state
  const [selectedVersion, setSelectedVersion] = useState<number>(
    secret.selectedVersion || secret.currentVersion || 1
  );
  const [currentLatestVersion, setCurrentLatestVersion] = useState<number>(
    secret.currentVersion || 1
  );
  const [isLoadingVersion, setIsLoadingVersion] = useState(false);

  // Diff comparison version
  const [diffVersion, setDiffVersion] = useState<number>(
    Math.max(1, (secret.currentVersion || 1) - 1)
  );
  const [diffData, setDiffData] = useState<Record<string, any> | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);

  // New Key-Value input form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newType, setNewType] = useState<'string' | 'number' | 'boolean'>('string');

  // Save states
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Initialize and synchronize state when secret prop updates
  const syncFromRawSecret = useCallback(
    (rawData: Record<string, any>, sep: ':' | '.') => {
      const extracted = extractConfigData(rawData);
      setHasWrapper(extracted.hasAppsettingsWrapper);
      setWrapperIsString(extracted.wrapperIsJsonString);

      const rows = flattenToKeyValues(extracted.targetData, sep);
      setKvRows(rows);

      const formatted = JSON.stringify(rawData, null, 2);
      setRawJsonText(formatted);
      setJsonError(null);
    },
    []
  );

  useEffect(() => {
    syncFromRawSecret(secret.data || {}, separator);
    setSelectedVersion(secret.selectedVersion || secret.currentVersion || 1);
    setCurrentLatestVersion(secret.currentVersion || 1);
    setDiffVersion(Math.max(1, (secret.currentVersion || 1) - 1));
  }, [secret, syncFromRawSecret, separator]);

  // Handle switching separator (: vs .)
  const handleToggleSeparator = (newSep: ':' | '.') => {
    if (newSep === separator) return;
    setSeparator(newSep);
    // Rebuild rows from current raw text
    try {
      const parsed = JSON.parse(rawJsonText);
      syncFromRawSecret(parsed, newSep);
    } catch {
      // ignore
    }
  };

  // Sync KV changes back to raw JSON
  const syncKvToRawJson = (updatedRows: KeyValueItem[]) => {
    setKvRows(updatedRows);
    const reconstructed = unflattenKeyValues(
      updatedRows,
      separator,
      hasWrapper,
      wrapperIsString
    );
    const formatted = JSON.stringify(reconstructed, null, 2);
    setRawJsonText(formatted);
    setJsonError(null);
  };

  // Handle value change for a row
  const handleValueChange = (id: string, valStr: string) => {
    const updated = kvRows.map((r) => {
      if (r.id !== id) return r;
      let typedVal: any = valStr;
      if (r.type === 'number') {
        const num = Number(valStr);
        typedVal = isNaN(num) ? valStr : num;
      } else if (r.type === 'boolean') {
        typedVal = valStr.toLowerCase() === 'true';
      }
      return { ...r, value: typedVal };
    });
    syncKvToRawJson(updated);
  };

  // Handle key rename for a row
  const handleKeyRename = (id: string, newKeyName: string) => {
    const updated = kvRows.map((r) =>
      r.id === id
        ? {
            ...r,
            key: newKeyName,
            isSensitive: isSensitiveKey(newKeyName),
          }
        : r
    );
    syncKvToRawJson(updated);
  };

  // Delete row
  const handleDeleteRow = (id: string) => {
    const updated = kvRows.filter((r) => r.id !== id);
    syncKvToRawJson(updated);
  };

  // Add new Key:Value
  const handleAddNewRow = () => {
    if (!newKey.trim()) return;

    let typedVal: any = newValue;
    if (newType === 'number') {
      typedVal = Number(newValue) || 0;
    } else if (newType === 'boolean') {
      typedVal = newValue.toLowerCase() === 'true';
    }

    const newRow: KeyValueItem = {
      id: Math.random().toString(36).substring(2, 9),
      key: newKey.trim(),
      value: typedVal,
      type: newType,
      isSensitive: isSensitiveKey(newKey.trim()),
    };

    const updated = [...kvRows, newRow];
    syncKvToRawJson(updated);
    setNewKey('');
    setNewValue('');
    setShowAddForm(false);
  };

  // Raw JSON Text Change handler
  const handleRawJsonChange = (text: string) => {
    setRawJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setJsonError(null);
      const extracted = extractConfigData(parsed);
      setHasWrapper(extracted.hasAppsettingsWrapper);
      setWrapperIsString(extracted.wrapperIsJsonString);
      const rows = flattenToKeyValues(extracted.targetData, separator);
      setKvRows(rows);
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  // Beautify JSON
  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(rawJsonText);
      const formatted = JSON.stringify(parsed, null, 2);
      setRawJsonText(formatted);
      setJsonError(null);
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  // Copy full JSON
  const handleCopyFullJson = () => {
    navigator.clipboard.writeText(rawJsonText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Version switcher handler
  const handleSwitchVersion = async (targetVer: number) => {
    if (targetVer === selectedVersion && !isLoadingVersion) return;
    setIsLoadingVersion(true);
    onAddLog('info', `Versiyon v${targetVer} yükleniyor: ${secret.path}`);

    try {
      const res = await VaultApiService.readSecret(connection, secret.path, targetVer);
      if (res.success && res.secret) {
        setSelectedVersion(targetVer);
        setCurrentLatestVersion(res.secret.currentVersion || currentLatestVersion);
        syncFromRawSecret(res.secret.data || {}, separator);
        onAddLog('success', `Versiyon v${targetVer} yüklendi: ${secret.path}`);
      } else {
        onAddLog('error', `Versiyon okunamadı: ${res.error}`);
        alert(`Versiyon yüklenemedi: ${res.error}`);
      }
    } catch (err: any) {
      onAddLog('error', `Hata: ${err.message}`);
    } finally {
      setIsLoadingVersion(false);
    }
  };

  // Save changes to Vault (Creates New Version in KV v2)
  const handleSaveAsNewVersion = async () => {
    if (jsonError) {
      alert('Lütfen kaydetmeden önce JSON formatındaki hataları giderin.');
      return;
    }

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(rawJsonText);
    } catch {
      payload = unflattenKeyValues(kvRows, separator, hasWrapper, wrapperIsString);
    }

    setSaving(true);
    setSaveSuccessMsg(null);
    const targetNextVer = currentLatestVersion + 1;
    onAddLog(
      'info',
      `Vault'a yeni versiyon (v${targetNextVer}) yazılıyor: ${connection.engine}/${secret.path}`
    );

    try {
      const res = await VaultApiService.writeSecret(connection, secret.path, payload);
      if (res.success) {
        const createdVer = res.newVersion || targetNextVer;
        setCurrentLatestVersion(createdVer);
        setSelectedVersion(createdVer);
        setSaveSuccessMsg(`Secret başarıyla kaydedildi! Yeni versiyon: v${createdVer}`);
        onAddLog(
          'success',
          `[+] Başarıyla kaydedildi: ${connection.engine}/${secret.path} (Yeni Versiyon: v${createdVer})`
        );
        onRefresh(createdVer);
        setTimeout(() => setSaveSuccessMsg(null), 4000);
      } else {
        onAddLog('error', `[-] Kaydetme başarısız: ${res.message}`);
        alert(`Kaydetme hatası: ${res.message}`);
      }
    } catch (err: any) {
      onAddLog('error', `[-] HATA: ${err.message}`);
      alert(`Hata: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Load Diff comparison data when Diff tab is opened
  useEffect(() => {
    if (activeTab === 'diff') {
      setIsLoadingDiff(true);
      VaultApiService.readSecret(connection, secret.path, diffVersion)
        .then((res) => {
          if (res.success && res.secret) {
            const extracted = extractConfigData(res.secret.data);
            const flat = flattenToKeyValues(extracted.targetData, separator);
            const dict: Record<string, any> = {};
            flat.forEach((item) => {
              dict[item.key] = item.value;
            });
            setDiffData(dict);
          } else {
            setDiffData(null);
          }
        })
        .catch(() => setDiffData(null))
        .finally(() => setIsLoadingDiff(false));
    }
  }, [activeTab, diffVersion, connection, secret.path, separator]);

  // Filtered rows for search
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return kvRows;
    const lower = searchTerm.toLowerCase();
    return kvRows.filter(
      (r) =>
        r.key.toLowerCase().includes(lower) ||
        String(r.value).toLowerCase().includes(lower)
    );
  }, [kvRows, searchTerm]);

  // Available versions list array [1, 2, ..., currentLatestVersion]
  const availableVersions = useMemo(() => {
    const maxVer = Math.max(currentLatestVersion, selectedVersion, 1);
    const list: number[] = [];
    for (let i = maxVer; i >= 1; i--) {
      list.push(i);
    }
    return list;
  }, [currentLatestVersion, selectedVersion]);

  const isViewingOlderVersion = selectedVersion < currentLatestVersion;

  return (
    <div className="h-full flex flex-col bg-slate-950 border border-slate-800 rounded-lg overflow-hidden shadow-lg">
      {/* Top Header Bar */}
      <div className="p-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Secret Path & Version Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="text-slate-500">{connection.engine}</span>
            <span className="text-slate-600">/</span>
            <span className="text-cyan-300 font-semibold">{secret.path}</span>
          </div>

          {/* Version Picker */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs">
            <History className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Versiyon:</span>
            <select
              value={selectedVersion}
              onChange={(e) => handleSwitchVersion(Number(e.target.value))}
              disabled={isLoadingVersion || saving}
              className="bg-transparent font-mono text-cyan-300 font-bold focus:outline-none cursor-pointer"
            >
              {availableVersions.map((v) => (
                <option key={v} value={v} className="bg-slate-900 text-slate-100">
                  v{v} {v === currentLatestVersion ? '(Güncel)' : ''}
                </option>
              ))}
            </select>
          </div>

          {isViewingOlderVersion && (
            <span className="px-2 py-0.5 rounded text-[10px] bg-amber-950/60 border border-amber-800/80 text-amber-300 font-mono">
              Geçmiş Versiyon (v{selectedVersion})
            </span>
          )}
        </div>

        {/* Right: Tab buttons & Primary Save Action */}
        <div className="flex items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center p-0.5 bg-slate-950 border border-slate-800 rounded">
            <button
              onClick={() => setActiveTab('key_value')}
              className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded transition-colors ${
                activeTab === 'key_value'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Key - Value Görünümü</span>
            </button>

            <button
              onClick={() => setActiveTab('raw_json')}
              className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded transition-colors ${
                activeTab === 'raw_json'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Raw JSON</span>
            </button>

            <button
              onClick={() => setActiveTab('diff')}
              className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded transition-colors ${
                activeTab === 'diff'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>Versiyon Farkı</span>
            </button>
          </div>

          {/* Primary Save Button: Creates New Version in KV v2 */}
          <button
            onClick={handleSaveAsNewVersion}
            disabled={saving || !!jsonError}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded transition-colors shadow-sm disabled:opacity-50"
            title="Değişiklikleri HashiCorp Vault'a yeni versiyon olarak kaydeder"
          >
            {saving ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>Kaydediliyor...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Kaydet (Yeni v{currentLatestVersion + 1})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Warning banner when viewing older version */}
      {isViewingOlderVersion && (
        <div className="bg-amber-950/60 border-b border-amber-800/80 px-4 py-2 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Şu anda <strong>v{selectedVersion}</strong> geçmiş versiyonunu görüntülüyorsunuz.
              (Sistemdeki en son versiyon: <strong>v{currentLatestVersion}</strong>).
            </span>
          </div>

          <button
            onClick={() => handleSwitchVersion(currentLatestVersion)}
            className="text-amber-300 hover:text-white font-semibold underline flex items-center gap-1"
          >
            <span>Güncel Versiyona Dön (v{currentLatestVersion})</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Success Notification Banner */}
      {saveSuccessMsg && (
        <div className="bg-emerald-950/70 border-b border-emerald-800 px-4 py-2 text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{saveSuccessMsg}</span>
          </div>
          <button
            onClick={() => setSaveSuccessMsg(null)}
            className="text-emerald-400 hover:text-emerald-200 text-xs"
          >
            Kapat
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ================= TAB 1: KEY - VALUE SEQUENTIAL VIEW ================= */}
        {activeTab === 'key_value' && (
          <div className="space-y-3">
            {/* Toolbar for Key - Value list */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Key veya Value ara (örn: ConnectionStrings, LogLevel, 34)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 placeholder:text-slate-600 font-mono"
                />
              </div>

              {/* Controls: Separator, Mask toggle, Add button */}
              <div className="flex items-center gap-2">
                {/* Separator selector (: vs .) */}
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded p-0.5 text-xs">
                  <span className="text-slate-500 px-1.5 text-[11px]">Ayraç:</span>
                  <button
                    onClick={() => handleToggleSeparator(':')}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                      separator === ':'
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title=".NET Standart Hiyerarşik İki Nokta Üst Üste (:)"
                  >
                    :
                  </button>
                  <button
                    onClick={() => handleToggleSeparator('.')}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                      separator === '.'
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Nokta Ayracı (.)"
                  >
                    .
                  </button>
                </div>

                {/* Mask / Reveal All toggle */}
                <button
                  onClick={() => setGlobalMask(!globalMask)}
                  className="px-2.5 py-1.5 text-xs bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded flex items-center gap-1.5"
                  title="Hassas şifreleri ve gizli anahtarları maskele"
                >
                  {globalMask ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{globalMask ? 'Şifreleri Gizle' : 'Şifreleri Göster'}</span>
                </button>

                {/* Add new Key:Value button */}
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="px-3 py-1.5 text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Yeni Key - Value Ekle</span>
                </button>
              </div>
            </div>

            {/* Add New Key - Value Form Box */}
            {showAddForm && (
              <div className="p-4 bg-slate-900 border border-cyan-500/40 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    Yeni Key - Value Tanımla
                  </span>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="text-slate-400 hover:text-slate-200 text-xs"
                  >
                    Kapat
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-xs">
                  <div className="md:col-span-5">
                    <label className="text-slate-400 block mb-1">Key (Anahtar Yolu):</label>
                    <input
                      type="text"
                      placeholder="örn: AppSettings:WorkerCount veya Logging:LogLevel:Default"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="text-slate-400 block mb-1">Value (Değer):</label>
                    <input
                      type="text"
                      placeholder="Değer yazın..."
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-slate-400 block mb-1">Tip:</label>
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 focus:outline-none"
                    >
                      <option value="string">String (Metin)</option>
                      <option value="number">Number (Sayı)</option>
                      <option value="boolean">Boolean (true/false)</option>
                    </select>
                  </div>

                  <div className="md:col-span-1 flex items-end">
                    <button
                      onClick={handleAddNewRow}
                      disabled={!newKey.trim()}
                      className="w-full py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded disabled:opacity-50"
                    >
                      Ekle
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Sequential Key - Value Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              {/* Table Header */}
              <div className="px-4 py-2.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                <div className="w-5/12 flex items-center gap-2">
                  <span className="font-semibold text-slate-300">KEY (Anahtar)</span>
                  <span className="text-[11px] text-slate-500">
                    ({filteredRows.length} / {kvRows.length})
                  </span>
                </div>
                <div className="w-5/12 font-semibold text-slate-300">VALUE (Değer)</div>
                <div className="w-2/12 text-right font-semibold text-slate-300">İşlemler</div>
              </div>

              {/* Rows */}
              {filteredRows.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 font-mono">
                  {searchTerm
                    ? 'Arama kriterine uygun anahtar bulunamadı.'
                    : 'Henüz tanımlı anahtar yok. "Yeni Key - Value Ekle" butonuyla ekleyebilirsiniz.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80 font-mono text-xs">
                  {filteredRows.map((item) => {
                    const isMasked =
                      item.isSensitive && globalMask && !revealedIds[item.id];

                    return (
                      <div
                        key={item.id}
                        className="px-4 py-2.5 hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-3 group"
                      >
                        {/* Column 1: KEY */}
                        <div className="w-5/12 flex items-center gap-2 min-w-0">
                          <input
                            type="text"
                            value={item.key}
                            onChange={(e) => handleKeyRename(item.id, e.target.value)}
                            className="w-full bg-transparent border-b border-transparent hover:border-slate-700 focus:border-cyan-500 text-cyan-300 font-medium truncate focus:outline-none px-1 py-0.5"
                            title={item.key}
                          />
                        </div>

                        {/* Column 2: VALUE */}
                        <div className="w-5/12 flex items-center gap-2">
                          {item.type === 'boolean' ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleValueChange(item.id, String(!item.value))}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                                  item.value === true || String(item.value).toLowerCase() === 'true'
                                    ? 'bg-emerald-500 text-slate-950'
                                    : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                {String(item.value).toUpperCase()}
                              </button>
                            </div>
                          ) : (
                            <div className="relative flex-1">
                              <input
                                type={isMasked ? 'password' : 'text'}
                                value={item.value === null || item.value === undefined ? '' : String(item.value)}
                                onChange={(e) => handleValueChange(item.id, e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-100 focus:outline-none focus:border-cyan-500 text-xs"
                              />
                            </div>
                          )}

                          <span className="text-[10px] text-slate-500 font-mono px-1 bg-slate-950 rounded border border-slate-800">
                            {item.type}
                          </span>
                        </div>

                        {/* Column 3: ACTIONS */}
                        <div className="w-2/12 flex items-center justify-end gap-1.5 shrink-0">
                          {/* Reveal/Mask toggle for sensitive keys */}
                          {item.isSensitive && (
                            <button
                              type="button"
                              onClick={() =>
                                setRevealedIds((prev) => ({
                                  ...prev,
                                  [item.id]: !prev[item.id],
                                }))
                              }
                              className="p-1 text-slate-400 hover:text-cyan-300 rounded"
                              title={isMasked ? 'Değeri Göster' : 'Değeri Gizle'}
                            >
                              {isMasked ? (
                                <Eye className="w-3.5 h-3.5" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5 text-cyan-400" />
                              )}
                            </button>
                          )}

                          {/* Copy Value */}
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(String(item.value));
                              setCopiedKeyId(item.id);
                              setTimeout(() => setCopiedKeyId(null), 1500);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-200 rounded"
                            title="Değeri Kopyala"
                          >
                            {copiedKeyId === item.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Delete Key */}
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(item.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 rounded"
                            title="Anahtarı Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: RAW JSON CODE EDITOR ================= */}
        {activeTab === 'raw_json' && (
          <div className="h-full flex flex-col space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-semibold text-slate-200">
                  Tam JSON Metin Editörü
                </span>
                <span className="text-xs text-slate-500">
                  (Key-Value tablosu ile çift yönlü anlık senkronizedir)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFormatJson}
                  className="px-2.5 py-1 text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded flex items-center gap-1.5"
                >
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  <span>Biçimlendir (Format)</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyFullJson}
                  className="px-2.5 py-1 text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded flex items-center gap-1.5"
                >
                  {copiedAll ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedAll ? 'Kopyalandı' : 'JSON Kopyala'}</span>
                </button>
              </div>
            </div>

            {jsonError && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-800/60 rounded text-xs text-rose-300 flex items-center gap-2 font-mono">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>Geçersiz JSON: {jsonError}</span>
              </div>
            )}

            <div className="flex-1 min-h-[480px]">
              <textarea
                value={rawJsonText}
                onChange={(e) => handleRawJsonChange(e.target.value)}
                spellCheck={false}
                className="w-full h-full min-h-[480px] bg-slate-950 border border-slate-800 rounded p-4 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500 leading-relaxed selection:bg-cyan-500/20"
              />
            </div>
          </div>
        )}

        {/* ================= TAB 3: VERSION DIFF VIEWER ================= */}
        {activeTab === 'diff' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Karşılaştırılacak Versiyon:</span>
                <select
                  value={diffVersion}
                  onChange={(e) => setDiffVersion(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 font-mono text-cyan-300"
                >
                  {availableVersions.map((v) => (
                    <option key={v} value={v}>
                      v{v} {v === currentLatestVersion ? '(En Son)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4 font-mono text-[11px]">
                <span className="text-emerald-400">+ Yeni Eklenen</span>
                <span className="text-amber-400">~ Değişen</span>
                <span className="text-rose-400">- Silinen</span>
              </div>
            </div>

            {isLoadingDiff ? (
              <div className="p-10 text-center text-xs text-slate-400 font-mono">
                Fark hesaplanıyor...
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                    <tr>
                      <th className="p-3 w-1/3">Anahtar (Key)</th>
                      <th className="p-3 w-1/3">v{diffVersion} (Eski Değer)</th>
                      <th className="p-3 w-1/3">v{selectedVersion} (Şimdiki Değer)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-mono text-xs">
                    {(() => {
                      const currentDict: Record<string, any> = {};
                      kvRows.forEach((r) => {
                        currentDict[r.key] = r.value;
                      });

                      const allKeys = Array.from(
                        new Set([...Object.keys(currentDict), ...Object.keys(diffData || {})])
                      ).sort();

                      if (allKeys.length === 0) {
                        return (
                          <tr>
                            <td colSpan={3} className="p-6 text-center text-slate-500">
                              Karşılaştırılacak anahtar bulunamadı.
                            </td>
                          </tr>
                        );
                      }

                      return allKeys.map((k) => {
                        const oldVal = diffData?.[k];
                        const newVal = currentDict[k];
                        const isAdded = oldVal === undefined && newVal !== undefined;
                        const isDeleted = oldVal !== undefined && newVal === undefined;
                        const isModified =
                          !isAdded &&
                          !isDeleted &&
                          JSON.stringify(oldVal) !== JSON.stringify(newVal);

                        let rowBg = 'hover:bg-slate-950/40';
                        if (isAdded) rowBg = 'bg-emerald-950/25';
                        if (isDeleted) rowBg = 'bg-rose-950/25';
                        if (isModified) rowBg = 'bg-amber-950/25';

                        return (
                          <tr key={k} className={rowBg}>
                            <td className="p-3 text-slate-200 font-semibold">{k}</td>
                            <td className="p-3 text-slate-400 break-all">
                              {oldVal !== undefined ? (
                                String(oldVal)
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                            <td className="p-3 text-cyan-300 break-all">
                              {newVal !== undefined ? (
                                String(newVal)
                              ) : (
                                <span className="text-rose-400 font-bold">Silindi</span>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
