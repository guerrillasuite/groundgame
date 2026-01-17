// app/api/survey/[surveyId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/init';

export async function GET(
  request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  const { surveyId } = params;
  const db = getDatabase();
  
  try {
    // Get survey details
    const survey = db.prepare(`
      SELECT id, title, description, active
      FROM surveys
      WHERE id = ? AND active = 1
    `).get(surveyId);
    
    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found or inactive' },
        { status: 404 }
      );
    }
    
    // Get questions for this survey
    const questions = db.prepare(`
      SELECT id, question_text, question_type, options, required, order_index
      FROM questions
      WHERE survey_id = ?
      ORDER BY order_index ASC
    `).all(surveyId);
    
    // Parse options JSON for each question
    const parsedQuestions = questions.map((q: any) => ({
      ...q,
      options: q.options ? JSON.parse(q.options) : null
    }));
    
    return NextResponse.json({
      survey,
      questions: parsedQuestions
    });
  } catch (error) {
    console.error('Error fetching survey:', error);
    return NextResponse.json(
      { error: 'Failed to fetch survey' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}