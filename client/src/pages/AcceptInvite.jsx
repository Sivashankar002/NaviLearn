import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { ShieldCheck, Lock, ArrowRight, Loader, AlertCircle } from 'lucide-react';

const AcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { setAuthSession } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!token) {
      setErrorMsg('Invalid or missing invitation token link.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const data = await apiFetch('/api/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });

      // Automatically log new admin in using returned session data
      setAuthSession(data);
      navigate('/admin');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to activate account. The invitation link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
        <div className="bg-red-100 p-4 rounded-full mb-4">
          <AlertCircle className="h-10 w-10 text-red-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invitation Link</h2>
        <p className="text-gray-500 max-w-md mb-6">
          No invitation token was found in the URL. Please check your email invitation link or request a new invite from your administrator.
        </p>
        <button
          onClick={() => navigate('/')}
          className="bg-indigo-600 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors"
        >
          Go to Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-8 sm:p-10 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="bg-violet-100 p-4 rounded-2xl w-16 h-16 mx-auto flex items-center justify-center mb-4">
            <ShieldCheck className="h-8 w-8 text-violet-600" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">Activate Admin Account</h1>
          <p className="text-sm text-gray-500 mt-2">
            You've been invited as an Administrator on NaviLearn. Set your password to activate your account.
          </p>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-lg flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-xs text-red-700 font-medium">{errorMsg}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">New Password</label>
            <div className="relative">
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none text-sm"
              />
              <Lock className="h-5 w-5 text-gray-400 absolute left-3 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Confirm Password</label>
            <div className="relative">
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none text-sm"
              />
              <Lock className="h-5 w-5 text-gray-400 absolute left-3 top-3.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-violet-600 text-white font-semibold text-sm p-3.5 rounded-xl hover:bg-violet-700 transition-colors shadow-md flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader className="animate-spin h-5 w-5" />
                <span>Activating Account...</span>
              </>
            ) : (
              <>
                <span>Activate Account & Login</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AcceptInvite;
