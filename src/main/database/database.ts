import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { migrations, latestSchemaVersion } from './migrations.js';
import type { DentivaPaths } from '../utils/paths.js';
import type { AppLogger } from '../utils/logger.js';

export interface RunResult { changes: number; lastInsertRowid: number | bigint; }

export class DentivaDatabase {
  private connection: DatabaseSync;
  private transactionDepth = 0;

  constructor(
    private readonly paths: DentivaPaths,
    private readonly logger: AppLogger
  ) {
    paths.ensure();
    const existed = fs.existsSync(paths.database) && fs.statSync(paths.database).size > 0;
    this.connection = new DatabaseSync(paths.database, { timeout: 10_000 });
    this.configure();
    this.migrate(existed);
    try { fs.chmodSync(paths.database, 0o600); } catch { /* Windows ACLs are inherited. */ }
  }

  get filePath(): string { return this.paths.database; }
  get schemaVersion(): number { return Number(this.pragmaValue('user_version') ?? 0); }

  private configure(): void {
    this.connection.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 10000;
      PRAGMA temp_store = MEMORY;
      PRAGMA cache_size = -32768;
      PRAGMA wal_autocheckpoint = 1000;
      PRAGMA secure_delete = FAST;
    `);
  }

  private pragmaValue(name: string): unknown {
    const row = this.connection.prepare(`PRAGMA ${name}`).get() as Record<string, unknown> | undefined;
    return row ? Object.values(row)[0] : undefined;
  }

  private migrate(existed: boolean): void {
    const current = this.schemaVersion;
    if (current > latestSchemaVersion) {
      throw new Error(`This database was created by a newer Dentiva version (schema ${current}). Please update Dentiva before opening it.`);
    }
    const pending = migrations.filter((migration) => migration.version > current);
    if (pending.length === 0) return;

    if (existed && current > 0) this.createMigrationSafetyBackup(current);
    for (const migration of pending) {
      this.transaction(() => {
        this.connection.exec(migration.sql);
        this.connection.prepare(
          'INSERT INTO schema_migrations(version, name, applied_at) VALUES(?, ?, ?)'
        ).run(migration.version, migration.name, new Date().toISOString());
        this.connection.exec(`PRAGMA user_version = ${migration.version}`);
      });
      this.logger.info('Database migration applied', { version: migration.version, name: migration.name });
    }
    const integrity = this.integrityCheck();
    if (integrity !== 'ok') throw new Error(`Database integrity validation failed after migration: ${integrity}`);
  }

  private createMigrationSafetyBackup(version: number): void {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destination = path.join(this.paths.migrationBackups, `dentiva-schema-${version}-${stamp}.db`);
    const escaped = destination.replaceAll("'", "''");
    this.connection.exec(`VACUUM INTO '${escaped}'`);
    this.logger.info('Pre-migration safety backup created', { schemaVersion: version, destination });
  }

  all<T extends Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.connection.prepare(sql).all(...params) as T[];
  }

  get<T extends Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.connection.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, ...params: SQLInputValue[]): RunResult {
    const result = this.connection.prepare(sql).run(...params);
    return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
  }

  exec(sql: string): void { this.connection.exec(sql); }

  transaction<T>(operation: () => T): T {
    const savepoint = `dentiva_sp_${this.transactionDepth}`;
    if (this.transactionDepth === 0) this.connection.exec('BEGIN IMMEDIATE');
    else this.connection.exec(`SAVEPOINT ${savepoint}`);
    this.transactionDepth += 1;
    try {
      const result = operation();
      this.transactionDepth -= 1;
      if (this.transactionDepth === 0) this.connection.exec('COMMIT');
      else this.connection.exec(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      this.transactionDepth -= 1;
      try {
        if (this.transactionDepth === 0) this.connection.exec('ROLLBACK');
        else this.connection.exec(`ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}`);
      } catch (rollbackError) {
        this.logger.error('Database rollback failed', rollbackError);
      }
      throw error;
    }
  }

  checkpoint(): void { this.connection.exec('PRAGMA wal_checkpoint(TRUNCATE)'); }

  integrityCheck(): string {
    const row = this.connection.prepare('PRAGMA integrity_check').get() as Record<string, unknown> | undefined;
    return String(row ? Object.values(row)[0] : 'unknown');
  }

  foreignKeyCheck(): Array<Record<string, unknown>> {
    return this.connection.prepare('PRAGMA foreign_key_check').all() as Array<Record<string, unknown>>;
  }

  optimize(): void {
    this.connection.exec('PRAGMA optimize; PRAGMA wal_checkpoint(PASSIVE);');
  }

  close(): void {
    try { this.checkpoint(); } catch { /* best effort */ }
    this.connection.close();
  }

  /** Used only by controlled restore; always reopens either the replacement or the original database. */
  replaceWith(sourceDatabasePath: string): void {
    this.close();
    const safety = `${this.paths.database}.before-restore-${Date.now()}`;
    fs.copyFileSync(this.paths.database, safety);
    try {
      fs.copyFileSync(sourceDatabasePath, this.paths.database);
      fs.rmSync(`${this.paths.database}-wal`, { force: true });
      fs.rmSync(`${this.paths.database}-shm`, { force: true });
      this.connection = new DatabaseSync(this.paths.database, { timeout: 10_000 });
      this.configure();
      const integrity = this.integrityCheck();
      if (integrity !== 'ok' || this.foreignKeyCheck().length > 0) throw new Error('The restored database did not pass integrity validation.');
      fs.rmSync(safety, { force: true });
    } catch (error) {
      try { this.connection.close(); } catch { /* The original connection may already be closed. */ }
      try { fs.copyFileSync(safety, this.paths.database); } catch (rollbackError) { this.logger.error('Database restore rollback failed; the safety copy was retained', rollbackError); }
      this.connection = new DatabaseSync(this.paths.database, { timeout: 10_000 });
      this.configure();
      throw error;
    }
  }
}
