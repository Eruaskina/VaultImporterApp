import { VaultConnection, SecretEngine, SecretData, BatchFileItem, VaultEnvironment } from '../types/vault';
import { MockVaultService } from './mockVaultStore';

export class VaultApiService {
  /**
   * Test connection to Vault server or validate mock mode
   */
  static async testConnection(
    url: string,
    token: string,
    namespace?: string
  ): Promise<{ success: boolean; message?: string; details?: any }> {
    try {
      const res = await fetch('/api/vault/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, token, namespace }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        return {
          success: true,
          message: `Bağlantı başarılı! (${data.displayName || 'Token geçerli'})`,
          details: data,
        };
      }

      return {
        success: false,
        message: data.message || 'Bağlantı başarısız',
        details: data,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'API Proxy sunucusuna ulaşılamadı.',
      };
    }
  }

  /**
   * List mounted KV secret engines
   */
  static async getEngines(conn: VaultConnection): Promise<{ engines: string[]; engineDetails?: SecretEngine[] }> {
    if (conn.isDemoMode) {
      const engines = MockVaultService.getEngines();
      return {
        engines,
        engineDetails: engines.map((e) => ({
          path: e,
          type: 'kv',
          description: `Simüle edilmiş Engine: ${e}`,
          version: '2',
        })),
      };
    }

    try {
      const res = await fetch('/api/vault/engines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: conn.url,
          token: conn.token,
          namespace: conn.namespace,
        }),
      });

      const data = await res.json();
      if (data.engines && data.engines.length > 0) {
        return {
          engines: data.engines,
          engineDetails: data.engineDetails,
        };
      }
      return { engines: ['asis', 'secret', 'secrets'] };
    } catch {
      return { engines: ['asis', 'secret', 'secrets'] };
    }
  }

  /**
   * List keys and folders in a secret path
   */
  static async listPath(
    conn: VaultConnection,
    path: string
  ): Promise<{ success: boolean; keys: string[]; isFolder?: boolean; error?: string }> {
    if (conn.isDemoMode) {
      try {
        const keys = MockVaultService.listKeys(conn.engine, path);
        return { success: true, keys };
      } catch (err: any) {
        return { success: false, keys: [], error: err.message };
      }
    }

    try {
      const res = await fetch('/api/vault/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: conn.url,
          token: conn.token,
          engine: conn.engine,
          path,
          namespace: conn.namespace,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, keys: data.keys || [] };
      }
      return { success: false, keys: [], error: data.message || 'Dizin listelenemedi' };
    } catch (err: any) {
      return { success: false, keys: [], error: err.message };
    }
  }

  /**
   * Read secret contents (JSON) and version metadata
   */
  static async readSecret(
    conn: VaultConnection,
    path: string,
    version?: number
  ): Promise<{ success: boolean; notFound?: boolean; secret?: SecretData; error?: string }> {
    if (conn.isDemoMode) {
      try {
        const result = MockVaultService.readSecret(conn.engine, path, version);
        return {
          success: true,
          secret: {
            path,
            engine: conn.engine,
            data: result.data,
            metadata: result.metadata,
            currentVersion: result.currentVersion,
            selectedVersion: result.selectedVersion,
          },
        };
      } catch (err: any) {
        return { success: false, notFound: true, error: err.message };
      }
    }

    try {
      const res = await fetch('/api/vault/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: conn.url,
          token: conn.token,
          engine: conn.engine,
          path,
          version,
          namespace: conn.namespace,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        return {
          success: true,
          secret: {
            path,
            engine: conn.engine,
            data: data.data || {},
            metadata: data.metadata,
            currentVersion: data.currentVersion || 1,
            selectedVersion: version || data.currentVersion || 1,
          },
        };
      }
      return {
        success: false,
        notFound: Boolean(data.notFound || res.status === 404),
        error: data.message || 'Secret okunamadı',
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Write secret data (Creates a new KV v2 version)
   */
  static async writeSecret(
    conn: VaultConnection,
    path: string,
    data: Record<string, any>,
    cas?: number
  ): Promise<{ success: boolean; newVersion?: number; message?: string }> {
    if (conn.isDemoMode) {
      try {
        const res = MockVaultService.writeSecret(conn.engine, path, data);
        return {
          success: true,
          newVersion: res.version,
          message: `Secret kaydedildi. Yeni versiyon: v${res.version}`,
        };
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    }

    try {
      const res = await fetch('/api/vault/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: conn.url,
          token: conn.token,
          engine: conn.engine,
          path,
          data,
          cas,
          namespace: conn.namespace,
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        return {
          success: true,
          newVersion: resData.version,
          message: resData.message || `Yeni versiyon (v${resData.version || '?'}) oluşturuldu.`,
        };
      }
      return {
        success: false,
        message: resData.message || 'Kaydetme işlemi başarısız',
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Delete secret
   */
  static async deleteSecret(
    conn: VaultConnection,
    path: string,
    permanent: boolean = false
  ): Promise<{ success: boolean; message?: string }> {
    if (conn.isDemoMode) {
      const deleted = MockVaultService.deleteSecret(conn.engine, path);
      return {
        success: deleted,
        message: deleted ? 'Secret silindi.' : 'Secret bulunamadı.',
      };
    }

    try {
      const res = await fetch('/api/vault/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: conn.url,
          token: conn.token,
          engine: conn.engine,
          path,
          permanent,
          namespace: conn.namespace,
        }),
      });

      const resData = await res.json();
      return {
        success: res.ok && resData.success,
        message: resData.message || 'İşlem tamamlandı.',
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Generates standard city secret path.
   * Format: {env}/apps-{sehir}/{app}/{sehir}
   * Supports both 'apps-tekirdag' and 'tekirdag' as input.
   */
  static getCitySecretPath(
    env: VaultEnvironment,
    cityOrAppsFolder: string,
    appName: string
  ): string {
    const cleanTarget = cityOrAppsFolder.trim().toLowerCase();
    const cleanApp = appName.trim() || 'afc-saas-api';
    const folder = cleanTarget.startsWith('apps-') ? cleanTarget : `apps-${cleanTarget}`;
    const leafCity = cleanTarget.startsWith('apps-') ? cleanTarget.replace(/^apps-/, '') : cleanTarget;
    return `${env}/${folder}/${cleanApp}/${leafCity}`;
  }

  /**
   * Discovers all existing apps and cities from Vault or Mock store.
   * Maps which applications actually exist in which apps-sehir folders.
   */
  static async discoverAppsAndCities(
    conn: VaultConnection,
    env: VaultEnvironment
  ): Promise<{
    apps: string[];
    cities: string[];
    appCitiesMap: Record<string, string[]>;
    detectedEngine?: string;
  }> {
    const appCitiesMap: Record<string, Set<string>> = {};

    if (conn.isDemoMode) {
      const engines = MockVaultService.getEngines();
      const citiesSet = new Set<string>();
      const appsSet = new Set<string>();

      for (const eng of engines) {
        const allPaths = MockVaultService.getAllSecretPaths(eng);
        for (const p of allPaths) {
          // Check standard patterns: {env}/(apps-{city})/{app}/{city}
          const regex1 = /(?:^|\/)(?:prod|test|dev)\/(apps-[^/]+)\/([^/]+)/i;
          const match1 = p.match(regex1);
          if (match1) {
            const city = match1[1].toLowerCase();
            const app = match1[2];
            citiesSet.add(city);
            appsSet.add(app);
            if (!appCitiesMap[app]) appCitiesMap[app] = new Set();
            appCitiesMap[app].add(city);
          }

          // Check direct pattern: (apps-{city})/{app}
          const regex2 = /(?:^|\/)(apps-[^/]+)\/([^/]+)/i;
          const match2 = p.match(regex2);
          if (match2) {
            const city = match2[1].toLowerCase();
            const app = match2[2];
            citiesSet.add(city);
            appsSet.add(app);
            if (!appCitiesMap[app]) appCitiesMap[app] = new Set();
            appCitiesMap[app].add(city);
          }
        }
      }

      const serializedMap: Record<string, string[]> = {};
      for (const [app, cities] of Object.entries(appCitiesMap)) {
        serializedMap[app] = Array.from(cities).sort();
      }

      return {
        cities: Array.from(citiesSet).sort(),
        apps: Array.from(appsSet).sort(),
        appCitiesMap: serializedMap,
        detectedEngine: conn.engine,
      };
    }

    // 1. Live Vault: First try fast server-side discovery endpoint
    try {
      const res = await fetch('/api/vault/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: conn.url,
          token: conn.token,
          engine: conn.engine,
          namespace: conn.namespace,
          env,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && (data.apps?.length > 0 || data.cities?.length > 0)) {
          let resolvedAppCities: Record<string, string[]> = {};
          if (data.envAppCitiesMap && data.envAppCitiesMap[env]) {
            resolvedAppCities = data.envAppCitiesMap[env];
          } else if (data.appCitiesMap) {
            resolvedAppCities = data.appCitiesMap;
          }

          return {
            apps: data.apps || [],
            cities: data.cities || [],
            appCitiesMap: resolvedAppCities,
            detectedEngine: data.engine || conn.engine,
          };
        }
      }
    } catch {
      // Fallback to client-side list queries below
    }

    // 2. Client-side fallback discovery across environments
    try {
      const citiesSet = new Set<string>();
      const appsSet = new Set<string>();
      const envsToScan: VaultEnvironment[] = [env, 'prod', 'test', 'dev'];
      const uniqueEnvs = Array.from(new Set(envsToScan));

      for (const targetEnv of uniqueEnvs) {
        const rootRes = await this.listPath(conn, targetEnv);
        if (rootRes.success && rootRes.keys) {
          for (const k of rootRes.keys) {
            const cleanKey = k.replace(/\/$/, '');
            if (cleanKey.startsWith('apps-')) {
              const cityLower = cleanKey.toLowerCase();
              citiesSet.add(cityLower);

              // Probe this city for applications
              const cityRes = await this.listPath(conn, `${targetEnv}/${cleanKey}`);
              if (cityRes.success && cityRes.keys) {
                for (const ak of cityRes.keys) {
                  const appName = ak.replace(/\/$/, '');
                  if (appName && appName !== cleanKey.replace(/^apps-/, '') && !appName.endsWith('.json')) {
                    appsSet.add(appName);
                    if (!appCitiesMap[appName]) appCitiesMap[appName] = new Set();
                    appCitiesMap[appName].add(cityLower);
                  }
                }
              }
            } else if (cleanKey && !cleanKey.includes('.')) {
              // Potential direct application folder
              const subRes = await this.listPath(conn, `${targetEnv}/${cleanKey}`);
              if (subRes.success && subRes.keys && subRes.keys.length > 0) {
                appsSet.add(cleanKey);
                for (const sk of subRes.keys) {
                  const cleanSk = sk.replace(/\/$/, '').toLowerCase();
                  if (cleanSk.startsWith('apps-')) {
                    citiesSet.add(cleanSk);
                    if (!appCitiesMap[cleanKey]) appCitiesMap[cleanKey] = new Set();
                    appCitiesMap[cleanKey].add(cleanSk);
                  }
                }
              }
            }
          }
        }
      }

      const serializedMap: Record<string, string[]> = {};
      for (const [app, cities] of Object.entries(appCitiesMap)) {
        serializedMap[app] = Array.from(cities).sort();
      }

      return {
        cities: Array.from(citiesSet).sort(),
        apps: Array.from(appsSet).sort(),
        appCitiesMap: serializedMap,
        detectedEngine: conn.engine,
      };
    } catch {
      return {
        cities: [],
        apps: [],
        appCitiesMap: {},
        detectedEngine: conn.engine,
      };
    }
  }
}
