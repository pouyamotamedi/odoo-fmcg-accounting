import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';

export async function POST() {
  try {
    const installDir = path.resolve(process.cwd(), '..');
    const dbName = process.env.NEXT_PUBLIC_ODOO_DB || 'smoke';
    
    // Simple update: just git pull + rebuild. Service restart handled separately.
    const script = `
      cd "${installDir}" && 
      git fetch origin feature/frontend-api-integration && 
      git reset --hard origin/feature/frontend-api-integration &&
      cat deploy/security_patched.py > odoo/odoo/service/security.py 2>/dev/null;
      cd frontend && npm run build 2>&1 | tail -3 &&
      sudo systemctl restart fmcg-${dbName} odoo-${dbName} 2>/dev/null &
      echo "UPDATE_DONE"
    `;
    
    exec(script, { timeout: 180000, cwd: installDir });
    
    return NextResponse.json({ 
      success: true, 
      message: 'بروزرسانی شروع شد. لطفا ۲ دقیقه صبر کنید و صفحه را رفرش کنید.' 
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || 'Update failed' }, { status: 500 });
  }
}
