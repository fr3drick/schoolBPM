import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.js';
import schoolRoutes from './routes/schools.js';
import userRoutes from './routes/users.js';
import roleRoutes from './routes/roles.js';
import definitionRoutes from './routes/definitions.js';
import instanceRoutes from './routes/instances.js';
import notificationRoutes from './routes/notifications.js';
import dashboardRoutes from './routes/dashboard.js';
import auditRoutes from './routes/audit.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/definitions', definitionRoutes);
app.use('/api/instances', instanceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);

// Serve the built Angular client from the same origin, so the SPA's relative
// /api calls need no CORS and no second web server. Skipped in dev, where the
// directory does not exist and `ng serve` proxies /api here instead.
const clientDir = path.resolve(
  process.env.CLIENT_DIR ||
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public'),
);
if (fs.existsSync(path.join(clientDir, 'index.html'))) {
  // index: false so the fallback below owns index.html and its cache headers;
  // every other asset is content-hashed by the build, so it can cache forever.
  app.use(express.static(clientDir, { index: false, maxAge: '1y' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({ error: err.message });
  }
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

export default app;
