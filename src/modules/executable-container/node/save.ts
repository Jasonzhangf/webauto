import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// process类型已由@types/node提供

export interface SaveOptions {
  site: string;
  fileName?: string;
  baseDir?: string; // defaults to containers/staging/<site>/
}

export function saveDefinition(def: any, opts: SaveOptions) {
  const file = opts.fileName || `picker_${Date.now()}.json`;
  const dir = opts.baseDir || join(process.cwd(), 'containers', 'staging', opts.site, 'containers');
  const fp = join(dir, file);
  mkdirSync(dirname(fp), { recursive: true });
  writeFileSync(fp, JSON.stringify(def, null, 2));
  return fp;
}

export default { saveDefinition };
