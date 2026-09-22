#!/usr/bin/env node
import minimist from 'minimist';
import { assertDaemonAdmission, runWeiboCli } from '../weibo-v3/cli.mjs';

const argv = minimist(process.argv.slice(2));
if (!argv.help && !argv.h) assertDaemonAdmission();
const result = await runWeiboCli('video', argv);
if (!result?.help) console.log(JSON.stringify(result, null, 2));
if (result?.ok === false || result?.success === false) process.exitCode = 1;
