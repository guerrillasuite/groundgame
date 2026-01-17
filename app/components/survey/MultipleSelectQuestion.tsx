// app/components/survey/MultipleSelectQuestion.tsx
'use client';

import { useState, useEffect } from 'react';

interface MultipleSelectQuestionProps {
  questionId: string;
  options: string[];
  maxSelections?: number;
  hasOther?: boolean;
  required?: boolean;
  onAnswer: (values: string[], otherText?: string, positions?: number[]) => void;
  initialValues?: string[];
  initialOtherText?: string;
  randomize?: boolean;
}

export function MultipleSelectQuestion({
  questionId,
  options,
  maxSelections = 3,
  hasOther = false,
  required = true,
  onAnswer,
  initialValues = [],
  initialOtherText = '',
  randomize = false
}: MultipleSelectQuestionProps) {
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set(initialValues));
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
  
  const handleToggle = (value: string) => {
    const newSelected = new Set(selectedValues);
    
    if (newSelected.has(value)) {
      newSelected.delete(value);
    } else {
      if (newSelected.size >= maxSelections) {
        return; // Max selections reached
      }
      newSelected.add(value);
    }
    
    setSelectedValues(newSelected);
    
    const values = Array.from(newSelected);
    const positions = values.map(v => optionPositions.get(v) ?? -1);
    
    if (newSelected.has('other')) {
      if (otherText.trim()) {
        onAnswer(values, otherText, positions);
      }
    } else {
      setOtherText('');
      onAnswer(values, undefined, positions);
    }
  };
  
  const handleOtherTextChange = (text: string) => {
    setOtherText(text);
    if (selectedValues.has('other') && text.trim()) {
      const values = Array.from(selectedValues);
      const positions = values.map(v => optionPositions.get(v) ?? -1);
      onAnswer(values, text, positions);
    }
  };
  
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <p style={{ 
        color: 'rgb(var(--text-300))', 
        fontSize: '14px', 
        margin: '0 0 8px'
      }}>
        Select up to {maxSelections} options
      </p>
      
      {displayOptions.map((option) => (
        <label
          key={option}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 18px',
            borderRadius: '12px',
            cursor: selectedValues.size >= maxSelections && !selectedValues.has(option) ? 'not-allowed' : 'pointer',
            border: selectedValues.has(option)
              ? '2px solid rgb(var(--primary-600))' 
              : '1px solid rgb(var(--border-600))',
            background: selectedValues.has(option)
              ? 'rgba(37, 99, 235, 0.1)'
              : 'rgb(var(--card-700))',
            opacity: selectedValues.size >= maxSelections && !selectedValues.has(option) ? 0.5 : 1,
            transition: 'all 0.15s ease',
            boxShadow: selectedValues.has(option)
              ? '0 4px 12px rgba(37, 99, 235, 0.25)' 
              : 'none'
          }}
          onMouseEnter={(e) => {
            if (!selectedValues.has(option) && selectedValues.size < maxSelections) {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
            }
          }}
          onMouseLeave={(e) => {
            if (!selectedValues.has(option)) {
              e.currentTarget.style.borderColor = 'rgb(var(--border-600))';
            }
          }}
        >
          <input
            type="checkbox"
            name={questionId}
            value={option}
            checked={selectedValues.has(option)}
            onChange={() => handleToggle(option)}
            disabled={selectedValues.size >= maxSelections && !selectedValues.has(option)}
            style={{
              width: '20px',
              height: '20px',
              accentColor: 'rgb(var(--primary-600))',
              cursor: selectedValues.size >= maxSelections && !selectedValues.has(option) ? 'not-allowed' : 'pointer'
            }}
          />
          <span style={{
            marginLeft: '14px',
            fontSize: '16px',
            fontWeight: selectedValues.has(option) ? 600 : 400,
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
              cursor: selectedValues.size >= maxSelections && !selectedValues.has('other') ? 'not-allowed' : 'pointer',
              border: selectedValues.has('other')
                ? '2px solid rgb(var(--primary-600))' 
                : '1px solid rgb(var(--border-600))',
              background: selectedValues.has('other')
                ? 'rgba(37, 99, 235, 0.1)'
                : 'rgb(var(--card-700))',
              opacity: selectedValues.size >= maxSelections && !selectedValues.has('other') ? 0.5 : 1,
              transition: 'all 0.15s ease',
              boxShadow: selectedValues.has('other')
                ? '0 4px 12px rgba(37, 99, 235, 0.25)' 
                : 'none'
            }}
          >
            <input
              type="checkbox"
              name={questionId}
              value="other"
              checked={selectedValues.has('other')}
              onChange={() => handleToggle('other')}
              disabled={selectedValues.size >= maxSelections && !selectedValues.has('other')}
              style={{
                width: '20px',
                height: '20px',
                accentColor: 'rgb(var(--primary-600))',
                cursor: selectedValues.size >= maxSelections && !selectedValues.has('other') ? 'not-allowed' : 'pointer'
              }}
            />
            <span style={{
              marginLeft: '14px',
              fontSize: '16px',
              fontWeight: selectedValues.has('other') ? 600 : 400,
              color: 'rgb(var(--text-100))'
            }}>
              Other
            </span>
          </label>
          
          {selectedValues.has('other') && (
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