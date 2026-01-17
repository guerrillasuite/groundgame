// app/api/survey/complete/route.ts - UPDATE
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/init';

export async function POST(request: NextRequest) {
  const db = getDatabase();
  
  try {
    const body = await request.json();
    const { crm_contact_id, survey_id } = body;
    
    if (!crm_contact_id || !survey_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Check if already completed
    const existing = db.prepare(`
      SELECT completed_at 
      FROM survey_sessions
      WHERE crm_contact_id = ? AND survey_id = ?
    `).get(crm_contact_id, survey_id) as any;
    
    if (existing?.completed_at) {
      return NextResponse.json(
        { error: 'Survey already completed' },
        { status: 400 }
      );
    }
    
    // Mark as completed - this invalidates the link
    const result = db.prepare(`
      UPDATE survey_sessions
      SET completed_at = CURRENT_TIMESTAMP
      WHERE crm_contact_id = ? AND survey_id = ? AND completed_at IS NULL
    `).run(crm_contact_id, survey_id);
    
    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Survey session not found' },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Survey completed successfully'
    });
  } catch (error) {
    console.error('Error completing survey:', error);
    return NextResponse.json(
      { error: 'Failed to complete survey' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}