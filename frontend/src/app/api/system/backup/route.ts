import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);
const readFileAsync = promisify(readFile);

export async function POST() {
  try {
    const dbName = process.env.NEXT_PUBLIC_ODOO_DB || 'fmcg_shop';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup_${dbName}_${timestamp}.zip`;
    const tmpPath = join(tmpdir(), filename);

    // Use pg_dump to create backup, then zip with filestore
    // First: pg_dump
    const dumpPath = join(tmpdir(), `${dbName}_${timestamp}.sql`);
    await execAsync(
      `PGPASSWORD=odoo pg_dump -h localhost -U odoo -d ${dbName} -f "${dumpPath}"`,
      { timeout: 120000 }
    );

    // Find filestore path
    const filestorePath = `/var/lib/odoo/.local/share/Odoo/filestore/${dbName}`;
    const hasFilestore = existsSync(filestorePath);

    // Create tar.gz with dump + filestore (tar/gzip are always available, zip may not be)
    const archivePath = join(tmpdir(), `backup_${dbName}_${timestamp}.tar.gz`);
    if (hasFilestore) {
      await execAsync(
        `tar -czf "${archivePath}" -C /tmp "${dbName}_${timestamp}.sql" -C "${filestorePath}" .`,
        { timeout: 120000 }
      );
    } else {
      await execAsync(`tar -czf "${archivePath}" -C /tmp "${dbName}_${timestamp}.sql"`, { timeout: 60000 });
    }

    // Read the archive
    const archiveBuffer = await readFileAsync(archivePath);
    const dlFilename = `backup_${dbName}_${timestamp}.tar.gz`;

    // Cleanup
    try { unlink(dumpPath, () => {}); } catch {}
    try { unlink(archivePath, () => {}); } catch {}

    // Return as downloadable file
    return new NextResponse(archiveBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${dlFilename}"`,
        'Content-Length': String(archiveBuffer.length),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message || 'خطا در پشتیبان‌گیری' },
      { status: 500 }
    );
  }
}
