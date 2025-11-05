// @ts-nocheck
import express from 'express';
import { health, run as runWorkflow, status as workflowStatus } from './controllers/workflowController.js';
import { listSessions, start as startSession, close as closeSession } from './controllers/sessionController.js';
import { navigate, click, type as typeText, evalInPage, currentUrl, highlight, screenshot, checkLoginAnchor, waitLoginAnchorEndpoint } from './controllers/browserController.js';
import { snapshot as pageSnapshot, html as pageHtml, scripts as pageScripts, text as pageText } from './controllers/pageController.js';
import { list as listContainers, resolve as resolveContainer, validate as validateContainer, highlight as highlightContainer } from './controllers/containersController.js';
import { runScript as extractRunScript, containerExtract as extractContainer, extract1688Search } from './controllers/extractController.js';
import { tabClose, tabAttach } from './controllers/browserExtraController.js';
import { evalFile as devEvalFile, evalCode as devEvalCode, installPicker as devInstallPicker } from './controllers/devController.js';
import * as mouseCtl from './controllers/mouseController.js';
import * as keyboardCtl from './controllers/keyboardController.js';
import * as containerOps from './controllers/containerOpsController.ts';
import { run as runSequence } from './controllers/workflowSequenceController.js';
import { list as listRecords } from './controllers/workflowRecordsController.js';
import { submitWorkflow as jobSubmitWorkflow, status as jobStatus } from './controllers/jobController.js';
import { switchRun } from './controllers/demoSwitchController.js';

const app = express();
app.use(express.json({ limit: '20mb' }));

// health
app.get('/health', health);
app.get('/v1/health', health);

// sessions
app.get('/sessions', listSessions);
app.post('/sessions/start', startSession);
app.post('/sessions/close', closeSession);
app.get('/v1/sessions', listSessions);
app.post('/v1/sessions/start', startSession);
app.post('/v1/sessions/close', closeSession);

// workflow
app.post('/workflow/run', runWorkflow);
app.get('/workflow/status/:sessionId', workflowStatus);
app.post('/v1/workflows/run', runWorkflow);
app.get('/v1/workflows/status/:sessionId', workflowStatus);

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
// v1 mirror
app.post('/v1/browser/navigate', navigate);
app.post('/v1/browser/click', click);
app.post('/v1/browser/type', typeText);
app.post('/v1/browser/eval', evalInPage);
app.get('/v1/browser/url', currentUrl);
app.post('/v1/browser/highlight', highlight);
app.post('/v1/browser/screenshot', screenshot);
app.post('/v1/browser/check-login-anchor', checkLoginAnchor);
app.post('/v1/browser/wait-login-anchor', waitLoginAnchorEndpoint);
app.post('/v1/browser/tab/attach', tabAttach);
app.post('/v1/browser/tab/close', tabClose);

// page
app.get('/v1/page/snapshot', pageSnapshot);
app.get('/v1/page/html', pageHtml);
app.get('/v1/page/scripts', pageScripts);
app.get('/v1/page/text', pageText);

// containers
app.get('/v1/containers', listContainers);
app.post('/v1/containers/resolve', resolveContainer);
app.post('/v1/containers/validate', validateContainer);
app.post('/v1/containers/highlight', highlightContainer);

// extract
app.post('/v1/extract/run-script', extractRunScript);
app.post('/v1/extract/container', extractContainer);
app.post('/v1/extract/1688/search', extract1688Search);

// dev
app.post('/v1/dev/eval-file', devEvalFile);
app.post('/v1/dev/eval-code', devEvalCode);
app.post('/v1/dev/picker/install', devInstallPicker);

// mouse primitives
app.post('/v1/mouse/move', mouseCtl.move);
app.post('/v1/mouse/click', mouseCtl.click);
app.post('/v1/mouse/wheel', mouseCtl.wheel);

// keyboard primitives
app.post('/v1/keyboard/type', keyboardCtl.type);
app.post('/v1/keyboard/press', keyboardCtl.press);
app.post('/v1/keyboard/down', keyboardCtl.down);
app.post('/v1/keyboard/up', keyboardCtl.up);

// container operations
app.post('/v1/containers/actions/click', containerOps.click);
app.post('/v1/containers/actions/type', containerOps.type);
app.post('/v1/containers/actions/scroll', containerOps.scroll);
app.post('/v1/containers/actions/hover', containerOps.hover);
app.post('/v1/containers/actions/bbox', containerOps.bbox);
app.post('/v1/containers/actions/screenshot', containerOps.screenshot);
app.post('/v1/containers/actions/get', containerOps.get);

// workflows sequence
app.post('/v1/workflows/sequence/run', runSequence);
app.get('/v1/workflows/records', listRecords);
app.post('/v1/jobs/submit/workflow', jobSubmitWorkflow);
app.get('/v1/jobs/:id', jobStatus);

// demos
app.post('/v1/demos/switch-run', switchRun);

const port = Number(process.env.PORT_WORKFLOW || 7701);
app.listen(port, () => {
  console.log(`Workflow API listening on http://localhost:${port}`);
});
