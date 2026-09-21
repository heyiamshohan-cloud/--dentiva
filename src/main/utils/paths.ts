import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export class DentivaPaths {
  readonly root: string;
  readonly databaseDir: string;
  readonly database: string;
  readonly attachments: string;
  readonly backups: string;
  readonly exports: string;
  readonly logs: string;
  readonly temp: string;
  readonly branding: string;
  readonly migrationBackups: string;

  constructor(root: string) {
    this.root = root;
    this.databaseDir = path.join(root, 'Database');
    this.database = path.join(this.databaseDir, 'dentiva.db');
    this.attachments = path.join(root, 'Attachments');
    this.backups = path.join(root, 'Backups');
    this.exports = path.join(root, 'Exports');
    this.logs = path.join(root, 'Logs');
    this.temp = path.join(root, 'Temp');
    this.branding = path.join(root, 'Branding');
    this.migrationBackups = path.join(this.backups, 'MigrationSafety');
  }

  static fromElectron(): DentivaPaths {
    // appData keeps clinical data outside replaceable program binaries. A dedicated
    // product folder also avoids coupling the data location to Electron's cache.
    return new DentivaPaths(path.join(app.getPath('appData'), 'Dentiva'));
  }

  ensure(): void {
    for (const directory of [
      this.root, this.databaseDir, this.attachments, this.backups, this.exports,
      this.logs, this.temp, this.branding, this.migrationBackups
    ]) {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    }
    this.cleanTemporaryFiles();
  }

  cleanTemporaryFiles(maxAgeHours = 24): void {
    if (!fs.existsSync(this.temp)) return;
    const threshold = Date.now() - maxAgeHours * 60 * 60 * 1000;
    for (const entry of fs.readdirSync(this.temp, { withFileTypes: true })) {
      const candidate = path.join(this.temp, entry.name);
      try {
        const stat = fs.statSync(candidate);
        if (stat.mtimeMs < threshold) fs.rmSync(candidate, { recursive: true, force: true });
      } catch {
        // A locked temporary file is harmless and can be retried next launch.
      }
    }
  }

  resolveAttachment(relativePath: string): string {
    const target = path.resolve(this.attachments, relativePath);
    const root = path.resolve(this.attachments) + path.sep;
    if (!target.startsWith(root)) throw new Error('Attachment path is outside the managed storage directory.');
    return target;
  }
}
