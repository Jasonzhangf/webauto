import test from 'node:test';
import assert from 'node:assert/strict';
import { registerActionUsage, getActionUsage, clearAllUsages } from '../src/index.ts';
test('api-usage registry registers and retrieves usage', () => {
  clearAllUsages();
  registerActionUsage('browser:test', {