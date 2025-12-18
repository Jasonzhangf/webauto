export class FloatingOrchestrator {
  constructor({ graphStore, backend }) {
    this.graphStore = graphStore;
    this.backend = backend;
  }

  async loadSnapshot(profileId, url) {
    if (!profileId || !url) return;
    const snapshot = await this.backend.inspectContainers({ profile: profileId, url });
    return snapshot;
  }
}
