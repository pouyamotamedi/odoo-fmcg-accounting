import { execFile } from 'child_process';
import { lstat, mkdir, mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { promisify } from 'util';
import { NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);
const DB_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;

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

export async function POST() {
  let tempRoot: string | null = null;

  try {
    const config = getDatabaseConfig();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const downloadName = `backup_${config.name}_${timestamp}.tar.gz`;

    tempRoot = await mkdtemp(join(tmpdir(), 'fmcg-backup-'));
    const bundleDir = join(/* turbopackIgnore: true */ tempRoot, 'bundle');
    const dumpPath = join(/* turbopackIgnore: true */ bundleDir, 'dump.sql');
    const archivePath = join(/* turbopackIgnore: true */ tempRoot, downloadName);
    await mkdir(bundleDir, { recursive: true });

    await execFileAsync(
      'pg_dump',
      [
        '-h', config.host,
        '-U', config.user,
        '--no-owner',
        '--file', dumpPath,
        config.name,
      ],
      {
        timeout: 240_000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PGPASSWORD: config.password },
      },
    );

    const dataDir = process.env.ODOO_DATA_DIR || '/home/odoo/.local/share/Odoo';
    const filestorePath = join(/* turbopackIgnore: true */ dataDir, 'filestore', config.name);
    let hasFilestore = false;
    try {
      const filestoreInfo = await lstat(filestorePath);
      hasFilestore = filestoreInfo.isDirectory() && !filestoreInfo.isSymbolicLink();
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }

    const tarArgs = ['-czf', archivePath, '-C', bundleDir, 'dump.sql'];
    if (hasFilestore) {
      tarArgs.push(
        `--transform=s,^${config.name},filestore,`,
        '-C', dirname(filestorePath),
        config.name,
      );
    }

    await execFileAsync(
      'tar',
      tarArgs,
      { timeout: 240_000, maxBuffer: 10 * 1024 * 1024 },
    );

    const archiveBuffer = await readFile(archivePath);
    return new NextResponse(archiveBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Content-Length': String(archiveBuffer.length),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در پشتیبان‌گیری' },
      { status: 500 },
    );
  } finally {
    if (tempRoot) {
      try { await rm(tempRoot, { recursive: true, force: true }); } catch {}
    }
  }
}
