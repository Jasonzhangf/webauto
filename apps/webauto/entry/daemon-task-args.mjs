export function resolveTaskArgs(rawArgv = [], cmd = 'task') {
  const list = Array.isArray(rawArgv) ? rawArgv : [];
  const idx = list.indexOf('--');
  let taskArgs = idx >= 0 ? list.slice(idx + 1) : list.slice(cmd === 'task' ? 2 : 1);
  if (taskArgs.includes('--detach')) {
    taskArgs = taskArgs.filter((arg) => arg !== '--detach');
  }
  return taskArgs;
}
