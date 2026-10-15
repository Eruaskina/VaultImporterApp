import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  VaultConnection,
  VaultEnvironment,
  AggregatedKeyRow,
  CitySecretRef,
  BatchModalMode,
} from '../types/vault';
import { VaultApiService } from '../services/vaultApi';
import {
  aggregateSecretsKeys,
  applyDeleteKeysToSecretData,
  applyAddKeysToSecretData,
  applyUpdateValueToSecretData,
  applyRenameKeyToSecretData,
  isSensitiveKey,
} from '../utils/appsettingsHelper';
import {
  Building2,
  Server,
  Layers,
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Edit3,
  Check,
  CheckSquare,
  Square,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  X,
  Copy,
  Sliders,
  Filter,
  Eye,
  EyeOff,
  CheckCircle2,
  Code2,
  Table as TableIcon,
  Sparkles,
  Database,
} from 'lucide-react';

interface BulkKeyManagerProps {
  connection: VaultConnection;
  onAddLog: (type: 'info' | 'success' | 'warning' | 'error', message: string, details?: string) => void;
  onNavigateToExplorer?: (path?: string) => void;
  onUpdateConnection?: (updated: Partial<VaultConnection>) => void;
}

interface NewKeyRowInput {
  id: string;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'null';
}

export const BulkKeyManager: React.FC<BulkKeyManagerProps> = ({
  connection,
  onAddLog,
  onNavigateToExplorer,
  onUpdateConnection,
}) => {
  // Configuration State
  const [selectedEnv, setSelectedEnv] = useState<VaultEnvironment>(connection.selectedEnv || 'prod');
  const [selectedEngine, setSelectedEngine] = useState<string>(connection.engine || 'asis');
  const [availableEngines, setAvailableEngines] = useState<string[]>(['asis', 'secret', 'secrets']);
  const [selectedApp, setSelectedApp] = useState<string>(connection.appName || 'afc-saas-api');
  const [availableApps, setAvailableApps] = useState<string[]>(['afc-saas-api', 'afc-saas']);
  const [allKnownCities, setAllKnownCities] = useState<string[]>([
    'apps-tekirdag',
    'apps-istanbul',
    'apps-ankara',
    'apps-izmir',
    'apps-bursa',
  ]);
  const [selectedCities, setSelectedCities] = useState<string[]>([
    'apps-tekirdag',
    'apps-istanbul',
    'apps-ankara',
    'apps-izmir',
    'apps-bursa',
  ]);
  const [newCityInput, setNewCityInput] = useState('');
  const [isScouting, setIsScouting] = useState(false);

  // Active connection memo with dynamic engine and environment
  const activeConnection = useMemo<VaultConnection>(() => {
    return {
      ...connection,
      engine: selectedEngine,
      selectedEnv,
      appName: selectedApp,
    };
  }, [connection, selectedEngine, selectedEnv, selectedApp]);

  // Loaded Secret Data per City
  const [citySecrets, setCitySecrets] = useState<CitySecretRef[]>([]);
  const [isLoadingSecrets, setIsLoadingSecrets] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<{ current: number; total: number } | null>(null);

  // Table filtering & selection
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'conflicts_only' | 'same_only'>('all');
  const [selectedKeyPaths, setSelectedKeyPaths] = useState<string[]>([]);
  const [expandedConflictKeys, setExpandedConflictKeys] = useState<Record<string, boolean>>({});
  const [revealedSensitives, setRevealedSensitives] = useState<Record<string, boolean>>({});

  // Modal State
  const [modalMode, setModalMode] = useState<BatchModalMode>('none');
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [actionProgress, setActionProgress] = useState<{ current: number; total: number; currentCity: string } | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Fetch available engines on mount
  useEffect(() => {
    VaultApiService.getEngines(activeConnection).then((res) => {
      if (res.engines && res.engines.length > 0) {
        setAvailableEngines((prev) => Array.from(new Set([...prev, ...res.engines])));
      }
    });
  }, [connection.url, connection.token]);

  // Modal 1: EKLEME YAP state
  const [addInputMode, setAddInputMode] = useState<'table' | 'json'>('table');
  const [addRows, setAddRows] = useState<NewKeyRowInput[]>([
    { id: '1', key: '', value: '', type: 'string' },
  ]);
  const [addJsonInput, setAddJsonInput] = useState('{\n  "YeniAyar": "Deger"\n}');
  const [addJsonError, setAddJsonError] = useState<string | null>(null);
  const [addOverwriteExisting, setAddOverwriteExisting] = useState(true);
  const [addSelectedCities, setAddSelectedCities] = useState<string[]>([]);

  // Modal 2: SİL state
  const [deleteSelectedKeys, setDeleteSelectedKeys] = useState<string[]>([]);
  const [deleteTargetCities, setDeleteTargetCities] = useState<string[]>([]);

  // Modal 3: GÜNCELLE state
  const [updateTab, setUpdateTab] = useState<'value' | 'rename'>('value');
  const [updateTargetKey, setUpdateTargetKey] = useState<string>('');
  const [updateNewValue, setUpdateNewValue] = useState<string>('');
  const [updateNewType, setUpdateNewType] = useState<'string' | 'number' | 'boolean' | 'null'>('string');
  const [renameOldKey, setRenameOldKey] = useState<string>('');
  const [renameNewKey, setRenameNewKey] = useState<string>('');
  const [updateTargetCities, setUpdateTargetCities] = useState<string[]>([]);

  // Scout existing apps & cities from Vault across all environments
  const handleScoutVault = useCallback(async () => {
    setIsScouting(true);
    try {
      const res = await VaultApiService.discoverAppsAndCities(activeConnection, selectedEnv);
      if (res.apps && res.apps.length > 0) {
        setAvailableApps((prev) => Array.from(new Set([...prev, ...res.apps])));
        if (!res.apps.includes(selectedApp) && !availableApps.includes(selectedApp)) {
          setSelectedApp(res.apps[0]);
        }
      }
      if (res.cities && res.cities.length > 0) {
        setAllKnownCities((prev) => Array.from(new Set([...prev, ...res.cities])));
      }
      if (res.detectedEngine && res.detectedEngine !== selectedEngine) {
        setSelectedEngine(res.detectedEngine);
        onUpdateConnection?.({ engine: res.detectedEngine });
      }
      onAddLog(
        'info',
        `Vault keşfi tamamlandı (${selectedEnv} ortamı, Engine: ${res.detectedEngine || selectedEngine})`,
        `${res.cities.length} apps-şehir klasörü ve ${res.apps.length} uygulama bulundu.`
      );
    } catch (err: any) {
      onAddLog('warning', 'Vault keşfi sırasında uyarı', err.message);
    } finally {
      setIsScouting(false);
    }
  }, [activeConnection, selectedEnv, selectedApp, availableApps, selectedEngine, onAddLog, onUpdateConnection]);

  useEffect(() => {
    handleScoutVault();
  }, [selectedEnv, selectedEngine]);

  // Load Secrets for Selected Cities and Application
  const handleLoadCitySecrets = useCallback(async () => {
    if (selectedCities.length === 0) return;

    setIsLoadingSecrets(true);
    setFetchProgress({ current: 0, total: selectedCities.length });
    const results: CitySecretRef[] = [];

    for (let i = 0; i < selectedCities.length; i++) {
      const city = selectedCities[i];
      const path = VaultApiService.getCitySecretPath(selectedEnv, city, selectedApp);

      setFetchProgress({ current: i + 1, total: selectedCities.length });

      try {
        const res = await VaultApiService.readSecret(activeConnection, path);
        if (res.success && res.secret) {
          results.push({
            city,
            path,
            status: 'success',
            secretData: res.secret,
            version: res.secret.currentVersion,
          });
        } else if (res.notFound) {
          results.push({
            city,
            path,
            status: 'not_found',
            error: 'Bu ortamda henüz secret mevcut değil',
          });
        } else {
          results.push({
            city,
            path,
            status: 'not_found',
            error: res.error || 'Secret henüz mevcut değil',
          });
        }
      } catch (err: any) {
        results.push({
          city,
          path,
          status: 'error',
          error: err.message,
        });
      }
    }

    setCitySecrets(results);
    setIsLoadingSecrets(false);
    setFetchProgress(null);
    setSelectedKeyPaths([]); // Reset selection on fresh load

    const loadedCount = results.filter((r) => r.status === 'success').length;
    onAddLog(
      'info',
      `Şehir secret'ları yüklendi (${loadedCount}/${selectedCities.length})`,
      `Uygulama: ${selectedApp}, Ortam: ${selectedEnv}, Engine: ${selectedEngine}`
    );
  }, [selectedCities, selectedEnv, selectedApp, selectedEngine, activeConnection, onAddLog]);

  // Auto load on initial or when app/env/engine changes
  useEffect(() => {
    handleLoadCitySecrets();
  }, [selectedEnv, selectedApp, selectedEngine]);

  // Aggregate keys across loaded city secrets
  const aggregatedKeys: AggregatedKeyRow[] = useMemo(() => {
    const validCitySecrets = citySecrets
      .filter((cs) => cs.status === 'success' && cs.secretData?.data)
      .map((cs) => ({
        city: cs.city,
        data: cs.secretData!.data,
      }));

    return aggregateSecretsKeys(validCitySecrets, ':');
  }, [citySecrets]);

  // Filter keys by search and conflict mode
  const filteredKeys = useMemo(() => {
    return aggregatedKeys.filter((row) => {
      // Search filter
      const matchesSearch =
        !searchQuery ||
        row.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.uniqueValues.some((v) =>
          String(v).toLowerCase().includes(searchQuery.toLowerCase())
        );

      if (!matchesSearch) return false;

      // Conflict filter
      if (filterMode === 'conflicts_only') {
        return row.hasMultipleValues;
      }
      if (filterMode === 'same_only') {
        return !row.hasMultipleValues;
      }
      return true;
    });
  }, [aggregatedKeys, searchQuery, filterMode]);

  // Checkbox helpers
  const handleToggleSelectAllKeys = () => {
    if (selectedKeyPaths.length === filteredKeys.length && filteredKeys.length > 0) {
      setSelectedKeyPaths([]);
    } else {
      setSelectedKeyPaths(filteredKeys.map((k) => k.key));
    }
  };

  const handleToggleKeySelection = (key: string) => {
    setSelectedKeyPaths((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectAllCities = () => {
    if (selectedCities.length === allKnownCities.length) {
      setSelectedCities([]);
    } else {
      setSelectedCities([...allKnownCities]);
    }
  };

  const handleToggleCity = (city: string) => {
    setSelectedCities((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]
    );
  };

  const handleAddNewCity = () => {
    if (!newCityInput.trim()) return;
    let clean = newCityInput.trim().toLowerCase();
    if (!clean.startsWith('apps-')) {
      clean = `apps-${clean}`;
    }
    if (!allKnownCities.includes(clean)) {
      setAllKnownCities((prev) => [...prev, clean]);
    }
    if (!selectedCities.includes(clean)) {
      setSelectedCities((prev) => [...prev, clean]);
    }
    setNewCityInput('');
  };

  // --------------------------------------------------------------------------
  // ACTION 1: EKLEME YAP (Add Key-Values)
  // --------------------------------------------------------------------------
  const openAddModal = () => {
    setAddSelectedCities([...selectedCities]);
    setAddRows([{ id: Math.random().toString(36).substring(2, 7), key: '', value: '', type: 'string' }]);
    setAddJsonInput('{\n  "Logging:LogLevel:Default": "Information"\n}');
    setAddJsonError(null);
    setModalMode('add');
  };

  const handleAddRow = () => {
    setAddRows((prev) => [
      ...prev,
      { id: Math.random().toString(36).substring(2, 7), key: '', value: '', type: 'string' },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    setAddRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handleExecuteAdd = async () => {
    if (addSelectedCities.length === 0) {
      alert('Lütfen en az bir şehir seçin.');
      return;
    }

    let itemsToAdd: { key: string; value: any; type?: string }[] = [];

    if (addInputMode === 'table') {
      const validRows = addRows.filter((r) => r.key.trim().length > 0);
      if (validRows.length === 0) {
        alert('Lütfen en az bir geçerli Anahtar (Key) girin.');
        return;
      }
      itemsToAdd = validRows.map((r) => ({
        key: r.key.trim(),
        value: r.value,
        type: r.type,
      }));
    } else {
      try {
        const parsed = JSON.parse(addJsonInput);
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('Geçerli bir JSON nesnesi girilmelidir.');
        }
        for (const [k, v] of Object.entries(parsed)) {
          itemsToAdd.push({ key: k, value: v, type: typeof v });
        }
      } catch (err: any) {
        setAddJsonError(`JSON Sözdizimi Hatası: ${err.message}`);
        return;
      }
    }

    setIsExecutingAction(true);
    setActionProgress({ current: 0, total: addSelectedCities.length, currentCity: '' });

    let updatedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < addSelectedCities.length; i++) {
      const city = addSelectedCities[i];
      const path = VaultApiService.getCitySecretPath(selectedEnv, city, selectedApp);
      setActionProgress({ current: i + 1, total: addSelectedCities.length, currentCity: city });

      try {
        const readRes = await VaultApiService.readSecret(activeConnection, path);
        const currentData = (readRes.success && readRes.secret?.data) ? readRes.secret.data : { appsettings: {} };
        const updatedData = applyAddKeysToSecretData(currentData, itemsToAdd, ':');

        const writeRes = await VaultApiService.writeSecret(activeConnection, path, updatedData);
        if (writeRes.success) {
          updatedCount++;
        } else {
          errors.push(`${city}: ${writeRes.message}`);
        }
      } catch (err: any) {
        errors.push(`${city}: ${err.message}`);
      }
    }

    setIsExecutingAction(false);
    setActionProgress(null);
    setModalMode('none');

    if (errors.length > 0) {
      onAddLog('warning', `Toplu ekleme tamamlandı (${updatedCount}/${addSelectedCities.length})`, errors.join(', '));
    } else {
      onAddLog('success', `Toplu ekleme başarılı! (${updatedCount} şehir güncellendi)`, `${itemsToAdd.length} anahtar eklendi.`);
    }

    setActionSuccessMessage(`Tebrikler! ${updatedCount} şehirde ${itemsToAdd.length} anahtar başarıyla kaydedildi.`);
    setTimeout(() => setActionSuccessMessage(null), 5000);
    handleLoadCitySecrets();
  };

  // --------------------------------------------------------------------------
  // ACTION 2: SİL (Bulk Delete Keys)
  // --------------------------------------------------------------------------
  const openDeleteModal = (specificKey?: string) => {
    const keysToDelete = specificKey
      ? [specificKey]
      : selectedKeyPaths.length > 0
      ? [...selectedKeyPaths]
      : [];

    if (keysToDelete.length === 0) {
      alert('Lütfen silmek istediğiniz satır(lar)ı tablodan işaretleyin.');
      return;
    }

    setDeleteSelectedKeys(keysToDelete);
    setDeleteTargetCities([...selectedCities]);
    setModalMode('delete');
  };

  const handleExecuteDelete = async () => {
    if (deleteSelectedKeys.length === 0 || deleteTargetCities.length === 0) {
      alert('Silinecek anahtar veya hedef şehir seçilmedi.');
      return;
    }

    setIsExecutingAction(true);
    setActionProgress({ current: 0, total: deleteTargetCities.length, currentCity: '' });

    let updatedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < deleteTargetCities.length; i++) {
      const city = deleteTargetCities[i];
      const path = VaultApiService.getCitySecretPath(selectedEnv, city, selectedApp);
      setActionProgress({ current: i + 1, total: deleteTargetCities.length, currentCity: city });

      try {
        const readRes = await VaultApiService.readSecret(activeConnection, path);
        if (readRes.success && readRes.secret?.data) {
          const updatedData = applyDeleteKeysToSecretData(readRes.secret.data, deleteSelectedKeys, ':');
          const writeRes = await VaultApiService.writeSecret(activeConnection, path, updatedData);
          if (writeRes.success) {
            updatedCount++;
          } else {
            errors.push(`${city}: ${writeRes.message}`);
          }
        }
      } catch (err: any) {
        errors.push(`${city}: ${err.message}`);
      }
    }

    setIsExecutingAction(false);
    setActionProgress(null);
    setModalMode('none');

    if (errors.length > 0) {
      onAddLog('warning', `Toplu silme uyarısı (${updatedCount}/${deleteTargetCities.length})`, errors.join(', '));
    } else {
      onAddLog('success', `Toplu silme başarılı! (${updatedCount} şehir güncellendi)`, `${deleteSelectedKeys.join(', ')} silindi.`);
    }

    setActionSuccessMessage(`${updatedCount} şehirde seçili ${deleteSelectedKeys.length} anahtar başarıyla silindi ve yeni versiyon oluşturuldu.`);
    setTimeout(() => setActionSuccessMessage(null), 5000);
    setSelectedKeyPaths([]);
    handleLoadCitySecrets();
  };

  // --------------------------------------------------------------------------
  // ACTION 3: GÜNCELLE (Bulk Update: Value or Key Name)
  // --------------------------------------------------------------------------
  const openUpdateModal = (specificKey?: string) => {
    const target = specificKey || selectedKeyPaths[0];
    if (!target) {
      alert('Lütfen güncellemek istediğiniz satırı tablodan seçin.');
      return;
    }

    const row = aggregatedKeys.find((r) => r.key === target);
    setUpdateTargetKey(target);
    setRenameOldKey(target);
    setRenameNewKey(target);
    setUpdateNewValue(row ? String(row.uniqueValues[0] ?? '') : '');
    setUpdateNewType(row ? row.type : 'string');
    setUpdateTargetCities([...selectedCities]);
    setUpdateTab('value');
    setModalMode('update_value');
  };

  const handleExecuteUpdate = async () => {
    if (updateTargetCities.length === 0) {
      alert('Lütfen en az bir şehir seçin.');
      return;
    }

    setIsExecutingAction(true);
    setActionProgress({ current: 0, total: updateTargetCities.length, currentCity: '' });

    let updatedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < updateTargetCities.length; i++) {
      const city = updateTargetCities[i];
      const path = VaultApiService.getCitySecretPath(selectedEnv, city, selectedApp);
      setActionProgress({ current: i + 1, total: updateTargetCities.length, currentCity: city });

      try {
        const readRes = await VaultApiService.readSecret(activeConnection, path);
        if (readRes.success && readRes.secret?.data) {
          let updatedData = readRes.secret.data;

          if (updateTab === 'value') {
            updatedData = applyUpdateValueToSecretData(
              updatedData,
              updateTargetKey,
              updateNewValue,
              updateNewType,
              ':'
            );
          } else {
            // Rename key
            if (!renameNewKey.trim() || renameNewKey === renameOldKey) {
              throw new Error('Yeni anahtar adı geçerli ve farklı olmalıdır.');
            }
            updatedData = applyRenameKeyToSecretData(
              updatedData,
              renameOldKey,
              renameNewKey.trim(),
              ':'
            );
          }

          const writeRes = await VaultApiService.writeSecret(activeConnection, path, updatedData);
          if (writeRes.success) {
            updatedCount++;
          } else {
            errors.push(`${city}: ${writeRes.message}`);
          }
        }
      } catch (err: any) {
        errors.push(`${city}: ${err.message}`);
      }
    }

    setIsExecutingAction(false);
    setActionProgress(null);
    setModalMode('none');

    const desc =
      updateTab === 'value'
        ? `'${updateTargetKey}' değeri '${updateNewValue}' olarak güncellendi.`
        : `'${renameOldKey}' -> '${renameNewKey}' olarak yeniden adlandırıldı.`;

    if (errors.length > 0) {
      onAddLog('warning', `Toplu güncelleme uyarısı (${updatedCount}/${updateTargetCities.length})`, errors.join(', '));
    } else {
      onAddLog('success', `Toplu güncelleme başarılı! (${updatedCount} şehir güncellendi)`, desc);
    }

    setActionSuccessMessage(`${updatedCount} şehirde güncelleme başarıyla uygulandı.`);
    setTimeout(() => setActionSuccessMessage(null), 5000);
    handleLoadCitySecrets();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* =========================================================================
          CONTROL & SELECTION HEADER
          ========================================================================= */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 shrink-0 shadow-md">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Top row: Title, Env, App, and Scout */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-950/80 border border-cyan-800/60 rounded-lg text-cyan-400">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                  <span>Toplu Değer Yönetimi & Senkronizasyon</span>
                  <span className="text-[11px] font-mono font-normal px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                    Çoklu Şehir / Multi-City
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Tüm şehirlerdeki veya seçilen uygulamalardaki appsettings değerlerini toplu olarak ekleyin, silin ve güncelleyin.
                </p>
              </div>
            </div>

            {/* Quick Status Pill */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleLoadCitySecrets}
                disabled={isLoadingSecrets}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
                title="Tüm seçili şehirlerin secret'larını yeniden yükle"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSecrets ? 'animate-spin text-cyan-400' : ''}`} />
                <span>Değerleri Yenile</span>
              </button>
            </div>
          </div>

          {/* Configuration Selection Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            {/* 1. Environment Selection */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                <Server className="w-3.5 h-3.5 text-cyan-400" />
                <span>Ortam (Environment)</span>
              </label>
              <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-md border border-slate-800">
                {(['prod', 'dev', 'test'] as VaultEnvironment[]).map((env) => (
                  <button
                    key={env}
                    onClick={() => setSelectedEnv(env)}
                    className={`py-1 text-xs font-medium rounded transition-all capitalize ${
                      selectedEnv === env
                        ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {env}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Secret Engine Selection */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Secret Engine</span>
                </label>
                <span className="text-[10px] text-emerald-400/80 font-mono">
                  {selectedEngine}/
                </span>
              </div>
              <div className="flex gap-1.5">
                <select
                  value={selectedEngine}
                  onChange={(e) => {
                    const eng = e.target.value;
                    setSelectedEngine(eng);
                    onUpdateConnection?.({ engine: eng });
                  }}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                >
                  {availableEngines.map((eng) => (
                    <option key={eng} value={eng}>
                      {eng} (KV)
                    </option>
                  ))}
                </select>
                <div className="flex gap-1">
                  {['secret', 'asis'].map((eng) => (
                    <button
                      key={eng}
                      onClick={() => {
                        setSelectedEngine(eng);
                        onUpdateConnection?.({ engine: eng });
                      }}
                      className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${
                        selectedEngine === eng
                          ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-semibold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                      title={`${eng} engine'ine geç`}
                    >
                      {eng}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Application Selection */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Uygulama ({availableApps.length})</span>
                </label>
                <button
                  onClick={handleScoutVault}
                  disabled={isScouting}
                  className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1"
                  title="Tüm Vault ortamlarını (prod, test, dev) tara ve tüm uygulamaları çek"
                >
                  <Search className={`w-2.5 h-2.5 ${isScouting ? 'animate-spin' : ''}`} />
                  <span>{isScouting ? 'Taranıyor...' : 'Tüm Vault\'u Tara'}</span>
                </button>
              </div>

              <div className="flex gap-1.5">
                <select
                  value={selectedApp}
                  onChange={(e) => setSelectedApp(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                >
                  {availableApps.map((app) => (
                    <option key={app} value={app}>
                      {app}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="özel uygulama adı"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      const custom = e.currentTarget.value.trim();
                      if (!availableApps.includes(custom)) {
                        setAvailableApps((prev) => [...prev, custom]);
                      }
                      setSelectedApp(custom);
                      e.currentTarget.value = '';
                    }
                  }}
                  className="w-28 bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                  title="Listede olmayan başka bir uygulama adı ekleyip Enter'a basın"
                />
              </div>
            </div>

            {/* 4. Path Pattern Info */}
            <div className="flex flex-col justify-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Hedef Vault Yolu Şablonu:
              </span>
              <div className="bg-slate-900/80 px-2.5 py-1.5 rounded border border-slate-800 font-mono text-[11px] text-cyan-300 truncate" title={`${selectedEngine}/${selectedEnv}/apps-{sehir}/${selectedApp}/{sehir}`}>
                {selectedEngine}/{selectedEnv}/apps-&#123;sehir&#125;/{selectedApp}/&#123;sehir&#125;
              </div>
            </div>
          </div>

          {/* Cities / Apps-Sehir Selection Section */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-300">
                  Hedef apps-şehir Listesi ({selectedCities.length}/{allKnownCities.length} Seçili):
                </span>
                <div className="flex items-center gap-1.5 ml-2">
                  <button
                    onClick={() => setSelectedCities([...allKnownCities])}
                    className="px-2.5 py-0.5 text-xs font-bold font-mono rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500 hover:text-slate-950 border border-cyan-500/40 transition-colors flex items-center gap-1"
                    title="Tüm apps-şehir Klasörlerini Seç (ALL)"
                  >
                    <CheckSquare className="w-3 h-3" />
                    <span>ALL (Tümünü Seç)</span>
                  </button>
                  <button
                    onClick={() => setSelectedCities([])}
                    className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded border border-slate-700 transition-colors"
                    title="Seçimi Temizle"
                  >
                    Temizle
                  </button>
                </div>
              </div>

              {/* Add Custom apps-sehir */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Yeni apps-şehir ekle (örn: apps-antalya)"
                  value={newCityInput}
                  onChange={(e) => setNewCityInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNewCity()}
                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 w-56 font-mono"
                />
                <button
                  onClick={handleAddNewCity}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-xs font-medium"
                >
                  Ekle
                </button>
              </div>
            </div>

            {/* apps-sehir Badges / Multi-selection pills */}
            <div className="flex flex-wrap gap-1.5 items-center">
              <button
                onClick={() => {
                  if (selectedCities.length === allKnownCities.length) {
                    setSelectedCities([]);
                  } else {
                    setSelectedCities([...allKnownCities]);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono font-bold transition-all border ${
                  selectedCities.length === allKnownCities.length && allKnownCities.length > 0
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md ring-2 ring-cyan-400/40'
                    : 'bg-slate-900 text-cyan-400 border-cyan-700/60 hover:bg-slate-800 hover:border-cyan-400'
                }`}
                title="Tüm apps-şehir Klasörlerini Seç / Kaldır"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>ALL ({allKnownCities.length})</span>
              </button>
              {allKnownCities.map((city) => {
                const isSelected = selectedCities.includes(city);
                const cityRef = citySecrets.find((c) => c.city === city);
                const statusColor =
                  cityRef?.status === 'success'
                    ? 'border-emerald-500/40 text-emerald-300 bg-emerald-950/20'
                    : cityRef?.status === 'not_found'
                    ? 'border-amber-500/30 text-amber-300/70 bg-amber-950/10'
                    : 'border-slate-800 text-slate-400 bg-slate-900';

                return (
                  <button
                    key={city}
                    onClick={() => handleToggleCity(city)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-all border ${
                      isSelected
                        ? 'bg-slate-800 text-slate-100 border-cyan-500 shadow-sm'
                        : `${statusColor} opacity-60 hover:opacity-100`
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span className="font-mono text-xs">{city}</span>
                    {cityRef?.status === 'success' && (
                      <span className="text-[10px] text-emerald-400 font-sans">
                        v{cityRef.version}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Success Banner */}
      {actionSuccessMessage && (
        <div className="bg-emerald-950/70 border-b border-emerald-800/70 px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button onClick={() => setActionSuccessMessage(null)}>
            <X className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        </div>
      )}

      {/* =========================================================================
          ACTION BAR & TABLE TOOLBAR
          ========================================================================= */}
      <div className="bg-slate-900/60 border-b border-slate-800 px-4 py-3 shrink-0 backdrop-blur">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* LEFT: 3 PRIMARY ACTION BUTTONS (As requested by user!) */}
          <div className="flex items-center gap-2">
            {/* 1. EKLEME YAP */}
            <button
              onClick={openAddModal}
              disabled={isLoadingSecrets || selectedCities.length === 0}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-950/50 transition-all disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>EKLEME YAP</span>
            </button>

            {/* 2. SİL */}
            <button
              onClick={() => openDeleteModal()}
              disabled={isLoadingSecrets || selectedCities.length === 0}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                selectedKeyPaths.length > 0
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-950/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              } disabled:opacity-50`}
            >
              <Trash2 className="w-4 h-4" />
              <span>
                SİL
                {selectedKeyPaths.length > 0 && ` (${selectedKeyPaths.length})`}
              </span>
            </button>

            {/* 3. GÜNCELLE */}
            <button
              onClick={() => openUpdateModal()}
              disabled={isLoadingSecrets || selectedCities.length === 0}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                selectedKeyPaths.length > 0
                  ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm shadow-cyan-950/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              } disabled:opacity-50`}
            >
              <Edit3 className="w-4 h-4" />
              <span>
                GÜNCELLE
                {selectedKeyPaths.length > 0 && ` (${selectedKeyPaths.length})`}
              </span>
            </button>
          </div>

          {/* RIGHT: Search & Conflict Filtering */}
          <div className="flex items-center gap-3">
            {/* Filter mode toggles */}
            <div className="flex bg-slate-950 rounded-md p-0.5 border border-slate-800 text-[11px]">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filterMode === 'all'
                    ? 'bg-slate-800 text-slate-100 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tümü ({aggregatedKeys.length})
              </button>
              <button
                onClick={() => setFilterMode('conflicts_only')}
                className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                  filterMode === 'conflicts_only'
                    ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>Farklı Değerler ({aggregatedKeys.filter((k) => k.hasMultipleValues).length})</span>
              </button>
              <button
                onClick={() => setFilterMode('same_only')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filterMode === 'same_only'
                    ? 'bg-slate-800 text-slate-100 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Ortak Değerler ({aggregatedKeys.filter((k) => !k.hasMultipleValues).length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Key veya Value ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-md pl-8 pr-3 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 w-56"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          AGGREGATED KEY-VALUE TABLE (MAIN VIEW)
          ========================================================================= */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-7xl mx-auto space-y-3">
          {isLoadingSecrets && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-8 text-center space-y-3">
              <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
              <p className="text-sm text-slate-300 font-medium">
                Şehirlerin secret verileri Vault'tan getiriliyor...
              </p>
              {fetchProgress && (
                <p className="text-xs text-slate-500 font-mono">
                  {fetchProgress.current} / {fetchProgress.total} şehir sorgulandı
                </p>
              )}
            </div>
          )}

          {!isLoadingSecrets && filteredKeys.length === 0 && (
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-12 text-center space-y-3">
              <Layers className="w-8 h-8 text-slate-600 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-300">
                {aggregatedKeys.length === 0
                  ? 'Seçilen şehirlerde veya uygulamada henüz secret bulunamadı.'
                  : 'Filtreye uygun anahtar bulunamadı.'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {aggregatedKeys.length === 0
                  ? 'Yeni anahtarlar eklemek için yukarıdaki "EKLEME YAP" butonunu kullanabilir veya uygulamanızı kontrol edebilirsiniz.'
                  : 'Arama teriminizi temizleyebilir veya farklı bir filtre modu seçebilirsiniz.'}
              </p>
              {aggregatedKeys.length === 0 && (
                <button
                  onClick={openAddModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium shadow"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Şimdi Ekleme Yap</span>
                </button>
              )}
            </div>
          )}

          {!isLoadingSecrets && filteredKeys.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none">
                      <th className="py-2.5 px-3 w-10 text-center">
                        <button
                          onClick={handleToggleSelectAllKeys}
                          className="text-slate-400 hover:text-slate-200"
                        >
                          {selectedKeyPaths.length === filteredKeys.length && filteredKeys.length > 0 ? (
                            <CheckSquare className="w-4 h-4 text-cyan-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="py-2.5 px-3 w-80">Anahtar (Key Path)</th>
                      <th className="py-2.5 px-3">Değer (Value) / Durum</th>
                      <th className="py-2.5 px-3 w-44 text-center">Bulunduğu apps-şehir</th>
                      <th className="py-2.5 px-3 w-24 text-center">Tür</th>
                      <th className="py-2.5 px-3 w-28 text-right">Aksiyonlar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {filteredKeys.map((item) => {
                      const isSelected = selectedKeyPaths.includes(item.key);
                      const isExpanded = !!expandedConflictKeys[item.key];
                      const isSensitive = isSensitiveKey(item.key);
                      const isRevealed = !!revealedSensitives[item.key];

                      return (
                        <React.Fragment key={item.key}>
                          <tr
                            className={`hover:bg-slate-800/40 transition-colors ${
                              isSelected ? 'bg-cyan-950/20' : ''
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="py-2 px-3 text-center">
                              <button
                                onClick={() => handleToggleKeySelection(item.key)}
                                className="text-slate-400 hover:text-slate-200"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-cyan-400" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            </td>

                            {/* Key Path */}
                            <td className="py-2 px-3 font-mono font-medium text-slate-200">
                              <div className="flex items-center gap-1.5">
                                <span className="break-all">{item.key}</span>
                                {isSensitive && (
                                  <span className="text-[10px] px-1 py-0.2 rounded bg-amber-950/80 text-amber-400 border border-amber-800/50">
                                    Gizli
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Value / Conflict Status */}
                            <td className="py-2 px-3 font-mono">
                              {!item.hasMultipleValues ? (
                                /* Single common value across all cities */
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`truncate max-w-md ${
                                      item.type === 'number'
                                        ? 'text-cyan-400'
                                        : item.type === 'boolean'
                                        ? 'text-purple-400'
                                        : 'text-emerald-300'
                                    }`}
                                  >
                                    {isSensitive && !isRevealed
                                      ? '••••••••••••••••'
                                      : String(item.uniqueValues[0] ?? 'null')}
                                  </span>

                                  {isSensitive && (
                                    <button
                                      onClick={() =>
                                        setRevealedSensitives((prev) => ({
                                          ...prev,
                                          [item.key]: !prev[item.key],
                                        }))
                                      }
                                      className="text-slate-500 hover:text-slate-300 p-0.5"
                                      title={isRevealed ? 'Gizle' : 'Göster'}
                                    >
                                      {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                  )}

                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(String(item.uniqueValues[0] ?? ''));
                                    }}
                                    className="text-slate-500 hover:text-slate-300 p-0.5"
                                    title="Değeri kopyala"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                /* Multiple different values across cities (User requirement!) */
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/80 text-amber-300 border border-amber-800/60">
                                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                                      <span>Farklı Değerler ({item.uniqueValues.length} farklı)</span>
                                    </span>

                                    <button
                                      onClick={() =>
                                        setExpandedConflictKeys((prev) => ({
                                          ...prev,
                                          [item.key]: !prev[item.key],
                                        }))
                                      }
                                      className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 font-sans underline"
                                    >
                                      <span>{isExpanded ? 'Gizle' : 'apps-şehir Bazlı Listele'}</span>
                                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Present In Cities */}
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`font-mono text-[11px] px-2 py-0.5 rounded-full ${
                                  item.presentInCities.length === selectedCities.length
                                    ? 'bg-slate-800 text-slate-300'
                                    : 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                                }`}
                              >
                                {item.presentInCities.length} / {selectedCities.length} apps-şehir
                              </span>
                            </td>

                            {/* Type */}
                            <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-400">
                              {item.type}
                            </td>

                            {/* Row Action Buttons */}
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => openUpdateModal(item.key)}
                                  className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
                                  title="Bu anahtarı güncelle / adını değiştir"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => openDeleteModal(item.key)}
                                  className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                                  title="Bu anahtarı tüm şehirlerden sil"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded City-by-City Value Breakdown (Crucial for user!) */}
                          {item.hasMultipleValues && isExpanded && (
                            <tr className="bg-slate-950/90 border-b border-slate-800">
                              <td colSpan={6} className="p-3 pl-12">
                                <div className="bg-slate-900 border border-slate-800 rounded-md p-3 space-y-2">
                                  <div className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span>apps-şehir Bazında Mevcut Değerler:</span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {Object.entries(item.cityValues).map(([city, val]) => (
                                      <div
                                        key={city}
                                        className="bg-slate-950 p-2 rounded border border-slate-800/80 flex flex-col gap-1"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-semibold text-slate-300 font-mono flex items-center gap-1">
                                            <Building2 className="w-3 h-3 text-cyan-400" />
                                            {city}
                                          </span>
                                          <button
                                            onClick={() => navigator.clipboard.writeText(String(val))}
                                            className="text-slate-500 hover:text-slate-300"
                                            title="Değeri kopyala"
                                          >
                                            <Copy className="w-3 h-3" />
                                          </button>
                                        </div>
                                        <div className="font-mono text-xs text-cyan-300 truncate bg-slate-900/60 p-1 rounded">
                                          {isSensitive && !isRevealed
                                            ? '••••••••'
                                            : String(val)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          MODAL 1: EKLEME YAP (Add Key-Values across cities)
          ========================================================================= */}
      {modalMode === 'add' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2 text-emerald-400">
                <Plus className="w-5 h-5" />
                <h2 className="text-base font-semibold text-slate-100">
                  Toplu Yeni Değer Ekle (EKLEME YAP)
                </h2>
              </div>
              <button
                onClick={() => setModalMode('none')}
                disabled={isExecutingAction}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <p className="text-xs text-slate-400">
                Seçtiğiniz şehirlerin appsettings / JSON yapısına yeni anahtar ve değerleri toplu olarak ekleyin.
              </p>

              {/* Mode switch: Key-Value Table vs JSON */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">Giriş Modu:</span>
                <div className="flex bg-slate-950 p-0.5 rounded border border-slate-800 text-xs">
                  <button
                    onClick={() => setAddInputMode('table')}
                    className={`px-3 py-1 rounded flex items-center gap-1.5 ${
                      addInputMode === 'table'
                        ? 'bg-emerald-600 text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span>Key-Value Formu</span>
                  </button>
                  <button
                    onClick={() => setAddInputMode('json')}
                    className={`px-3 py-1 rounded flex items-center gap-1.5 ${
                      addInputMode === 'json'
                        ? 'bg-emerald-600 text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>JSON Editörü</span>
                  </button>
                </div>
              </div>

              {/* Form Option 1: Key-Value Rows */}
              {addInputMode === 'table' ? (
                <div className="space-y-2">
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {addRows.map((row, idx) => (
                      <div key={row.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Key (örn: CityConfig:TimeoutSec)"
                          value={row.key}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAddRows((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, key: val } : r))
                            );
                          }}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                        />
                        <select
                          value={row.type}
                          onChange={(e) => {
                            const t = e.target.value as any;
                            setAddRows((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, type: t } : r))
                            );
                          }}
                          className="w-24 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-emerald-500"
                        >
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                          <option value="null">null</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Value (örn: 60)"
                          value={row.value}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAddRows((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, value: val } : r))
                            );
                          }}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          onClick={() => handleRemoveRow(row.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded"
                          title="Satırı sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleAddRow}
                    className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium pt-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Başka Bir Satır Ekle</span>
                  </button>
                </div>
              ) : (
                /* Form Option 2: Raw JSON Input */
                <div className="space-y-1.5">
                  <textarea
                    rows={6}
                    value={addJsonInput}
                    onChange={(e) => {
                      setAddJsonInput(e.target.value);
                      setAddJsonError(null);
                    }}
                    placeholder='{\n  "Redis:Host": "10.0.0.1",\n  "Redis:Port": 6379\n}'
                    className="w-full bg-slate-950 border border-slate-800 rounded-md p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                  {addJsonError && (
                    <p className="text-xs text-rose-400 font-mono">{addJsonError}</p>
                  )}
                </div>
              )}

              {/* Target apps-sehir Selection */}
              <div className="border-t border-slate-800 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Uygulanacak apps-şehir Klasörleri ({addSelectedCities.length}/{selectedCities.length}):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAddSelectedCities([...selectedCities])}
                      className="px-2 py-0.5 text-xs font-mono font-bold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700/60 rounded transition-colors"
                      title="Tüm apps-şehir Klasörlerini Seç (ALL)"
                    >
                      ALL (Tümü)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddSelectedCities([])}
                      className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 rounded transition-colors"
                    >
                      Temizle
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCities.map((city) => {
                    const isChecked = addSelectedCities.includes(city);
                    return (
                      <button
                        key={city}
                        onClick={() =>
                          setAddSelectedCities((prev) =>
                            prev.includes(city)
                              ? prev.filter((c) => c !== city)
                              : [...prev, city]
                          )
                        }
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-all border ${
                          isChecked
                            ? 'bg-emerald-950 text-emerald-200 border-emerald-500'
                            : 'bg-slate-950 text-slate-500 border-slate-800'
                        }`}
                      >
                        {city}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Progress if executing */}
              {isExecutingAction && actionProgress && (
                <div className="bg-slate-950 p-3 rounded border border-emerald-800/60 space-y-2">
                  <div className="flex items-center justify-between text-xs text-emerald-300">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{actionProgress.currentCity} için yeni versiyon yazılıyor...</span>
                    </span>
                    <span className="font-mono">
                      {actionProgress.current} / {actionProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{
                        width: `${(actionProgress.current / actionProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-end gap-2 bg-slate-950/60">
              <button
                onClick={() => setModalMode('none')}
                disabled={isExecutingAction}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 rounded"
              >
                Vazgeç
              </button>
              <button
                onClick={handleExecuteAdd}
                disabled={isExecutingAction}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow-md disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {isExecutingAction ? 'Kaydediliyor...' : 'Ekle ve Vault\'a Kaydet'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: SİL (Bulk Delete Keys with detailed multi-value preview!)
          ========================================================================= */}
      {modalMode === 'delete' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2 text-rose-400">
                <Trash2 className="w-5 h-5" />
                <h2 className="text-base font-semibold text-slate-100">
                  Toplu Satır / Anahtar Silme (SİL)
                </h2>
              </div>
              <button
                onClick={() => setModalMode('none')}
                disabled={isExecutingAction}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="bg-rose-950/30 border border-rose-800/40 rounded-lg p-3 text-xs text-rose-300">
                Aşağıdaki anahtarlar seçili şehirlerin appsettings yapısından kaldırılacak ve Vault KV v2 üzerinde yeni versiyon oluşturulacaktır.
              </div>

              {/* List of keys to delete and their values (with multi-value breakdown as user requested!) */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-slate-300">
                  Silinecek Anahtar ve Değerler ({deleteSelectedKeys.length} adet):
                </span>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {deleteSelectedKeys.map((key) => {
                    const row = aggregatedKeys.find((r) => r.key === key);
                    const isSensitive = isSensitiveKey(key);

                    return (
                      <div
                        key={key}
                        className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-semibold text-rose-400 break-all">
                            {key}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500">
                            {row?.presentInCities.length || 0} şehirde mevcut
                          </span>
                        </div>

                        {/* VALUE DISPLAY: Single Value OR Multiple Values List */}
                        {!row?.hasMultipleValues ? (
                          <div className="bg-slate-900/80 px-2.5 py-1.5 rounded font-mono text-xs text-slate-300 truncate">
                            <span className="text-slate-500 mr-2">Değer:</span>
                            {isSensitive ? '••••••••••••••••' : String(row?.uniqueValues[0] ?? 'null')}
                          </div>
                        ) : (
                          /* Detailed multi-value list as required by user */
                          <div className="bg-slate-900/80 p-2.5 rounded border border-amber-900/30 space-y-1.5">
                            <div className="text-[11px] font-semibold text-amber-300 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>apps-şehir Klasörleri Arasında Farklı Değerler Bulunuyor ({row.uniqueValues.length} farklı):</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] font-mono">
                              {Object.entries(row.cityValues).map(([city, val]) => (
                                <div
                                  key={city}
                                  className="bg-slate-950 px-2 py-1 rounded flex items-center justify-between gap-2"
                                >
                                  <span className="text-slate-400 font-mono">{city}:</span>
                                  <span className="text-amber-200 truncate max-w-[140px]">
                                    {isSensitive ? '••••••••' : String(val)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Target apps-sehir Selection */}
              <div className="border-t border-slate-800 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Hangi apps-şehir Klasörlerinden Silinsin? ({deleteTargetCities.length}/{selectedCities.length}):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteTargetCities([...selectedCities])}
                      className="px-2 py-0.5 text-xs font-mono font-bold text-rose-300 bg-rose-950/60 hover:bg-rose-900 border border-rose-700/60 rounded transition-colors"
                      title="Tüm apps-şehir Klasörlerini Seç (ALL)"
                    >
                      ALL (Tümü)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTargetCities([])}
                      className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 rounded transition-colors"
                    >
                      Temizle
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCities.map((city) => {
                    const isChecked = deleteTargetCities.includes(city);
                    return (
                      <button
                        key={city}
                        onClick={() =>
                          setDeleteTargetCities((prev) =>
                            prev.includes(city)
                              ? prev.filter((c) => c !== city)
                              : [...prev, city]
                          )
                        }
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-all border ${
                          isChecked
                            ? 'bg-rose-950 text-rose-200 border-rose-500'
                            : 'bg-slate-950 text-slate-500 border-slate-800'
                        }`}
                      >
                        {city}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Progress if executing */}
              {isExecutingAction && actionProgress && (
                <div className="bg-slate-950 p-3 rounded border border-rose-800/60 space-y-2">
                  <div className="flex items-center justify-between text-xs text-rose-300">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{actionProgress.currentCity} için silme uygulanıyor...</span>
                    </span>
                    <span className="font-mono">
                      {actionProgress.current} / {actionProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-rose-500 h-full transition-all duration-300"
                      style={{
                        width: `${(actionProgress.current / actionProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-end gap-2 bg-slate-950/60">
              <button
                onClick={() => setModalMode('none')}
                disabled={isExecutingAction}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 rounded"
              >
                Vazgeç
              </button>
              <button
                onClick={handleExecuteDelete}
                disabled={isExecutingAction}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold shadow-md disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>
                  {isExecutingAction ? 'Siliniyor...' : 'Onayla ve Tüm Şehirlerden Sil'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: GÜNCELLE (Bulk Update Value or Key Name)
          ========================================================================= */}
      {modalMode === 'update_value' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2 text-cyan-400">
                <Edit3 className="w-5 h-5" />
                <h2 className="text-base font-semibold text-slate-100">
                  Toplu Değer veya Key Adı Güncelleme (GÜNCELLE)
                </h2>
              </div>
              <button
                onClick={() => setModalMode('none')}
                disabled={isExecutingAction}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Tab Selector: Değer Güncelle vs Anahtar Adı Değiştir */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setUpdateTab('value')}
                  className={`py-1.5 text-xs font-medium rounded transition-all ${
                    updateTab === 'value'
                      ? 'bg-cyan-600 text-white font-semibold shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  1. Değeri Güncelle (Value Update)
                </button>
                <button
                  onClick={() => setUpdateTab('rename')}
                  className={`py-1.5 text-xs font-medium rounded transition-all ${
                    updateTab === 'rename'
                      ? 'bg-cyan-600 text-white font-semibold shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  2. Anahtar Adını Değiştir (Key Rename)
                </button>
              </div>

              {/* Current Key Indicator */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Hedef Anahtar (Target Key):
                </span>
                <div className="font-mono text-xs text-cyan-300 font-semibold break-all">
                  {updateTargetKey}
                </div>
              </div>

              {/* Tab 1: Update Value */}
              {updateTab === 'value' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-slate-300 mb-1 block">
                        Yeni Değer (New Value):
                      </label>
                      <input
                        type="text"
                        value={updateNewValue}
                        onChange={(e) => setUpdateNewValue(e.target.value)}
                        placeholder="Yeni değeri yazın..."
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-300 mb-1 block">
                        Veri Türü:
                      </label>
                      <select
                        value={updateNewType}
                        onChange={(e) => setUpdateNewType(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                      >
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="null">null</option>
                      </select>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400">
                    Bu değer seçtiğiniz tüm şehirlerdeki <code className="text-cyan-300 font-mono">{updateTargetKey}</code> alanına yazılacaktır.
                  </p>
                </div>
              )}

              {/* Tab 2: Rename Key */}
              {updateTab === 'rename' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">
                      Yeni Anahtar Adı (New Key Path):
                    </label>
                    <input
                      type="text"
                      value={renameNewKey}
                      onChange={(e) => setRenameNewKey(e.target.value)}
                      placeholder="örn: CityConfig:WorkerLimit"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="bg-indigo-950/30 border border-indigo-800/40 p-3 rounded-md text-xs text-indigo-300">
                    Mevcut değerler (şehir bazındaki farklı değerler dahil) aynen korunur. Yalnızca anahtar adı değiştirilir.
                  </div>
                </div>
              )}

              {/* Target Cities */}
              <div className="border-t border-slate-800 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Uygulanacak apps-şehir Klasörleri ({updateTargetCities.length}/{selectedCities.length}):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUpdateTargetCities([...selectedCities])}
                      className="px-2 py-0.5 text-xs font-mono font-bold text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-700/60 rounded transition-colors"
                      title="Tüm apps-şehir Klasörlerini Seç (ALL)"
                    >
                      ALL (Tümü)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUpdateTargetCities([])}
                      className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 rounded transition-colors"
                    >
                      Temizle
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCities.map((city) => {
                    const isChecked = updateTargetCities.includes(city);
                    return (
                      <button
                        key={city}
                        onClick={() =>
                          setUpdateTargetCities((prev) =>
                            prev.includes(city)
                              ? prev.filter((c) => c !== city)
                              : [...prev, city]
                          )
                        }
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-all border ${
                          isChecked
                            ? 'bg-cyan-950 text-cyan-200 border-cyan-500'
                            : 'bg-slate-950 text-slate-500 border-slate-800'
                        }`}
                      >
                        {city}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Progress if executing */}
              {isExecutingAction && actionProgress && (
                <div className="bg-slate-950 p-3 rounded border border-cyan-800/60 space-y-2">
                  <div className="flex items-center justify-between text-xs text-cyan-300">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{actionProgress.currentCity} için güncelleme uygulanıyor...</span>
                    </span>
                    <span className="font-mono">
                      {actionProgress.current} / {actionProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-cyan-500 h-full transition-all duration-300"
                      style={{
                        width: `${(actionProgress.current / actionProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-end gap-2 bg-slate-950/60">
              <button
                onClick={() => setModalMode('none')}
                disabled={isExecutingAction}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 rounded"
              >
                Vazgeç
              </button>
              <button
                onClick={handleExecuteUpdate}
                disabled={isExecutingAction}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold shadow-md disabled:opacity-50"
              >
                <Edit3 className="w-4 h-4" />
                <span>
                  {isExecutingAction ? 'Güncelleniyor...' : 'Güncelle ve Kaydet'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
