/**
 * Output formatting utilities.
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function colorize(text, color) {
  if (process.env.NO_COLOR || !process.stdout.isTTY) return text;
  return `${colors[color] || ''}${text}${colors.reset}`;
}

export function ok(msg) { console.log(colorize('  ✓ ', 'green') + msg); }
export function fail(msg) { console.log(colorize('  ✗ ', 'red') + msg); }
export function warn(msg) { console.log(colorize('  ⚠ ', 'yellow') + msg); }
export function info(msg) { console.log(colorize('  ℹ ', 'blue') + msg); }
export function header(msg) { console.log(`\n${colorize(msg, 'bold')}`); }

export function json(data) {
  console.log(JSON.stringify(data, null, 2));
}

export function table(rows, columns) {
  const widths = columns.map((col, i) =>
    Math.max(col.label.length, ...rows.map(r => String(r[i] ?? '').length))
  );
  
  const headerLine = columns.map((col, i) =>
    col.label.padEnd(widths[i])
  ).join('  ');
  
  console.log(colorize(headerLine, 'bold'));
  
  for (const row of rows) {
    const line = columns.map((col, i) =>
      String(row[i] ?? '').padEnd(widths[i])
    ).join('  ');
    console.log(line);
  }
}

export function progressBar(current, total, width = 30) {
  const ratio = total > 0 ? current / total : 0;
  const filled = Math.round(width * ratio);
  const empty = width - filled;
  const bar = colorize('█'.repeat(filled), 'green') + '░'.repeat(empty);
  const pct = Math.round(ratio * 100);
  return `[${bar}] ${current}/${total} (${pct}%)`;
}
