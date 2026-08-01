import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import config from '../config';
import { BookOpen, CheckCircle, Play, Sparkles, Award, ArrowRight, Loader } from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer';
import clientLogger from '../utils/logger';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Local UI state (not server-fetched, so not managed by React Query) ──
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [activeModule, setActiveModule] = useState(null);

  // ── Heartbeat Ping: Send periodic ping to keep lastActive updated ──────
  useEffect(() => {
    // Send immediate initial ping on mount
    apiFetch('/api/learner/ping', { method: 'POST' }).catch(() => {});

    // Send heartbeat ping every 60 seconds
    const interval = setInterval(() => {
      apiFetch('/api/learner/ping', { method: 'POST' }).catch(() => {});
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // ── Query: Fetch all enrolled courses ──────────────────────────────────
  const {
    data: enrollments = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['enrollments'],
    queryFn: async () => {
      const data = await apiFetch('/api/learner/courses');
      return data.filter(c => c.status !== 'Not Enrolled');
    },
    select: (enrolled) => {
      // Auto-select the first active course on initial load
      if (!selectedCourseId && enrolled.length > 0) {
        const firstActive = enrolled.find(c => c.status === 'Active' || c.status === 'Completed');
        if (firstActive) {
          // Use setTimeout to avoid setting state during render
          setTimeout(() => setSelectedCourseId(firstActive._id), 0);
        }
      }
      return enrolled;
    },
  });

  // Derive the selected course object from the enrollments array
  const selectedCourse = enrollments.find(c => c._id === selectedCourseId) || null;

  // ── Query: Fetch timeline / learning path for the selected course ──────
  const {
    data: timelineData,
    isLoading: pathLoading,
  } = useQuery({
    queryKey: ['timeline', selectedCourseId],
    queryFn: () => apiFetch(`/api/learner/courses/${selectedCourseId}/path`),
    enabled: !!selectedCourseId && (selectedCourse?.status === 'Active' || selectedCourse?.status === 'Completed'),
  });

  // Auto-select the first active uncompleted module on load or course change
  useEffect(() => {
    if (timelineData?.path && !activeModule) {
      const firstActive = timelineData.path.find(m => !m.shouldSkip && !m.isCompleted);
      const fallback = timelineData.path.find(m => !m.shouldSkip);
      setActiveModule(firstActive || fallback || null);
    }
  }, [timelineData, activeModule]);

  // Calculate progress percentage dynamically based on timeline path completion
  const activeModules = timelineData?.path.filter(m => !m.shouldSkip) || [];
  const completedModules = activeModules.filter(m => m.isCompleted);
  const progressPercent = activeModules.length > 0
    ? Math.round((completedModules.length / activeModules.length) * 100)
    : 0;

  // ── Server-Sent Events (SSE) progress stream connection ───────────────
  useEffect(() => {
    if (!selectedCourseId || selectedCourse?.status !== 'Active') return;

    const token = localStorage.getItem('accessToken');
    const sseUrl = `${config.API_URL}/api/learner/courses/${selectedCourseId}/progress-stream?token=${token}`;

    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.triggerRefetch) {
          // Auto-refetch dashboard queries reactively upon progress change
          queryClient.invalidateQueries({ queryKey: ['timeline', selectedCourseId] });
          queryClient.invalidateQueries({ queryKey: ['enrollments'] });
        }
      } catch (err) {
        console.error('Error parsing SSE event data:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Connection Error:', err);
    };

    return () => {
      eventSource.close();
    };
  }, [selectedCourseId, selectedCourse?.status, queryClient]);

  // ── Mutation: Mark a module as complete ─────────────────────────────────
  const completeMutation = useMutation({
    mutationFn: (moduleId) =>
      apiFetch(`/api/learner/courses/${selectedCourseId}/modules/${moduleId}/complete`, {
        method: 'POST',
      }),
    onSuccess: () => {
      // Invalidate the timeline so it re-fetches with updated completion status
      queryClient.invalidateQueries({ queryKey: ['timeline', selectedCourseId] });
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  // ── Event handlers ─────────────────────────────────────────────────────
  const handleCourseSelect = (course) => {
    setSelectedCourseId(course._id);
    setActiveModule(null);
  };

  const handleMarkComplete = (moduleId) => {
    completeMutation.mutate(moduleId);
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader className="animate-spin h-10 w-10 text-indigo-600" />
        <p className="text-gray-500 font-medium">Loading Learner Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Welcome Banner */}
      <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-md mb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-100 p-3 rounded-xl">
              <BookOpen className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-gray-900">Learner Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">
                Welcome back, <span className="font-semibold text-indigo-600">{user?.name}</span>! Track and resume your study goals.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/courses')}
            className="flex items-center justify-center space-x-2 bg-indigo-600 text-white font-semibold text-sm px-5 py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm self-start md:self-auto"
          >
            <span>Explore Course Catalog</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-lg">
          <p className="text-sm text-red-700 font-medium">{error.message}</p>
        </div>
      )}

      {enrollments.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <Award className="mx-auto h-16 w-16 text-indigo-200" />
          <h2 className="mt-4 text-xl font-bold text-gray-900">No enrolled courses yet</h2>
          <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto mb-6">
            Get started by enrolling in one of our courses.
          </p>
          <button
            onClick={() => navigate('/courses')}
            className="bg-indigo-600 text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Browse Courses
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar: Course Selector */}
          <div className="lg:col-span-1 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Your Enrollments</h3>
            {enrollments.map((enrollment) => {
              const isSelected = selectedCourseId === enrollment._id;
              return (
                <button
                  key={enrollment._id}
                  onClick={() => handleCourseSelect(enrollment)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${isSelected
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                    : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50 bg-white'
                    }`}
                >
                  <h4 className="font-bold text-gray-900 text-sm line-clamp-1">{enrollment.title}</h4>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${enrollment.status === 'Active'
                      ? 'bg-green-100 text-green-700'
                      : enrollment.status === 'Completed'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-yellow-100 text-yellow-700'
                      }`}>
                      {enrollment.status}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Main Panel */}
          <div className="lg:col-span-3">
            {selectedCourse && selectedCourse.status === 'Onboarding' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-8 text-center">
                <Sparkles className="mx-auto h-12 w-12 text-yellow-500 animate-pulse" />
                <h3 className="mt-4 text-xl font-bold text-gray-900">Assessment Pending</h3>
                <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto mb-6">
                  Complete the onboarding quiz to get the personalized learning path.
                </p>
                <button
                  onClick={() => navigate(`/courses/${selectedCourse._id}/assessment`)}
                  className="bg-yellow-500 text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-yellow-600 transition-colors shadow-sm"
                >
                  Start Quiz
                </button>
              </div>
            )}

            {selectedCourse && (selectedCourse.status === 'Active' || selectedCourse.status === 'Completed') && (
              <div className="space-y-8">
                {/* Visual Progress Bar Card */}
                {timelineData && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-md">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-700">Course Progress</span>
                      <span className="text-sm font-extrabold text-indigo-600">{progressPercent}%</span>
                    </div>
                    <div className="w-full bg-gray-100 h-3.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-indigo-500 to-violet-600 h-full rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {pathLoading ? (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 flex flex-col items-center justify-center space-y-3">
                    <Loader className="animate-spin h-8 w-8 text-indigo-600" />
                    <p className="text-gray-500 text-sm font-medium">Updating path details...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Active study material and active custom timeline path */}
                    <div className="lg:col-span-2 space-y-8">
                      {/* Embedded Video Panel */}
                      {activeModule ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-md overflow-hidden">
                          <div className="aspect-video w-full bg-black">
                            <VideoPlayer url={activeModule.contentUrl} title={activeModule.title} />
                          </div>
                          <div className="p-6">
                            <div className="flex items-center justify-between mb-2">
                              <h2 className="text-2xl font-bold text-gray-900">{activeModule.title}</h2>
                              <span className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-3 py-1 rounded-full">
                                {activeModule.difficulty}
                              </span>
                            </div>
                            <p className="text-gray-500 text-sm leading-relaxed mb-6">{activeModule.contentText}</p>

                            <div className="flex items-center justify-between border-t border-gray-100 pt-6">
                              <span className="text-xs text-gray-400 font-medium">Estimated Duration: {activeModule.duration} mins</span>
                              {activeModule.shouldSkip ? (
                                <div className="flex items-center space-x-1.5 text-indigo-600 font-semibold text-xs bg-indigo-50 border border-indigo-100 px-3.5 py-2 rounded-xl">
                                  <Award className="h-4 w-4" />
                                  <span>Mastered (AI Bypassed)</span>
                                </div>
                              ) : activeModule.isCompleted ? (
                                <div className="flex items-center space-x-1.5 text-green-600 font-semibold text-sm">
                                  <CheckCircle className="h-5 w-5" />
                                  <span>Completed</span>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleMarkComplete(activeModule.moduleId)}
                                  disabled={completeMutation.isPending}
                                  className="bg-indigo-600 text-white font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                                >
                                  {completeMutation.isPending ? 'Updating...' : 'Mark Module as Complete'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-indigo-50/50 rounded-2xl border border-indigo-100 p-8 text-center">
                          <Award className="mx-auto h-12 w-12 text-indigo-500" />
                          <h3 className="mt-4 text-lg font-bold text-indigo-900">Congratulations!</h3>
                          <p className="text-indigo-700/80 text-sm max-w-xs mx-auto mt-2">
                            You have completed all active modules in this path!
                          </p>
                        </div>
                      )}

                      {/* Active Course Timeline Path */}
                      {timelineData && (() => {
                        const activeModulesList = timelineData.path.filter(m => !m.shouldSkip);

                        return (
                          <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-6">Your Personalized Course Path</h3>
                            {activeModulesList.length === 0 ? (
                              <p className="text-gray-500 text-sm italic text-center py-4">No active modules remaining in your path.</p>
                            ) : (
                              <div className="relative border-l border-gray-200 ml-4 space-y-8">
                                {activeModulesList.map((module, index) => {
                                  const isCurrentlyActive = activeModule?.moduleId === module.moduleId;
                                  return (
                                    <div key={module.moduleId} className="relative pl-8 group">
                                      {/* Timeline Bullet Indicator */}
                                      <div className={`absolute -left-[13px] top-1 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors ${module.isCompleted
                                        ? 'bg-green-500 border-green-500 text-white'
                                        : isCurrentlyActive
                                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                          : 'bg-white border-gray-300 text-gray-400'
                                        }`}>
                                        {module.isCompleted ? (
                                          <CheckCircle className="h-3.5 w-3.5" />
                                        ) : (
                                          <Play className="h-2.5 w-2.5 fill-current ml-0.5" />
                                        )}
                                      </div>

                                      <div className={`p-4 rounded-xl border transition-all ${isCurrentlyActive
                                        ? 'border-indigo-600 bg-indigo-50/20 shadow-sm'
                                        : 'border-gray-100 hover:border-indigo-200 bg-white'
                                        }`}>
                                        <div className="flex items-center justify-between">
                                          <h4 className="font-bold text-sm text-gray-900">
                                            {module.title}
                                          </h4>
                                          <button
                                            onClick={() => setActiveModule(module)}
                                            className={`text-xs font-semibold px-3 py-1 rounded-lg transition-colors ${isCurrentlyActive
                                              ? 'bg-indigo-600 text-white'
                                              : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                              }`}
                                          >
                                            View
                                          </button>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">{module.description}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Right Column: Mastered skills sidebar achievements */}
                    <div className="lg:col-span-1">
                      {timelineData && (() => {
                        const skippedModulesList = timelineData.path.filter(m => m.shouldSkip);
                        if (skippedModulesList.length === 0) return null;

                        return (
                          <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl border border-indigo-100 p-6 shadow-sm sticky top-6">
                            <div className="flex items-center space-x-2.5 mb-4">
                              <Award className="h-5 w-5 text-indigo-600 animate-bounce" />
                              <h3 className="text-sm font-extrabold text-indigo-900 uppercase tracking-wider">Fast-Tracked Skills</h3>
                            </div>
                            <p className="text-xs text-indigo-700/80 mb-5 leading-relaxed">
                              Based on your diagnostic assessment, you have been fast-tracked past these modules to optimize your learning. Click "View" to optionally study their content.
                            </p>
                            <div className="space-y-4">
                              {skippedModulesList.map((module) => {
                                const isCurrentlyActive = activeModule?.moduleId === module.moduleId;
                                return (
                                  <div key={module.moduleId} className={`bg-white rounded-xl border p-4 shadow-sm transition-all ${isCurrentlyActive ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-indigo-100/50'
                                    }`}>
                                    <div className="flex items-start justify-between space-x-2">
                                      <div className="flex items-center space-x-2 flex-1">
                                        <div className="bg-green-50 text-green-600 p-1 rounded-lg border border-green-200 shrink-0">
                                          <CheckCircle className="h-3.5 w-3.5" />
                                        </div>
                                        <h4 className="font-bold text-xs text-gray-800 line-clamp-1">{module.title}</h4>
                                      </div>
                                      <button
                                        onClick={() => setActiveModule(module)}
                                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-md transition-colors ${isCurrentlyActive
                                          ? 'bg-indigo-600 text-white'
                                          : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                          }`}
                                      >
                                        View
                                      </button>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-2 line-clamp-2">{module.description}</p>
                                    {module.reason && (
                                      <p className="text-[10px] font-semibold text-indigo-600 mt-2 bg-indigo-50/70 p-2 rounded-lg border border-indigo-100/30 leading-normal">
                                        💡 {module.reason}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
