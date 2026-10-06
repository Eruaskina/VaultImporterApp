import React, { useState } from 'react';
import { VaultConnection, VaultEnvironment } from '../types/vault';
import { VaultApiService } from '../services/vaultApi';
import { Server, KeyRound, CheckCircle2, AlertTriangle, Layers, User, Play, RotateCcw, Eye, EyeOff, Shield } from 'lucide-react';

interface ConnectionSettingsProps {
  connection: VaultConnection;
  onUpdateConnection: (updated: Partial<VaultConnection>) => void;
  onAddLog: (type: 'info' | 'success' | 'warning' | 'error', message: string, details?: string) => void;
  onConnectedSuccess: () => void;
}

export const ConnectionSettings: React.FC<ConnectionSettingsProps> = ({
  connection,
  onUpdateConnection,
  onAddLog,
  onConnectedSuccess,
}) => {
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
    policies?: string[];
  } | null>(null);

  const [availableEngines, setAvailableEngines] = useState<string[]>([
    'asis',
    'secret',
    'secrets',
  ]);
  const [isFetchingEngines, setIsFetchingEngines] = useState(false);

  // Check URL server type
  const is108Server = connection.url.includes('10.240.1.108') || connection.serverType === 'dual_path_108';

  const handleApplyPreset = (type: '54' | '108' | 'compose' | 'host' | 'demo') => {
    if (type === '54') {
      onUpdateConnection({
        url: 'http://10.240.52.54:8200',
        engine: 'asis',
        appName: 'afc-saas',
        username: '',
        selectedEnv: 'prod',
        serverType: 'standard',
        isDemoMode: false,
      });
      onAddLog('info', 'Ön ayar uygulandı: 10.240.52.54:8200 (Prod Tek Path)');
    } else if (type === '108') {
      onUpdateConnection({
        url: 'http://10.240.1.108:8200',
        engine: 'asis',
        appName: 'afc-saas',
        username: connection.username || 'test-user',
        selectedEnv: 'dev',
        serverType: 'dual_path_108',
        isDemoMode: false,
      });
      onAddLog('info', 'Ön ayar uygulandı: 10.240.1.108:8200 (Çift Path & Dev/Test/Prod Ortam)');
    } else if (type === 'compose') {
      onUpdateConnection({
        url: 'http://vault-dev:8200',
        token: 'root',
        engine: 'secret',
        appName: 'afc-saas',
        username: 'test-user',
        selectedEnv: 'dev',
        serverType: 'dual_path_108',
        isDemoMode: false,
      });
      onAddLog('info', 'Ön ayar uygulandı: Docker Compose Vault (http://vault-dev:8200, Token: root)');
    } else if (type === 'host') {
      onUpdateConnection({
        url: 'http://host.docker.internal:8200',
        engine: 'asis',
        appName: 'afc-saas',
        username: connection.username || 'test-user',
        selectedEnv: 'dev',
        serverType: 'dual_path_108',
        isDemoMode: false,
      });
      onAddLog('info', 'Ön ayar uygulandı: Ana Sunucu Vault (http://host.docker.internal:8200)');
    } else if (type === 'demo') {
      onUpdateConnection({
        url: 'http://10.240.52.54:8200 (Sandbox)',
        token: 's.demo-vault-root-token-9988',
        engine: 'asis',
        appName: 'afc-saas',
        username: 'test-user',
        selectedEnv: 'dev',
        serverType: 'dual_path_108',
        isDemoMode: true,
        isConnected: true,
      });
      setTestResult({
        success: true,
        message: 'Sandbox ortamı hazırlandı. Önceden yüklenmiş appsettings ve secretlar aktif.',
        policies: ['root', 'default', 'saas-config-admin'],
      });
      onAddLog('success', 'Demo Sandbox aktif edildi. Veriler yerel depolamadan servis ediliyor.');
    }
  };

  const handleTestAndConnect = async () => {
    if (connection.isDemoMode) {
      onUpdateConnection({ isConnected: true });
      setTestResult({
        success: true,
        message: 'Demo Modu aktif. Tüm okuma, yazma ve versiyonlama özellikleri simüle ediliyor.',
        policies: ['root', 'admin'],
      });
      onAddLog('success', 'Demo modunda başarıyla doğrulandı.');
      onConnectedSuccess();
      return;
    }

    if (!connection.url.trim() || !connection.token.trim()) {
      setTestResult({
        success: false,
        message: 'Lütfen Vault URL ve Token alanlarını doldurun.',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    onAddLog('info', `Vault sunucusuna bağlanılıyor: ${connection.url}`);

    try {
      const res = await VaultApiService.testConnection(
        connection.url,
        connection.token,
        connection.namespace
      );

      if (res.success) {
        onUpdateConnection({ isConnected: true });
        setTestResult({
          success: true,
          message: res.message,
          policies: res.details?.policies || ['default'],
        });
        onAddLog('success', `[+] Vault'a başarıyla bağlanıldı: ${connection.url}`);

        // Fetch engine list
        setIsFetchingEngines(true);
        onAddLog('info', "-> Vault sunucusundan Secret Engine'ler isteniyor...");
        const enginesRes = await VaultApiService.getEngines(connection);
        if (enginesRes.engines.length > 0) {
          setAvailableEngines(enginesRes.engines);
          if (!enginesRes.engines.includes(connection.engine)) {
            onUpdateConnection({ engine: enginesRes.engines[0] });
          }
          onAddLog('success', `[+] Engine'ler çekildi: ${enginesRes.engines.join(', ')}`);
        }
        setIsFetchingEngines(false);

        onConnectedSuccess();
      } else {
        onUpdateConnection({ isConnected: false });
        setTestResult({
          success: false,
          message: res.message,
        });
        onAddLog('error', `[-] Bağlantı hatası: ${res.message}`, JSON.stringify(res.details));
      }
    } catch (err: any) {
      onUpdateConnection({ isConnected: false });
      setTestResult({
        success: false,
        message: err.message || 'Bağlantı denemesi başarısız oldu.',
      });
      onAddLog('error', `[-] HATA: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Server className="w-5 h-5 text-cyan-400" />
            Vault Bağlantısı ve Yapılandırma
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            HashiCorp Vault KV v2 secret engine bağlantı parametreleri ve çoklu ortam ayarları.
          </p>
        </div>

        {/* Quick presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Hızlı Ön Ayarlar:</span>
          <button
            onClick={() => handleApplyPreset('compose')}
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/60 rounded transition-colors whitespace-nowrap"
            title="Docker compose içindeki vault-dev servisine bağlanır"
          >
            vault-dev (Docker)
          </button>
          <button
            onClick={() => handleApplyPreset('host')}
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors whitespace-nowrap"
            title="Aynı sunucunun hostundaki Vault servisine bağlanır"
          >
            host.docker.internal
          </button>
          <button
            onClick={() => handleApplyPreset('54')}
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors whitespace-nowrap"
          >
            10.240.52.54
          </button>
          <button
            onClick={() => handleApplyPreset('108')}
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors whitespace-nowrap"
          >
            10.240.1.108
          </button>
          <button
            onClick={() => handleApplyPreset('demo')}
            className="px-2.5 py-1 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded transition-colors whitespace-nowrap"
          >
            Sandbox / Demo
          </button>
        </div>
      </div>

      {/* Main Settings Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Vault URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>Vault Sunucu URL</span>
              <span className="text-[11px] text-slate-500">örn: http://10.240.52.54:8200</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={connection.url}
                onChange={(e) => {
                  const val = e.target.value;
                  const is108 = val.includes('10.240.1.108');
                  onUpdateConnection({
                    url: val,
                    serverType: is108 ? 'dual_path_108' : connection.serverType,
                  });
                }}
                placeholder="http://10.240.52.54:8200"
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
            {is108Server && (
              <p className="text-[11px] text-cyan-400">
                10.240.1.108 sunucusu algılandı: Çift Path ve Ortam (Dev/Test/Prod) modu otomatik etkin.
              </p>
            )}
          </div>

          {/* Vault Token */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>Vault Token (X-Vault-Token)</span>
              <span className="text-[11px] text-slate-500">Gizli anahtar</span>
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={connection.token}
                onChange={(e) => onUpdateConnection({ token: e.target.value })}
                placeholder="s.xxxxxxxxxxxxxx veya hvs.xxxxxxxx"
                className="w-full bg-slate-950 border border-slate-800 rounded pl-3 pr-10 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Secret Engine */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>Secret Engine (Mount Point)</span>
              {isFetchingEngines && <span className="text-[11px] text-cyan-400">Yükleniyor...</span>}
            </label>
            <div className="flex gap-2">
              <select
                value={availableEngines.includes(connection.engine) ? connection.engine : 'custom'}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    onUpdateConnection({ isCustomEngine: true });
                  } else {
                    onUpdateConnection({ engine: e.target.value, isCustomEngine: false });
                  }
                }}
                className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors flex-1"
              >
                {availableEngines.map((eng) => (
                  <option key={eng} value={eng}>
                    {eng} (KV Engine)
                  </option>
                ))}
                <option value="custom">Özel Engine Yaz...</option>
              </select>

              {connection.isCustomEngine && (
                <input
                  type="text"
                  value={connection.engine}
                  onChange={(e) => onUpdateConnection({ engine: e.target.value.trim() })}
                  placeholder="Engine adı (asis)"
                  className="w-32 bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                />
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Token yetkiniz sys/mounts listelemeye izin vermiyorsa özel engine yazabilirsiniz.
            </p>
          </div>

          {/* Uygulama Adı (App Name) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>Uygulama Adı (app_name)</span>
              <span className="text-[11px] text-slate-500">Path hiyerarşisi için</span>
            </label>
            <input
              type="text"
              value={connection.appName}
              onChange={(e) => onUpdateConnection({ appName: e.target.value.trim() })}
              placeholder="afc-saas"
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
        </div>

        {/* 10.240.1.108 / Multi-environment section */}
        <div className="pt-3 border-t border-slate-800/80">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold text-slate-200">
                Hedef Ortam ve Kullanıcı Yetkilendirmesi
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-400 flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={connection.serverType === 'dual_path_108'}
                  onChange={(e) =>
                    onUpdateConnection({
                      serverType: e.target.checked ? 'dual_path_108' : 'standard',
                    })
                  }
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                />
                Çift Path (User + Shared) Modu
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Ortam Seçimi */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Hedef Ortam:</label>
              <div className="flex items-center gap-2 p-1 bg-slate-950 border border-slate-800 rounded-md">
                {(['dev', 'test', 'prod'] as VaultEnvironment[]).map((env) => (
                  <button
                    key={env}
                    type="button"
                    onClick={() => onUpdateConnection({ selectedEnv: env })}
                    className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors uppercase font-mono ${
                      connection.selectedEnv === env
                        ? 'bg-cyan-500 text-slate-950 shadow-sm font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {env}
                  </button>
                ))}
              </div>
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                <span>Kullanıcı Adı (Username)</span>
                {is108Server && <span className="text-[11px] text-amber-400">108 için zorunlu</span>}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={connection.username}
                  onChange={(e) => onUpdateConnection({ username: e.target.value.trim() })}
                  placeholder="test-user"
                  disabled={!is108Server && connection.serverType !== 'dual_path_108'}
                  className={`w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors ${
                    !is108Server && connection.serverType !== 'dual_path_108' ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Generated path preview info */}
          <div className="mt-3 p-3 bg-slate-950/70 border border-slate-800/80 rounded text-xs space-y-1">
            <span className="text-slate-400 font-medium">Oluşturulacak Vault Yolları Örneği (Tekirdağ için):</span>
            <div className="font-mono text-[11px] text-cyan-400/90 space-y-0.5">
              {connection.selectedEnv === 'prod' ? (
                <div>
                  1. <span className="text-slate-500">{connection.engine}/</span>
                  <span className="text-cyan-300">prod/apps-tekirdag/{connection.appName || 'afc-saas-api'}/tekirdag</span>
                  <span className="ml-2 text-emerald-400 text-[10px]">(Prod: Kullanıcıya özel path oluşturulmaz)</span>
                </div>
              ) : is108Server ? (
                <>
                  <div>
                    1. <span className="text-slate-500">{connection.engine}/</span>
                    <span className="text-cyan-300">{connection.selectedEnv}/apps-tekirdag/{connection.appName || 'afc-saas-api'}/tekirdag/user/{connection.username || 'user'}</span>
                  </div>
                  <div>
                    2. <span className="text-slate-500">{connection.engine}/</span>
                    <span className="text-cyan-300">{connection.selectedEnv}/apps-tekirdag/{connection.appName || 'afc-saas-api'}/tekirdag</span>
                  </div>
                </>
              ) : (
                <div>
                  1. <span className="text-slate-500">{connection.engine}/</span>
                  <span className="text-cyan-300">{connection.selectedEnv}/apps-tekirdag/{connection.appName || 'afc-saas-api'}/tekirdag</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Button & Test Result */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={handleTestAndConnect}
            disabled={testing}
            className="w-full sm:w-auto px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded transition-colors flex items-center justify-center gap-2 whitespace-nowrap shadow-sm disabled:opacity-50"
          >
            {testing ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>Bağlantı Doğrulanıyor...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Bağlan ve Doğrula</span>
              </>
            )}
          </button>

          {testResult && (
            <div
              className={`text-xs px-3 py-2 rounded border flex items-center gap-2 flex-1 ${
                testResult.success
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50'
                  : 'bg-rose-950/40 text-rose-300 border-rose-800/50'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <div className="flex-1 truncate">
                <span>{testResult.message}</span>
                {testResult.policies && testResult.policies.length > 0 && (
                  <span className="ml-2 text-slate-400 font-mono text-[10px]">
                    (Yetkiler: {testResult.policies.join(', ')})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CORS & Network Architecture Guide */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white">
              CORS & Ağ Bağlantı Problemleri Nasıl Çözülür? (Rehber)
            </h2>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">DevOps & Ağ Mimarisi</span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Web tarayıcıları doğrudan istemci tarafından (JavaScript <code>fetch</code>) farklı bir domaine veya şirket içi IP'ye (<code>10.240.x.x</code>) istek atarken <strong>CORS (Cross-Origin Resource Sharing)</strong> ve <strong>Mixed-Content (HTTPS'ten HTTP'ye güvensiz istek)</strong> engellerine takılır. Bu sorunu çözmenin 3 temel yolu vardır:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {/* Solution 1 */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
            <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
              <span className="w-5 h-5 rounded-full bg-cyan-950 border border-cyan-800 flex items-center justify-center text-[10px] font-bold">1</span>
              <span>Backend Proxy (En Kolayı)</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              <strong>Bu sitede zaten aktiftir!</strong> Tarayıcınız doğrudan Vault'a değil, sunucumuzun arka planındaki <code>/api/vault/*</code> Express servisine gider. Node.js bir tarayıcı olmadığı için <strong>CORS ve Mixed-Content kurallarına tabi değildir</strong>.
            </p>
            <div className="p-2 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-300 font-mono">
              Browser ➔ Express Server ➔ Vault (CORS Yok)
            </div>
          </div>

          {/* Solution 2 */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="w-5 h-5 rounded-full bg-emerald-950 border border-emerald-800 flex items-center justify-center text-[10px] font-bold">2</span>
              <span>Vault HCL'de CORS Açmak</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Vault sunucusundaki <code>/etc/vault.d/vault.hcl</code> dosyasında <code>listener "tcp"</code> bloğuna CORS parametrelerini ekleyip servisi yeniden başlatabilirsiniz:
            </p>
            <pre className="p-2 bg-slate-900 border border-slate-800 rounded text-[10px] text-cyan-300 font-mono overflow-x-auto">
{`listener "tcp" {
  address = "0.0.0.0:8200"
  cors_enabled = true
  cors_allowed_origins = ["*"]
  cors_allowed_headers = [
    "X-Vault-Token",
    "X-Vault-Namespace",
    "Content-Type"
  ]
}`}
            </pre>
          </div>

          {/* Solution 3 */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
            <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
              <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-800 flex items-center justify-center text-[10px] font-bold">3</span>
              <span>Nginx Reverse Proxy</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Vault'un önüne Nginx kurarak tüm preflight <code>OPTIONS</code> isteklerine otomatik <code>204</code> ve CORS başlıkları dönebilirsiniz:
            </p>
            <pre className="p-2 bg-slate-900 border border-slate-800 rounded text-[10px] text-amber-300 font-mono overflow-x-auto">
{`location /v1/ {
  proxy_pass http://127.0.0.1:8200;
  add_header 'Access-Control-Allow-Origin' '*' always;
  add_header 'Access-Control-Allow-Headers' 'X-Vault-Token, Content-Type' always;
  if ($request_method = 'OPTIONS') {
    return 204;
  }
}`}
            </pre>
          </div>
        </div>

        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded text-xs text-slate-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="text-slate-200 font-semibold">Şirket İçi (Internal IP: 10.240.x.x) Ağ Notu:</span>
            <p className="text-[11px] text-slate-400">
              Eğer hedef Vault sunucunuz <code>10.240.52.54</code> gibi şirket içi lokal bir IP ise, internet üzerindeki bulut sunucuları şirketinizin özel ağına / VPN'ine erişemez. Bu durumda web uygulamasını şirket içi ağınızdaki bir makinede (Docker ile) çalıştırmanız veya yerel testleriniz için <strong>"Sandbox / Demo"</strong> modunu kullanmanız önerilir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
