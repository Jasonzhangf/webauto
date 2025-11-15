// @ts-nocheck
export const CONFIG = {
  ports: {
    orchestrator: Number(process.env.PORT_ORCH || 7700),
    workflow: Number(process.env.PORT_WORKFLOW || 7701),
    vision: Number(process.env.PORT_VISION || 7702),
    visionPy: Number(process.env.PORT_PY_VISION || 8899),
    container: Number(process.env.PORT_CONTAINER || 7703),
  },
  scripts: {
    workflow: 'dist/services/engines/api-gateway/server.js',
    vision: 'dist/services/engines/vision-engine/server.js',
    container: 'dist/services/engines/container-engine/server.js',
  }
};
