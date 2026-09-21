import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { migrations } from '../../src/main/database/migrations.js';
import { AppLogger } from '../../src/main/utils/logger.js';
import { DentivaDatabase } from '../../src/main/database/database.js';
import { createWorkspace, type TestWorkspace } from '../helpers.js';

describe('forward-only database migrations',()=>{let workspace:TestWorkspace|undefined;afterEach(()=>workspace?.dispose());it('upgrades a schema-3 workspace to schema 4 with a safety backup',()=>{workspace=createWorkspace();workspace.db.close();fs.rmSync(workspace.paths.database,{force:true});const legacy=new DatabaseSync(workspace.paths.database);for(const migration of migrations.filter((item)=>item.version<=3)){legacy.exec('BEGIN');legacy.exec(migration.sql);legacy.prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)').run(migration.version,migration.name,'2026-09-21T00:00:00.000Z');legacy.exec(`PRAGMA user_version=${migration.version}`);legacy.exec('COMMIT');}legacy.close();workspace.db=new DentivaDatabase(workspace.paths,new AppLogger(workspace.paths.logs));expect(workspace.db.schemaVersion).toBe(4);expect(workspace.db.get<{name:string}>("SELECT name FROM sqlite_master WHERE type='table' AND name='treatment_plans'")?.name).toBe('treatment_plans');expect(workspace.db.integrityCheck()).toBe('ok');expect(workspace.db.foreignKeyCheck()).toEqual([]);expect(fs.readdirSync(workspace.paths.migrationBackups).some((name)=>name.includes('schema-3'))).toBe(true);workspace.db.close();});});
