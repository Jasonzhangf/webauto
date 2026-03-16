/**
 * Checkpoint Manager Module
 * 
 * Provides checkpoint save/load functionality for task recovery
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Save checkpoint to file
 * @param {Object} checkpoint - Checkpoint data
 * @param {string} outputRoot - Output root directory
 * @param {string} keyword - Task keyword
 * @returns {Promise<string>} - Checkpoint file path
 */
export async function saveCheckpoint(checkpoint, outputRoot, keyword) {
  const checkpointDir = path.join(outputRoot, keyword);
  const checkpointPath = path.join(checkpointDir, '.checkpoint.json');
  
  // Ensure directory exists
  await fs.mkdir(checkpointDir, { recursive: true });
  
  // Add timestamp
  checkpoint.timestamp = Date.now();
  
  // Write checkpoint
  await fs.writeFile(
    checkpointPath,
    JSON.stringify(checkpoint, null, 2),
    'utf-8'
  );
  
  return checkpointPath;
}

/**
 * Load checkpoint from file
 * @param {string} outputRoot - Output root directory
 * @param {string} keyword - Task keyword
 * @returns {Promise<Object|null>} - Checkpoint data or null
 */
export async function loadCheckpoint(outputRoot, keyword) {
  const checkpointPath = path.join(outputRoot, keyword, '.checkpoint.json');
  
  try {
    const data = await fs.readFile(checkpointPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Clear checkpoint file
 * @param {string} outputRoot - Output root directory
 * @param {string} keyword - Task keyword
 * @returns {Promise<void>}
 */
export async function clearCheckpoint(outputRoot, keyword) {
  const checkpointPath = path.join(outputRoot, keyword, '.checkpoint.json');
  
  try {
    await fs.unlink(checkpointPath);
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Check if checkpoint exists
 * @param {string} outputRoot - Output root directory
 * @param {string} keyword - Task keyword
 * @returns {Promise<boolean>} - True if checkpoint exists
 */
export async function hasCheckpoint(outputRoot, keyword) {
  const checkpointPath = path.join(outputRoot, keyword, '.checkpoint.json');
  
  try {
    await fs.access(checkpointPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create checkpoint data structure
 * @param {Object} params - Checkpoint parameters
 * @returns {Object} - Checkpoint data
 */
export function createCheckpoint({
  runId,
  profileId,
  keyword,
  processedNoteIds = [],
  currentIndex = 0,
  totalNotes = 0,
  lastOperation = '',
  lastError = null,
  recoveryCount = 0
}) {
  return {
    runId,
    profileId,
    keyword,
    processedNoteIds,
    currentIndex,
    totalNotes,
    lastOperation,
    lastError,
    recoveryCount,
    timestamp: Date.now()
  };
}
