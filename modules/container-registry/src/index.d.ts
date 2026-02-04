export interface SelectorDefinition {
    css?: string;
    id?: string;
    classes?: string[];
    variant?: string;
    score?: number;
}
export interface ContainerDefinition {
    id: string;
    name?: string;
    type?: string;
    selectors?: SelectorDefinition[];
    children?: string[];
    page_patterns?: string[];
    pagePatterns?: string[];
    metadata?: Record<string, any>;
    [key: string]: any;
}
export declare class ContainerRegistry {
    private indexCache;
    private legacyCache;
    listSites(): {
        key: string;
        website: string;
        path: string;
    }[];
    getContainersForSite(siteKey: string): Record<string, ContainerDefinition>;
    resolveSiteKey(url: string): string | null;
    load(): Promise<void>;
    getContainersForUrl(url: string): Record<string, ContainerDefinition>;
    private fetchContainersForSite;
    private ensureIndex;
    private loadSiteContainers;
    private walkSite;
    private loadLegacyFile;
    private loadLegacyRegistry;
    private findSiteKey;
}
//# sourceMappingURL=index.d.ts.map