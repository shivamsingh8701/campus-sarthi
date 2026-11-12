import { useNavigate } from 'react-router-dom';
import { authApi } from '@/services/api';
import { useAuth } from '@/store/authStore';
import type { LoginCredentials, RegisterCredentials, Student } from '@/types';

export interface LoginActionResult {
  success: boolean;
  message?: string;
  code?: string;
  verificationType?: string;
  requiresEmail?: boolean;
  verifiedAdmissionNumber?: string;
  detectedName?: string | null;
}

function extractStudent(res: unknown): Student | null {
  if (!res || typeof res !== 'object') return null;
  const obj = res as { student?: Student; data?: { student?: Student } };
  return obj.student ?? obj.data?.student ?? null;
}

export function useAuthActions() {
  const { setStudent, clearStudent, refreshStudent } = useAuth();
  const navigate = useNavigate();

  const login = async (credentials: LoginCredentials): Promise<LoginActionResult> => {
    try {
      const response = await authApi.login(credentials);
      const student = extractStudent(response);
      if (student) {
        setStudent(student);
        return { success: true };
      }
      return { success: false, message: 'Authentication succeeded but no profile was returned.' };
    } catch (err: unknown) {
      const e = err as {
        response?: {
          status?: number;
          data?: {
            error?: string;
            message?: string;
            code?: string;
            verificationType?: string;
            requiresEmail?: boolean;
            verifiedAdmissionNumber?: string;
            detectedName?: string | null;
          };
        };
        message?: string;
      };
      const data = e.response?.data;
      return {
        success: false,
        message:
          data?.error ||
          data?.message ||
          e.message ||
          'Authentication failed. Please check your university credentials.',
        code: data?.code,
        verificationType: data?.verificationType,
        requiresEmail: Boolean(data?.requiresEmail),
        verifiedAdmissionNumber: data?.verifiedAdmissionNumber,
        detectedName: data?.detectedName,
      };
    }
  };

  const enterDemo = async (): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await authApi.enterDemo();
      const student = extractStudent(response);
      if (student) {
        setStudent(student);
        navigate('/dashboard');
        return { success: true };
      }
      return { success: false, message: 'Failed to load Demo Mode.' };
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      return {
        success: false,
        message: e.response?.data?.error || e.message || 'Unable to launch Demo Mode.',
      };
    }
  };

  const logout = async (disconnectLms = false) => {
    try {
      await authApi.logout(disconnectLms);
    } catch {
      // Clear local auth state even if network fails
    }
    clearStudent();
  };

  const register = async (
    credentials: RegisterCredentials
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await authApi.register(credentials);
      const student = extractStudent(response);
      if (student) {
        setStudent(student);
        await refreshStudent();
        return { success: true, message: (response as { message?: string }).message };
      }
      return { success: true };
    } catch (err: unknown) {
      const e = err as {
        response?: { data?: { error?: string; message?: string } };
        message?: string;
      };
      return {
        success: false,
        message:
          e.response?.data?.error ||
          e.response?.data?.message ||
          e.message ||
          'Registration failed. Please verify your details and try again.',
      };
    }
  };

  return { login, enterDemo, logout, register };
}
