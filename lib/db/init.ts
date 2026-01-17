// lib/db/init.ts
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'surveys.db');

export function initializeDatabase() {
  const db = new Database(DB_PATH);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Create surveys table
  db.exec(`
    CREATE TABLE IF NOT EXISTS surveys (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      active BOOLEAN DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create questions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      survey_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL, -- 'multiple_choice', 'text', 'multiple_choice_with_other', 'multiple_select_with_other', 'contact_verification'
      options TEXT, -- JSON array of options
      required BOOLEAN DEFAULT 1,
      order_index INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    )
  `);
  
  // Create responses table - stores individual answers
  db.exec(`
    CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crm_contact_id TEXT NOT NULL,
      survey_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      answer_value TEXT NOT NULL,
      answer_text TEXT, -- For "other" responses or text inputs
      original_position INTEGER, -- Track original position before randomization
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    )
  `);
  
  // Create survey_sessions table - tracks completion status
  db.exec(`
    CREATE TABLE IF NOT EXISTS survey_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crm_contact_id TEXT NOT NULL,
      survey_id TEXT NOT NULL,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      last_question_answered TEXT,
      UNIQUE(crm_contact_id, survey_id)
    )
  `);
  
  // Create indexes for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_responses_contact 
    ON responses(crm_contact_id);
    
    CREATE INDEX IF NOT EXISTS idx_responses_survey 
    ON responses(survey_id);
    
    CREATE INDEX IF NOT EXISTS idx_responses_question 
    ON responses(question_id);
    
    CREATE INDEX IF NOT EXISTS idx_sessions_contact 
    ON survey_sessions(crm_contact_id);
  `);
  
  db.close();
  console.log('Database initialized successfully');
}

export function getDatabase() {
  return new Database(DB_PATH);
}

// Seed the LNC Chair poll
export function seedLNCChairPoll() {
  const db = getDatabase();
  
  try {
    // Check if survey already exists
    const existing = db.prepare('SELECT id FROM surveys WHERE id = ?').get('lnc-chair-2025');
    
    if (!existing) {
      // Insert survey
      db.prepare(`
        INSERT INTO surveys (id, title, description, active)
        VALUES (?, ?, ?, ?)
      `).run(
        'lnc-chair-2025',
        'LNC Chair Race Poll',
        'If the National Convention was today, who would you vote for in the First Ballot of the LNC Chair Race?',
        1
      );
      
      // Insert question
      const candidates = ['Evan McMahon', 'Rob Yates', 'Wes Benedict', 'Jim Ostrowski'];
      
      db.prepare(`
        INSERT INTO questions (id, survey_id, question_text, question_type, options, required, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'lnc-chair-q1',
        'lnc-chair-2025',
        'If the National Convention was today, who would you vote for in the First Ballot of the LNC Chair Race?',
        'multiple_choice_with_other',
        JSON.stringify(candidates),
        1,
        1
      );
      
      console.log('LNC Chair poll seeded successfully');
    } else {
      console.log('LNC Chair poll already exists');
    }
  } finally {
    db.close();
  }
}

// Run if executed directly
if (require.main === module) {
  initializeDatabase();
  seedLNCChairPoll();
}