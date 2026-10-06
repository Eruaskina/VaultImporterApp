import React, { useState, useRef } from 'react';
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
  Layers,
  Terminal,
  Trash2,
  Eye,
  FileCheck,
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
    const app = appName || 'afc-saas';
    const user = username || 'test-user';

    if (isDual) {
      targetPaths.push(`${env}/apps-${cityName}/${app}/${cityName}/user/${user}`);
      targetPaths.push(`${env}/apps-${cityName}/${app}/${cityName}`);
    } else {
      targetPaths.push(`prod/apps-${cityName}/${app}/${cityName}`);
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
      };
    });

    setFiles(generatedItems);
    appendConsoleLog('-> 4 adet hazır örnek appsettings yapılandırma dosyası oluşturuldu.');
    onAddLog('info', 'Örnek appsettings dosyaları listeye eklendi.');
  };

  // Run the Batch Upload to Vault
  const handleStartBatchUpload = async () => {
    if (files.length === 0) {
      alert('Lütfen önce yüklenecek appsettings dosyalarını seçin.');
      return;
    }

    if (is108Server && !connection.username.trim()) {
      alert("10.240.1.108 sunucusu için 'Kullanıcı Adı (Username)' zorunludur!");
      return;
    }

    const confirmMsg = is108Server
      ? `Yapacağınız eklemeler '${connection.selectedEnv.toUpperCase()}' ortamına ve '${connection.username}' kullanıcısına eklenecektir.\n\nOnaylıyor musunuz?`
      : `Toplam ${files.length} dosya Vault (${connection.engine}) üzerine yüklenecektir.\n\nOnaylıyor musunuz?`;

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
    appendConsoleLog(`-> Dosya Sayısı: ${files.length}`);
    appendConsoleLog('='.repeat(50));

    let successFileCount = 0;

    for (let i = 0; i < files.length; i++) {
      const fileItem = files[i];

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

      // Upload to each target path
      for (const vPath of fileItem.targetPaths) {
        try {
          const res = await VaultApiService.writeSecret(connection, vPath, secretPayload);

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
      `--- İŞLEM TAMAMLANDI: ${successFileCount} / ${files.length} dosya başarıyla işlendi. ---`
    );
    appendConsoleLog('-'.repeat(50) + '\n');
    onAddLog(
      'success',
      `Toplu yükleme tamamlandı: ${successFileCount}/${files.length} dosya Vault'a yazıldı.`
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
            Toplu appsettings Yapılandırma Dağıtımı
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            appsettings.sehir.json dosyalarından şehir adını otomatik çözümler, dinamik Vault path'leri üretir ve KV v2'ye aktarır.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleLoadSampleFiles}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Örnek Dosyalar Yükle</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded transition-colors flex items-center gap-1.5"
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
            placeholder="afc-saas"
            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 font-mono text-slate-200"
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
            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 font-mono text-slate-200"
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

      {/* Files List / Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-slate-200">
              İşlenecek appsettings Dosyaları ({files.length})
            </span>
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
                  <th className="p-3 w-1/4">Dosya Adı</th>
                  <th className="p-3 w-1/8">Çözümlenen Şehir</th>
                  <th className="p-3 w-1/2">Hedef Vault Path(leri)</th>
                  <th className="p-3 w-1/8 text-right">Durum / İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {files.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 text-slate-200">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span className="truncate">{item.fileName}</span>
                      </div>
                    </td>

                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 border border-slate-700 text-cyan-300 uppercase">
                        {item.cityName}
                      </span>
                    </td>

                    <td className="p-3 text-slate-300 space-y-1">
                      {item.targetPaths.map((tp, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-slate-500">{idx + 1}.</span>
                          <span className="text-slate-500">{connection.engine}/</span>
                          <span className="text-cyan-300 font-medium">{tp}</span>
                        </div>
                      ))}
                    </td>

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
                          onClick={() => setPreviewItem(item)}
                          title="İçeriği Önizle"
                          className="p-1 text-slate-400 hover:text-slate-200 rounded"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Action Button */}
        {files.length > 0 && (
          <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              <span>Toplam: {files.length} dosya</span>
              {completedCount > 0 && (
                <span className="ml-3 text-cyan-400 font-mono">
                  ({completedCount} / {files.length} tamamlandı)
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
                disabled={isProcessing}
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
                    <span>Sunuculara Yüklemeyi Başlat</span>
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
    </div>
  );
};
