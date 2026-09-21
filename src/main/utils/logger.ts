import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

interface SafeError {
  name: string;
  message: string;
  stack?: string;
  code?: string;
}

const SENSITIVE_KEYS = /password|token|secret|clinical|diagnosis|medication|allerg|medical|notes|content/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[truncated]';
  if (value instanceof Error) {
    const error = value as Error & { code?: string };
    const safe: SafeError = { name: error.name, message: error.message, code: error.code };
    if (process.env.NODE_ENV !== 'production') safe.stack = error.stack;
    return safe;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.test(key) ? '[redacted]' : redact(item, depth + 1);
    }
    return result;
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

export class AppLogger {
  private currentFile: string;
  private readonly maxBytes = 5 * 1024 * 1024;
  private readonly retainedFiles = 7;

  constructor(private readonly directory: string) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.currentFile = path.join(directory, 'dentiva.log');
    this.rotateIfNeeded();
  }

  info(message: string, context?: unknown): void { this.write('INFO', message, context); }
  warn(message: string, context?: unknown): void { this.write('WARN', message, context); }
  error(message: string, context?: unknown): void { this.write('ERROR', message, context); }

  private write(level: LogLevel, message: string, context?: unknown): void {
    try {
      this.rotateIfNeeded();
      const record = {
        timestamp: new Date().toISOString(),
        level,
        message,
        context: context === undefined ? undefined : redact(context)
      };
      fs.appendFileSync(this.currentFile, `${JSON.stringify(record)}${os.EOL}`, { encoding: 'utf8', mode: 0o600 });
    } catch {
      // Logging must never crash a clinical workflow.
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (!fs.existsSync(this.currentFile) || fs.statSync(this.currentFile).size < this.maxBytes) return;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.renameSync(this.currentFile, path.join(this.directory, `dentiva-${stamp}.log`));
      const archives = fs.readdirSync(this.directory)
        .filter((name) => /^dentiva-.*\.log$/.test(name))
        .map((name) => ({ name, mtime: fs.statSync(path.join(this.directory, name)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      for (const archive of archives.slice(this.retainedFiles)) fs.rmSync(path.join(this.directory, archive.name), { force: true });
    } catch {
      // Best-effort rotation.
    }
  }
}
