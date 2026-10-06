import { VaultConnection, SecretEngine, SecretData, BatchFileItem } from '../types/vault';
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
  ): Promise<{ success: boolean; secret?: SecretData; error?: string }> {
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
        return { success: false, error: err.message };
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
      return { success: false, error: data.message || 'Secret okunamadı' };
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
}
