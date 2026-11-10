import { useAuth } from '@/store/authStore';
import { authApi } from '@/services/api';
import type { RegisterCredentials } from '@/types';

export function useAuthActions() {
  const { setStudent, clearStudent, setLoading } = useAuth();

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await authApi.login(email, password);
      // Support both { data: { student } } and { data: student }
      const rawData = response.data as unknown as Record<string, unknown>;
      const rawStudent = (rawData?.student || rawData) as Record<string, unknown>;

      if (response.success && rawStudent && (rawStudent['id'] || rawStudent['_id'])) {
        const student = {
          ...rawStudent,
          _id: (rawStudent['_id'] || rawStudent['id']) as string,
          id: (rawStudent['id'] || rawStudent['_id']) as string,
          admissionNumber: (rawStudent['admissionNumber'] || rawStudent['admission_number']) as string,
          email: rawStudent['email'] as string,
          name: (rawStudent['name'] || rawStudent['full_name']) as string | undefined,
          emailVerified: Boolean(rawStudent['emailVerified'] ?? rawStudent['is_email_verified']),
          isEmailVerified: Boolean(rawStudent['isEmailVerified'] ?? rawStudent['is_email_verified']),
          lmsConnected: Boolean(rawStudent['lmsConnected']),
          createdAt: String(rawStudent['createdAt'] || rawStudent['created_at'] || new Date().toISOString()),
          updatedAt: String(rawStudent['updatedAt'] || rawStudent['updated_at'] || new Date().toISOString()),
        } as unknown as import('@/types').Student;

        setStudent(student);
        return { success: true };
      }
      return { success: false, message: response.message || 'Login failed' };
    } catch (err: unknown) {
      // Graceful offline fallback for demo account if backend is restarting/connecting
      if (
        email.toLowerCase() === 'demo@galgotiasuniversity.org' &&
        password === 'DemoStudent@123'
      ) {
        const demoStudent = {
          _id: '00000000-0000-0000-0000-000000000001',
          id: '00000000-0000-0000-0000-000000000001',
          admissionNumber: '21SCSE101001',
          email: 'demo@galgotiasuniversity.org',
          name: 'Aarav Sharma (Demo Student)',
          emailVerified: true,
          isEmailVerified: true,
          lmsConnected: true,
          lmsUsername: '21SCSE101001',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as unknown as import('@/types').Student;
        setStudent(demoStudent);
        return { success: true };
      }

      const error = err as { response?: { data?: { message?: string; error?: string } } };
      return {
        success: false,
        message:
          error.response?.data?.message ||
          error.response?.data?.error ||
          'Unable to reach backend server. Please ensure backend is running on port 3001.',
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      clearStudent();
    }
  };

  const register = async (data: RegisterCredentials) => {
    setLoading(true);
    try {
      const response = await authApi.register(data);
      return { success: response.success, message: response.message };
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string; error?: string; details?: string[] } } };
      const details = error.response?.data?.details?.join(', ');
      return {
        success: false,
        message: details || error.response?.data?.message || error.response?.data?.error || 'Registration failed',
      };
    } finally {
      setLoading(false);
    }
  };

  return { login, logout, register };
}
