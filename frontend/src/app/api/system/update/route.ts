import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST() {
  try {
    // Only works on Linux server
    const updateScript = '/opt/fmcg-accounting/deploy/update.sh';
    const { stdout, stderr } = await execAsync(`bash ${updateScript}`, { timeout: 120000 });
    return NextResponse.json({ success: true, output: stdout, errors: stderr });
  } catch (e: any) {
    // Fallback: try git pull only (for development)
    try {
      const { stdout } = await execAsync('git pull origin feature/frontend-api-integration', { 
        cwd: process.cwd().replace('/frontend', ''),
        timeout: 30000 
      });
      return NextResponse.json({ success: true, output: stdout, note: 'Git pull only (dev mode)' });
    } catch (e2: any) {
      return NextResponse.json({ success: false, error: e2.message }, { status: 500 });
    }
  }
}
