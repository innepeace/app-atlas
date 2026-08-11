// lib/config.mjs
// 统一管理 atlas.config.json 配置文件的读写。
// 配置文件位于项目根目录，存储用户本地环境相关设置（如源码项目路径）。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const CONFIG_PATH = join(root, 'atlas.config.json');

const DEFAULTS = {
  sourceProject: ''  // 源码项目绝对路径，如 /Users/xx/project/fix
};

/** 读取配置，不存在则返回默认值 */
export function readConfig() {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

/** 写入配置（合并已有配置） */
export function writeConfig(partial) {
  const current = readConfig();
  const merged = { ...current, ...partial };
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + '\n');
  return merged;
}

/** 获取源码项目路径，若未配置或路径不存在返回 null */
export function getSourceProject() {
  const cfg = readConfig();
  const p = cfg.sourceProject;
  if (!p) return null;
  if (!existsSync(p)) return null;
  return p;
}

/** 配置文件路径（供外部判断是否存在） */
export const configPath = CONFIG_PATH;
