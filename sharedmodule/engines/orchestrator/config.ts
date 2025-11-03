// @ts-nocheck
export const CONFIG = {
  ports: {
    orchestrator: Number(process.env.PORT_ORCH || 7700),
    workflow: Number(process.env.PORT_WORKFLOW || 7701),
    vision: Number(process.env.PORT_VISION || 7702),
    visionPy: Number(process.env.PORT_PY_VISION || 8899),
  },
  scripts: {
    workflow: 'dist/sharedmodule/engines/api-gateway/server.js',
    vision: 'dist/sharedmodule/engines/vision-engine/server.js',
  }
};

