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

    // Create zip with dump + filestore
    if (hasFilestore) {
      await execAsync(
        `cd /tmp && zip -r "${tmpPath}" "${dumpPath}" -j && cd "${filestorePath}" && zip -r "${tmpPath}" . -x ".*"`,
        { timeout: 120000 }
      );
    } else {
      // Just zip the SQL dump
      await execAsync(`zip -j "${tmpPath}" "${dumpPath}"`, { timeout: 60000 });
    }

    // Read the zip file
    const zipBuffer = await readFileAsync(tmpPath);

    // Cleanup
    try { unlink(dumpPath, () => {}); } catch {}
    try { unlink(tmpPath, () => {}); } catch {}

    // Return as downloadable file
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message || 'خطا در پشتیبان‌گیری' },
      { status: 500 }
    );
  }
}
