import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST() {
  try {
    // Only works on Linux server
    const backupScript = '/opt/fmcg-accounting/deploy/backup.sh';
    const { stdout } = await execAsync(`bash ${backupScript}`, { timeout: 60000 });
    const match = stdout.match(/Backup complete: (.+)/);
    return NextResponse.json({ success: true, file: match?.[1] || 'backup created', output: stdout });
  } catch (e: any) {
    // Fallback for Windows/dev
    return NextResponse.json({ success: false, error: 'Backup only available on Linux server. Use deploy/backup.sh manually.' }, { status: 500 });
  }
}
