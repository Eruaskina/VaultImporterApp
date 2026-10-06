import { SecretMetadata } from '../types/vault';

interface StoredSecret {
  versions: Record<number, { data: Record<string, any>; created_time: string }>;
  current_version: number;
  metadata: SecretMetadata;
}

const STORAGE_KEY = 'vault_mock_store_data_v2';

const initialStore: Record<string, Record<string, StoredSecret>> = {
  asis: {
    'prod/apps-istanbul/afc-saas/istanbul': {
      current_version: 2,
      metadata: {
        current_version: 2,
        oldest_version: 1,
        created_time: new Date(Date.now() - 86400000 * 3).toISOString(),
        updated_time: new Date(Date.now() - 3600000).toISOString(),
        max_versions: 10,
        versions: {
          '1': {
            version: 1,
            created_time: new Date(Date.now() - 86400000 * 3).toISOString(),
          },
          '2': {
            version: 2,
            created_time: new Date(Date.now() - 3600000).toISOString(),
          },
        },
      },
      versions: {
        1: {
          created_time: new Date(Date.now() - 86400000 * 3).toISOString(),
          data: {
            appsettings: {
              Logging: {
                LogLevel: {
                  Default: 'Information',
                  'Microsoft.AspNetCore': 'Warning',
                },
              },
              ConnectionStrings: {
                DefaultConnection: 'Server=10.240.20.15;Database=AfcIstanbul_Prod;User Id=db_usr;Password=OldPassword123;',
              },
              CityConfig: {
                Code: '34',
                Name: 'Istanbul',
                Environment: 'Production',
                WorkerCount: 100,
              },
            },
          },
        },
        2: {
          created_time: new Date(Date.now() - 3600000).toISOString(),
          data: {
            appsettings: {
              Logging: {
                LogLevel: {
                  Default: 'Information',
                  'Microsoft.AspNetCore': 'Warning',
                },
              },
              ConnectionStrings: {
                DefaultConnection: 'Server=10.240.20.15;Database=AfcIstanbul_Prod;User Id=db_app_usr;Password=ProdSecr3tP@ss2026;TrustServerCertificate=True;',
                RedisCache: '10.240.20.50:6379,password=Red1sMasterSecure',
              },
              CityConfig: {
                Code: '34',
                Name: 'Istanbul',
                Environment: 'Production',
                WorkerCount: 250,
                EnableAuditLogging: true,
                MaxQueueSize: 5000,
              },
              JwtSettings: {
                Issuer: 'AfcAuthIssuer',
                Audience: 'AfcIstanbulService',
                SecretKey: 'SuperSecretJwtKeyIstanbulProduction2026!',
                ExpiryMinutes: 120,
              },
            },
          },
        },
      },
    },
    'dev/apps-ankara/afc-saas/ankara/user/test-user': {
      current_version: 1,
      metadata: {
        current_version: 1,
        oldest_version: 1,
        created_time: new Date(Date.now() - 86400000).toISOString(),
        updated_time: new Date(Date.now() - 86400000).toISOString(),
        versions: {
          '1': {
            version: 1,
            created_time: new Date(Date.now() - 86400000).toISOString(),
          },
        },
      },
      versions: {
        1: {
          created_time: new Date(Date.now() - 86400000).toISOString(),
          data: {
            appsettings: {
              Logging: {
                LogLevel: {
                  Default: 'Debug',
                  System: 'Information',
                },
              },
              ConnectionStrings: {
                DefaultConnection: 'Server=10.240.10.88;Database=AfcAnkara_Dev;User Id=dev_user;Password=DevP@ssword2026;',
              },
              CityConfig: {
                Code: '06',
                Name: 'Ankara',
                Environment: 'Development',
                DeveloperOverride: true,
                UserWorkspace: 'test-user',
              },
            },
          },
        },
      },
    },
    'dev/apps-ankara/afc-saas/ankara': {
      current_version: 1,
      metadata: {
        current_version: 1,
        oldest_version: 1,
        created_time: new Date(Date.now() - 86400000 * 2).toISOString(),
        updated_time: new Date(Date.now() - 86400000 * 2).toISOString(),
        versions: {
          '1': {
            version: 1,
            created_time: new Date(Date.now() - 86400000 * 2).toISOString(),
          },
        },
      },
      versions: {
        1: {
          created_time: new Date(Date.now() - 86400000 * 2).toISOString(),
          data: {
            appsettings: {
              Logging: {
                LogLevel: { Default: 'Debug' },
              },
              ConnectionStrings: {
                DefaultConnection: 'Server=10.240.10.88;Database=AfcAnkara_SharedDev;User Id=dev_user;Password=DevMasterShared;',
              },
              CityConfig: {
                Code: '06',
                Name: 'Ankara',
                Environment: 'Development',
              },
            },
          },
        },
      },
    },
    'prod/apps-izmir/afc-saas/izmir': {
      current_version: 1,
      metadata: {
        current_version: 1,
        oldest_version: 1,
        created_time: new Date(Date.now() - 86400000 * 4).toISOString(),
        updated_time: new Date(Date.now() - 86400000 * 4).toISOString(),
        versions: {
          '1': {
            version: 1,
            created_time: new Date(Date.now() - 86400000 * 4).toISOString(),
          },
        },
      },
      versions: {
        1: {
          created_time: new Date(Date.now() - 86400000 * 4).toISOString(),
          data: {
            appsettings: {
              Logging: { LogLevel: { Default: 'Information' } },
              ConnectionStrings: {
                DefaultConnection: 'Server=10.240.30.12;Database=AfcIzmir_Prod;User Id=izmir_db;Password=IzmirP@ssSecure!',
              },
              CityConfig: { Code: '35', Name: 'Izmir', Active: true },
            },
          },
        },
      },
    },
  },
  secret: {
    'database/central-postgres': {
      current_version: 1,
      metadata: {
        current_version: 1,
        oldest_version: 1,
        created_time: new Date().toISOString(),
        updated_time: new Date().toISOString(),
      },
      versions: {
        1: {
          created_time: new Date().toISOString(),
          data: {
            host: 'postgres-cluster.internal',
            port: 5432,
            username: 'super_admin',
            password: 'VaultManagedPassword_998a!',
            max_connections: 50,
          },
        },
      },
    },
    'apis/pos-integrations': {
      current_version: 1,
      metadata: {
        current_version: 1,
        oldest_version: 1,
        created_time: new Date().toISOString(),
        updated_time: new Date().toISOString(),
      },
      versions: {
        1: {
          created_time: new Date().toISOString(),
          data: {
            merchant_id: 'TR_POS_887129',
            terminal_id: 'TERM_IST_01',
            api_key: 'sk_live_9923847a98bc19d',
            endpoint: 'https://payment.bank.com/v3/gateway',
            timeout_seconds: 30,
          },
        },
      },
    },
  },
};

export class MockVaultService {
  private static getStore(): Record<string, Record<string, StoredSecret>> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return initialStore;
  }

  private static saveStore(store: Record<string, Record<string, StoredSecret>>) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // ignore
    }
  }

  static getEngines(): string[] {
    const store = this.getStore();
    return Object.keys(store);
  }

  static listKeys(engine: string, prefix: string = ''): string[] {
    const store = this.getStore();
    const engineStore = store[engine] || {};
    const cleanPrefix = prefix ? prefix.replace(/^\/+|\/+$/g, '') + '/' : '';

    const directItems = new Set<string>();

    for (const fullPath of Object.keys(engineStore)) {
      if (!cleanPrefix) {
        // Root items
        const parts = fullPath.split('/');
        if (parts.length > 1) {
          directItems.add(parts[0] + '/');
        } else {
          directItems.add(parts[0]);
        }
      } else if (fullPath.startsWith(cleanPrefix)) {
        const remainder = fullPath.slice(cleanPrefix.length);
        const parts = remainder.split('/');
        if (parts.length > 1) {
          directItems.add(parts[0] + '/');
        } else if (parts[0]) {
          directItems.add(parts[0]);
        }
      }
    }

    return Array.from(directItems).sort();
  }

  static readSecret(engine: string, path: string, version?: number) {
    const store = this.getStore();
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    const entry = store[engine]?.[cleanPath];

    if (!entry) {
      throw new Error(`Secret '${engine}/${cleanPath}' bulunamadı.`);
    }

    const targetVersion = version ? Number(version) : entry.current_version;
    const versionData = entry.versions[targetVersion];

    if (!versionData) {
      throw new Error(`Versiyon ${targetVersion} bulunamadı.`);
    }

    return {
      data: versionData.data,
      metadata: entry.metadata,
      currentVersion: entry.current_version,
      selectedVersion: targetVersion,
    };
  }

  static writeSecret(engine: string, path: string, data: Record<string, any>) {
    const store = this.getStore();
    if (!store[engine]) {
      store[engine] = {};
    }

    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    const now = new Date().toISOString();

    if (!store[engine][cleanPath]) {
      store[engine][cleanPath] = {
        current_version: 1,
        metadata: {
          current_version: 1,
          oldest_version: 1,
          created_time: now,
          updated_time: now,
          versions: {
            '1': {
              version: 1,
              created_time: now,
            },
          },
        },
        versions: {
          1: {
            created_time: now,
            data,
          },
        },
      };
      this.saveStore(store);
      return { version: 1, created_time: now };
    }

    const existing = store[engine][cleanPath];
    const newVersion = existing.current_version + 1;

    existing.current_version = newVersion;
    existing.metadata.current_version = newVersion;
    existing.metadata.updated_time = now;

    if (!existing.metadata.versions) {
      existing.metadata.versions = {};
    }
    existing.metadata.versions[String(newVersion)] = {
      version: newVersion,
      created_time: now,
    };

    existing.versions[newVersion] = {
      created_time: now,
      data,
    };

    this.saveStore(store);
    return { version: newVersion, created_time: now };
  }

  static deleteSecret(engine: string, path: string) {
    const store = this.getStore();
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    if (store[engine]?.[cleanPath]) {
      delete store[engine][cleanPath];
      this.saveStore(store);
      return true;
    }
    return false;
  }

  static resetToDefault() {
    localStorage.removeItem(STORAGE_KEY);
  }
}
