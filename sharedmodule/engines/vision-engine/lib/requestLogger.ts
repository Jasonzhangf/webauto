// @ts-nocheck
export function requestLogger(req, res, next) {
  const t0 = Date.now();
  res.on('finish', () => {
    const dt = Date.now() - t0;
    console.log(`[vision] ${req.method} ${req.url} -> ${res.statusCode} ${dt}ms`);
  });
  next();
}

