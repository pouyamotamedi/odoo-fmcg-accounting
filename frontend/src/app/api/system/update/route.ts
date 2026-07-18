import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';

export async function POST() {
  try {
    const installDir = path.resolve(process.cwd(), '..');
    const dbName = process.env.NEXT_PUBLIC_ODOO_DB || 'smoke';
    const updateScript = path.join(installDir, 'deploy', 'update.sh');
    
    // Run update in BACKGROUND — can't wait because it restarts this very service!
    exec(`nohup bash "${updateScript}" ${dbName} > /tmp/fmcg-update-${dbName}.log 2>&1 &`, {
      cwd: installDir,
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Update started in background. Site will restart in 1-2 minutes. Check /tmp/fmcg-update-' + dbName + '.log for details.' 
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || 'Update failed' }, { status: 500 });
  }
}
