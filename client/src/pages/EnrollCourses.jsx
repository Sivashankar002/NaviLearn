import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../utils/api';
import { BookOpen, CheckCircle, Play, ArrowRight, Loader } from 'lucide-react';

const EnrollCourses = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Query: Fetch all courses with learner enrollment status ────────────
  const {
    data: courses = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['learnerCourses'],
    queryFn: () => apiFetch('/api/learner/courses'),
  });

  // ── Mutation: Enroll in a course ───────────────────────────────────────
  const enrollMutation = useMutation({
    mutationFn: (courseId) =>
      apiFetch(`/api/learner/courses/${courseId}/enroll`, {
        method: 'POST',
      }),
    onSuccess: (data, courseId) => {
      // Invalidate course list so status updates from 'Not Enrolled' to 'Onboarding'
      queryClient.invalidateQueries({ queryKey: ['learnerCourses'] });
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      // Navigate to the placement assessment quiz directly
      navigate(`/courses/${courseId}/assessment`);
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader className="animate-spin h-10 w-10 text-indigo-600" />
        <p className="text-gray-500 font-medium">Loading course catalog...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">NaviLearn Course Catalog</h1>
        <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
          Discover and enroll in courses to start your adaptive learning journey.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-red-500">⚠</span>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 font-medium">{error.message}</p>
            </div>
          </div>
        </div>
      )}

      {courses.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">No courses available</h3>
          <p className="mt-1 text-sm text-gray-500">Check back later for new study resources.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {courses.map((course) => {
            const isEnrolling = enrollMutation.isPending && enrollMutation.variables === course._id;

            return (
              <div
                key={course._id}
                className="bg-white rounded-2xl border border-gray-100 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden"
              >
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{course.title}</h3>
                  <p className="text-gray-500 text-sm line-clamp-3">{course.description}</p>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    {course.status}
                  </span>

                  {course.status === 'Not Enrolled' && (
                    <button
                      onClick={() => enrollMutation.mutate(course._id)}
                      disabled={enrollMutation.isPending}
                      className={`flex items-center space-x-2 bg-indigo-600 text-white font-semibold text-sm px-4 py-2 rounded-xl transition-all shadow-sm ${
                        isEnrolling ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'
                      }`}
                    >
                      {isEnrolling ? (
                        <>
                          <Loader className="animate-spin h-4 w-4 text-white" />
                          <span>Enrolling...</span>
                        </>
                      ) : (
                        <>
                          <span>Enroll</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  )}

                {course.status === 'Onboarding' && (
                  <button
                    onClick={() => navigate(`/courses/${course._id}/assessment`)}
                    className="flex items-center space-x-2 bg-yellow-500 text-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-yellow-600 transition-colors shadow-sm"
                  >
                    <span>Take Assessment</span>
                    <Play className="h-4 w-4" />
                  </button>
                )}

                {course.status === 'Active' && (
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="flex items-center space-x-2 bg-green-600 text-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-green-700 transition-colors shadow-sm"
                  >
                    <span>Dashboard</span>
                    <CheckCircle className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
};

export default EnrollCourses;
