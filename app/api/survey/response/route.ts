// app/api/survey/response/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/init';

export async function POST(request: NextRequest) {
  const db = getDatabase();
  
  try {
    const body = await request.json();
    const { crm_contact_id, survey_id, question_id, answer_value, answer_text } = body;
    
    // Validate required fields
    if (!crm_contact_id || !survey_id || !question_id || !answer_value) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Start a transaction
    db.prepare('BEGIN').run();
    
    try {
      // Check if response already exists (upsert behavior)
      const existing = db.prepare(`
        SELECT id FROM responses
        WHERE crm_contact_id = ? AND question_id = ?
      `).get(crm_contact_id, question_id);
      
      if (existing) {
        // Update existing response
        db.prepare(`
          UPDATE responses
          SET answer_value = ?, answer_text = ?, updated_at = CURRENT_TIMESTAMP
          WHERE crm_contact_id = ? AND question_id = ?
        `).run(answer_value, answer_text || null, crm_contact_id, question_id);
      } else {
        // Insert new response
        db.prepare(`
          INSERT INTO responses (crm_contact_id, survey_id, question_id, answer_value, answer_text)
          VALUES (?, ?, ?, ?, ?)
        `).run(crm_contact_id, survey_id, question_id, answer_value, answer_text || null);
      }
      
      // Update or create session tracking
      const session = db.prepare(`
        SELECT id FROM survey_sessions
        WHERE crm_contact_id = ? AND survey_id = ?
      `).get(crm_contact_id, survey_id);
      
      if (session) {
        db.prepare(`
          UPDATE survey_sessions
          SET last_question_answered = ?
          WHERE crm_contact_id = ? AND survey_id = ?
        `).run(question_id, crm_contact_id, survey_id);
      } else {
        db.prepare(`
          INSERT INTO survey_sessions (crm_contact_id, survey_id, last_question_answered)
          VALUES (?, ?, ?)
        `).run(crm_contact_id, survey_id, question_id);
      }
      
      db.prepare('COMMIT').run();
      
      return NextResponse.json({
        success: true,
        message: 'Response saved successfully'
      });
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  } catch (error) {
    console.error('Error saving response:', error);
    return NextResponse.json(
      { error: 'Failed to save response' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}