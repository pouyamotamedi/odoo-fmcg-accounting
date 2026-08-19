import { execFile } from 'child_process';
import { cp, lstat, mkdir, mkdtemp, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, dirname, join, relative, resolve, sep } from 'path';
import { promisify } from 'util';
import { NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);
const MAX_BACKUP_SIZE = 500 * 1024 * 1024;
const DB_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;
const SYSTEMCTL = '/usr/bin/systemctl';
const SUDO = '/usr/bin/sudo';

export const runtime = 'nodejs';
export const maxDuration = 300;

function getDatabaseConfig() {
  const name = process.env.NEXT_PUBLIC_ODOO_DB || 'fmcg_shop';
  if (!DB_NAME_PATTERN.test(name)) {
    throw new Error('نام دیتابیس در تنظیمات سرور معتبر نیست');
  }

  return {
    name,
    host: process.env.ODOO_DB_HOST || 'localhost',
    user: process.env.ODOO_DB_USER || 'odoo',
    password: process.env.ODOO_DB_PASSWORD || 'odoo',
  };
}

function databaseIdentifier(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function databaseLiteral(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

function commandEnvironment(password: string) {
  return { ...process.env, PGPASSWORD: password };
}

async function runCommand(
  command: string,
  args: string[],
  options: { timeout?: number; password?: string } = {},
) {
  return execFileAsync(command, args, {
    timeout: options.timeout,
    maxBuffer: 10 * 1024 * 1024,
    env: options.password ? commandEnvironment(options.password) : process.env,
  });
}

function validateArchiveEntries(entries: string[]) {
  if (entries.length > 100_000) {
    throw new Error('تعداد فایل‌های آرشیو بیش از حد مجاز است');
  }

  for (const entry of entries) {
    const normalized = entry.trim().replace(/\\/g, '/');
    if (!normalized || normalized === '.' || normalized === './') continue;
    if (
      normalized.startsWith('/') ||
      /^[a-zA-Z]:\//.test(normalized) ||
      normalized.split('/').some((part) => part === '..')
    ) {
      throw new Error('ساختار مسیرهای فایل بکاپ معتبر نیست');
    }
  }
}

async function extractArchive(archivePath: string, extractDir: string, fileName: string) {
  const lowerName = fileName.toLowerCase();
  await mkdir(extractDir, { recursive: true });

  if (lowerName.endsWith('.zip')) {
    const { stdout } = await runCommand('unzip', ['-Z1', archivePath], { timeout: 60_000 });
    validateArchiveEntries(stdout.split(/\r?\n/));
    await runCommand('unzip', ['-oq', archivePath, '-d', extractDir], { timeout: 120_000 });
    return;
  }

  if (lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz')) {
    const { stdout } = await runCommand('tar', ['-tzf', archivePath], { timeout: 60_000 });
    validateArchiveEntries(stdout.split(/\r?\n/));
    await runCommand(
      'tar',
      ['-xzf', archivePath, '--no-same-owner', '--no-same-permissions', '-C', extractDir],
      { timeout: 120_000 },
    );
    return;
  }

  throw new Error('فقط فایل ZIP یا TAR.GZ قابل بازگردانی است');
}

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(/* turbopackIgnore: true */ directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('فایل بکاپ حاوی لینک نمادین غیرمجاز است');
    }
    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function assertPathInside(parent: string, child: string) {
  const parentPath = resolve(/* turbopackIgnore: true */ parent) + sep;
  const childPath = resolve(/* turbopackIgnore: true */ child);
  if (!childPath.startsWith(parentPath)) {
    throw new Error('مسیر استخراج‌شده خارج از پوشه موقت است');
  }
  const info = await lstat(childPath);
  if (info.isSymbolicLink()) {
    throw new Error('فایل بکاپ حاوی لینک نمادین غیرمجاز است');
  }
}

async function findSqlDump(extractDir: string) {
  const files = await collectFiles(extractDir);
  const sqlFiles = files.filter((filePath) => filePath.toLowerCase().endsWith('.sql'));
  if (sqlFiles.length !== 1) {
    throw new Error(sqlFiles.length === 0 ? 'فایل SQL در آرشیو یافت نشد' : 'آرشیو باید دقیقاً یک فایل SQL داشته باشد');
  }

  await assertPathInside(extractDir, sqlFiles[0]);
  return sqlFiles[0];
}

async function stopOdooService(serviceName: string) {
  try {
    await runCommand(SUDO, ['-n', SYSTEMCTL, 'stop', serviceName], { timeout: 30_000 });
  } catch {
    throw new Error(
      `توقف سرویس ${serviceName} ممکن نشد. مجوز restore سرور را با اسکریپت deploy/configure_restore_permissions.sh تنظیم کنید.`,
    );
  }

  const { stdout } = await runCommand(
    SYSTEMCTL,
    ['show', '--property=ActiveState', '--value', serviceName],
    { timeout: 10_000 },
  );
  const state = stdout.trim();
  if (state !== 'inactive' && state !== 'failed') {
    throw new Error(`سرویس ${serviceName} متوقف نشد (وضعیت: ${state || 'نامشخص'})`);
  }
}

async function startOdooService(serviceName: string) {
  await runCommand(SUDO, ['-n', SYSTEMCTL, 'start', serviceName], { timeout: 30_000 });
}

async function databaseExists(config: ReturnType<typeof getDatabaseConfig>) {
  const { stdout } = await runCommand(
    'psql',
    [
      '-h', config.host,
      '-U', config.user,
      '-d', 'postgres',
      '-tAc', `SELECT 1 FROM pg_database WHERE datname = ${databaseLiteral(config.name)}`,
    ],
    { timeout: 15_000, password: config.password },
  );
  return stdout.trim() === '1';
}

async function setDatabaseConnections(
  config: ReturnType<typeof getDatabaseConfig>,
  allowed: boolean,
) {
  await runCommand(
    'psql',
    [
      '-h', config.host,
      '-U', config.user,
      '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1',
      '-c', `ALTER DATABASE ${databaseIdentifier(config.name)} ALLOW_CONNECTIONS ${allowed ? 'true' : 'false'}`,
    ],
    { timeout: 15_000, password: config.password },
  );
}

async function terminateDatabaseSessions(config: ReturnType<typeof getDatabaseConfig>) {
  await runCommand(
    'psql',
    [
      '-h', config.host,
      '-U', config.user,
      '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1',
      '-c', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${databaseLiteral(config.name)} AND pid <> pg_backend_pid()`,
    ],
    { timeout: 15_000, password: config.password },
  );
}

async function restoreFilestore(extractDir: string, sqlFile: string, dbName: string) {
  const dataDir = process.env.ODOO_DATA_DIR || '/home/odoo/.local/share/Odoo';
  const destination = join(/* turbopackIgnore: true */ dataDir, 'filestore', dbName);
  const standardFilestore = join(/* turbopackIgnore: true */ extractDir, 'filestore');

  await rm(destination, { recursive: true, force: true });

  try {
    const info = await lstat(standardFilestore);
    if (info.isSymbolicLink()) throw new Error('filestore آرشیو معتبر نیست');
    if (info.isDirectory()) {
      await mkdir(dirname(destination), { recursive: true });
      await cp(standardFilestore, destination, { recursive: true, force: true });
      return;
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }

  // Compatibility with older backups that stored filestore contents at archive root.
  const sqlTopLevelEntry = relative(extractDir, sqlFile).split(sep)[0];
  const entries = await readdir(extractDir, { withFileTypes: true });
  const legacyEntries = entries.filter((entry) =>
    entry.name !== sqlTopLevelEntry && entry.name !== 'manifest.json'
  );
  if (legacyEntries.length === 0) return;

  await mkdir(destination, { recursive: true });
  for (const entry of legacyEntries) {
    if (entry.isSymbolicLink()) throw new Error('filestore آرشیو حاوی لینک نمادین غیرمجاز است');
    await cp(join(/* turbopackIgnore: true */ extractDir, entry.name), join(/* turbopackIgnore: true */ destination, entry.name), {
      recursive: true,
      force: true,
    });
  }
}

export async function POST(request: Request) {
  let tempRoot: string | null = null;
  let serviceName = '';
  let serviceStopped = false;
  let connectionsBlocked = false;
  let originalDatabaseRemoved = false;
  let databaseReady = false;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'فایل بکاپ ارسال نشده' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BACKUP_SIZE) {
      return NextResponse.json({ success: false, error: 'حجم فایل بکاپ معتبر نیست (حداکثر ۵۰۰ مگابایت)' }, { status: 413 });
    }

    const config = getDatabaseConfig();
    serviceName = `odoo-${config.name}.service`;
    tempRoot = await mkdtemp(join(tmpdir(), 'fmcg-restore-'));
    const archivePath = join(/* turbopackIgnore: true */ tempRoot, basename(file.name) || 'backup.tar.gz');
    const extractDir = join(/* turbopackIgnore: true */ tempRoot, 'extracted');

    await writeFile(archivePath, Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
    await extractArchive(archivePath, extractDir, file.name);
    const sqlFile = await findSqlDump(extractDir);

    await stopOdooService(serviceName);
    serviceStopped = true;

    if (await databaseExists(config)) {
      await setDatabaseConnections(config, false);
      connectionsBlocked = true;
      await terminateDatabaseSessions(config);
      await runCommand(
        'dropdb',
        [
          '-h', config.host,
          '-U', config.user,
          '--maintenance-db=postgres',
          '--if-exists',
          '--force',
          config.name,
        ],
        { timeout: 30_000, password: config.password },
      );
      connectionsBlocked = false;
    }
    originalDatabaseRemoved = true;

    await runCommand(
      'createdb',
      [
        '-h', config.host,
        '-U', config.user,
        '--maintenance-db=postgres',
        '-O', config.user,
        config.name,
      ],
      { timeout: 30_000, password: config.password },
    );

    await runCommand(
      'psql',
      [
        '-h', config.host,
        '-U', config.user,
        '-d', config.name,
        '-v', 'ON_ERROR_STOP=1',
        '-f', sqlFile,
      ],
      { timeout: 240_000, password: config.password },
    );

    await restoreFilestore(extractDir, sqlFile, config.name);
    databaseReady = true;
    await startOdooService(serviceName);
    serviceStopped = false;

    return NextResponse.json({ success: true, message: 'بازگردانی با موفقیت انجام شد' });
  } catch (error: any) {
    const suffix = originalDatabaseRemoved && !databaseReady
      ? ' سرویس Odoo برای جلوگیری از اجرای دیتابیس ناقص متوقف نگه داشته شد؛ پس از رفع خطا restore را دوباره اجرا کنید.'
      : '';
    return NextResponse.json(
      { success: false, error: `${error?.message || 'خطا در بازگردانی'}${suffix}` },
      { status: 500 },
    );
  } finally {
    if (connectionsBlocked) {
      try {
        const config = getDatabaseConfig();
        if (await databaseExists(config)) await setDatabaseConnections(config, true);
      } catch {}
    }

    if (serviceStopped && (!originalDatabaseRemoved || databaseReady)) {
      try { await startOdooService(serviceName); } catch {}
    }

    if (tempRoot) {
      try { await rm(tempRoot, { recursive: true, force: true }); } catch {}
    }
  }
}
