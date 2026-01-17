// app/api/survey/[surveyId]/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/init';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ surveyId: string }> }
) {
  const { surveyId } = await context.params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'csv'; // Default to CSV
  
  const db = getDatabase();
  
  try {
    // Get survey info
    const survey = db.prepare(`
      SELECT id, title, description, created_at
      FROM surveys
      WHERE id = ?
    `).get(surveyId) as any;
    
    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }
    
    // Get all responses with full details
    const responses = db.prepare(`
      SELECT 
        r.crm_contact_id,
        r.question_id,
        q.question_text,
        q.order_index,
        r.answer_value,
        r.answer_text,
        r.created_at as answered_at,
        ss.completed_at,
        ss.started_at
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      LEFT JOIN survey_sessions ss ON r.crm_contact_id = ss.crm_contact_id 
        AND r.survey_id = ss.survey_id
      WHERE r.survey_id = ?
      ORDER BY r.crm_contact_id, q.order_index
    `).all(surveyId) as any[];
    
    if (format === 'csv') {
      // Create CSV header
      const headers = [
        'Contact ID',
        'Question',
        'Answer',
        'Other Text',
        'Original Position',
        'Answered At',
        'Started At',
        'Completed At',
        'Status'
      ];
      
      // Create CSV rows
      const rows = responses.map(r => [
        r.crm_contact_id,
        r.question_text,
        r.answer_value,
        r.answer_text || '',
        r.original_position ?? '',
        r.answered_at,
        r.started_at || '',
        r.completed_at || '',
        r.completed_at ? 'Complete' : 'Partial'
      ]);
      
      // Convert to CSV format
      const csvContent = [
        headers.join(','),
        ...rows.map(row => 
          row.map(cell => {
            // Escape cells with commas, quotes, or newlines
            const str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          }).join(',')
        )
      ].join('\n');
      
      // Return CSV file
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="survey-${surveyId}-${Date.now()}.csv"`
        }
      });
    }
    
    // JSON format (for backup/debugging)
    const sessions = db.prepare(`
      SELECT 
        crm_contact_id,
        started_at,
        completed_at,
        last_question_answered
      FROM survey_sessions
      WHERE survey_id = ?
    `).all(surveyId) as any[];
    
    const sessionMap = new Map(
      sessions.map(s => [s.crm_contact_id, s])
    );
    
    const byContact = responses.reduce((acc: any, row: any) => {
      if (!acc[row.crm_contact_id]) {
        const session = sessionMap.get(row.crm_contact_id);
        acc[row.crm_contact_id] = {
          contact_id: row.crm_contact_id,
          started_at: session?.started_at || null,
          completed_at: session?.completed_at || null,
          is_complete: !!session?.completed_at,
          responses: []
        };
      }
      
      acc[row.crm_contact_id].responses.push({
        question_id: row.question_id,
        question_text: row.question_text,
        question_order: row.order_index,
        answer_value: row.answer_value,
        answer_text: row.answer_text,
        answered_at: row.answered_at
      });
      
      return acc;
    }, {});
    
    const contactData = Object.values(byContact);
    const completedCount = sessions.filter(s => s.completed_at).length;
    
    const questions = db.prepare(`
      SELECT id, question_text, question_type, options, order_index
      FROM questions
      WHERE survey_id = ?
      ORDER BY order_index
    `).all(surveyId) as any[];
    
    const parsedQuestions = questions.map((q: any) => ({
      ...q,
      options: q.options ? JSON.parse(q.options) : null
    }));
    
    return NextResponse.json({
      export_metadata: {
        survey_id: surveyId,
        survey_title: survey.title,
        survey_description: survey.description,
        survey_created_at: survey.created_at,
        exported_at: new Date().toISOString(),
        total_contacts: sessions.length,
        completed_responses: completedCount,
        partial_responses: sessions.length - completedCount
      },
      questions: parsedQuestions,
      responses: contactData
    });
    
  } catch (error) {
    console.error('Error exporting survey:', error);
    return NextResponse.json(
      { error: 'Failed to export survey data' },
      { status: 500 }
    );
  } finally {
    db.close();
  }
}