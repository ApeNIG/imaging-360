import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

export function CallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { handleAuth0Callback, error, isLoading } = useAuthStore();

  useEffect(() => {
    const processCallback = async () => {
      // Check if this is an Auth0 callback (has code and state params)
      if (!searchParams.has('code') || !searchParams.has('state')) {
        navigate('/login', { replace: true });
        return;
      }

      try {
        await handleAuth0Callback();
        // Clear the URL params and redirect to sessions
        navigate('/sessions', { replace: true });
      } catch (err) {
        // Error is already set in the store, redirect to login
        navigate('/login', { replace: true });
      }
    };

    processCallback();
  }, [handleAuth0Callback, navigate, searchParams]);

  // Show error state if there's an error
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg text-center">
          <div className="text-red-600 mb-4">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Login Failed</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // Show loading state while processing
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
        <p className="mt-4 text-gray-600">
          {isLoading ? 'Completing sign in...' : 'Redirecting...'}
        </p>
      </div>
    </div>
  );
}
