import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST() {
  try {
    // Detect install directory (parent of frontend/)
    const installDir = path.resolve(process.cwd(), '..');
    const dbName = process.env.NEXT_PUBLIC_ODOO_DB || 'smoke';
    const updateScript = path.join(installDir, 'deploy', 'update.sh');
    
    const { stdout, stderr } = await execAsync(`bash "${updateScript}" ${dbName}`, {
      timeout: 300000, // 5 minutes
      cwd: installDir,
    });
    return NextResponse.json({ success: true, output: stdout, errors: stderr });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || 'Update failed' }, { status: 500 });
  }
}
