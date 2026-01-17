// app/components/survey/MultipleChoiceQuestion.tsx
'use client';

import { useState, useEffect } from 'react';

interface MultipleChoiceQuestionProps {
  questionId: string;
  options: string[];
  hasOther?: boolean;
  required?: boolean;
  onAnswer: (value: string, otherText?: string, position?: number) => void;
  initialValue?: string;
  initialOtherText?: string;
  randomize?: boolean;
}

export function MultipleChoiceQuestion({
  questionId,
  options,
  hasOther = false,
  required = true,
  onAnswer,
  initialValue = '',
  initialOtherText = '',
  randomize = false
}: MultipleChoiceQuestionProps) {
  const [selectedValue, setSelectedValue] = useState(initialValue);
  const [otherText, setOtherText] = useState(initialOtherText);
  const [displayOptions, setDisplayOptions] = useState<string[]>([]);
  const [optionPositions, setOptionPositions] = useState<Map<string, number>>(new Map());
  
  const shuffleArrayWithPositions = (array: string[]) => {
    const shuffled = array.map((item, idx) => ({ item, originalIndex: idx }));
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    const posMap = new Map<string, number>();
    shuffled.forEach(({ item, originalIndex }) => {
      posMap.set(item, originalIndex);
    });
    
    setOptionPositions(posMap);
    return shuffled.map(s => s.item);
  };
  
  useEffect(() => {
    if (randomize) {
      setDisplayOptions(shuffleArrayWithPositions(options));
    } else {
      const posMap = new Map<string, number>();
      options.forEach((opt, idx) => posMap.set(opt, idx));
      setOptionPositions(posMap);
      setDisplayOptions(options);
    }
  }, [options, randomize]);
  
  const handleSelect = (value: string) => {
    setSelectedValue(value);
    const position = optionPositions.get(value) ?? -1;
    
    if (value === 'other') {
      if (otherText.trim()) {
        onAnswer(value, otherText, position);
      }
    } else {
      setOtherText('');
      onAnswer(value, undefined, position);
    }
  };
  
  const handleOtherTextChange = (text: string) => {
    setOtherText(text);
    if (selectedValue === 'other' && text.trim()) {
      const position = optionPositions.get('other') ?? -1;
      onAnswer('other', text, position);
    }
  };
  
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      {displayOptions.map((option) => (
        <label
          key={option}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 18px',
            borderRadius: '12px',
            cursor: 'pointer',
            border: selectedValue === option 
              ? '2px solid rgb(var(--primary-600))' 
              : '1px solid rgb(var(--border-600))',
            background: selectedValue === option
              ? 'rgba(37, 99, 235, 0.1)'
              : 'rgb(var(--card-700))',
            transition: 'all 0.15s ease',
            boxShadow: selectedValue === option 
              ? '0 4px 12px rgba(37, 99, 235, 0.25)' 
              : 'none'
          }}
          onMouseEnter={(e) => {
            if (selectedValue !== option) {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
            }
          }}
          onMouseLeave={(e) => {
            if (selectedValue !== option) {
              e.currentTarget.style.borderColor = 'rgb(var(--border-600))';
            }
          }}
        >
          <input
            type="radio"
            name={questionId}
            value={option}
            checked={selectedValue === option}
            onChange={(e) => handleSelect(e.target.value)}
            style={{
              width: '20px',
              height: '20px',
              accentColor: 'rgb(var(--primary-600))',
              cursor: 'pointer'
            }}
          />
          <span style={{
            marginLeft: '14px',
            fontSize: '16px',
            fontWeight: selectedValue === option ? 600 : 400,
            color: 'rgb(var(--text-100))'
          }}>
            {option}
          </span>
        </label>
      ))}
      
      {hasOther && (
        <div style={{ display: 'grid', gap: '8px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '16px 18px',
              borderRadius: '12px',
              cursor: 'pointer',
              border: selectedValue === 'other' 
                ? '2px solid rgb(var(--primary-600))' 
                : '1px solid rgb(var(--border-600))',
              background: selectedValue === 'other'
                ? 'rgba(37, 99, 235, 0.1)'
                : 'rgb(var(--card-700))',
              transition: 'all 0.15s ease',
              boxShadow: selectedValue === 'other' 
                ? '0 4px 12px rgba(37, 99, 235, 0.25)' 
                : 'none'
            }}
          >
            <input
              type="radio"
              name={questionId}
              value="other"
              checked={selectedValue === 'other'}
              onChange={(e) => handleSelect(e.target.value)}
              style={{
                width: '20px',
                height: '20px',
                accentColor: 'rgb(var(--primary-600))',
                cursor: 'pointer'
              }}
            />
            <span style={{
              marginLeft: '14px',
              fontSize: '16px',
              fontWeight: selectedValue === 'other' ? 600 : 400,
              color: 'rgb(var(--text-100))'
            }}>
              Other
            </span>
          </label>
          
          {selectedValue === 'other' && (
            <input
              type="text"
              value={otherText}
              onChange={(e) => handleOtherTextChange(e.target.value)}
              placeholder="Please specify..."
              autoFocus
              style={{
                width: '100%',
                padding: '14px 16px',
                border: '2px solid rgb(var(--primary-600))',
                borderRadius: '12px',
                background: 'rgb(var(--surface-800))',
                color: 'rgb(var(--text-100))',
                fontSize: '16px',
                outline: 'none'
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}