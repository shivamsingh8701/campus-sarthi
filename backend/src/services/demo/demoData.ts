// ============================================================
// CampusSarthi — Demo Mode & Mock Data Provider
// Contains clearly labelled sample data for demonstration / offline evaluation
// ============================================================

import type { StudentRow, CourseRow, AssignmentRow, QuizRow, DocumentRow, ActivityLogRow, LMSSessionRow } from '../../types/db';

export const DEMO_STUDENT_ID = '00000000-0000-0000-0000-000000000001';
export const DEMO_EMAIL = 'demo@galgotiasuniversity.org';
export const DEMO_PASSWORD = 'DemoStudent@123';
export const DEMO_ADMISSION_NUMBER = '21SCSE101001';
export const DEMO_LMS_PASSWORD = 'DemoLMSPassword@123';

export const DEMO_STUDENT: StudentRow = {
  id: DEMO_STUDENT_ID,
  admission_number: DEMO_ADMISSION_NUMBER,
  email: DEMO_EMAIL,
  password_hash: '$2b$12$4m26eL0r7p0K8O8s8.0gQ.vj3YgI8q9U2q1gO4u0O8f8m26eL0r7p',
  full_name: 'Aarav Sharma (Demo Student)',
  is_email_verified: true,
  email_verification_token: null,
  email_verification_expires_at: null,
  created_at: new Date('2026-08-15T10:00:00Z').toISOString(),
  updated_at: new Date().toISOString(),
};

export const DEMO_COURSES: CourseRow[] = [
  {
    id: '11111111-0000-0000-0000-000000000001',
    student_id: DEMO_STUDENT_ID,
    lms_course_id: 'GULMS_CS301',
    name: 'CS301 - Design & Analysis of Algorithms',
    short_name: 'CS301',
    full_name: 'B.Tech CSE - Design & Analysis of Algorithms (Batch 2026)',
    course_url: 'https://gulms.galgotiasuniversity.org/course/view.php?id=301',
    instructor: 'Dr. Rajesh Kumar (Associate Professor, SCSE)',
    enrolled_at: new Date('2026-08-01T00:00:00Z').toISOString(),
    last_synced_at: new Date().toISOString(),
    created_at: new Date('2026-08-01T00:00:00Z').toISOString(),
  },
  {
    id: '11111111-0000-0000-0000-000000000002',
    student_id: DEMO_STUDENT_ID,
    lms_course_id: 'GULMS_CS304',
    name: 'CS304 - Database Management Systems',
    short_name: 'CS304',
    full_name: 'B.Tech CSE - Database Management Systems & Relational Theory',
    course_url: 'https://gulms.galgotiasuniversity.org/course/view.php?id=304',
    instructor: 'Prof. Ananya Sen (Dept of Computer Science)',
    enrolled_at: new Date('2026-08-01T00:00:00Z').toISOString(),
    last_synced_at: new Date().toISOString(),
    created_at: new Date('2026-08-01T00:00:00Z').toISOString(),
  },
  {
    id: '11111111-0000-0000-0000-000000000003',
    student_id: DEMO_STUDENT_ID,
    lms_course_id: 'GULMS_AI201',
    name: 'AI201 - Artificial Intelligence & Machine Learning',
    short_name: 'AI201',
    full_name: 'B.Tech CSE - Foundations of Artificial Intelligence & Neural Networks',
    course_url: 'https://gulms.galgotiasuniversity.org/course/view.php?id=201',
    instructor: 'Dr. Vikas Mishra (Head of AI & Data Science)',
    enrolled_at: new Date('2026-08-01T00:00:00Z').toISOString(),
    last_synced_at: new Date().toISOString(),
    created_at: new Date('2026-08-01T00:00:00Z').toISOString(),
  },
];

export const DEMO_ASSIGNMENTS: AssignmentRow[] = [
  {
    id: '22222222-0000-0000-0000-000000000001',
    student_id: DEMO_STUDENT_ID,
    course_id: '11111111-0000-0000-0000-000000000001',
    lms_assignment_id: 'assign_401',
    title: 'Assignment 3: Dynamic Programming & Greedy Knapsack [DEMO]',
    description: 'Solve the 0/1 Knapsack problem using dynamic programming and compare asymptotic complexity with Fractional Knapsack greedy strategy. Include code, recurrence relations, and space optimization techniques.',
    due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days from now
    open_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    max_grade: 20,
    submission_status: 'Not submitted',
    attachments: [
      {
        url: 'https://gulms.galgotiasuniversity.org/pluginfile.php/301/mod_assign/intro/Algorithms_Lab_Assignment_3.pdf',
        filename: 'Algorithms_Lab_Assignment_3.pdf',
        fileSize: 245000,
        mimeType: 'application/pdf',
      },
    ],
    ai_status: 'completed',
    ai_error_message: null,
    ai_processed_at: new Date().toISOString(),
    document_id: '44444444-0000-0000-0000-000000000001',
    email_sent_at: new Date().toISOString(),
    email_status: 'sent',
    last_synced_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '22222222-0000-0000-0000-000000000002',
    student_id: DEMO_STUDENT_ID,
    course_id: '11111111-0000-0000-0000-000000000002',
    lms_assignment_id: 'assign_402',
    title: 'DBMS Project: 3NF & BCNF Decomposition [DEMO]',
    description: 'Normalize the given University Enrollment relational schema from 1NF to BCNF. Provide functional dependencies, minimal cover, and lossless join proofs.',
    due_date: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days from now
    open_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    max_grade: 25,
    submission_status: 'Draft',
    attachments: [
      {
        url: 'https://gulms.galgotiasuniversity.org/pluginfile.php/304/mod_assign/intro/DBMS_Normalization_Task.pdf',
        filename: 'DBMS_Normalization_Task.pdf',
        fileSize: 180000,
        mimeType: 'application/pdf',
      },
    ],
    ai_status: 'pending',
    ai_error_message: null,
    ai_processed_at: null,
    document_id: null,
    email_sent_at: null,
    email_status: null,
    last_synced_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '22222222-0000-0000-0000-000000000003',
    student_id: DEMO_STUDENT_ID,
    course_id: '11111111-0000-0000-0000-000000000003',
    lms_assignment_id: 'assign_403',
    title: 'AI Lab: A* Search Algorithm & Heuristic Analysis [DEMO]',
    description: 'Implement A* search on the 8-puzzle game. Compare Manhattan distance heuristic with Misplaced Tiles heuristic in terms of explored node count and execution time.',
    due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    open_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    max_grade: 30,
    submission_status: 'Not submitted',
    attachments: [
      {
        url: 'https://gulms.galgotiasuniversity.org/pluginfile.php/201/mod_assign/intro/AI_Search_Lab.pdf',
        filename: 'AI_Search_Lab.pdf',
        fileSize: 310000,
        mimeType: 'application/pdf',
      },
    ],
    ai_status: 'pending',
    ai_error_message: null,
    ai_processed_at: null,
    document_id: null,
    email_sent_at: null,
    email_status: null,
    last_synced_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const DEMO_QUIZZES: QuizRow[] = [
  {
    id: '33333333-0000-0000-0000-000000000001',
    student_id: DEMO_STUDENT_ID,
    course_id: '11111111-0000-0000-0000-000000000001',
    lms_quiz_id: 'quiz_501',
    title: 'Quiz 2: Graph Algorithms, BFS/DFS & Dijkstra [DEMO]',
    description: 'Timed assessment covering graph representations, single-source shortest path, topological sorting, and cycle detection in directed graphs.',
    open_time: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    close_time: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    time_limit_seconds: 2700, // 45 mins
    max_attempts: 2,
    attempts_used: 1,
    total_questions: 20,
    status: 'Open (Attempt 1 Graded: 18/20)',
    instructions: 'Each question carries 1 mark. Negative marking: 0.25 for incorrect options. Calculators permitted.',
    last_synced_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '33333333-0000-0000-0000-000000000002',
    student_id: DEMO_STUDENT_ID,
    course_id: '11111111-0000-0000-0000-000000000003',
    lms_quiz_id: 'quiz_502',
    title: 'Mid-term Quiz: Neural Networks & Backpropagation [DEMO]',
    description: 'Online test covering activation functions, gradient descent variants, multi-layer perceptrons, and cross-entropy loss calculation.',
    open_time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    close_time: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    time_limit_seconds: 3600, // 60 mins
    max_attempts: 1,
    attempts_used: 0,
    total_questions: 30,
    status: 'Upcoming',
    instructions: 'Single attempt allowed. Browser full screen mode required. Do not refresh during the quiz.',
    last_synced_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const DEMO_DOCUMENTS: DocumentRow[] = [
  {
    id: '44444444-0000-0000-0000-000000000001',
    student_id: DEMO_STUDENT_ID,
    assignment_id: '22222222-0000-0000-0000-000000000001',
    filename: 'Algorithms_Assignment_3_Solution_Draft.pdf',
    file_path: 'C:\\Users\\Shivam\\Desktop\\campussarthi\\docs\\sample_algorithms_solution.pdf',
    file_size_bytes: 412500,
    generated_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  },
];

export const DEMO_ACTIVITIES: ActivityLogRow[] = [
  {
    id: '55555555-0000-0000-0000-000000000001',
    student_id: DEMO_STUDENT_ID,
    type: 'lms_connected',
    description: 'Galgotias University LMS connected for 21SCSE101001',
    metadata: { username: '21SCSE101001', lms: 'https://gulms.galgotiasuniversity.org' },
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '55555555-0000-0000-0000-000000000002',
    student_id: DEMO_STUDENT_ID,
    type: 'lms_sync',
    description: 'Discovered 3 active courses and 3 pending assignments',
    metadata: { courses: 3, assignments: 3, quizzes: 2 },
    created_at: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '55555555-0000-0000-0000-000000000003',
    student_id: DEMO_STUDENT_ID,
    type: 'document_generated',
    description: 'AI Solution Draft generated for Assignment 3 (CS301)',
    metadata: { assignmentId: '22222222-0000-0000-0000-000000000001', questionsExtracted: 5 },
    created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '55555555-0000-0000-0000-000000000004',
    student_id: DEMO_STUDENT_ID,
    type: 'email_sent',
    description: 'Solution PDF emailed to demo@galgotiasuniversity.org',
    metadata: { messageId: 'gmail_demo_mock_msg_01' },
    created_at: new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString(),
  },
];

export const DEMO_LMS_SESSION: LMSSessionRow = {
  id: '66666666-0000-0000-0000-000000000001',
  student_id: DEMO_STUDENT_ID,
  session_data_encrypted: 'demo_session_encrypted_token',
  lms_username: DEMO_ADMISSION_NUMBER,
  is_active: true,
  logged_in_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  last_used_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
};

export function isDemoStudent(id?: string): boolean {
  return id === DEMO_STUDENT_ID;
}

