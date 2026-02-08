import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { DEFAULT_CONFIG, type DifferConfig } from './types'

export * from './types'

const CONFIG_FILENAME = '.diffyrc.json'
const GLOBAL_CONFIG_DIR = join(homedir(), '.config', 'diffy')
const GLOBAL_CONFIG_PATH = join(GLOBAL_CONFIG_DIR, 'config.json')

/**
 * Load config from file, merging with defaults
 */
function loadConfigFile(path: string): Partial<DifferConfig> {
  try {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8')
      return JSON.parse(content)
    }
  } catch (error) {
    console.warn(`Warning: Failed to parse config at ${path}`)
  }
  return {}
}

/**
 * Load config with priority:
 * 1. CLI options (passed in)
 * 2. Repo-local config (.diffyrc.json in repoPath)
 * 3. Global config (~/.config/diffy/config.json)
 * 4. Defaults
 */
export function loadConfig(
  repoPath: string,
  overrides: Partial<DifferConfig> = {}
): DifferConfig {
  // Load global config
  const globalConfig = loadConfigFile(GLOBAL_CONFIG_PATH)

  // Load repo-local config
  const localConfigPath = join(repoPath, CONFIG_FILENAME)
  const localConfig = loadConfigFile(localConfigPath)

  // Merge configs (later sources override earlier ones)
  return {
    ...DEFAULT_CONFIG,
    ...globalConfig,
    ...localConfig,
    ...overrides,
  }
}

/**
 * Save config to repo-local or global location
 */
export function saveConfig(
  config: Partial<DifferConfig>,
  options: { repoPath?: string; global?: boolean } = {}
): void {
  const { repoPath, global: saveGlobal } = options

  let configPath: string
  if (saveGlobal || !repoPath) {
    // Ensure global config directory exists
    if (!existsSync(GLOBAL_CONFIG_DIR)) {
      mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true })
    }
    configPath = GLOBAL_CONFIG_PATH
  } else {
    configPath = join(repoPath, CONFIG_FILENAME)
  }

  // Load existing config and merge
  const existingConfig = loadConfigFile(configPath)
  const mergedConfig = { ...existingConfig, ...config }

  writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2) + '\n')
}

/**
 * Get the path where config would be saved
 */
export function getConfigPath(options: { repoPath?: string; global?: boolean } = {}): string {
  if (options.global || !options.repoPath) {
    return GLOBAL_CONFIG_PATH
  }
  return join(options.repoPath, CONFIG_FILENAME)
}
