import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
} from 'react';
import type { Student, AuthState } from '@/types';
import { authApi } from '@/services/api';

// ─── Actions ──────────────────────────────────────────────────────────────────
type AuthAction =
  | { type: 'SET_STUDENT'; payload: Student }
  | { type: 'CLEAR_STUDENT' }
  | { type: 'SET_LOADING'; payload: boolean };

// ─── Reducer ──────────────────────────────────────────────────────────────────
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_STUDENT':
      return {
        ...state,
        student: action.payload,
        isAuthenticated: true,
        isLoading: false,
      };
    case 'CLEAR_STUDENT':
      return {
        ...state,
        student: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface AuthContextValue extends AuthState {
  setStudent: (student: Student) => void;
  clearStudent: () => void;
  setLoading: (loading: boolean) => void;
  refreshStudent: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const initialState: AuthState = {
  student: null,
  isLoading: true,
  isAuthenticated: false,
};

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const setStudent = (student: Student) =>
    dispatch({ type: 'SET_STUDENT', payload: student });

  const clearStudent = () => dispatch({ type: 'CLEAR_STUDENT' });

  const setLoading = (loading: boolean) =>
    dispatch({ type: 'SET_LOADING', payload: loading });

  const refreshStudent = async () => {
    try {
      setLoading(true);
      const response = (await authApi.getMe()) as unknown as {
        success?: boolean;
        data?: Record<string, unknown> & { student?: Record<string, unknown> };
        student?: Record<string, unknown>;
      };
      const rawStudent = (
        response?.data?.student ||
        response?.data ||
        response?.student
      ) as Record<string, unknown> | undefined;

      if (rawStudent && (rawStudent['id'] || rawStudent['_id'])) {
        const student = {
          ...rawStudent,
          _id: (rawStudent['_id'] || rawStudent['id']) as string,
          id: (rawStudent['id'] || rawStudent['_id']) as string,
          admissionNumber: (rawStudent['admissionNumber'] || rawStudent['admission_number']) as string,
          email: rawStudent['email'] as string,
          name: (rawStudent['name'] || rawStudent['fullName'] || rawStudent['full_name']) as string | undefined,
          fullName: (rawStudent['fullName'] || rawStudent['full_name'] || rawStudent['name']) as string | undefined,
          emailVerified: Boolean(rawStudent['emailVerified'] ?? rawStudent['isEmailVerified'] ?? rawStudent['is_email_verified']),
          isEmailVerified: Boolean(rawStudent['isEmailVerified'] ?? rawStudent['is_email_verified']),
          isDemo: Boolean(rawStudent['isDemo']),
          authMode: (rawStudent['authMode'] as Student['authMode']) || undefined,
          lmsConnected: Boolean(rawStudent['lmsConnected']),
          lmsUsername: (rawStudent['lmsUsername'] as string | null) ?? null,
          lmsExpiresAt: (rawStudent['lmsExpiresAt'] as string | null) ?? null,
          lastSync: (rawStudent['lastSync'] as string | null) ?? null,
          createdAt: String(rawStudent['createdAt'] || rawStudent['created_at'] || new Date().toISOString()),
          updatedAt: String(rawStudent['updatedAt'] || rawStudent['updated_at'] || new Date().toISOString()),
        } as unknown as Student;
        setStudent(student);
      } else {
        clearStudent();
      }
    } catch {
      clearStudent();
    }
  };

  // Check auth on mount
  useEffect(() => {
    refreshStudent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...state, setStudent, clearStudent, setLoading, refreshStudent }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
