import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { Settings, Plus, Trash2, Loader, UserPlus, ShieldCheck } from 'lucide-react';
import clientLogger from '../utils/logger';

const AdminCatalog = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── New Course Form State (only 2 fields — useState is fine here) ──────
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // ── New Admin Form State ────────────────────────────────────────────────
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminSuccessMsg, setAdminSuccessMsg] = useState('');

  // ── Query: Fetch all courses ───────────────────────────────────────────
  const {
    data: courses = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['adminCourses'],
    queryFn: () => apiFetch('/api/courses'),
  });

  // ── Mutation: Create a new course ──────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (newCourse) =>
      apiFetch('/api/courses', {
        method: 'POST',
        body: JSON.stringify(newCourse),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
      setNewTitle('');
      setNewDescription('');
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  // ── Mutation: Delete a course (optimistic) ─────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (courseId) =>
      apiFetch(`/api/courses/${courseId}`, {
        method: 'DELETE',
      }),
    onMutate: async (courseId) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['adminCourses'] });

      // Snapshot the previous value for rollback
      const previousCourses = queryClient.getQueryData(['adminCourses']);

      // Optimistically remove the course from the cache
      queryClient.setQueryData(['adminCourses'], (old) =>
        old?.filter(c => c._id !== courseId) || []
      );

      return { previousCourses };
    },
    onError: (err, courseId, context) => {
      // Rollback to previous value on error
      queryClient.setQueryData(['adminCourses'], context.previousCourses);
      alert(err.message);
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
    },
  });

  // ── Mutation: Invite a new Admin via Email ─────────────────────────────
  const createAdminMutation = useMutation({
    mutationFn: (adminData) =>
      apiFetch('/api/auth/invite-admin', {
        method: 'POST',
        body: JSON.stringify(adminData),
      }),
    onSuccess: (data) => {
      setAdminSuccessMsg(`Invitation email sent to "${adminEmail}"! They can click the link to set their password.`);
      setAdminName('');
      setAdminEmail('');
      setTimeout(() => setAdminSuccessMsg(''), 7000);
    },
    onError: (err) => {
      alert(err.message || 'Failed to send admin invitation');
    },
  });

  const handleCreateCourse = (e) => {
    e.preventDefault();
    if (!newTitle) return;
    createMutation.mutate({ title: newTitle, description: newDescription });
  };

  const handleCreateAdmin = (e) => {
    e.preventDefault();
    if (!adminName || !adminEmail) return;
    createAdminMutation.mutate({ name: adminName, email: adminEmail });
  };

  const handleDeleteCourse = (courseId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this course?')) return;
    deleteMutation.mutate(courseId);
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader className="animate-spin h-10 w-10 text-indigo-600" />
        <p className="text-gray-500 font-medium">Loading Administrator Console...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header Panel */}
      <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-md mb-10">
        <div className="flex items-center space-x-3">
          <div className="bg-violet-100 p-3 rounded-xl">
            <Settings className="h-6 w-6 text-violet-600" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900">Admin Panel</h1>
            <p className="text-sm text-gray-500 mt-1">
              Welcome back, administrator <span className="font-semibold text-violet-600">{user?.name}</span>.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-lg">
          <p className="text-sm text-red-700 font-medium">{error.message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left Panel: Course Catalog Grid */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-extrabold text-gray-900">Manage Course Curriculum</h2>
          <div className="grid grid-cols-1 gap-6">
            {courses.map((course) => (
              <div
                key={course._id}
                onClick={() => navigate(`/admin/courses/${course._id}`)}
                className="bg-white rounded-2xl border border-gray-100 p-6 shadow-md hover:shadow-lg transition-all duration-200 flex justify-between items-center cursor-pointer group"
              >
                <div>
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                    {course.title}
                  </h3>
                  <p className="text-gray-500 text-sm line-clamp-2 mt-1">{course.description}</p>
                </div>
                <button
                  onClick={(e) => handleDeleteCourse(course._id, e)}
                  className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel: Create Forms */}
        <div className="lg:col-span-1 space-y-8">
          {/* Create New Course Card */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-md">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center space-x-2">
              <Plus className="h-5 w-5 text-indigo-600" />
              <span>Create New Course</span>
            </h3>
            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Course Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., Algorithms & Structures"
                  className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Description</label>
                <textarea
                  rows="3"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Short course description summary..."
                  className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm resize-none"
                ></textarea>
              </div>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full bg-indigo-600 text-white font-semibold text-sm p-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Course'}
              </button>
            </form>
          </div>

          {/* Invite New Admin Card */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-md">
            <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center space-x-2">
              <UserPlus className="h-5 w-5 text-violet-600" />
              <span>Invite New Administrator</span>
            </h3>
            <p className="text-xs text-gray-500 mb-6">
              Send an email invitation link for a new course creator/admin to set their password and join.
            </p>

            {adminSuccessMsg && (
              <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3 mb-4 rounded-r-lg flex items-center space-x-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                <p className="text-xs text-emerald-800 font-medium">{adminSuccessMsg}</p>
              </div>
            )}

            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Full Name</label>
                <input
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="e.g., Dr. Sarah Jenkins"
                  className="w-full p-3 rounded-xl border border-gray-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Email Address</label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="instructor@university.edu"
                  className="w-full p-3 rounded-xl border border-gray-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={createAdminMutation.isPending}
                className="w-full bg-violet-600 text-white font-semibold text-sm p-3 rounded-xl hover:bg-violet-700 transition-colors shadow-sm disabled:opacity-50"
              >
                {createAdminMutation.isPending ? 'Sending Invitation...' : 'Send Admin Invitation Email'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminCatalog;
