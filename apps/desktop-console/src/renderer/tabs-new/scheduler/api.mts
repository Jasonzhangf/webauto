export async function invokeSchedule(ctx: any, input: Record<string, any>) {
  if (typeof ctx.api?.scheduleInvoke !== 'function') {
    throw new Error('scheduleInvoke unavailable');
  }
  const ret = await ctx.api.scheduleInvoke(input);
  if (!ret?.ok) {
    const reason = String(ret?.error || 'schedule command failed').trim();
    throw new Error(reason || 'schedule command failed');
  }
  return ret?.json ?? ret;
}

export async function invokeTaskRunEphemeral(ctx: any, input: Record<string, any>) {
  if (typeof ctx.api?.taskRunEphemeral !== 'function') {
    throw new Error('taskRunEphemeral unavailable');
  }
  const ret = await ctx.api.taskRunEphemeral(input);
  if (!ret?.ok) {
    const reason = String(ret?.error || 'run ephemeral failed').trim();
    throw new Error(reason || 'run ephemeral failed');
  }
  return ret;
}

export function downloadJson(fileName: string, payload: any) {
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
