// app/api/survey/[surveyId]/results/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/init';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ surveyId: string }> }
) {
  const { surveyId } = await context.params;
  const db = getDatabase();
  
  try {
    // Get survey info
    const survey = db.prepare(`
      SELECT id, title, description
      FROM surveys
      WHERE id = ?
    `).get(surveyId) as any;
    
    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }
    
    // Get session stats
    const sessionStats = db.prepare(`
      SELECT 
        COUNT(*) as total_started,
        COUNT(completed_at) as total_completed
      FROM survey_sessions
      WHERE survey_id = ?
    `).get(surveyId) as any;
    
    // Get all questions for this survey
    const questions = db.prepare(`
      SELECT id, question_text, order_index
      FROM questions
      WHERE survey_id = ?
      ORDER BY order_index ASC
    `).all(surveyId) as any[];
    
    // For each question, get answer distribution
    const questionResults = questions.map(question => {
      // Get all responses for this question
      const responses = db.prepare(`
        SELECT 
          answer_value,
          answer_text,
          COUNT(*) as count
        FROM responses
        WHERE question_id = ?
        GROUP BY answer_value, answer_text
        ORDER BY count DESC
      `).all(question.id) as any[];
      
      const totalResponses = responses.reduce((sum, r) => sum + r.count, 0);
      
      // Format answers with percentages
      const answers = responses.map(r => ({
        value: r.answer_value === 'other' && r.answer_text 
          ? `Other: ${r.answer_text}` 
          : r.answer_value,
        count: r.count,
        percentage: totalResponses > 0 ? (r.count / totalResponses) * 100 : 0
      }));
      
      return {
        question_id: question.id,
        question_text: question.question_text,
        total_responses: totalResponses,
        answers
      };
    });
    
    // Calculate completion rate
    const completionRate = sessionStats.total_started > 0
      ? (sessionStats.total_completed / sessionStats.total_started) * 100
      : 0;
    
    return NextResponse.json({
      survey_id: survey.id,
      survey_title: survey.title,
      total_started: sessionStats.total_started,
      total_completed: sessionStats.total_completed,
      completion_rate: completionRate,
      questions: questionResults
    });
    
  } catch (error) {
    console.error('Error fetching results:', error);
    return NextResponse.json(
      { error: 'Failed to fetch results' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}