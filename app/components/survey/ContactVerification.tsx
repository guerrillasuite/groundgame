// app/components/survey/ContactVerification.tsx
'use client';

import { useState, useEffect } from 'react';

interface ContactVerificationProps {
  questionId: string;
  contactId: string;
  onAnswer: (data: ContactData) => void;
  initialData?: ContactData;
  existingContact?: ExistingContactData;
}

interface ContactData {
  name_correct?: boolean;
  name?: string;
  email_correct?: boolean;
  email?: string;
  phone_correct?: boolean;
  phone?: string;
  phone_type?: 'cell' | 'landline';
  additional_phone?: string;
  additional_phone_type?: 'cell' | 'landline';
  address?: string;
}

interface ExistingContactData {
  name?: string;
  email?: string;
  phone?: string;
}

export function ContactVerification({
  questionId,
  contactId,
  onAnswer,
  initialData = {},
  existingContact = {}
}: ContactVerificationProps) {
  const [formData, setFormData] = useState<ContactData>(initialData);
  
  useEffect(() => {
    // Auto-save on any change
    onAnswer(formData);
  }, [formData]);
  
  const handleChange = (field: keyof ContactData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  
  const hasExistingName = !!existingContact.name;
  const hasExistingEmail = !!existingContact.email;
  const hasExistingPhone = !!existingContact.phone;
  
  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      
      {/* Name Verification */}
      {hasExistingName ? (
        <div>
          <label style={{
            display: 'block',
            marginBottom: '12px',
            color: 'rgb(var(--text-100))',
            fontSize: '16px',
            fontWeight: 600
          }}>
            Is this your correct name?
          </label>
          <div style={{
            padding: '12px 16px',
            background: 'rgb(var(--card-700))',
            borderRadius: '8px',
            marginBottom: '12px',
            color: 'rgb(var(--text-100))',
            fontSize: '18px'
          }}>
            {existingContact.name}
          </div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <label style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              borderRadius: '10px',
              cursor: 'pointer',
              border: formData.name_correct === true
                ? '2px solid rgb(var(--primary-600))'
                : '1px solid rgb(var(--border-600))',
              background: formData.name_correct === true
                ? 'rgba(37, 99, 235, 0.1)'
                : 'rgb(var(--card-700))'
            }}>
              <input
                type="radio"
                name={`${questionId}-name`}
                checked={formData.name_correct === true}
                onChange={() => handleChange('name_correct', true)}
                style={{ marginRight: '10px', accentColor: 'rgb(var(--primary-600))' }}
              />
              <span style={{ color: 'rgb(var(--text-100))' }}>Yes, correct</span>
            </label>
            <label style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              borderRadius: '10px',
              cursor: 'pointer',
              border: formData.name_correct === false
                ? '2px solid rgb(var(--primary-600))'
                : '1px solid rgb(var(--border-600))',
              background: formData.name_correct === false
                ? 'rgba(37, 99, 235, 0.1)'
                : 'rgb(var(--card-700))'
            }}>
              <input
                type="radio"
                name={`${questionId}-name`}
                checked={formData.name_correct === false}
                onChange={() => handleChange('name_correct', false)}
                style={{ marginRight: '10px', accentColor: 'rgb(var(--primary-600))' }}
              />
              <span style={{ color: 'rgb(var(--text-100))' }}>No, incorrect</span>
            </label>
          </div>
          {formData.name_correct === false && (
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Enter correct name"
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
      ) : (
        <div>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            color: 'rgb(var(--text-100))',
            fontSize: '14px',
            fontWeight: 600
          }}>
            Full Name (Optional)
          </label>
          <input
            type="text"
            value={formData.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Enter your full name"
            style={{
              width: '100%',
              padding: '14px 16px',
              border: '1px solid rgb(var(--border-600))',
              borderRadius: '12px',
              background: 'rgb(var(--surface-800))',
              color: 'rgb(var(--text-100))',
              fontSize: '16px',
              outline: 'none'
            }}
          />
        </div>
      )}
      
      {/* Email Verification */}
      {hasExistingEmail ? (
        <div>
          <label style={{
            display: 'block',
            marginBottom: '12px',
            color: 'rgb(var(--text-100))',
            fontSize: '16px',
            fontWeight: 600
          }}>
            Is this your correct email?
          </label>
          <div style={{
            padding: '12px 16px',
            background: 'rgb(var(--card-700))',
            borderRadius: '8px',
            marginBottom: '12px',
            color: 'rgb(var(--text-100))',
            fontSize: '18px'
          }}>
            {existingContact.email}
          </div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <label style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              borderRadius: '10px',
              cursor: 'pointer',
              border: formData.email_correct === true
                ? '2px solid rgb(var(--primary-600))'
                : '1px solid rgb(var(--border-600))',
              background: formData.email_correct === true
                ? 'rgba(37, 99, 235, 0.1)'
                : 'rgb(var(--card-700))'
            }}>
              <input
                type="radio"
                name={`${questionId}-email`}
                checked={formData.email_correct === true}
                onChange={() => handleChange('email_correct', true)}
                style={{ marginRight: '10px', accentColor: 'rgb(var(--primary-600))' }}
              />
              <span style={{ color: 'rgb(var(--text-100))' }}>Yes, correct</span>
            </label>
            <label style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              borderRadius: '10px',
              cursor: 'pointer',
              border: formData.email_correct === false
                ? '2px solid rgb(var(--primary-600))'
                : '1px solid rgb(var(--border-600))',
              background: formData.email_correct === false
                ? 'rgba(37, 99, 235, 0.1)'
                : 'rgb(var(--card-700))'
            }}>
              <input
                type="radio"
                name={`${questionId}-email`}
                checked={formData.email_correct === false}
                onChange={() => handleChange('email_correct', false)}
                style={{ marginRight: '10px', accentColor: 'rgb(var(--primary-600))' }}
              />
              <span style={{ color: 'rgb(var(--text-100))' }}>No, incorrect</span>
            </label>
          </div>
          {formData.email_correct === false && (
            <input
              type="email"
              value={formData.email || ''}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="Enter correct email"
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
      ) : (
        <div>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            color: 'rgb(var(--text-100))',
            fontSize: '14px',
            fontWeight: 600
          }}>
            Email Address (Optional)
          </label>
          <input
            type="email"
            value={formData.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="your.email@example.com"
            style={{
              width: '100%',
              padding: '14px 16px',
              border: '1px solid rgb(var(--border-600))',
              borderRadius: '12px',
              background: 'rgb(var(--surface-800))',
              color: 'rgb(var(--text-100))',
              fontSize: '16px',
              outline: 'none'
            }}
          />
        </div>
      )}
      
      {/* Phone Verification */}
      {hasExistingPhone ? (
        <div>
          <label style={{
            display: 'block',
            marginBottom: '12px',
            color: 'rgb(var(--text-100))',
            fontSize: '16px',
            fontWeight: 600
          }}>
            Is this your correct phone number?
          </label>
          <div style={{
            padding: '12px 16px',
            background: 'rgb(var(--card-700))',
            borderRadius: '8px',
            marginBottom: '12px',
            color: 'rgb(var(--text-100))',
            fontSize: '18px'
          }}>
            {existingContact.phone}
          </div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <label style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              borderRadius: '10px',
              cursor: 'pointer',
              border: formData.phone_correct === true
                ? '2px solid rgb(var(--primary-600))'
                : '1px solid rgb(var(--border-600))',
              background: formData.phone_correct === true
                ? 'rgba(37, 99, 235, 0.1)'
                : 'rgb(var(--card-700))'
            }}>
              <input
                type="radio"
                name={`${questionId}-phone`}
                checked={formData.phone_correct === true}
                onChange={() => handleChange('phone_correct', true)}
                style={{ marginRight: '10px', accentColor: 'rgb(var(--primary-600))' }}
              />
              <span style={{ color: 'rgb(var(--text-100))' }}>Yes, correct</span>
            </label>
            <label style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              borderRadius: '10px',
              cursor: 'pointer',
              border: formData.phone_correct === false
                ? '2px solid rgb(var(--primary-600))'
                : '1px solid rgb(var(--border-600))',
              background: formData.phone_correct === false
                ? 'rgba(37, 99, 235, 0.1)'
                : 'rgb(var(--card-700))'
            }}>
              <input
                type="radio"
                name={`${questionId}-phone`}
                checked={formData.phone_correct === false}
                onChange={() => handleChange('phone_correct', false)}
                style={{ marginRight: '10px', accentColor: 'rgb(var(--primary-600))' }}
              />
              <span style={{ color: 'rgb(var(--text-100))' }}>No, incorrect</span>
            </label>
          </div>
          
          {/* Phone Type Selection */}
          {formData.phone_correct === true && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                color: 'rgb(var(--text-100))',
                fontSize: '14px',
                fontWeight: 600
              }}>
                Is this number a cell phone or landline?
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <label style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  border: formData.phone_type === 'cell'
                    ? '2px solid rgb(var(--primary-600))'
                    : '1px solid rgb(var(--border-600))',
                  background: formData.phone_type === 'cell'
                    ? 'rgba(37, 99, 235, 0.1)'
                    : 'rgb(var(--card-700))'
                }}>
                  <input
                    type="radio"
                    name={`${questionId}-phone-type`}
                    checked={formData.phone_type === 'cell'}
                    onChange={() => handleChange('phone_type', 'cell')}
                    style={{ marginRight: '10px', accentColor: 'rgb(var(--primary-600))' }}
                  />
                  <span style={{ color: 'rgb(var(--text-100))' }}>Cell</span>
                </label>
                <label style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  border: formData.phone_type === 'landline'
                    ? '2px solid rgb(var(--primary-600))'
                    : '1px solid rgb(var(--border-600))',
                  background: formData.phone_type === 'landline'
                    ? 'rgba(37, 99, 235, 0.1)'
                    : 'rgb(var(--card-700))'
                }}>
                  <input
                    type="radio"
                    name={`${questionId}-phone-type`}
                    checked={formData.phone_type === 'landline'}
                    onChange={() => handleChange('phone_type', 'landline')}
                    style={{ marginRight: '10px', accentColor: 'rgb(var(--primary-600))' }}
                  />
                  <span style={{ color: 'rgb(var(--text-100))' }}>Landline</span>
                </label>
              </div>
            </div>
          )}
          
          {formData.phone_correct === false && (
            <input
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="Enter correct phone number"
              style={{
                width: '100%',
                padding: '14px 16px',
                border: '2px solid rgb(var(--primary-600))',
                borderRadius: '12px',
                background: 'rgb(var(--surface-800))',
                color: 'rgb(var(--text-100))',
                fontSize: '16px',
                outline: 'none',
                marginBottom: '12px'
              }}
            />
          )}
          
          {/* Additional Phone */}
          <div style={{ marginTop: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              color: 'rgb(var(--text-100))',
              fontSize: '14px',
              fontWeight: 600
            }}>
              Additional Phone Number (Optional)
            </label>
            <input
              type="tel"
              value={formData.additional_phone || ''}
              onChange={(e) => handleChange('additional_phone', e.target.value)}
              placeholder="(555) 123-4567"
              style={{
                width: '100%',
                padding: '14px 16px',
                border: '1px solid rgb(var(--border-600))',
                borderRadius: '12px',
                background: 'rgb(var(--surface-800))',
                color: 'rgb(var(--text-100))',
                fontSize: '16px',
                outline: 'none',
                marginBottom: '12px'
              }}
            />
            {formData.additional_phone && (
              <div style={{ display: 'flex', gap: '12px' }}>
                <label style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  border: formData.additional_phone_type === 'cell'
                    ? '2px solid rgb(var(--primary-600))'
                    : '1px solid rgb(var(--border-600))',
                  background: formData.additional_phone_type === 'cell'
                    ? 'rgba(37, 99, 235, 0.1)'
                    : 'rgb(var(--card-700))'
                }}>
                  <input
                    type="radio"
                    name={`${questionId}-additional-phone-type`}
                    checked={formData.additional_phone_type === 'cell'}
                    onChange={() => handleChange('additional_phone_type', 'cell')}
                    style={{ marginRight: '10px', accentColor: 'rgb(var(--primary-600))' }}
                  />
                  <span style={{ color: 'rgb(var(--text-100))' }}>Cell</span>
                </label>
                <label style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  border: formData.additional_phone_type === 'landline'
                    ? '2px solid rgb(var(--primary-600))'
                    : '1px solid rgb(var(--border-600))',
                  background: formData.additional_phone_type === 'landline'
                    ? 'rgba(37, 99, 235, 0.1)'
                    : 'rgb(var(--card-700))'
                }}>
                  <input
                    type="radio"
                    name={`${questionId}-additional-phone-type`}
                    checked={formData.additional_phone_type === 'landline'}
                    onChange={() => handleChange('additional_phone_type', 'landline')}
                    style={{ marginRight: '10px', accentColor: 'rgb(var(--primary-600))' }}
                  />
                  <span style={{ color: 'rgb(var(--text-100))' }}>Landline</span>
                </label>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            color: 'rgb(var(--text-100))',
            fontSize: '14px',
            fontWeight: 600
          }}>
            Phone Number (Optional)
          </label>
          <input
            type="tel"
            value={formData.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="(555) 123-4567"
            style={{
              width: '100%',
              padding: '14px 16px',
              border: '1px solid rgb(var(--border-600))',
              borderRadius: '12px',
              background: 'rgb(var(--surface-800))',
              color: 'rgb(var(--text-100))',
              fontSize: '16px',
              outline: 'none'
            }}
          />
        </div>
      )}
      
      {/* Mailing Address - Always optional */}
      <div>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          color: 'rgb(var(--text-100))',
          fontSize: '14px',
          fontWeight: 600
        }}>
          Mailing Address (Optional)
        </label>
        <textarea
          value={formData.address || ''}
          onChange={(e) => handleChange('address', e.target.value)}
          placeholder="123 Main St, City, State ZIP"
          rows={3}
          style={{
            width: '100%',
            padding: '14px 16px',
            border: '1px solid rgb(var(--border-600))',
            borderRadius: '12px',
            background: 'rgb(var(--surface-800))',
            color: 'rgb(var(--text-100))',
            fontSize: '16px',
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit'
          }}
        />
      </div>
    </div>
  );
}