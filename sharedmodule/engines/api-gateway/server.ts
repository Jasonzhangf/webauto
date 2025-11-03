// @ts-nocheck
import express from 'express';
import { health, run as runWorkflow, status as workflowStatus } from './controllers/workflowController.js';
import { list as listSessions, start as startSession, close as closeSession } from './controllers/sessionController.js';
import { navigate, click, type as typeText, evalInPage, currentUrl, highlight, screenshot, checkLoginAnchor, waitLoginAnchorEndpoint } from './controllers/browserController.js';

const app = express();
app.use(express.json({ limit: '20mb' }));

// health
app.get('/health', health);

// sessions
app.get('/sessions', listSessions);
app.post('/sessions/start', startSession);
app.post('/sessions/close', closeSession);

// workflow
app.post('/workflow/run', runWorkflow);
app.get('/workflow/status/:sessionId', workflowStatus);

// browser direct
app.post('/browser/navigate', navigate);
app.post('/browser/click', click);
app.post('/browser/type', typeText);
app.post('/browser/eval', evalInPage);
app.get('/browser/url', currentUrl);
app.post('/browser/highlight', highlight);
app.post('/browser/screenshot', screenshot);
app.post('/browser/check-login-anchor', checkLoginAnchor);
app.post('/browser/wait-login-anchor', waitLoginAnchorEndpoint);

const port = Number(process.env.PORT_WORKFLOW || 7701);
app.listen(port, () => {
  console.log(`Workflow API listening on http://localhost:${port}`);
});

