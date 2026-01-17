// app/components/survey/SurveyContainer.tsx
'use client';

import { useState, useEffect } from 'react';
import { MultipleChoiceQuestion } from './MultipleChoiceQuestion';
import { MultipleSelectQuestion } from './MultipleSelectQuestion';
import { ContactVerification } from './ContactVerification';

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  required: boolean;
  order_index: number;
}

interface Survey {
  id: string;
  title: string;
  description: string;
}

interface SurveyContainerProps {
  surveyId: string;
  contactId: string;
  randomizeOptions?: boolean;
}

export function SurveyContainer({ 
  surveyId, 
  contactId,
  randomizeOptions = false 
}: SurveyContainerProps) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, { value: string; text?: string }>>(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchSurvey();
  }, [surveyId]);
  
  const fetchSurvey = async () => {
    try {
      const response = await fetch(`/api/survey/${surveyId}`);
      if (!response.ok) throw new Error('Failed to fetch survey');
      
      const data = await response.json();
      setSurvey(data.survey);
      setQuestions(data.questions);
    } catch (err) {
      setError('Failed to load survey. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const saveAnswer = async (questionId: string, value: string, text?: string, position?: number) => {
    try {
      const response = await fetch('/api/survey/response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crm_contact_id: contactId,
          survey_id: surveyId,
          question_id: questionId,
          answer_value: value,
          answer_text: text,
          original_position: position
        })
      });
      
      if (!response.ok) throw new Error('Failed to save answer');
      
      setAnswers(new Map(answers.set(questionId, { value, text })));
    } catch (err) {
      console.error('Error saving answer:', err);
      setError('Failed to save answer. Please try again.');
    }
  };
  
  const handleAnswer = async (value: string, text?: string, position?: number) => {
    const currentQuestion = questions[currentQuestionIndex];
    await saveAnswer(currentQuestion.id, value, text, position);
  };
  
  const handleMultiSelectAnswer = async (values: string[], text?: string, positions?: number[]) => {
    const currentQuestion = questions[currentQuestionIndex];
    const combinedValue = JSON.stringify(values);
    await saveAnswer(currentQuestion.id, combinedValue, text, positions?.[0]);
    
    setAnswers(new Map(answers.set(currentQuestion.id, { 
      value: combinedValue, 
      text 
    })));
  };
  
  const handleContactVerification = async (data: any) => {
    const currentQuestion = questions[currentQuestionIndex];
    const jsonData = JSON.stringify(data);
    await saveAnswer(currentQuestion.id, jsonData);
    
    setAnswers(new Map(answers.set(currentQuestion.id, { 
      value: jsonData
    })));
  };
  
  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };
  
  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };
  
  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/survey/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crm_contact_id: contactId,
          survey_id: surveyId
        })
      });
      
      if (!response.ok) throw new Error('Failed to submit survey');
      
      setIsComplete(true);
    } catch (err) {
      console.error('Error submitting survey:', err);
      setError('Failed to submit survey. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'rgb(var(--bg-900))'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '3px solid rgb(var(--border-600))',
            borderTop: '3px solid rgb(var(--primary-600))',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <div style={{ color: 'rgb(var(--text-100))', fontSize: '18px' }}>
            Loading survey...
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '16px',
        background: 'rgb(var(--bg-900))'
      }}>
        <div style={{
          maxWidth: '500px',
          width: '100%',
          background: 'rgb(var(--surface-800))',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid rgb(var(--border-600))',
          boxShadow: 'var(--shadow)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(220, 38, 38, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '28px'
          }}>
            ⚠️
          </div>
          <h3 style={{
            margin: '0 0 8px',
            fontSize: '20px',
            fontWeight: 600,
            color: 'rgb(var(--text-100))'
          }}>
            Oops! Something went wrong
          </h3>
          <p style={{ margin: 0, color: 'rgb(var(--text-300))' }}>
            {error}
          </p>
        </div>
      </div>
    );
  }
  
  if (isComplete) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '16px',
        background: 'rgb(var(--bg-900))'
      }}>
        <div style={{
          maxWidth: '500px',
          width: '100%',
          background: 'rgb(var(--surface-800))',
          borderRadius: '16px',
          padding: '40px',
          border: '1px solid rgb(var(--border-600))',
          boxShadow: 'var(--shadow)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'rgba(22, 163, 74, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: '36px'
          }}>
            ✓
          </div>
          <h2 style={{
            margin: '0 0 12px',
            fontSize: '28px',
            fontWeight: 700,
            color: 'rgb(var(--text-100))'
          }}>
            Thank You!
          </h2>
          <p style={{
            margin: 0,
            color: 'rgb(var(--text-300))',
            fontSize: '18px'
          }}>
            Your response has been recorded successfully.
          </p>
        </div>
      </div>
    );
  }
  
  if (!survey || questions.length === 0) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '16px',
        background: 'rgb(var(--bg-900))'
      }}>
        <div style={{
          maxWidth: '500px',
          width: '100%',
          background: 'rgb(var(--surface-800))',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid rgb(var(--border-600))',
          boxShadow: 'var(--shadow)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(245, 158, 11, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '28px'
          }}>
            ℹ️
          </div>
          <h3 style={{
            margin: '0 0 8px',
            fontSize: '20px',
            fontWeight: 600,
            color: 'rgb(var(--text-100))'
          }}>
            Survey Not Found
          </h3>
          <p style={{ margin: 0, color: 'rgb(var(--text-300))' }}>
            This survey doesn't exist or is no longer available.
          </p>
        </div>
      </div>
    );
  }
  
  const currentQuestion = questions[currentQuestionIndex];
  const currentAnswer = answers.get(currentQuestion.id);
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  
  // Can proceed if: answer exists OR question is not required
  const canProceed = currentAnswer || !currentQuestion.required;
  
  // Determine if this question should randomize (not Yes/No or numeric ranges)
  const shouldRandomize = randomizeOptions && !['lnc-chair-q2', 'lnc-chair-q6'].includes(currentQuestion.id);
  
  return (
    <div style={{
      minHeight: '100vh',
      background: 'rgb(var(--bg-900))',
      padding: '24px 16px'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        
        {/* Header Card */}
        <div style={{
          background: 'rgb(var(--surface-800))',
          borderRadius: '16px',
          padding: '32px',
          marginBottom: '24px',
          border: '1px solid rgb(var(--border-600))',
          boxShadow: 'var(--shadow)'
        }}>
          <h1 style={{
            margin: '0',
            fontSize: '32px',
            fontWeight: 700,
            color: 'rgb(var(--text-100))'
          }}>
            {survey.title}
          </h1>
        </div>
        
        {/* Progress Bar */}
        <div style={{
          background: 'rgb(var(--surface-800))',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          border: '1px solid rgb(var(--border-600))',
          boxShadow: 'var(--shadow)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '12px',
            fontSize: '14px',
            fontWeight: 600,
            color: 'rgb(var(--text-300))'
          }}>
            <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
            <span>{Math.round(progress)}% Complete</span>
          </div>
          <div style={{
            width: '100%',
            height: '10px',
            background: 'rgb(var(--card-700))',
            borderRadius: '999px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, rgb(var(--primary-600)), rgb(var(--primary-500)))',
              borderRadius: '999px',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
        
        {/* Question Card */}
        <div style={{
          background: 'rgb(var(--surface-800))',
          borderRadius: '16px',
          padding: '32px',
          marginBottom: '24px',
          border: '1px solid rgb(var(--border-600))',
          boxShadow: 'var(--shadow)'
        }}>
          <h2 style={{
            margin: '0 0 24px',
            fontSize: '24px',
            fontWeight: 700,
            color: 'rgb(var(--text-100))'
          }}>
            {currentQuestion.question_text}
            {currentQuestion.required && (
              <span style={{ color: 'rgb(var(--error-600))', marginLeft: '4px' }}>*</span>
            )}
          </h2>
          
          {currentQuestion.question_type === 'multiple_choice_with_other' && (
            <MultipleChoiceQuestion
              questionId={currentQuestion.id}
              options={currentQuestion.options || []}
              hasOther={true}
              required={currentQuestion.required}
              onAnswer={handleAnswer}
              initialValue={currentAnswer?.value || ''}
              initialOtherText={currentAnswer?.text || ''}
              randomize={shouldRandomize}
            />
          )}
          
          {currentQuestion.question_type === 'multiple_choice' && (
            <MultipleChoiceQuestion
              questionId={currentQuestion.id}
              options={currentQuestion.options || []}
              hasOther={false}
              required={currentQuestion.required}
              onAnswer={handleAnswer}
              initialValue={currentAnswer?.value || ''}
              randomize={shouldRandomize}
            />
          )}
          
          {currentQuestion.question_type === 'multiple_select_with_other' && (
            <MultipleSelectQuestion
              questionId={currentQuestion.id}
              options={currentQuestion.options || []}
              maxSelections={3}
              hasOther={true}
              required={currentQuestion.required}
              onAnswer={handleMultiSelectAnswer}
              initialValues={currentAnswer?.value ? JSON.parse(currentAnswer.value) : []}
              initialOtherText={currentAnswer?.text || ''}
              randomize={shouldRandomize}
            />
          )}
          
          {currentQuestion.question_type === 'contact_verification' && (
            <ContactVerification
              questionId={currentQuestion.id}
              contactId={contactId}
              onAnswer={handleContactVerification}
              initialData={currentAnswer?.value ? JSON.parse(currentAnswer.value) : {}}
              existingContact={{
                name: 'John Smith',  // TODO: Fetch from CRM
                email: 'john.smith@example.com',  // TODO: Fetch from CRM
                phone: '(555) 123-4567'  // TODO: Fetch from CRM
              }}
            />
          )}
        </div>
        
        {/* Navigation */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <button
            onClick={handlePrevious}
            disabled={currentQuestionIndex === 0}
            style={{
              padding: '14px 24px',
              background: 'rgb(var(--surface-800))',
              border: '1px solid rgb(var(--border-600))',
              borderRadius: '12px',
              color: 'rgb(var(--text-100))',
              fontSize: '16px',
              fontWeight: 600,
              cursor: currentQuestionIndex === 0 ? 'not-allowed' : 'pointer',
              opacity: currentQuestionIndex === 0 ? 0.5 : 1,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (currentQuestionIndex !== 0) {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgb(var(--border-600))';
            }}
          >
            ← Previous
          </button>
          
          {isLastQuestion ? (
            <button
              onClick={handleSubmit}
              disabled={!canProceed || isSubmitting}
              style={{
                padding: '14px 32px',
                background: !canProceed || isSubmitting 
                  ? 'rgb(var(--border-600))' 
                  : 'linear-gradient(90deg, rgb(22, 163, 74), rgb(34, 197, 94))',
                border: 'none',
                borderRadius: '12px',
                color: 'white',
                fontSize: '16px',
                fontWeight: 700,
                cursor: !canProceed || isSubmitting ? 'not-allowed' : 'pointer',
                boxShadow: !canProceed || isSubmitting ? 'none' : '0 8px 20px rgba(22, 163, 74, 0.3)',
                transition: 'all 0.15s ease'
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Survey ✓'}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!canProceed}
              style={{
                padding: '14px 32px',
                background: !canProceed 
                  ? 'rgb(var(--border-600))' 
                  : 'linear-gradient(90deg, rgb(var(--primary-600)), rgb(var(--primary-500)))',
                border: 'none',
                borderRadius: '12px',
                color: 'white',
                fontSize: '16px',
                fontWeight: 700,
                cursor: !canProceed ? 'not-allowed' : 'pointer',
                boxShadow: !canProceed ? 'none' : '0 8px 20px rgba(37, 99, 235, 0.3)',
                transition: 'all 0.15s ease'
              }}
            >
              Next →
            </button>
          )}
        </div>
      </div>
      
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}