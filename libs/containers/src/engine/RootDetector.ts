// Container Engine v2 - Root Detector (skeleton)
// On page visit (navigate/refresh), detect presence of root by anchors or selectors

import { ContainerDefV2, SelectorByClass } from './types.js';

export interface RootDetectorDeps {
  queryByClasses: (scopeHandle: any, selector: SelectorByClass) => Promise<any[]>;
  documentHandle: () => Promise<any>; // page root handle
}

export class RootDetector {
  constructor(private deps: RootDetectorDeps) {}

  async detect(def: ContainerDefV2): Promise<{ found: boolean; handle?: any }> {
    const scope = await this.deps.documentHandle();
    const candidates = def.anchors && def.anchors.length ? def.anchors : def.selectors;
    for (const s of candidates) {
      const hs = await this.deps.queryByClasses(scope, s).catch((): any[] => []);
      if (hs && hs.length) return { found: true, handle: hs[0] };
    }
    return { found: false };
  }
}
