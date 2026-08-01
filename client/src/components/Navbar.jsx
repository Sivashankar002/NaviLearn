import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, BookOpen, User as UserIcon } from 'lucide-react';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Hide user session controls on account activation page to prevent session collision
  const isAcceptInvitePage = location.pathname === '/accept-invite';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <BookOpen className="h-6 w-6 text-indigo-600" />
              <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                NaviLearn
              </span>
            </Link>
            {user && user.role === 'Learner' && (
              <div className="hidden sm:flex sm:space-x-6 sm:ml-10">
                <Link
                  to="/dashboard"
                  className="text-gray-500 hover:text-indigo-600 inline-flex items-center px-1 pt-1 text-sm font-semibold transition-colors duration-200"
                >
                  Dashboard
                </Link>
                <Link
                  to="/courses"
                  className="text-gray-500 hover:text-indigo-600 inline-flex items-center px-1 pt-1 text-sm font-semibold transition-colors duration-200"
                >
                  Catalog
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {!isAcceptInvitePage && user ? (
              <>
                <div className="flex items-center space-x-2 text-gray-700">
                  <div className="bg-indigo-50 p-1.5 rounded-full">
                    <UserIcon className="h-4 w-4 text-indigo-600" />
                  </div>
                  <span className="font-medium text-sm">{user.name}</span>
                  <span className="px-2 py-0.5 text-xs font-semibold text-indigo-800 bg-indigo-100 rounded-full">
                    {user.role}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-1 px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-red-600 bg-red-50 hover:bg-red-100 transition-colors duration-200 cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-gray-600 hover:text-indigo-600 px-3 py-2 text-sm font-medium transition-colors duration-200"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm hover:shadow transition-all duration-200"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
