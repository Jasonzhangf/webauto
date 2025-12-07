export interface BranchRequest {
  profile: string;
  url: string;
  path: string;
  maxDepth?: number;
  maxChildren?: number;
}

export interface BranchNode {
  path: string;
  tag: string;
  childCount: number;
  children: BranchNode[];
}

export interface BranchResponse {
  profileId: string;
  url: string;
  node: BranchNode;
}

export async function fetchBranch(req: BranchRequest): Promise<BranchResponse> {
  if (!req?.profile || !req?.url || !req?.path) {
    throw new Error('profile/url/path required');
  }
  const cliPath = new URL('../src/cli.ts', import.meta.url).pathname;
  // For now return mock
  return {
    profileId: req.profile,
    url: req.url,
    node: {
      path: req.path,
      tag: 'DIV',
      childCount: 0,
      children: [],
    },
  };
}
