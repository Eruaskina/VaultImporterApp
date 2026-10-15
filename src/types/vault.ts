export type VaultEnvironment = 'dev' | 'test' | 'prod';

export interface VaultConnection {
  url: string;
  token: string;
  engine: string;
  namespace?: string;
  appName: string;
  username: string;
  selectedEnv: VaultEnvironment;
  isCustomEngine?: boolean;
  isConnected: boolean;
  isDemoMode: boolean;
  serverType: 'dual_path_108' | 'standard';
}

export interface SecretEngine {
  path: string;
  type: string;
  description: string;
  version: string;
}

export interface SecretVersionMeta {
  version: number;
  created_time: string;
  deletion_time?: string;
  destroyed?: boolean;
}

export interface SecretMetadata {
  current_version: number;
  oldest_version: number;
  created_time: string;
  updated_time: string;
  max_versions?: number;
  versions?: Record<string, SecretVersionMeta>;
}

export interface SecretData {
  path: string;
  engine: string;
  data: Record<string, any>;
  metadata?: SecretMetadata;
  currentVersion: number;
  selectedVersion?: number;
}

export interface BatchFileItem {
  id: string;
  fileName: string;
  fileSize: number;
  cityName: string;
  content: any; // parsed JSON or raw string
  rawString: string;
  isValidJson: boolean;
  targetPaths: string[];
  status: 'pending' | 'success' | 'error' | 'uploading';
  errorMessage?: string;
  isSelected?: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  details?: string;
}

export interface AppFileItem {
  id: string; // unique identifier e.g. 'apps-tekirdag/tekirdag'
  fileName: string; // e.g. 'tekirdag' or 'appsettings.json'
  appsFolder: string; // e.g. 'apps-tekirdag'
  path: string; // full path e.g. 'prod/apps-tekirdag/afc-saas-api/tekirdag'
  displayName: string; // e.g. 'tekirdag (apps-tekirdag)'
}

export interface CitySecretRef {
  city: string;
  path: string;
  status: 'idle' | 'loading' | 'success' | 'not_found' | 'error';
  secretData?: SecretData;
  error?: string;
  version?: number;
  fileName?: string;
  appsFolder?: string;
  fileId?: string;
}

export interface AggregatedKeyRow {
  key: string;
  uniqueValues: any[];
  hasMultipleValues: boolean;
  cityValues: Record<string, any>;
  presentInCities: string[];
  type: 'string' | 'number' | 'boolean' | 'null';
}

export type BatchModalMode = 'none' | 'add' | 'delete' | 'update_value' | 'rename_key';

