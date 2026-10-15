import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  VaultConnection,
  VaultEnvironment,
  AggregatedKeyRow,
  CitySecretRef,
  BatchModalMode,
  AppFileItem,
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
  FileText,
  FileCode,
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
  // Configuration State
  const [selectedEnv, setSelectedEnv] = useState<VaultEnvironment>(connection.selectedEnv || 'prod');
  const [selectedEngine, setSelectedEngine] = useState<string>(connection.engine || 'asis');
  const [availableEngines, setAvailableEngines] = useState<string[]>(['asis', 'secret', 'secrets']);
  const [selectedApp, setSelectedApp] = useState<string>(connection.appName || 'afc-saas-api');
  const [availableApps, setAvailableApps] = useState<string[]>(['afc-saas-api', 'afc-saas']);
  const [appCitiesMap, setAppCitiesMap] = useState<Record<string, string[]>>({});

  // Discovered Files under apps-*/selectedApp
  const [allAppFiles, setAllAppFiles] = useState<AppFileItem[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [newFileInput, setNewFileInput] = useState('');
  const [isScouting, setIsScouting] = useState(false);

  // Computed Aliases
  const allKnownCities = useMemo(() => allAppFiles.map((f) => f.id), [allAppFiles]);
  const selectedCities = useMemo(() => selectedFileIds, [selectedFileIds]);
  const setSelectedCities = setSelectedFileIds;
  const setAllKnownCities = (_cities: string[]) => {};
  const sortedAppFiles = useMemo(
    () => [...allAppFiles].sort((a, b) => a.fileName.localeCompare(b.fileName)),
    [allAppFiles]
  );

  // Stable refs for callbacks to prevent cascading re-render loops
  const onAddLogRef = useRef(onAddLog);
  useEffect(() => {
    onAddLogRef.current = onAddLog;
  }, [onAddLog]);

  const onUpdateConnectionRef = useRef(onUpdateConnection);
  useEffect(() => {
    onUpdateConnectionRef.current = onUpdateConnection;
  }, [onUpdateConnection]);

  // Active connection memo with dynamic engine and environment
  const activeConnection = useMemo<VaultConnection>(() => {
    return {
      ...connection,
      engine: selectedEngine,
      selectedEnv,
      appName: selectedApp,
    };
  }, [
    connection.url,
    connection.token,
    connection.engine,
    connection.isDemoMode,
    selectedEngine,
    selectedEnv,
    selectedApp,
  ]);

  // Loaded Secret Data per File
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
  const [addSelectedFileIds, setAddSelectedFileIds] = useState<string[]>([]);
  const addSelectedCities = addSelectedFileIds;
  const setAddSelectedCities = setAddSelectedFileIds;

  // Modal 2: SİL state
  const [deleteSelectedKeys, setDeleteSelectedKeys] = useState<string[]>([]);
  const [deleteTargetFileIds, setDeleteTargetFileIds] = useState<string[]>([]);
  const deleteTargetCities = deleteTargetFileIds;
  const setDeleteTargetCities = setDeleteTargetFileIds;

  // Modal 3: GÜNCELLE state
  const [updateTab, setUpdateTab] = useState<'value' | 'rename'>('value');
  const [updateTargetKey, setUpdateTargetKey] = useState<string>('');
  const [updateNewValue, setUpdateNewValue] = useState<string>('');
  const [updateNewType, setUpdateNewType] = useState<'string' | 'number' | 'boolean' | 'null'>('string');
  const [renameOldKey, setRenameOldKey] = useState<string>('');
  const [renameNewKey, setRenameNewKey] = useState<string>('');
  const [updateTargetFileIds, setUpdateTargetFileIds] = useState<string[]>([]);
  const updateTargetCities = updateTargetFileIds;
  const setUpdateTargetCities = setUpdateTargetFileIds;

  // Discover and list ALL actual files under apps-*/{appName}
  const loadAppFiles = useCallback(
    async (app: string, env: VaultEnvironment) => {
      if (!app) return;
      setIsLoadingSecrets(true);
      try {
        const files = await VaultApiService.getAppFiles(activeConnection, env, app);
        setAllAppFiles(files);
        const fileIds = files.map((f) => f.id);
        setSelectedFileIds(fileIds);
        onAddLogRef.current(
          'info',
          `"${app}" altındaki dosyalar listelendi (${env} ortamı)`,
          files.length > 0
            ? `${files.length} dosya bulundu: ${files.map((f) => f.fileName).join(', ')}`
            : 'Bu uygulama için henüz dosya bulunamadı.'
        );
      } catch (err: any) {
        onAddLogRef.current('warning', 'Dosyalar listelenirken hata', err.message);
      } finally {
        setIsLoadingSecrets(false);
      }
    },
    [activeConnection]
  );

  // Scout existing apps from Vault across all environments
  const handleScoutVault = useCallback(async () => {
    setIsScouting(true);
    try {
      const res = await VaultApiService.discoverAppsAndCities(activeConnection, selectedEnv);
      const currentMap = res.appCitiesMap || {};
      setAppCitiesMap(currentMap);

      let targetApp = selectedApp;
      if (res.apps && res.apps.length > 0) {
        setAvailableApps(res.apps);
        if (!res.apps.includes(selectedApp)) {
          targetApp = res.apps[0];
          setSelectedApp(targetApp);
        }
      }

      if (res.detectedEngine && res.detectedEngine !== selectedEngine) {
        setSelectedEngine(res.detectedEngine);
        onUpdateConnectionRef.current?.({ engine: res.detectedEngine });
      }

      await loadAppFiles(targetApp, selectedEnv);
    } catch (err: any) {
      onAddLogRef.current('warning', 'Vault keşfi sırasında uyarı', err.message);
    } finally {
      setIsScouting(false);
    }
  }, [activeConnection, selectedEnv, selectedApp, selectedEngine, loadAppFiles]);

  // Scout vault on mount or when environment changes
  useEffect(() => {
    handleScoutVault();
  }, [selectedEnv]);

  // When user manually selects another app or engine, reload files
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (selectedApp) {
      loadAppFiles(selectedApp, selectedEnv);
    }
  }, [selectedApp, selectedEngine]);

  // Load Secrets for Selected Files
  const handleLoadSecrets = useCallback(async () => {
    const filesToLoad = allAppFiles.filter((f) => selectedFileIds.includes(f.id));
    if (filesToLoad.length === 0 || !selectedApp) {
      setCitySecrets([]);
      setIsLoadingSecrets(false);
      return;
    }

    setIsLoadingSecrets(true);
    setFetchProgress({ current: 0, total: filesToLoad.length });
    const results: CitySecretRef[] = [];

    for (let i = 0; i < filesToLoad.length; i++) {
      const file = filesToLoad[i];
      setFetchProgress({ current: i + 1, total: filesToLoad.length });

      try {
        const res = await VaultApiService.readSecret(activeConnection, file.path);
        if (res.success && res.secret) {
          results.push({
            city: file.displayName,
            path: file.path,
            status: 'success',
            secretData: res.secret,
            version: res.secret.currentVersion,
            fileName: file.fileName,
            appsFolder: file.appsFolder,
            fileId: file.id,
          });
        } else if (res.notFound) {
          results.push({
            city: file.displayName,
            path: file.path,
            status: 'not_found',
            error: 'Secret henüz mevcut değil',
            fileName: file.fileName,
            appsFolder: file.appsFolder,
            fileId: file.id,
          });
        } else {
          results.push({
            city: file.displayName,
            path: file.path,
            status: 'not_found',
            error: res.error || 'Secret henüz mevcut değil',
            fileName: file.fileName,
            appsFolder: file.appsFolder,
            fileId: file.id,
          });
        }
      } catch (err: any) {
        results.push({
          city: file.displayName,
          path: file.path,
          status: 'error',
          error: err.message,
          fileName: file.fileName,
          appsFolder: file.appsFolder,
          fileId: file.id,
        });
      }
    }

    setCitySecrets(results);
    setIsLoadingSecrets(false);
    setFetchProgress(null);
    setSelectedKeyPaths([]); // Reset selection on fresh load

    const loadedCount = results.filter((r) => r.status === 'success').length;
    onAddLogRef.current(
      'info',
      `Dosya secret'ları yüklendi (${loadedCount}/${filesToLoad.length})`,
      `Uygulama: ${selectedApp}, Ortam: ${selectedEnv}, Engine: ${selectedEngine}`
    );
  }, [allAppFiles, selectedFileIds, selectedApp, selectedEnv, selectedEngine, activeConnection]);

  const selectedFilesKey = useMemo(() => selectedFileIds.slice().sort().join(','), [selectedFileIds]);
  const allFilesKey = useMemo(() => allAppFiles.map((f) => f.path).join(','), [allAppFiles]);

  const handleLoadSecretsRef = useRef(handleLoadSecrets);
  useEffect(() => {
    handleLoadSecretsRef.current = handleLoadSecrets;
  });

  // Auto load when selected files change or when files list is populated
  useEffect(() => {
    if (selectedFilesKey && allFilesKey) {
      handleLoadSecretsRef.current();
    } else if (!selectedFilesKey) {
      setCitySecrets([]);
    }
  }, [selectedFilesKey, allFilesKey]);

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

  const handleSelectAllFiles = () => {
    if (selectedFileIds.length === allAppFiles.length) {
      setSelectedFileIds([]);
    } else {
      setSelectedFileIds(allAppFiles.map((f) => f.id));
    }
  };

  const handleToggleFile = (fileId: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  // Backward-compatible city selection helpers
  const handleSelectAllCities = handleSelectAllFiles;
  const handleToggleCity = handleToggleFile;

  const handleAddNewFile = () => {
    if (!newFileInput.trim() || !selectedApp) return;
    const input = newFileInput.trim();
    let appsFolder = '';
    let fileName = '';
    if (input.includes('/')) {
      const parts = input.split('/');
      appsFolder = parts[0].startsWith('apps-') ? parts[0] : `apps-${parts[0]}`;
      fileName = parts.slice(1).join('/');
    } else if (input.startsWith('apps-')) {
      appsFolder = input;
      fileName = input.replace(/^apps-/, '');
    } else {
      appsFolder = `apps-${input}`;
      fileName = input;
    }
    const id = `${appsFolder}/${fileName}`;
    const path = `${selectedEnv}/${appsFolder}/${selectedApp}/${fileName}`;
    const newFile: AppFileItem = {
      id,
      fileName,
      appsFolder,
      path,
      displayName: `${fileName} (${appsFolder})`,
    };
    setAllAppFiles((prev) => (prev.some((f) => f.id === id) ? prev : [...prev, newFile]));
    setSelectedFileIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setNewFileInput('');
  };

  const handleAddNewCity = handleAddNewFile;

  // --------------------------------------------------------------------------
  // ACTION 1: EKLEME YAP (Add Key-Values to Selected Files)
  // --------------------------------------------------------------------------
  const openAddModal = () => {
    setAddSelectedFileIds(selectedFileIds.length > 0 ? [...selectedFileIds] : allAppFiles.map((f) => f.id));
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
    const targetFiles = allAppFiles.filter((f) => addSelectedFileIds.includes(f.id));
    if (targetFiles.length === 0) {
      alert('Lütfen en az bir hedef dosya seçin.');
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
    setActionProgress({ current: 0, total: targetFiles.length, currentCity: '' });

    let updatedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < targetFiles.length; i++) {
      const file = targetFiles[i];
      setActionProgress({ current: i + 1, total: targetFiles.length, currentCity: file.fileName });

      try {
        const readRes = await VaultApiService.readSecret(activeConnection, file.path);
        const currentData = (readRes.success && readRes.secret?.data) ? readRes.secret.data : { appsettings: {} };
        const updatedData = applyAddKeysToSecretData(currentData, itemsToAdd, ':');

        const writeRes = await VaultApiService.writeSecret(activeConnection, file.path, updatedData);
        if (writeRes.success) {
          updatedCount++;
        } else {
          errors.push(`${file.fileName}: ${writeRes.message}`);
        }
      } catch (err: any) {
        errors.push(`${file.fileName}: ${err.message}`);
      }
    }

    setIsExecutingAction(false);
    setActionProgress(null);
    setModalMode('none');

    if (errors.length > 0) {
      onAddLog('warning', `Toplu ekleme tamamlandı (${updatedCount}/${targetFiles.length})`, errors.join(', '));
    } else {
      onAddLog('success', `Toplu ekleme başarılı! (${updatedCount} dosyaya yazıldı)`, `${itemsToAdd.length} anahtar eklendi.`);
    }

    setActionSuccessMessage(`Tebrikler! ${updatedCount} dosyada ${itemsToAdd.length} anahtar başarıyla kaydedildi.`);
    setTimeout(() => setActionSuccessMessage(null), 5000);
    handleLoadSecrets();
  };

  // --------------------------------------------------------------------------
  // ACTION 2: SİL (Bulk Delete Keys from Selected Files)
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
    setDeleteTargetFileIds(selectedFileIds.length > 0 ? [...selectedFileIds] : allAppFiles.map((f) => f.id));
    setModalMode('delete');
  };

  const handleExecuteDelete = async () => {
    const targetFiles = allAppFiles.filter((f) => deleteTargetFileIds.includes(f.id));
    if (deleteSelectedKeys.length === 0 || targetFiles.length === 0) {
      alert('Silinecek anahtar veya hedef dosya seçilmedi.');
      return;
    }

    setIsExecutingAction(true);
    setActionProgress({ current: 0, total: targetFiles.length, currentCity: '' });

    let updatedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < targetFiles.length; i++) {
      const file = targetFiles[i];
      setActionProgress({ current: i + 1, total: targetFiles.length, currentCity: file.fileName });

      try {
        const readRes = await VaultApiService.readSecret(activeConnection, file.path);
        if (readRes.success && readRes.secret?.data) {
          const updatedData = applyDeleteKeysToSecretData(readRes.secret.data, deleteSelectedKeys, ':');
          const writeRes = await VaultApiService.writeSecret(activeConnection, file.path, updatedData);
          if (writeRes.success) {
            updatedCount++;
          } else {
            errors.push(`${file.fileName}: ${writeRes.message}`);
          }
        }
      } catch (err: any) {
        errors.push(`${file.fileName}: ${err.message}`);
      }
    }

    setIsExecutingAction(false);
    setActionProgress(null);
    setModalMode('none');

    if (errors.length > 0) {
      onAddLog('warning', `Toplu silme uyarısı (${updatedCount}/${targetFiles.length})`, errors.join(', '));
    } else {
      onAddLog('success', `Toplu silme başarılı! (${updatedCount} dosyada güncellendi)`, `${deleteSelectedKeys.join(', ')} silindi.`);
    }

    setActionSuccessMessage(`${updatedCount} dosyada seçili ${deleteSelectedKeys.length} anahtar başarıyla silindi ve yeni versiyon oluşturuldu.`);
    setTimeout(() => setActionSuccessMessage(null), 5000);
    setSelectedKeyPaths([]);
    handleLoadSecrets();
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
    setUpdateTargetFileIds(selectedFileIds.length > 0 ? [...selectedFileIds] : allAppFiles.map((f) => f.id));
    setUpdateTab('value');
    setModalMode('update_value');
  };

  const handleExecuteUpdate = async () => {
    const targetFiles = allAppFiles.filter((f) => updateTargetFileIds.includes(f.id));
    if (targetFiles.length === 0) {
      alert('Lütfen en az bir hedef dosya seçin.');
      return;
    }

    setIsExecutingAction(true);
    setActionProgress({ current: 0, total: targetFiles.length, currentCity: '' });

    let updatedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < targetFiles.length; i++) {
      const file = targetFiles[i];
      setActionProgress({ current: i + 1, total: targetFiles.length, currentCity: file.fileName });

      try {
        const readRes = await VaultApiService.readSecret(activeConnection, file.path);
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

          const writeRes = await VaultApiService.writeSecret(activeConnection, file.path, updatedData);
          if (writeRes.success) {
            updatedCount++;
          } else {
            errors.push(`${file.fileName}: ${writeRes.message}`);
          }
        }
      } catch (err: any) {
        errors.push(`${file.fileName}: ${err.message}`);
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
      onAddLog('warning', `Toplu güncelleme uyarısı (${updatedCount}/${targetFiles.length})`, errors.join(', '));
    } else {
      onAddLog('success', `Toplu güncelleme başarılı! (${updatedCount} dosyada uygulandı)`, desc);
    }

    setActionSuccessMessage(`${updatedCount} dosyada güncelleme başarıyla uygulandı.`);
    setTimeout(() => setActionSuccessMessage(null), 5000);
    handleLoadSecrets();
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
                onClick={handleLoadSecrets}
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
                      {app} ({appCitiesMap[app]?.length || 0} apps-şehir)
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
              <div className="bg-slate-900/80 px-2.5 py-1.5 rounded border border-slate-800 font-mono text-[11px] text-cyan-300 truncate" title={`${selectedEngine}/${selectedEnv}/apps-{sehir}/${selectedApp}/{dosyadi}`}>
                {selectedEngine}/{selectedEnv}/apps-&#123;sehir&#125;/{selectedApp}/&#123;dosyadi&#125;
              </div>
            </div>
          </div>

          {/* Files List / Uygulama Dosyaları Section */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-300">
                  <span className="text-cyan-300 font-mono">{selectedApp}</span> Altındaki Dosyalar ({selectedFileIds.length}/{allAppFiles.length} Seçili):
                </span>
                {allAppFiles.length > 0 && (
                  <div className="flex items-center gap-1.5 ml-2">
                    <button
                      onClick={handleSelectAllFiles}
                      className="px-2.5 py-0.5 text-xs font-bold font-mono rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500 hover:text-slate-950 border border-cyan-500/40 transition-colors flex items-center gap-1"
                      title="Tüm Dosyaları Seç (ALL)"
                    >
                      <CheckSquare className="w-3 h-3" />
                      <span>ALL ({selectedFileIds.length === allAppFiles.length ? 'Tümünü Kaldır' : 'Tümünü Seç'})</span>
                    </button>
                    <button
                      onClick={() => setSelectedFileIds([])}
                      className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded border border-slate-700 transition-colors"
                      title="Seçimi Temizle"
                    >
                      Temizle
                    </button>
                    <button
                      onClick={() => loadAppFiles(selectedApp, selectedEnv)}
                      disabled={isLoadingSecrets}
                      className="px-2.5 py-0.5 text-xs text-emerald-300 hover:text-emerald-200 bg-emerald-950/40 hover:bg-emerald-900/60 rounded border border-emerald-800/60 transition-colors flex items-center gap-1"
                      title="Dosya listesini yeniden yükle"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingSecrets ? 'animate-spin' : ''}`} />
                      <span>Yenile</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Add Custom File */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Yeni dosya ekle (örn: apps-bursa/bursa veya config)"
                  value={newFileInput}
                  onChange={(e) => setNewFileInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNewFile()}
                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 w-64 font-mono"
                />
                <button
                  onClick={handleAddNewFile}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-xs font-medium"
                >
                  Ekle
                </button>
              </div>
            </div>

            {/* File Badges - Listed by File Name */}
            <div className="flex flex-wrap gap-1.5 items-center">
              {allAppFiles.length === 0 ? (
                <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-lg p-3 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2 w-full">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong className="text-slate-200 font-mono">{selectedApp || 'Uygulama'}</strong> altında bu ortamda (<strong className="text-cyan-300 font-mono">{selectedEnv}</strong>) henüz secret dosyası bulunamadı.
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Yukarıdaki alandan yeni dosya ekleyebilir veya "Tüm Vault'u Tara" butonuna tıklayabilirsiniz.
                  </span>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleSelectAllFiles}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono font-bold transition-all border ${
                      selectedFileIds.length === allAppFiles.length && allAppFiles.length > 0
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md ring-2 ring-cyan-400/40'
                        : 'bg-slate-900 text-cyan-400 border-cyan-700/60 hover:bg-slate-800 hover:border-cyan-400'
                    }`}
                    title="Tüm Dosyaları Seç / Kaldır"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>ALL ({allAppFiles.length})</span>
                  </button>
                  {sortedAppFiles.map((file) => {
                    const isSelected = selectedFileIds.includes(file.id);
                    const fileRef = citySecrets.find((c) => c.fileId === file.id || c.city === file.displayName);
                    const statusColor =
                      fileRef?.status === 'success'
                        ? 'border-emerald-500/40 text-emerald-300 bg-emerald-950/20'
                        : fileRef?.status === 'not_found'
                        ? 'border-amber-500/30 text-amber-300/70 bg-amber-950/10'
                        : 'border-slate-800 text-slate-400 bg-slate-900';

                    return (
                      <button
                        key={file.id}
                        onClick={() => handleToggleFile(file.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-all border ${
                          isSelected
                            ? 'bg-slate-800 text-slate-100 border-cyan-500 shadow-sm ring-1 ring-cyan-500/30'
                            : `${statusColor} opacity-60 hover:opacity-100`
                        }`}
                        title={file.path}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-500" />
                        )}
                        <FileText className="w-3 h-3 text-cyan-400/80" />
                        <span className="font-semibold text-slate-100">{file.fileName}</span>
                        {file.appsFolder && (
                          <span className="text-[10px] text-slate-400 bg-slate-950 px-1 py-0.2 rounded border border-slate-800 font-sans">
                            {file.appsFolder}
                          </span>
                        )}
                        {fileRef?.status === 'success' && (
                          <span className="text-[10px] text-emerald-400 font-sans font-bold">
                            v{fileRef.version}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
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

              {/* Target Files Selection */}
              <div className="border-t border-slate-800 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Uygulanacak Hedef Dosyalar ({addSelectedFileIds.length}/{allAppFiles.length}):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAddSelectedFileIds(allAppFiles.map((f) => f.id))}
                      className="px-2 py-0.5 text-xs font-mono font-bold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700/60 rounded transition-colors"
                      title="Tüm Dosyaları Seç (ALL)"
                    >
                      ALL (Tümü)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddSelectedFileIds([])}
                      className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 rounded transition-colors"
                    >
                      Temizle
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {sortedAppFiles.map((file) => {
                    const isChecked = addSelectedFileIds.includes(file.id);
                    return (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() =>
                          setAddSelectedFileIds((prev) =>
                            prev.includes(file.id)
                              ? prev.filter((id) => id !== file.id)
                              : [...prev, file.id]
                          )
                        }
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-all border flex items-center gap-1.5 ${
                          isChecked
                            ? 'bg-emerald-950 text-emerald-200 border-emerald-500 shadow-sm ring-1 ring-emerald-500/40'
                            : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                        }`}
                        title={file.path}
                      >
                        <FileText className="w-3 h-3" />
                        <span className="font-semibold">{file.fileName}</span>
                        {file.appsFolder && (
                          <span className="text-[10px] text-slate-400 font-sans">({file.appsFolder})</span>
                        )}
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

              {/* Target Files Selection */}
              <div className="border-t border-slate-800 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Hangi Dosyalardan Silinsin? ({deleteTargetFileIds.length}/{allAppFiles.length}):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteTargetFileIds(allAppFiles.map((f) => f.id))}
                      className="px-2 py-0.5 text-xs font-mono font-bold text-rose-300 bg-rose-950/60 hover:bg-rose-900 border border-rose-700/60 rounded transition-colors"
                      title="Tüm Dosyaları Seç (ALL)"
                    >
                      ALL (Tümü)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTargetFileIds([])}
                      className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 rounded transition-colors"
                    >
                      Temizle
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {sortedAppFiles.map((file) => {
                    const isChecked = deleteTargetFileIds.includes(file.id);
                    return (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() =>
                          setDeleteTargetFileIds((prev) =>
                            prev.includes(file.id)
                              ? prev.filter((id) => id !== file.id)
                              : [...prev, file.id]
                          )
                        }
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-all border flex items-center gap-1.5 ${
                          isChecked
                            ? 'bg-rose-950 text-rose-200 border-rose-500 shadow-sm ring-1 ring-rose-500/40'
                            : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                        }`}
                        title={file.path}
                      >
                        <FileText className="w-3 h-3" />
                        <span className="font-semibold">{file.fileName}</span>
                        {file.appsFolder && (
                          <span className="text-[10px] text-slate-400 font-sans">({file.appsFolder})</span>
                        )}
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

              {/* Target Files Selection */}
              <div className="border-t border-slate-800 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Uygulanacak Hedef Dosyalar ({updateTargetFileIds.length}/{allAppFiles.length}):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUpdateTargetFileIds(allAppFiles.map((f) => f.id))}
                      className="px-2 py-0.5 text-xs font-mono font-bold text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-700/60 rounded transition-colors"
                      title="Tüm Dosyaları Seç (ALL)"
                    >
                      ALL (Tümü)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUpdateTargetFileIds([])}
                      className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 rounded transition-colors"
                    >
                      Temizle
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {sortedAppFiles.map((file) => {
                    const isChecked = updateTargetFileIds.includes(file.id);
                    return (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() =>
                          setUpdateTargetFileIds((prev) =>
                            prev.includes(file.id)
                              ? prev.filter((id) => id !== file.id)
                              : [...prev, file.id]
                          )
                        }
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-all border flex items-center gap-1.5 ${
                          isChecked
                            ? 'bg-cyan-950 text-cyan-200 border-cyan-500 shadow-sm ring-1 ring-cyan-500/40'
                            : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                        }`}
                        title={file.path}
                      >
                        <FileText className="w-3 h-3" />
                        <span className="font-semibold">{file.fileName}</span>
                        {file.appsFolder && (
                          <span className="text-[10px] text-slate-400 font-sans">({file.appsFolder})</span>
                        )}
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
