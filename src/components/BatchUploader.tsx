import React, { useState, useRef, useMemo } from 'react';
import { VaultConnection, BatchFileItem, VaultEnvironment } from '../types/vault';
import { VaultApiService } from '../services/vaultApi';
import {
  UploadCloud,
  FileCode,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
  Trash2,
  Eye,
  CheckSquare,
  Square,
  Edit3,
  Plus,
  Sliders,
  Building2,
  X,
  Check,
  Copy,
  Layers,
} from 'lucide-react';

interface BatchUploaderProps {
  connection: VaultConnection;
  onUpdateConnection: (updated: Partial<VaultConnection>) => void;
  onAddLog: (type: 'info' | 'success' | 'warning' | 'error', message: string, details?: string) => void;
  onNavigateToExplorer: () => void;
}

export const BatchUploader: React.FC<BatchUploaderProps> = ({
  connection,
  onUpdateConnection,
  onAddLog,
  onNavigateToExplorer,
}) => {
  const [files, setFiles] = useState<BatchFileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeConsoleLogs, setActiveConsoleLogs] = useState<string[]>([]);
  const [previewItem, setPreviewItem] = useState<BatchFileItem | null>(null);
  const [completedCount, setCompletedCount] = useState(0);

  // Filter & Batch Editing States
  const [filterCity, setFilterCity] = useState<string>('all');
  const [showBatchPathModal, setShowBatchPathModal] = useState(false);
  const [batchModalTab, setBatchModalTab] = useState<'template' | 'replace'>('template');
  const [templatePattern, setTemplatePattern] = useState('{env}/apps-{city}/{app}/{city}');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logConsoleRef = useRef<HTMLDivElement>(null);

  // Check if dual path mode
  const is108Server =
    connection.url.includes('10.240.1.108') || connection.serverType === 'dual_path_108';

  // Helper to add to terminal log
  const appendConsoleLog = (text: string) => {
    setActiveConsoleLogs((prev) => [...prev, text]);
    setTimeout(() => {
      if (logConsoleRef.current) {
        logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
      }
    }, 50);
  };

  // Extract city name and generate paths from filename as in Python script:
  // isim_kismi = dosya_adi.split('.', 1)[1]
  // sehir = isim_kismi.split('_')[0].lower()
  const calculatePaths = (
    fileName: string,
    env: VaultEnvironment,
    appName: string,
    username: string,
    isDual: boolean
  ): { cityName: string; targetPaths: string[] } => {
    let cityName = 'genel';
    try {
      if (fileName.startsWith('appsettings.')) {
        const afterPrefix = fileName.slice('appsettings.'.length);
        const namePart = afterPrefix.replace(/\.json$/i, '');
        cityName = namePart.split('_')[0].toLowerCase();
      } else {
        const cleanName = fileName.replace(/\.[^/.]+$/, '');
        cityName = cleanName.split('_')[0].split('.')[0].toLowerCase();
      }
    } catch {
      cityName = 'bilinmeyen';
    }

    const targetPaths: string[] = [];
    const app = appName || 'afc-saas-api';
    const user = username || 'test-user';

    // KURAL: Prod ortamında NE OLURSA OLSUN kullanıcı özelinde secret oluşturulmaz!
    // Sadece: prod/apps-{sehir}/{app}/{sehir} (örn: prod/apps-tekirdag/afc-saas-api/tekirdag)
    if (env === 'prod') {
      targetPaths.push(`prod/apps-${cityName}/${app}/${cityName}`);
    } else {
      // Dev ve Test ortamında mevcut çift path mantığı aynen korunur:
      if (isDual) {
        targetPaths.push(`${env}/apps-${cityName}/${app}/${cityName}/user/${user}`);
        targetPaths.push(`${env}/apps-${cityName}/${app}/${cityName}`);
      } else {
        targetPaths.push(`${env}/apps-${cityName}/${app}/${cityName}`);
      }
    }

    return { cityName, targetPaths };
  };

  // Re-calculate paths for all loaded files when env, appName, or username changes
  const refreshFilePaths = (
    updatedEnv: VaultEnvironment,
    updatedApp: string,
    updatedUser: string,
    updatedDual: boolean
  ) => {
    setFiles((prev) =>
      prev.map((item) => {
        const { cityName, targetPaths } = calculatePaths(
          item.fileName,
          updatedEnv,
          updatedApp,
          updatedUser,
          updatedDual
        );
        return { ...item, cityName, targetPaths };
      })
    );
  };

  // Handle uploaded files
  const handleFilesSelected = async (selectedFileList: FileList | null) => {
    if (!selectedFileList || selectedFileList.length === 0) return;

    const newItems: BatchFileItem[] = [];

    for (let i = 0; i < selectedFileList.length; i++) {
      const file = selectedFileList[i];
      const text = await file.text();
      let parsedJson: any = text;
      let isValid = false;

      try {
        parsedJson = JSON.parse(text);
        isValid = true;
      } catch {
        isValid = false;
      }

      const { cityName, targetPaths } = calculatePaths(
        file.name,
        connection.selectedEnv,
        connection.appName,
        connection.username,
        is108Server
      );

      newItems.push({
        id: Math.random().toString(36).substring(2, 9),
        fileName: file.name,
        fileSize: file.size,
        cityName,
        content: parsedJson,
        rawString: text,
        isValidJson: isValid,
        targetPaths,
        status: 'pending',
        isSelected: true,
      });
    }

    setFiles((prev) => [...prev, ...newItems]);
    appendConsoleLog(`-> ${newItems.length} dosya yüklendi ve işleme hazırlandı.`);
  };

  // Generate Sample appsettings files for instant test
  const handleLoadSampleFiles = () => {
    const samples = [
      {
        fileName: 'appsettings.istanbul.json',
        city: 'istanbul',
        content: {
          Logging: { LogLevel: { Default: 'Information', 'Microsoft.AspNetCore': 'Warning' } },
          ConnectionStrings: {
            DefaultConnection: 'Server=10.240.20.15;Database=AfcIstanbul_Prod;Uid=db_app_usr;Pwd=P@ss2026;',
            RedisCache: '10.240.20.50:6379',
          },
          CityConfig: { Code: '34', Name: 'Istanbul', MaxWorkers: 300, Active: true },
        },
      },
      {
        fileName: 'appsettings.ankara_dev.json',
        city: 'ankara',
        content: {
          Logging: { LogLevel: { Default: 'Debug' } },
          ConnectionStrings: {
            DefaultConnection: 'Server=10.240.10.88;Database=AfcAnkara_Dev;Uid=dev_usr;Pwd=DevP@ss;',
          },
          CityConfig: { Code: '06', Name: 'Ankara', MaxWorkers: 100, Active: true },
        },
      },
      {
        fileName: 'appsettings.izmir_test.json',
        city: 'izmir',
        content: {
          Logging: { LogLevel: { Default: 'Information' } },
          ConnectionStrings: {
            DefaultConnection: 'Server=10.240.30.12;Database=AfcIzmir_Test;Uid=test_usr;Pwd=TestP@ss;',
          },
          CityConfig: { Code: '35', Name: 'Izmir', MaxWorkers: 150, Active: true },
        },
      },
      {
        fileName: 'appsettings.tekirdag_api.json',
        city: 'tekirdag',
        content: {
          Logging: { LogLevel: { Default: 'Information' } },
          ConnectionStrings: {
            DefaultConnection: 'Server=10.240.59.10;Database=AfcTekirdag_Prod;Uid=tekirdag_usr;Pwd=TekirdagSecretP@ss;',
          },
          CityConfig: { Code: '59', Name: 'Tekirdag', Active: true },
        },
      },
      {
        fileName: 'appsettings.bursa.json',
        city: 'bursa',
        content: {
          Logging: { LogLevel: { Default: 'Warning' } },
          ConnectionStrings: {
            DefaultConnection: 'Server=10.240.16.20;Database=AfcBursa_Prod;Uid=bursa_usr;Pwd=BursaP@ss;',
          },
          CityConfig: { Code: '16', Name: 'Bursa', MaxWorkers: 80, Active: true },
        },
      },
    ];

    const generatedItems: BatchFileItem[] = samples.map((s) => {
      const rawString = JSON.stringify(s.content, null, 2);
      const { cityName, targetPaths } = calculatePaths(
        s.fileName,
        connection.selectedEnv,
        connection.appName,
        connection.username,
        is108Server
      );
      return {
        id: Math.random().toString(36).substring(2, 9),
        fileName: s.fileName,
        fileSize: rawString.length,
        cityName,
        content: s.content,
        rawString,
        isValidJson: true,
        targetPaths,
        status: 'pending',
        isSelected: true,
      };
    });

    setFiles(generatedItems);
    appendConsoleLog('-> 5 adet hazır örnek appsettings yapılandırma dosyası oluşturuldu.');
    onAddLog('info', 'Örnek appsettings dosyaları listeye eklendi.');
  };

  // =========================================================================
  // MANUAL PATH EDITING HANDLERS (User requirement!)
  // =========================================================================

  // Update a single target path for a specific file item
  const handleUpdateSinglePath = (fileId: string, pathIndex: number, newPath: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f;
        const updated = [...f.targetPaths];
        updated[pathIndex] = newPath;
        return { ...f, targetPaths: updated };
      })
    );
  };

  // Add a new target path to a file item
  const handleAddPathToFile = (fileId: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f;
        const defaultNew = `${connection.selectedEnv}/apps-${f.cityName}/${connection.appName || 'afc-saas-api'}/${f.cityName}`;
        return { ...f, targetPaths: [...f.targetPaths, defaultNew] };
      })
    );
  };

  // Remove a target path from a file item
  const handleRemoveSinglePath = (fileId: string, pathIndex: number) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f;
        const updated = f.targetPaths.filter((_, idx) => idx !== pathIndex);
        return { ...f, targetPaths: updated.length > 0 ? updated : [''] };
      })
    );
  };

  // Reset a file's paths back to automatic algorithm
  const handleResetFilePaths = (fileId: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f;
        const { targetPaths } = calculatePaths(
          f.fileName,
          connection.selectedEnv,
          connection.appName,
          connection.username,
          is108Server
        );
        return { ...f, targetPaths };
      })
    );
  };

  // Update city name manually for a file item
  const handleUpdateCityName = (fileId: string, newCity: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f;
        return { ...f, cityName: newCity.toLowerCase().trim() };
      })
    );
  };

  // Toggle selection for a file item
  const handleToggleSelectFile = (fileId: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, isSelected: !(f.isSelected ?? true) } : f))
    );
  };

  // Master Select All / Deselect All
  const handleSelectAllFiles = (selectAll: boolean) => {
    setFiles((prev) => prev.map((f) => ({ ...f, isSelected: selectAll })));
  };

  // Remove file from list
  const handleRemoveFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // Apply batch template to all files or filtered files
  const handleApplyBatchTemplate = () => {
    if (!templatePattern.trim()) return;

    setFiles((prev) =>
      prev.map((f) => {
        const rendered = templatePattern
          .replace(/\{env\}/g, connection.selectedEnv)
          .replace(/\{city\}/g, f.cityName)
          .replace(/\{app\}/g, connection.appName || 'afc-saas-api')
          .replace(/\{user\}/g, connection.username || 'test-user');
        return { ...f, targetPaths: [rendered] };
      })
    );

    setShowBatchPathModal(false);
    appendConsoleLog(`[+] Şablon ile tüm konumlar güncellendi: ${templatePattern}`);
    onAddLog('success', 'Tüm hedef konumlar şablona göre güncellendi.', templatePattern);
  };

  // Apply Find & Replace across all target paths
  const handleApplyFindReplace = () => {
    if (!findText) return;

    let totalCount = 0;
    setFiles((prev) =>
      prev.map((f) => {
        const updatedPaths = f.targetPaths.map((p) => {
          if (p.includes(findText)) {
            totalCount++;
            return p.split(findText).join(replaceText);
          }
          return p;
        });
        return { ...f, targetPaths: updatedPaths };
      })
    );

    setShowBatchPathModal(false);
    appendConsoleLog(
      `[+] Konum Bul & Değiştir tamamlandı: "${findText}" -> "${replaceText}" (${totalCount} adet güncellendi)`
    );
    onAddLog('success', `Konumlar güncellendi: "${findText}" -> "${replaceText}"`);
  };

  // Unique cities in loaded files
  const uniqueCities = useMemo(() => {
    const set = new Set<string>();
    files.forEach((f) => {
      if (f.cityName) set.add(f.cityName);
    });
    return Array.from(set).sort();
  }, [files]);

  // Displayed files according to city filter
  const displayedFiles = useMemo(() => {
    if (filterCity === 'all') return files;
    return files.filter((f) => f.cityName === filterCity);
  }, [files, filterCity]);

  // Selected files count
  const selectedFiles = useMemo(() => {
    return files.filter((f) => f.isSelected !== false);
  }, [files]);

  const allSelected = files.length > 0 && files.every((f) => f.isSelected !== false);

  // Run the Batch Upload to Vault
  const handleStartBatchUpload = async () => {
    if (files.length === 0) {
      alert('Lütfen önce yüklenecek appsettings dosyalarını seçin.');
      return;
    }

    if (selectedFiles.length === 0) {
      alert('Lütfen yüklenecek en az bir dosya seçin veya ALL butonuna tıklayarak tümünü işaretleyin.');
      return;
    }

    // Dev ve Test ortamında 108 sunucusu için kullanıcı adı zorunludur; PROD ortamında ise kullanıcı özelinde secret oluşturulmaz.
    if (connection.selectedEnv !== 'prod' && is108Server && !connection.username.trim()) {
      alert("Dev ve Test ortamı için 'Kullanıcı Adı (Username)' zorunludur!");
      return;
    }

    const confirmMsg =
      connection.selectedEnv === 'prod'
        ? `Yapacağınız eklemeler PROD ortamına (Kullanıcı özelinde path olmadan, sadece ana servis path'lerine) eklenecektir.\n\nToplam ${selectedFiles.length} dosya '${connection.engine}' engine'ine yüklenecektir.\n\nOnaylıyor musunuz?`
        : is108Server
        ? `Yapacağınız eklemeler '${connection.selectedEnv.toUpperCase()}' ortamına ve '${connection.username}' kullanıcısına eklenecektir.\n\nOnaylıyor musunuz?`
        : `Toplam ${selectedFiles.length} dosya Vault (${connection.engine}) üzerine yüklenecektir.\n\nOnaylıyor musunuz?`;

    const userConfirmed = window.confirm(confirmMsg);
    if (!userConfirmed) {
      appendConsoleLog('[-] İşlem kullanıcı tarafından iptal edildi.');
      onAddLog('warning', 'Toplu yükleme kullanıcı tarafından iptal edildi.');
      return;
    }

    setIsProcessing(true);
    setCompletedCount(0);
    appendConsoleLog('\n' + '='.repeat(50));
    appendConsoleLog(`[+] Toplu Yükleme Başlatılıyor...`);
    appendConsoleLog(`-> Vault URL: ${connection.url}`);
    appendConsoleLog(`-> Hedef Engine: ${connection.engine}`);
    appendConsoleLog(`-> Hedef Ortam: ${connection.selectedEnv.toUpperCase()}`);
    appendConsoleLog(`-> Seçili Dosya Sayısı: ${selectedFiles.length}`);
    appendConsoleLog('='.repeat(50));

    let successFileCount = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
      const fileItem = selectedFiles[i];

      // Mark file as uploading
      setFiles((prev) =>
        prev.map((f) => (f.id === fileItem.id ? { ...f, status: 'uploading' } : f))
      );

      appendConsoleLog(`\n[>] İşleniyor: ${fileItem.fileName} (${fileItem.cityName})`);

      // Prepare secret data payload matching Python script:
      // secret_data = { "appsettings": json_icerik }
      const secretPayload = {
        appsettings: fileItem.content,
      };

      let fileHadError = false;

      // Upload to each target path (including manually edited paths)
      for (const vPath of fileItem.targetPaths) {
        if (!vPath || !vPath.trim()) continue;

        try {
          const res = await VaultApiService.writeSecret(connection, vPath.trim(), secretPayload);

          if (res.success) {
            appendConsoleLog(`[+] BAŞARILI: ${fileItem.fileName} -> Path: ${connection.engine}/${vPath}`);
            onAddLog('success', `[+] Yüklendi: ${connection.engine}/${vPath} (v${res.newVersion || 1})`);
          } else {
            appendConsoleLog(`[-] YÜKLEME HATASI: (Path: ${vPath}) -> Detay: ${res.message}`);
            onAddLog('error', `[-] Hata: ${vPath} -> ${res.message}`);
            fileHadError = true;
          }
        } catch (err: any) {
          appendConsoleLog(`[-] HATA: (Path: ${vPath}) -> ${err.message}`);
          onAddLog('error', `[-] HATA: ${err.message}`);
          fileHadError = true;
        }
      }

      // Update status
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id
            ? { ...f, status: fileHadError ? 'error' : 'success' }
            : f
        )
      );

      if (!fileHadError) {
        successFileCount++;
      }
      setCompletedCount((prev) => prev + 1);
    }

    appendConsoleLog('\n' + '-'.repeat(50));
    appendConsoleLog(
      `--- İŞLEM TAMAMLANDI: ${successFileCount} / ${selectedFiles.length} dosya başarıyla işlendi. ---`
    );
    appendConsoleLog('-'.repeat(50) + '\n');
    onAddLog(
      'success',
      `Toplu yükleme tamamlandı: ${successFileCount}/${selectedFiles.length} dosya Vault'a yazıldı.`
    );

    setIsProcessing(false);
  };

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-cyan-400" />
            <span>Toplu appsettings Yapılandırma Dağıtımı</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            appsettings.sehir.json dosyalarını yükleyin, konumları (Vault path) el ile düzenleyin ve KV v2'ye aktarın.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleLoadSampleFiles}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Örnek Dosyalar Yükle</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Dosya / Klasör Seç</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".json"
            onChange={(e) => handleFilesSelected(e.target.files)}
            className="hidden"
          />
        </div>
      </div>

      {/* Target Parameters Bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <label className="text-slate-400 block mb-1">Secret Engine:</label>
          <span className="font-mono text-cyan-300 font-semibold">{connection.engine}</span>
        </div>

        <div>
          <label className="text-slate-400 block mb-1">Uygulama Adı (App):</label>
          <input
            type="text"
            value={connection.appName}
            onChange={(e) => {
              const val = e.target.value.trim();
              onUpdateConnection({ appName: val });
              refreshFilePaths(
                connection.selectedEnv,
                val,
                connection.username,
                is108Server
              );
            }}
            placeholder="afc-saas-api"
            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="text-slate-400 block mb-1">Kullanıcı Adı (Username):</label>
          <input
            type="text"
            value={connection.username}
            onChange={(e) => {
              const val = e.target.value.trim();
              onUpdateConnection({ username: val });
              refreshFilePaths(
                connection.selectedEnv,
                connection.appName,
                val,
                is108Server
              );
            }}
            placeholder="test-user"
            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="text-slate-400 block mb-1">Hedef Ortam:</label>
          <div className="flex gap-1">
            {(['dev', 'test', 'prod'] as VaultEnvironment[]).map((env) => (
              <button
                key={env}
                onClick={() => {
                  onUpdateConnection({ selectedEnv: env });
                  refreshFilePaths(
                    env,
                    connection.appName,
                    connection.username,
                    is108Server
                  );
                }}
                className={`flex-1 py-1 rounded text-center uppercase font-mono text-[11px] font-semibold transition-colors ${
                  connection.selectedEnv === env
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                {env}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* City Filter & Selection Bar (User requirement: ALL button for cities & selection) */}
      {files.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left: City Filter with prominent ALL button */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-400 flex items-center gap-1 mr-1">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Şehir Filtresi:</span>
              </span>

              {/* ALL Button */}
              <button
                onClick={() => setFilterCity('all')}
                className={`px-2.5 py-1 text-xs font-mono font-bold rounded transition-all border flex items-center gap-1 ${
                  filterCity === 'all'
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm'
                    : 'bg-slate-950 text-cyan-300 border-slate-700 hover:border-cyan-500'
                }`}
                title="Tüm Şehirleri Göster (ALL)"
              >
                <CheckSquare className="w-3 h-3" />
                <span>ALL (Tümü - {files.length})</span>
              </button>

              {/* Individual city pills */}
              {uniqueCities.map((c) => {
                const count = files.filter((f) => f.cityName === c).length;
                return (
                  <button
                    key={c}
                    onClick={() => setFilterCity(c)}
                    className={`px-2 py-1 text-xs font-mono rounded capitalize transition-all border ${
                      filterCity === c
                        ? 'bg-slate-800 text-cyan-300 border-cyan-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {c} ({count})
                  </button>
                );
              })}
            </div>

            {/* Right: Batch Location Tools & Selection Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleSelectAllFiles(true)}
                className="px-2 py-1 text-xs font-mono font-semibold rounded bg-cyan-950 text-cyan-300 border border-cyan-800 hover:bg-cyan-900 transition-colors flex items-center gap-1"
                title="Tüm dosyaları işaretle"
              >
                <CheckSquare className="w-3 h-3" />
                <span>ALL Seç</span>
              </button>

              <button
                onClick={() => handleSelectAllFiles(false)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 rounded transition-colors"
                title="İşaretleri kaldır"
              >
                Temizle
              </button>

              <button
                onClick={() => setShowBatchPathModal(true)}
                className="px-2.5 py-1 text-xs bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 rounded transition-colors flex items-center gap-1.5"
                title="Tüm hedef konumları şablonla veya bul-değiştir ile düzenleyin"
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>Toplu Konum Düzenle</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Files List / Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileCode className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-slate-200">
              İşlenecek appsettings Dosyaları ({displayedFiles.length}{filterCity !== 'all' ? ` / ${files.length}` : ''})
            </span>
            {files.length > 0 && (
              <span className="text-[11px] text-cyan-400 font-mono">
                [{selectedFiles.length} / {files.length} seçili]
              </span>
            )}
          </div>

          {files.length > 0 && (
            <button
              onClick={() => setFiles([])}
              className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Listeyi Temizle</span>
            </button>
          )}
        </div>

        {files.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="p-12 text-center border-2 border-dashed border-slate-800 m-4 rounded-lg hover:border-cyan-500/50 transition-colors cursor-pointer space-y-3"
          >
            <UploadCloud className="w-10 h-10 text-slate-600 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-300">
                appsettings.*.json dosyalarını buraya sürükleyin veya tıklayarak seçin
              </p>
              <p className="text-xs text-slate-500">
                Örn: appsettings.istanbul.json, appsettings.ankara_dev.json, appsettings.izmir.json
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleLoadSampleFiles();
              }}
              className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Hızlı Test İçin Örnek Dosyalar Yükle</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={() => handleSelectAllFiles(!allSelected)}
                      className="text-cyan-400 hover:text-cyan-300"
                      title={allSelected ? 'Tümünü Kaldır' : 'Tümünü Seç (ALL)'}
                    >
                      {allSelected ? (
                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-500" />
                      )}
                    </button>
                  </th>
                  <th className="p-3 w-1/5">Dosya Adı</th>
                  <th className="p-3 w-32">Şehir (El ile Değiştir)</th>
                  <th className="p-3 w-1/2">
                    <div className="flex items-center justify-between">
                      <span>Hedef Vault Konumu (El ile Düzenlenebilir)</span>
                      <span className="text-[10px] text-cyan-400 font-sans font-normal">
                        ✎ Metin kutusuna doğrudan yazabilirsiniz
                      </span>
                    </div>
                  </th>
                  <th className="p-3 w-28 text-right">Durum / İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {displayedFiles.map((item) => {
                  const isChecked = item.isSelected !== false;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        !isChecked ? 'opacity-50 bg-slate-950/40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectFile(item.id)}
                          className="text-cyan-400 hover:text-cyan-300"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-cyan-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600" />
                          )}
                        </button>
                      </td>

                      {/* File Name */}
                      <td className="p-3 text-slate-200">
                        <div className="flex items-center gap-2">
                          <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />
                          <span className="truncate font-semibold">{item.fileName}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 ml-6 block">
                          {(item.fileSize / 1024).toFixed(1)} KB
                        </span>
                      </td>

                      {/* City Name - INLINE EDITABLE */}
                      <td className="p-3">
                        <input
                          type="text"
                          value={item.cityName}
                          onChange={(e) => handleUpdateCityName(item.id, e.target.value)}
                          className="w-24 bg-slate-950 border border-slate-800 focus:border-cyan-500 text-cyan-300 rounded px-2 py-1 text-xs font-mono uppercase focus:outline-none"
                          title="Şehir adını el ile değiştirebilirsiniz"
                        />
                      </td>

                      {/* Target Paths - INLINE EDITABLE (User requirement!) */}
                      <td className="p-3 space-y-1.5">
                        {item.targetPaths.map((tp, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 group">
                            <span className="text-slate-500 text-[10px] w-4 shrink-0 font-mono">
                              {idx + 1}.
                            </span>
                            <span className="text-slate-500 text-[11px] font-mono shrink-0 select-none">
                              {connection.engine}/
                            </span>
                            <input
                              type="text"
                              value={tp}
                              onChange={(e) =>
                                handleUpdateSinglePath(item.id, idx, e.target.value)
                              }
                              placeholder="prod/apps-sehir/app/sehir"
                              className="flex-1 bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-cyan-500 text-cyan-300 font-mono text-[11px] px-2.5 py-1 rounded focus:outline-none transition-colors"
                              title="Hedef Vault yolunu el ile düzenleyin"
                            />
                            {item.targetPaths.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveSinglePath(item.id, idx)}
                                className="p-1 text-slate-500 hover:text-rose-400 rounded opacity-60 group-hover:opacity-100 transition-opacity"
                                title="Bu konumu kaldır"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}

                        {/* Inline Path Quick Controls */}
                        <div className="flex items-center gap-3 pt-0.5 text-[11px] pl-6 font-sans">
                          <button
                            type="button"
                            onClick={() => handleAddPathToFile(item.id)}
                            className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium hover:underline"
                            title="Bu dosya için ek hedef konum ekle"
                          >
                            <Plus className="w-3 h-3" />
                            <span>+ Konum Ekle</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResetFilePaths(item.id)}
                            className="text-slate-500 hover:text-slate-300 flex items-center gap-1 hover:underline"
                            title="Otomatik oluşturulan varsayılan konuma sıfırla"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            <span>Sıfırla</span>
                          </button>
                        </div>
                      </td>

                      {/* Status / Actions */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {item.status === 'pending' && (
                            <span className="text-slate-400 text-[11px]">Bekliyor</span>
                          )}
                          {item.status === 'uploading' && (
                            <span className="text-cyan-400 text-[11px] flex items-center gap-1">
                              <RotateCcw className="w-3 h-3 animate-spin" />
                              Yükleniyor
                            </span>
                          )}
                          {item.status === 'success' && (
                            <span className="text-emerald-400 text-[11px] flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Yüklendi
                            </span>
                          )}
                          {item.status === 'error' && (
                            <span className="text-rose-400 text-[11px] flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Hata
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => setPreviewItem(item)}
                            title="İçeriği Önizle"
                            className="p-1 text-slate-400 hover:text-slate-200 rounded"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveFile(item.id)}
                            title="Listeden Çıkar"
                            className="p-1 text-slate-500 hover:text-rose-400 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Action Button & Summary Bar */}
        {files.length > 0 && (
          <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-400 space-x-2">
              <span>Seçili: <strong className="text-cyan-300 font-mono">{selectedFiles.length}</strong> / {files.length} dosya</span>
              {completedCount > 0 && (
                <span className="text-emerald-400 font-mono">
                  ({completedCount} / {selectedFiles.length} tamamlandı)
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onNavigateToExplorer}
                className="px-3 py-2 text-xs text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded transition-colors"
              >
                Secret Gezginine Git
              </button>

              <button
                onClick={handleStartBatchUpload}
                disabled={isProcessing || selectedFiles.length === 0}
                className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    <span>Vault'a Yazılıyor...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Seçili Dosyaları ({selectedFiles.length}) Vault'a Yükle</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Terminal Live Execution Console Log (Tkinter scrolled text replica) */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-200">İşlem Logları & Terminal Çıktısı</span>
          </div>
          <button
            onClick={() => setActiveConsoleLogs([])}
            className="text-[11px] text-slate-400 hover:text-slate-200"
          >
            Temizle
          </button>
        </div>

        <div
          ref={logConsoleRef}
          className="h-64 overflow-y-auto p-4 bg-slate-950 font-mono text-xs space-y-1 select-text"
        >
          {activeConsoleLogs.length === 0 ? (
            <div className="text-slate-600 italic">
              İşlem başladığında detaylı Vault HTTP API çağrıları ve yükleme durumları burada anlık akacaktır...
            </div>
          ) : (
            activeConsoleLogs.map((log, index) => {
              let color = 'text-slate-300';
              if (log.includes('[+]')) color = 'text-emerald-400';
              if (log.includes('[-]')) color = 'text-rose-400';
              if (log.includes('->')) color = 'text-cyan-400';
              if (log.startsWith('=')) color = 'text-slate-600';

              return (
                <div key={index} className={color}>
                  {log}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Preview File Content Modal */}
      {previewItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-2xl w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 font-mono text-xs">
                <FileCode className="w-4 h-4 text-cyan-400" />
                <span className="text-white font-semibold">{previewItem.fileName}</span>
              </div>
              <button
                onClick={() => setPreviewItem(null)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                Kapat
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-xs text-slate-400">Dosya İçeriği (JSON):</span>
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded font-mono text-xs text-slate-200 max-h-96 overflow-y-auto leading-relaxed">
                {previewItem.rawString}
              </pre>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setPreviewItem(null)}
                className="px-4 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Path Editor Modal */}
      {showBatchPathModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  Toplu Konum Düzenleyici / Şablon Uygulayıcı
                </h2>
              </div>
              <button
                onClick={() => setShowBatchPathModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs: Template vs Find/Replace */}
            <div className="flex border-b border-slate-800">
              <button
                type="button"
                onClick={() => setBatchModalTab('template')}
                className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition-colors ${
                  batchModalTab === 'template'
                    ? 'border-indigo-400 text-indigo-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Şablon ile Yeniden Üret
              </button>
              <button
                type="button"
                onClick={() => setBatchModalTab('replace')}
                className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition-colors ${
                  batchModalTab === 'replace'
                    ? 'border-indigo-400 text-indigo-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Bul ve Değiştir
              </button>
            </div>

            {batchModalTab === 'template' ? (
              <div className="space-y-3">
                <div className="text-xs text-slate-400">
                  Yüklü tüm dosyaların hedef Vault konumlarını aşağıdaki dinamik şablona göre günceller:
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-300 font-medium">Hedef Konum Şablonu:</label>
                  <input
                    type="text"
                    value={templatePattern}
                    onChange={(e) => setTemplatePattern(e.target.value)}
                    placeholder="{env}/apps-{city}/{app}/{city}"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded px-3 py-2 font-mono text-xs text-cyan-300 focus:outline-none"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px] text-slate-400">
                    <span>Değişkenler:</span>
                    <code className="text-indigo-300 font-mono">&#123;env&#125;</code>
                    <code className="text-indigo-300 font-mono">&#123;city&#125;</code>
                    <code className="text-indigo-300 font-mono">&#123;app&#125;</code>
                    <code className="text-indigo-300 font-mono">&#123;user&#125;</code>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded border border-slate-800 text-xs space-y-1 font-mono">
                  <span className="text-slate-500 block text-[11px] font-sans">Örnek Önizleme (tekirdag için):</span>
                  <span className="text-emerald-400">
                    {connection.engine}/
                    {templatePattern
                      .replace(/\{env\}/g, connection.selectedEnv)
                      .replace(/\{city\}/g, 'tekirdag')
                      .replace(/\{app\}/g, connection.appName || 'afc-saas-api')
                      .replace(/\{user\}/g, connection.username || 'test-user')}
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setShowBatchPathModal(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Vazgeç
                  </button>
                  <button
                    onClick={handleApplyBatchTemplate}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded transition-colors"
                  >
                    Tüm Dosyalara Uygula
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-slate-400">
                  Tüm dosyalardaki hedef path'lerin içinde belirli bir metni arayıp değiştirin:
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-medium block mb-1">Aranan Metin:</label>
                  <input
                    type="text"
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                    placeholder="örn: afc-saas-api"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-medium block mb-1">Yeni Metin (Değiştirilecek):</label>
                  <input
                    type="text"
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    placeholder="örn: afc-saas-core"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setShowBatchPathModal(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Vazgeç
                  </button>
                  <button
                    onClick={handleApplyFindReplace}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded transition-colors"
                  >
                    Değiştir ve Uygula
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
