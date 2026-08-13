import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ success: false, error: 'فایل بکاپ ارسال نشده' }, { status: 400 });
    }

    const dbName = process.env.NEXT_PUBLIC_ODOO_DB || 'fmcg_shop';
    const tmpPath = join(tmpdir(), `restore_${Date.now()}.zip`);

    // Save uploaded file
    const bytes = await file.arrayBuffer();
    await writeFile(tmpPath, Buffer.from(bytes));

    // Extract archive (support both .zip and .tar.gz)
    const extractDir = join(tmpdir(), `restore_${Date.now()}`);
    const isZip = file.name.endsWith('.zip');
    if (isZip) {
      await execAsync(`mkdir -p "${extractDir}" && unzip -o "${tmpPath}" -d "${extractDir}"`, { timeout: 60000 });
    } else {
      await execAsync(`mkdir -p "${extractDir}" && tar -xzf "${tmpPath}" -C "${extractDir}"`, { timeout: 60000 });
    }

    // Find SQL file
    const { stdout: sqlFiles } = await execAsync(`find "${extractDir}" -name "*.sql" -type f | head -1`);
    const sqlFile = sqlFiles.trim();
    if (!sqlFile) {
      await execAsync(`rm -rf "${extractDir}" "${tmpPath}"`);
      return NextResponse.json({ success: false, error: 'فایل SQL در آرشیو یافت نشد' }, { status: 400 });
    }

    // Stop Odoo service
    const serviceName = `odoo-${dbName}`;
    try { await execAsync(`sudo systemctl stop ${serviceName}`, { timeout: 10000 }); } catch {}

    // Drop and recreate database
    await execAsync(`PGPASSWORD=odoo dropdb -h localhost -U odoo --if-exists ${dbName}`, { timeout: 30000 });
    await execAsync(`PGPASSWORD=odoo createdb -h localhost -U odoo -O odoo ${dbName}`, { timeout: 10000 });

    // Restore SQL dump
    await execAsync(`PGPASSWORD=odoo psql -h localhost -U odoo -d ${dbName} -f "${sqlFile}"`, { timeout: 120000 });

    // Restore filestore if exists in zip
    const filestorePath = `/var/lib/odoo/.local/share/Odoo/filestore/${dbName}`;
    const { stdout: nonSqlFiles } = await execAsync(`find "${extractDir}" -not -name "*.sql" -type f | head -1`);
    if (nonSqlFiles.trim()) {
      await execAsync(`rm -rf "${filestorePath}" && mkdir -p "${filestorePath}"`);
      await execAsync(`find "${extractDir}" -not -name "*.sql" -type f -exec cp {} "${filestorePath}/" \\;`);
      await execAsync(`chown -R odoo:odoo "${filestorePath}"`);
    }

    // Restart services
    try { await execAsync(`sudo systemctl start ${serviceName}`, { timeout: 10000 }); } catch {}
    const frontendService = `fmcg-${dbName}`;
    try { await execAsync(`sudo systemctl restart ${frontendService}`, { timeout: 10000 }); } catch {}

    // Cleanup
    await execAsync(`rm -rf "${extractDir}" "${tmpPath}"`);

    return NextResponse.json({ success: true, message: 'بازگردانی انجام شد' });
  } catch (e: any) {
    // Try to restart services even on failure
    const dbName = process.env.NEXT_PUBLIC_ODOO_DB || 'fmcg_shop';
    try { await execAsync(`sudo systemctl start odoo-${dbName}`); } catch {}
    
    return NextResponse.json(
      { success: false, error: e.message || 'خطا در بازگردانی' },
      { status: 500 }
    );
  }
}
