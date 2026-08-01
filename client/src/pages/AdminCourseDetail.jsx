import React, { useReducer, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import config from '../config';
// ▲ Import the centralized config object that reads VITE_API_URL from .env.
//   We need the raw API base URL to construct the EventSource URL below.
//   apiFetch() adds this automatically for REST calls, but EventSource
//   requires a full URL string since it's a browser-native API, not our wrapper.
import { Settings, Plus, Video, HelpCircle, ArrowLeft, Loader, Pencil, Trash2, X, Check, Mail, GitBranch, Clock } from 'lucide-react';
import clientLogger from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════
// REDUCERS — Centralized form state for modules (6 fields) and quizzes (4)
// ═══════════════════════════════════════════════════════════════════════════

const initialModuleForm = {
  title: '',
  description: '',
  contentUrl: '',
  contentText: '',
  duration: '',
  difficulty: 'Intermediate',
};

function moduleFormReducer(state, action) {
  switch (action.type) {
    case 'UPDATE_FIELD':
      return { ...state, [action.field]: action.value };
    case 'RESET':
      return initialModuleForm;
    default:
      return state;
  }
}

const initialQuizForm = {
  question: '',
  options: ['', '', '', ''],
  correctAnswer: '',
  skillTag: '',
};

function quizFormReducer(state, action) {
  switch (action.type) {
    case 'UPDATE_FIELD':
      return { ...state, [action.field]: action.value };
    case 'UPDATE_OPTION': {
      const updatedOptions = [...state.options];
      updatedOptions[action.index] = action.value;
      return { ...state, options: updatedOptions };
    }
    case 'RESET':
      return initialQuizForm;
    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * timeAgo(dateString) → "2 hours ago", "3 days ago", "just now"
 * Converts an ISO date string into a human-readable relative timestamp.
 * No external library needed — uses simple arithmetic on Date.now() delta.
 */
function timeAgo(dateString) {
  if (!dateString) return 'Never';
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * getHeatmapColor(percent) → CSS color string
 * Returns a gradient color based on the stuck-learner percentage:
 *   0-10%  → green  (low concern)
 *   10-30% → yellow (moderate)
 *   30-50% → orange (high concern)
 *   50%+   → red    (critical)
 */
function getHeatmapColor(percent) {
  if (percent <= 0) return '#e5e7eb';   // gray-200 (no stuck learners)
  if (percent <= 10) return '#22c55e';  // green-500
  if (percent <= 30) return '#eab308';  // yellow-500
  if (percent <= 50) return '#f97316';  // orange-500
  return '#ef4444';                      // red-500
}

/**
 * getVarianceLabel(value) → { text, color } for Path Personalization Variance
 * Classifies the variance into interpretive bands.
 */
function getVarianceLabel(value) {
  if (value < 15) return { text: 'Minimal', color: 'text-gray-500' };
  if (value < 50) return { text: 'Healthy', color: 'text-green-600' };
  return { text: 'High Divergence', color: 'text-amber-600' };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const AdminCourseDetail = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Form state via useReducer ──────────────────────────────────────────
  const [modForm, dispatchMod] = useReducer(moduleFormReducer, initialModuleForm);
  const [quizForm, dispatchQuiz] = useReducer(quizFormReducer, initialQuizForm);

  // ── Inline edit state ──────────────────────────────────────────────────
  // Tracks which module/question is being edited and holds the draft values.
  // `null` means nothing is being edited.
  const [editingModuleId, setEditingModuleId] = useState(null);
  const [editModuleData, setEditModuleData] = useState({});
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [editQuestionData, setEditQuestionData] = useState({});
  const [editingCourse, setEditingCourse] = useState(false);
  const [editCourseData, setEditCourseData] = useState({ title: '', description: '' });
  const [activeTab, setActiveTab] = useState('curriculum'); // 'curriculum' or 'analytics'
  const [curriculumSubTab, setCurriculumSubTab] = useState('modules'); // 'modules' or 'assessment'
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 10;

  // ── Query: Fetch course analytics for stats and student logs ───────────
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['courseAnalytics', courseId],
    queryFn: () => apiFetch(`/api/courses/${courseId}/analytics`),
    enabled: activeTab === 'analytics',
    staleTime: 0, // Override global 2m cache: always fetch fresh on mount for real-time dashboards
  });

  const filteredLearners = (analytics?.learners || []).filter(learner =>
    learner.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    learner.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination computed values
  const totalPages = Math.max(1, Math.ceil(filteredLearners.length / ROWS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLearners = filteredLearners.slice(
    (safePage - 1) * ROWS_PER_PAGE,
    safePage * ROWS_PER_PAGE
  );

  // ═══════════════════════════════════════════════════════════════════════
  // SSE STREAM — Real-time admin analytics auto-refresh
  // ═══════════════════════════════════════════════════════════════════════
  //
  // This useEffect establishes a Server-Sent Events connection to the
  // backend ONLY when the admin is viewing the 'analytics' tab.
  // When a learner marks a module as complete, the server pushes an SSE
  // message through this connection, and we invalidate the React Query
  // cache to trigger an automatic re-fetch of the analytics data.
  //
  // The connection is automatically closed when:
  //   - The admin switches to the 'curriculum' tab (useEffect cleanup)
  //   - The admin navigates away from this page (component unmount)
  //   - The courseId changes (dependency array triggers re-run)
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    // ▲ useEffect(callback, dependencies)
    //   React calls this callback after every render where any value in
    //   the dependency array [courseId, activeTab, queryClient] has changed.
    //   On the first render, it always runs.

    if (activeTab !== 'analytics') return;
    // ▲ Guard clause: only connect to the SSE stream when the admin is
    //   actually viewing the analytics tab. If they're on 'curriculum',
    //   there's no point in keeping an open connection — it would waste
    //   server resources and a network socket for no visible benefit.
    //   Returning early from useEffect means no cleanup function is
    //   registered, which is correct (nothing to clean up).

    const token = localStorage.getItem('accessToken');
    // ▲ Retrieve the JWT access token from the browser's localStorage.
    //   The SSE endpoint requires authentication. Unlike fetch() where we
    //   can set Authorization headers, the browser's native EventSource API
    //   does NOT support custom headers. So we pass the token as a URL
    //   query parameter instead: ?token=eyJ...
    //   The server's `protect` middleware already handles this pattern
    //   (it checks req.query.token as a fallback when no Authorization
    //   header is present — see auth.js line 10-11).

    const sseUrl = `${config.API_URL}/api/courses/${courseId}/analytics-stream?token=${token}`;
    // ▲ Construct the full SSE endpoint URL.
    //   config.API_URL = 'http://localhost:5000' (from .env.development)
    //   courseId = the MongoDB ObjectId of the current course
    //   token = the JWT for authentication
    //   Example result: 'http://localhost:5000/api/courses/abc123/analytics-stream?token=eyJ...'

    const eventSource = new EventSource(sseUrl);
    // ▲ Create a new EventSource connection.
    //   EventSource is a browser-native API (part of the HTML5 spec).
    //   It opens an HTTP GET request to the URL and keeps the connection
    //   open, listening for server-pushed messages. Key behaviors:
    //     - Automatic reconnection: if the connection drops, the browser
    //       will retry after a few seconds (built-in, no code needed)
    //     - Lightweight: one-directional (server → client only)
    //     - Simple: no WebSocket upgrade handshake required

    eventSource.onmessage = (event) => {
      // ▲ .onmessage is called every time the server sends a message.
      //   `event.data` contains the string payload from the server's
      //   res.write(`data: {...}\n\n`) call.

      try {
        const payload = JSON.parse(event.data);
        // ▲ Parse the JSON string into a JavaScript object.
        //   Expected payload: { triggerRefetch: true } or { status: 'connected' }

        if (payload.triggerRefetch) {
          // ▲ The server sent this flag when a learner completed a module.
          //   We respond by invalidating the React Query cache for analytics.

          queryClient.invalidateQueries({ queryKey: ['courseAnalytics', courseId] });
          // ▲ .invalidateQueries() marks the cached data as "stale".
          //   Because the analytics query has `enabled: activeTab === 'analytics'`
          //   and we ARE on the analytics tab, React Query immediately triggers
          //   a background re-fetch of GET /api/courses/:id/analytics.
          //   When the fresh data arrives, the component re-renders with
          //   updated metrics (progress bars, completion rates, health scores).
          //
          //   This is the final step in the real-time update chain:
          //     Learner clicks "Complete" → Server emits eventBus event
          //     → SSE pushes to admin → React Query re-fetches → UI updates
        }
      } catch (err) {
        console.error('Error parsing Admin SSE payload:', err);
        // ▲ Safety net: if the server sends malformed JSON (e.g., during
        //   a deployment or server restart), we log the error but don't
        //   crash the admin's page. The EventSource will continue listening.
      }
    };

    eventSource.onerror = (err) => {
      console.error('Admin Analytics SSE connection error:', err);
      // ▲ Fires when the SSE connection encounters a network error.
      //   Common causes: server restart, network flap, or token expiration.
      //   The browser's EventSource automatically attempts to reconnect,
      //   so we only need to log the error for debugging purposes.
    };

    return () => {
      eventSource.close();
      // ▲ useEffect cleanup function.
      //   React calls this BEFORE re-running the effect (e.g., when
      //   activeTab changes from 'analytics' to 'curriculum') and when
      //   the component unmounts (admin navigates away).
      //
      //   .close() terminates the SSE connection from the client side.
      //   This triggers the server's req.on('close') handler in courses.js,
      //   which removes this admin from the activeAdminStreams Map and
      //   clears the heartbeat interval.
      //
      //   Without this cleanup, switching tabs would leak connections:
      //   each tab switch would open a NEW EventSource without closing
      //   the previous one, causing duplicate messages and memory leaks.
    };
  }, [courseId, activeTab, queryClient]);
  // ▲ Dependency array: React re-runs this effect when any of these change.
  //   - courseId: admin navigates to a different course's analytics
  //   - activeTab: admin switches between 'curriculum' and 'analytics'
  //   - queryClient: stable reference (included for exhaustive-deps lint rule)

  // ── CSV Export Helper: converts learner list to downloadable spreadsheet ──
  const handleExportCSV = () => {
    if (!analytics?.learners) return;
    const headers = ['Name', 'Email', 'Status', 'Progress (%)', 'Avg Assessment Score (%)', 'Days Inactive', 'Last Active', 'Emails Sent', 'Health Score', 'Health Status'];
    const rows = analytics.learners.map(l => [
      `"${l.name.replace(/"/g, '""')}"`,
      `"${l.email.replace(/"/g, '""')}"`,
      `"${l.status}"`,
      l.progress,
      l.avgAssessmentScore,
      l.daysInactive,
      `"${l.lastActive ? new Date(l.lastActive).toISOString() : 'N/A'}"`,
      l.emailsSent || 0,
      l.healthScore,
      `"${l.healthStatus}"`
    ]);
    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${course?.title ? course.title.replace(/\s+/g, '_') : 'course'}_learner_progress.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Query: Fetch single course details ─────────────────────────────────
  const {
    data: course,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['adminCourse', courseId],
    queryFn: () => apiFetch(`/api/courses/${courseId}`),
  });

  // ═══════════════════════════════════════════════════════════════════════
  // COURSE INFO MUTATION
  // ═══════════════════════════════════════════════════════════════════════

  const editCourseMutation = useMutation({
    mutationFn: (data) =>
      apiFetch(`/api/courses/${courseId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCourse', courseId] });
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
      setEditingCourse(false);
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE MUTATIONS
  // ═══════════════════════════════════════════════════════════════════════

  // ── Mutation: Add a module ─────────────────────────────────────────────
  const addModuleMutation = useMutation({
    mutationFn: (moduleData) =>
      apiFetch(`/api/courses/${courseId}/modules`, {
        method: 'POST',
        body: JSON.stringify(moduleData),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCourse', courseId] });
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
      dispatchMod({ type: 'RESET' });
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  // ── Mutation: Edit a module ────────────────────────────────────────────
  const editModuleMutation = useMutation({
    mutationFn: ({ moduleId, data }) =>
      apiFetch(`/api/courses/${courseId}/modules/${moduleId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCourse', courseId] });
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
      setEditingModuleId(null);
      setEditModuleData({});
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  // ── Mutation: Delete a module ──────────────────────────────────────────
  const deleteModuleMutation = useMutation({
    mutationFn: (moduleId) =>
      apiFetch(`/api/courses/${courseId}/modules/${moduleId}`, {
        method: 'DELETE',
      }),
    onMutate: async (moduleId) => {
      await queryClient.cancelQueries({ queryKey: ['adminCourse', courseId] });
      const previousCourse = queryClient.getQueryData(['adminCourse', courseId]);
      queryClient.setQueryData(['adminCourse', courseId], (old) => {
        if (!old) return old;
        return { ...old, modules: old.modules.filter(m => m._id !== moduleId) };
      });
      return { previousCourse };
    },
    onError: (err, moduleId, context) => {
      queryClient.setQueryData(['adminCourse', courseId], context.previousCourse);
      alert(err.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCourse', courseId] });
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
    },
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ASSESSMENT QUESTION MUTATIONS
  // ═══════════════════════════════════════════════════════════════════════

  // ── Mutation: Add a quiz question ──────────────────────────────────────
  const addQuestionMutation = useMutation({
    mutationFn: (questionData) =>
      apiFetch(`/api/courses/${courseId}/assessment`, {
        method: 'POST',
        body: JSON.stringify(questionData),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCourse', courseId] });
      dispatchQuiz({ type: 'RESET' });
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  // ── Mutation: Edit a quiz question ─────────────────────────────────────
  const editQuestionMutation = useMutation({
    mutationFn: ({ questionId, data }) =>
      apiFetch(`/api/courses/${courseId}/assessment/${questionId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCourse', courseId] });
      setEditingQuestionId(null);
      setEditQuestionData({});
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  // ── Mutation: Delete a quiz question ───────────────────────────────────
  const deleteQuestionMutation = useMutation({
    mutationFn: (questionId) =>
      apiFetch(`/api/courses/${courseId}/assessment/${questionId}`, {
        method: 'DELETE',
      }),
    onMutate: async (questionId) => {
      await queryClient.cancelQueries({ queryKey: ['adminCourse', courseId] });
      const previousCourse = queryClient.getQueryData(['adminCourse', courseId]);
      queryClient.setQueryData(['adminCourse', courseId], (old) => {
        if (!old) return old;
        return { ...old, assessment: old.assessment.filter(q => q._id !== questionId) };
      });
      return { previousCourse };
    },
    onError: (err, questionId, context) => {
      queryClient.setQueryData(['adminCourse', courseId], context.previousCourse);
      alert(err.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCourse', courseId] });
    },
  });

  // ═══════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  const handleAddModule = (e) => {
    e.preventDefault();
    if (!modForm.title || !modForm.duration) return;

    addModuleMutation.mutate({
      title: modForm.title,
      description: modForm.description,
      contentUrl: modForm.contentUrl,
      contentText: modForm.contentText,
      duration: Number(modForm.duration),
      difficulty: modForm.difficulty,
    });
  };

  const handleAddQuestion = (e) => {
    e.preventDefault();
    if (!quizForm.question || !quizForm.correctAnswer || !quizForm.skillTag) return;
    if (quizForm.options.some(opt => !opt)) {
      alert('Please fill out all 4 options.');
      return;
    }

    addQuestionMutation.mutate({
      question: quizForm.question,
      options: quizForm.options,
      correctAnswer: quizForm.correctAnswer,
      skillTag: quizForm.skillTag,
    });
  };

  // ── Module edit/delete handlers ────────────────────────────────────────
  const startEditModule = (m) => {
    setEditingModuleId(m._id);
    setEditModuleData({
      title: m.title,
      description: m.description || '',
      contentUrl: m.contentUrl || '',
      contentText: m.contentText || '',
      duration: m.duration,
      difficulty: m.difficulty || 'Intermediate',
    });
  };

  const cancelEditModule = () => {
    setEditingModuleId(null);
    setEditModuleData({});
  };

  const saveEditModule = () => {
    if (!editModuleData.title || !editModuleData.duration) return;
    editModuleMutation.mutate({
      moduleId: editingModuleId,
      data: { ...editModuleData, duration: Number(editModuleData.duration) },
    });
  };

  const handleDeleteModule = (moduleId) => {
    if (!window.confirm('Are you sure you want to delete this module?')) return;
    deleteModuleMutation.mutate(moduleId);
  };

  // ── Question edit/delete handlers ──────────────────────────────────────
  const startEditQuestion = (q) => {
    setEditingQuestionId(q._id);
    setEditQuestionData({
      question: q.question,
      options: [...q.options],
      correctAnswer: q.correctAnswer,
      skillTag: q.skillTag,
    });
  };

  const cancelEditQuestion = () => {
    setEditingQuestionId(null);
    setEditQuestionData({});
  };

  const saveEditQuestion = () => {
    if (!editQuestionData.question || !editQuestionData.correctAnswer || !editQuestionData.skillTag) return;
    if (editQuestionData.options.some(opt => !opt)) {
      alert('Please fill out all 4 options.');
      return;
    }
    editQuestionMutation.mutate({
      questionId: editingQuestionId,
      data: editQuestionData,
    });
  };

  const handleDeleteQuestion = (questionId) => {
    if (!window.confirm('Are you sure you want to delete this question?')) return;
    deleteQuestionMutation.mutate(questionId);
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader className="animate-spin h-10 w-10 text-indigo-600" />
        <p className="text-gray-500 font-medium">Loading course details...</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-center">
        <p className="text-gray-500">Course not found.</p>
        <button onClick={() => navigate('/admin')} className="mt-4 text-indigo-600 font-semibold hover:underline">
          Back to Admin Panel
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header Panel */}
      <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-md mb-10">
        <div className="flex items-center justify-between">
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
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center space-x-2 bg-gray-100 text-gray-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-gray-200 transition-all shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Catalog</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-lg">
          <p className="text-sm text-red-700 font-medium">{error.message}</p>
        </div>
      )}

      {/* Tab Switcher Headers */}
      <div className="flex border-b border-gray-200 mb-8">
        <button
          onClick={() => setActiveTab('curriculum')}
          className={`py-3 px-6 font-bold text-sm border-b-2 transition-all ${activeTab === 'curriculum'
            ? 'border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-indigo-600'
            }`}
        >
          Curriculum Builder
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`py-3 px-6 font-bold text-sm border-b-2 transition-all ${activeTab === 'analytics'
            ? 'border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-indigo-600'
            }`}
        >
          Learner Analytics
        </button>
      </div>

      {activeTab === 'curriculum' ? (
        <div className="space-y-6">
          {/* Sub-tab Switcher */}
          <div className="flex space-x-1.5 bg-gray-100 p-1.5 rounded-xl self-start w-fit">
            <button
              onClick={() => setCurriculumSubTab('modules')}
              className={`px-5 py-2.5 text-xs font-bold rounded-lg transition-all ${
                curriculumSubTab === 'modules'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-indigo-600'
              }`}
            >
              Course Modules ({course.modules?.length || 0})
            </button>
            <button
              onClick={() => setCurriculumSubTab('assessment')}
              className={`px-5 py-2.5 text-xs font-bold rounded-lg transition-all ${
                curriculumSubTab === 'assessment'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-indigo-600'
              }`}
            >
              Assessment Questions ({course.assessment?.length || 0})
            </button>
          </div>

          {curriculumSubTab === 'modules' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Course details edit panel + Modules List */}
              <div className="lg:col-span-2 space-y-8">
                {/* Course Metadata Card */}
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-md">
                  {editingCourse ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Course Title</label>
                        <input
                          type="text"
                          value={editCourseData.title}
                          onChange={(e) => setEditCourseData({ ...editCourseData, title: e.target.value })}
                          className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Description</label>
                        <textarea
                          rows="3"
                          value={editCourseData.description}
                          onChange={(e) => setEditCourseData({ ...editCourseData, description: e.target.value })}
                          className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm resize-none"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            if (!editCourseData.title) return;
                            editCourseMutation.mutate({ title: editCourseData.title, description: editCourseData.description });
                          }}
                          disabled={editCourseMutation.isPending}
                          className="flex items-center space-x-1 bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" />
                          <span>{editCourseMutation.isPending ? 'Saving...' : 'Save'}</span>
                        </button>
                        <button
                          onClick={() => setEditingCourse(false)}
                          className="flex items-center space-x-1 bg-gray-100 text-gray-700 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-gray-200 transition-colors"
                        >
                          <X className="h-4 w-4" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">{course.title}</h2>
                        <p className="text-gray-500 text-sm mt-2">{course.description}</p>
                      </div>
                      <button
                        onClick={() => {
                          setEditCourseData({ title: course.title, description: course.description || '' });
                          setEditingCourse(true);
                        }}
                        className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors"
                        title="Edit course info"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Modules List */}
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-md">
                  <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center space-x-2">
                    <Video className="h-5 w-5 text-indigo-600" />
                    <span>Modules ({course.modules?.length || 0})</span>
                  </h3>
                  {course.modules?.length === 0 ? (
                    <p className="text-gray-500 text-sm italic">No modules added yet. Add your first video resource below.</p>
                  ) : (
                    <div className="space-y-4">
                      {course.modules.map((m, idx) => (
                        <div key={m._id || idx} className="p-4 rounded-xl border border-gray-100 transition-all">
                          {editingModuleId === m._id ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <input
                                  type="text"
                                  value={editModuleData.title}
                                  onChange={(e) => setEditModuleData(prev => ({ ...prev, title: e.target.value }))}
                                  placeholder="Module Title"
                                  className="w-full p-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                                />
                                <input
                                  type="text"
                                  value={editModuleData.description}
                                  onChange={(e) => setEditModuleData(prev => ({ ...prev, description: e.target.value }))}
                                  placeholder="Description"
                                  className="w-full p-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                                />
                              </div>
                              <input
                                type="url"
                                value={editModuleData.contentUrl}
                                onChange={(e) => setEditModuleData(prev => ({ ...prev, contentUrl: e.target.value }))}
                                placeholder="YouTube Embed URL"
                                className="w-full p-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                              />
                              <textarea
                                rows="2"
                                value={editModuleData.contentText}
                                onChange={(e) => setEditModuleData(prev => ({ ...prev, contentText: e.target.value }))}
                                placeholder="Study content text"
                                className="w-full p-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm resize-none"
                              ></textarea>
                              <div className="grid grid-cols-2 gap-3">
                                <input
                                  type="number"
                                  value={editModuleData.duration}
                                  onChange={(e) => setEditModuleData(prev => ({ ...prev, duration: e.target.value }))}
                                  placeholder="Duration (mins)"
                                  className="w-full p-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                                />
                                <select
                                  value={editModuleData.difficulty}
                                  onChange={(e) => setEditModuleData(prev => ({ ...prev, difficulty: e.target.value }))}
                                  className="w-full p-2.5 rounded-lg border border-gray-200 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                                >
                                  <option value="Beginner">Beginner</option>
                                  <option value="Intermediate">Intermediate</option>
                                  <option value="Advanced">Advanced</option>
                                </select>
                              </div>
                              <div className="flex items-center space-x-2 pt-1">
                                <button
                                  onClick={saveEditModule}
                                  disabled={editModuleMutation.isPending}
                                  className="flex items-center space-x-1.5 bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  <span>{editModuleMutation.isPending ? 'Saving...' : 'Save'}</span>
                                </button>
                                <button
                                  onClick={cancelEditModule}
                                  className="flex items-center space-x-1.5 bg-gray-100 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  <span>Cancel</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center">
                              <div>
                                <h4 className="font-bold text-gray-900 text-sm">{m.title}</h4>
                                <p className="text-gray-500 text-xs mt-1">{m.description || 'No description'}</p>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2.5 py-1 rounded-full">
                                  {m.duration} mins
                                </div>
                                <button
                                  onClick={() => startEditModule(m)}
                                  className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                  title="Edit module"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteModule(m._id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete module"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Add Module Form */}
              <div className="lg:col-span-1">
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-md">
                  <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center space-x-2">
                    <Plus className="h-5 w-5 text-indigo-600" />
                    <span>Add Module</span>
                  </h3>
                  <form onSubmit={handleAddModule} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Module Title</label>
                      <input
                        type="text"
                        required
                        value={modForm.title}
                        onChange={(e) => dispatchMod({ type: 'UPDATE_FIELD', field: 'title', value: e.target.value })}
                        placeholder="e.g., Arrays Deep Dive"
                        className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Description</label>
                      <input
                        type="text"
                        value={modForm.description}
                        onChange={(e) => dispatchMod({ type: 'UPDATE_FIELD', field: 'description', value: e.target.value })}
                        placeholder="Brief details..."
                        className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">YouTube Embed URL</label>
                      <input
                        type="url"
                        required
                        value={modForm.contentUrl}
                        onChange={(e) => dispatchMod({ type: 'UPDATE_FIELD', field: 'contentUrl', value: e.target.value })}
                        placeholder="https://www.youtube.com/embed/..."
                        className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Study Content Text</label>
                      <textarea
                        rows="2"
                        value={modForm.contentText}
                        onChange={(e) => dispatchMod({ type: 'UPDATE_FIELD', field: 'contentText', value: e.target.value })}
                        placeholder="Theoretical explanation context..."
                        className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm resize-none"
                      ></textarea>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Duration (mins)</label>
                        <input
                          type="number"
                          required
                          value={modForm.duration}
                          onChange={(e) => dispatchMod({ type: 'UPDATE_FIELD', field: 'duration', value: e.target.value })}
                          placeholder="e.g., 20"
                          className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Difficulty</label>
                        <select
                          value={modForm.difficulty}
                          onChange={(e) => dispatchMod({ type: 'UPDATE_FIELD', field: 'difficulty', value: e.target.value })}
                          className="w-full p-3 rounded-xl border border-gray-200 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                        >
                          <option value="Beginner">Beginner</option>
                          <option value="Intermediate">Intermediate</option>
                          <option value="Advanced">Advanced</option>
                        </select>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={addModuleMutation.isPending}
                      className="w-full bg-indigo-600 text-white font-semibold text-sm p-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {addModuleMutation.isPending ? 'Adding...' : 'Add Module'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Assessment Questions List */}
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-md">
                  <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center space-x-2">
                    <HelpCircle className="h-5 w-5 text-indigo-600" />
                    <span>Assessment Questions ({course.assessment?.length || 0})</span>
                  </h3>
                  {course.assessment?.length === 0 ? (
                    <p className="text-gray-500 text-sm italic">No diagnostic questions added yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {course.assessment.map((q, idx) => (
                        <div key={q._id || idx} className="p-4 rounded-xl border border-gray-100 transition-all">
                          {editingQuestionId === q._id ? (
                            <div className="space-y-3">
                              <input
                                type="text"
                                value={editQuestionData.question}
                                onChange={(e) => setEditQuestionData(prev => ({ ...prev, question: e.target.value }))}
                                placeholder="Question text"
                                className="w-full p-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                              />
                              <div className="space-y-2">
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Options</label>
                                {editQuestionData.options.map((opt, optIdx) => (
                                  <input
                                    key={optIdx}
                                    type="text"
                                    value={opt}
                                    onChange={(e) => {
                                      const newOptions = [...editQuestionData.options];
                                      newOptions[optIdx] = e.target.value;
                                      setEditQuestionData(prev => ({ ...prev, options: newOptions }));
                                    }}
                                    placeholder={`Option ${optIdx + 1}`}
                                    className="w-full p-2 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                                  />
                                ))}
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <input
                                  type="text"
                                  value={editQuestionData.correctAnswer}
                                  onChange={(e) => setEditQuestionData(prev => ({ ...prev, correctAnswer: e.target.value }))}
                                  placeholder="Correct Answer"
                                  className="w-full p-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                                />
                                <input
                                  type="text"
                                  value={editQuestionData.skillTag}
                                  onChange={(e) => setEditQuestionData(prev => ({ ...prev, skillTag: e.target.value }))}
                                  placeholder="Skill Tag"
                                  className="w-full p-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                                />
                              </div>
                              <div className="flex items-center space-x-2 pt-1">
                                <button
                                  onClick={saveEditQuestion}
                                  disabled={editQuestionMutation.isPending}
                                  className="flex items-center space-x-1.5 bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  <span>{editQuestionMutation.isPending ? 'Saving...' : 'Save'}</span>
                                </button>
                                <button
                                  onClick={cancelEditQuestion}
                                  className="flex items-center space-x-1.5 bg-gray-100 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  <span>Cancel</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="flex justify-between items-start">
                                <h4 className="font-bold text-gray-900 text-sm max-w-[70%]">{q.question}</h4>
                                <div className="flex items-center space-x-2">
                                  <span className="text-[10px] uppercase font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">
                                    {q.skillTag}
                                  </span>
                                  <button
                                    onClick={() => startEditQuestion(q)}
                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                    title="Edit question"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteQuestion(q._id)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete question"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-green-600 font-medium mt-2">Correct Answer: {q.correctAnswer}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Add Quiz Question Form */}
              <div className="lg:col-span-1">
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-md">
                  <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center space-x-2">
                    <Plus className="h-5 w-5 text-indigo-600" />
                    <span>Add Quiz Question</span>
                  </h3>
                  <form onSubmit={handleAddQuestion} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Question Text</label>
                      <input
                        type="text"
                        required
                        value={quizForm.question}
                        onChange={(e) => dispatchQuiz({ type: 'UPDATE_FIELD', field: 'question', value: e.target.value })}
                        placeholder="e.g., What is stack insertion?"
                        className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Options (4 Required)</label>
                      {quizForm.options.map((opt, index) => (
                        <input
                          key={index}
                          type="text"
                          required
                          value={opt}
                          onChange={(e) => dispatchQuiz({ type: 'UPDATE_OPTION', index, value: e.target.value })}
                          placeholder={`Option ${index + 1}`}
                          className="w-full p-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                        />
                      ))}
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Correct Answer (Must match an option exactly)</label>
                      <input
                        type="text"
                        required
                        value={quizForm.correctAnswer}
                        onChange={(e) => dispatchQuiz({ type: 'UPDATE_FIELD', field: 'correctAnswer', value: e.target.value })}
                        placeholder="e.g., LIFO"
                        className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Skill Tag Category</label>
                      <input
                        type="text"
                        required
                        value={quizForm.skillTag}
                        onChange={(e) => dispatchQuiz({ type: 'UPDATE_FIELD', field: 'skillTag', value: e.target.value })}
                        placeholder="e.g., Stacks"
                        className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={addQuestionMutation.isPending}
                      className="w-full bg-indigo-600 text-white font-semibold text-sm p-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {addQuestionMutation.isPending ? 'Adding...' : 'Add Question'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Render Analytics Panel ────────────────────────────────── */
        <div className="space-y-8">
          {analyticsLoading ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 flex flex-col items-center justify-center space-y-4">
              <Loader className="animate-spin h-8 w-8 text-indigo-600" />
              <p className="text-gray-500 text-sm font-semibold">Generating analytics report...</p>
            </div>
          ) : analytics ? (
            <>
              {/* Summary Cards — 6-card grid: 3 per row on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-md">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Enrolled Learners</span>
                  <h3 className="text-3xl font-extrabold text-gray-900 mt-1">{analytics.summary.totalLearners}</h3>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-md">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Overall Completion Rate</span>
                  <h3 className="text-3xl font-extrabold text-indigo-600 mt-1">{analytics.summary.overallCompletionRate}%</h3>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-md">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Average Progress</span>
                  <h3 className="text-3xl font-extrabold text-violet-600 mt-1">{analytics.summary.averageProgress}%</h3>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-md">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Avg Path Generation</span>
                  <h3 className="text-3xl font-extrabold text-teal-600 mt-1">
                    {analytics.avgPathGenerationTimeMs ? `${(analytics.avgPathGenerationTimeMs / 1000).toFixed(1)}s` : '0s'}
                  </h3>
                </div>

                {/* NEW Card 5: Email Delivery Rate */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-md">
                  <div className="flex items-center space-x-2 mb-1">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Email Delivery Rate</span>
                  </div>
                  <h3 className={`text-3xl font-extrabold mt-1 ${analytics.emailDeliveryRate >= 90 ? 'text-green-600'
                    : analytics.emailDeliveryRate >= 70 ? 'text-yellow-600'
                      : 'text-red-600'
                    }`}>
                    {analytics.emailDeliveryRate ?? 100}%
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-1">Sent / (Sent + Failed)</p>
                </div>

                {/* NEW Card 6: Path Personalization Variance */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-md">
                  <div className="flex items-center space-x-2 mb-1">
                    <GitBranch className="h-4 w-4 text-gray-400" />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Path Personalization</span>
                  </div>
                  <h3 className="text-3xl font-extrabold text-purple-600 mt-1">
                    {analytics.pathPersonalizationVariance ?? 0}%
                  </h3>
                  {(() => {
                    const label = getVarianceLabel(analytics.pathPersonalizationVariance ?? 0);
                    return <p className={`text-[10px] font-semibold mt-1 ${label.color}`}>{label.text}</p>;
                  })()}
                </div>
              </div>

              {/* Health Distribution & Struggling Area highlight */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className={`${analytics.dropOffPoint ? 'lg:col-span-2' : 'lg:col-span-3'} bg-white rounded-2xl border border-gray-100 p-6 shadow-md flex items-center justify-between`}>
                  <h4 className="text-sm font-bold text-gray-900">Learner Health Distribution</h4>
                  <div className="flex items-center space-x-4 text-xs font-semibold">
                    <span className="text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-200">
                      Healthy: {analytics.healthDistribution?.Healthy || 0}
                    </span>
                    <span className="text-yellow-700 bg-yellow-50 px-3 py-1 rounded-full border border-yellow-200">
                      At-Risk: {analytics.healthDistribution?.['At-Risk'] || 0}
                    </span>
                    <span className="text-red-700 bg-red-50 px-3 py-1 rounded-full border border-red-200">
                      Inactive: {analytics.healthDistribution?.Inactive || 0}
                    </span>
                  </div>
                </div>

                {analytics.dropOffPoint && (
                  <div className="lg:col-span-1 bg-red-50 border border-red-100 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                    <div className="flex items-center space-x-2">
                      <div className="bg-red-100 p-1.5 rounded-lg">
                        <HelpCircle className="h-4 w-4 text-red-600" />
                      </div>
                      <h4 className="font-extrabold text-red-800 text-xs">Top Struggling Area</h4>
                    </div>
                    <p className="text-[11px] text-red-700/90 mt-2 leading-relaxed">
                      Stuck at: <span className="font-bold text-red-900">{analytics.dropOffPoint.moduleTitle}</span>{" "}
                      ({analytics.dropOffPoint.stuckLearnersCount} {analytics.dropOffPoint.stuckLearnersCount === 1 ? 'student' : 'students'}).
                    </p>
                  </div>
                )}
              </div>

              {/* Grid: Enrolled Students (2/3 width) and Module Heatmap (1/3 width) */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Enrolled Students Table */}
                <div className={`${analytics.dropOffHeatmap && analytics.dropOffHeatmap.length > 0 ? 'xl:col-span-2' : 'xl:col-span-3'} bg-white rounded-2xl border border-gray-100 shadow-md overflow-hidden self-start`}>
                  <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Enrolled Students</h3>
                      <p className="text-xs text-gray-400 mt-1">Track individual study progress and health logs.</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <input
                        type="text"
                        placeholder="Search students..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="p-2 px-3.5 border border-gray-200 rounded-xl text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-gray-50/50 w-48 sm:w-64 transition-all"
                      />
                      <button
                        onClick={handleExportCSV}
                        className="bg-indigo-600 text-white font-semibold text-xs px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm shrink-0"
                      >
                        Export Report (CSV)
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-[450px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10 shadow-[inset_0_-1px_0_rgba(0,0,0,0.05)]">
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50">Learner Name</th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50">Status</th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50">Course Progress</th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50">Quiz Avg</th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50">Days Inactive</th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50">Last Active</th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center bg-gray-50">Emails Sent</th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right bg-gray-50">Health Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredLearners.length === 0 ? (
                          <tr>
                            <td colSpan="8" className="p-8 text-center text-sm text-gray-400 italic">No students match your query.</td>
                          </tr>
                        ) : (
                          paginatedLearners.map((learner) => (
                            <tr key={learner.id} className="hover:bg-gray-50/50">
                              <td className="p-4">
                                <h4 className="text-sm font-bold text-gray-900">{learner.name}</h4>
                                <span className="text-xs text-gray-400">{learner.email}</span>
                              </td>
                              <td className="p-4">
                                <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full ${learner.status === 'Completed' ? 'bg-indigo-50 text-indigo-700' : 'bg-green-50 text-green-700'
                                  }`}>
                                  {learner.status}
                                </span>
                              </td>
                              <td className="p-4 w-1/4">
                                <div className="flex items-center space-x-2">
                                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                    <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${learner.progress}%` }} />
                                  </div>
                                  <span className="text-xs font-extrabold text-gray-700">{learner.progress}%</span>
                                </div>
                              </td>
                              <td className="p-4 text-sm font-semibold text-gray-700">{learner.avgAssessmentScore}%</td>
                              <td className="p-4 text-sm text-gray-500">
                                {learner.daysInactive === 0 ? 'Active today' : `${learner.daysInactive} days ago`}
                              </td>
                              <td className="p-4 text-sm text-gray-500" title={learner.lastActive ? new Date(learner.lastActive).toLocaleString() : 'N/A'}>
                                <div className="flex items-center space-x-1">
                                  <Clock className="h-3 w-3 text-gray-400" />
                                  <span>{timeAgo(learner.lastActive)}</span>
                                </div>
                              </td>
                              <td className="p-4 text-sm text-gray-500 text-center font-semibold">
                                {learner.emailsSent || 0}
                              </td>
                              <td className="p-4 text-right">
                                <span className={`inline-flex items-center space-x-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${learner.healthStatus === 'Healthy'
                                  ? 'bg-green-50 text-green-700 border border-green-200'
                                  : learner.healthStatus === 'At-Risk'
                                    ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                                    : 'bg-red-50 text-red-700 border border-red-200'
                                  }`}>
                                  <span>{learner.healthScore}</span>
                                  <span className="text-[9px] font-normal opacity-85">({learner.healthStatus})</span>
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination Controls */}
                  {filteredLearners.length > ROWS_PER_PAGE && (
                    <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                      <span className="text-xs text-gray-500">
                        Showing <span className="font-bold text-gray-700">{(safePage - 1) * ROWS_PER_PAGE + 1}–{Math.min(safePage * ROWS_PER_PAGE, filteredLearners.length)}</span> of <span className="font-bold text-gray-700">{filteredLearners.length}</span> students
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={safePage <= 1}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          ← Previous
                        </button>
                        <span className="text-xs font-bold text-gray-700">
                          Page {safePage} of {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={safePage >= totalPages}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Drop-off Heatmap */}
                {analytics.dropOffHeatmap && analytics.dropOffHeatmap.length > 0 && (
                  <div className="xl:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-md p-6 self-start">
                    <h3 className="text-sm font-bold text-gray-900 mb-1">Module Drop-off Heatmap</h3>
                    <p className="text-[10px] text-gray-400 mb-5">Percentage of active learners whose first uncompleted module is here.</p>
                    <div className="space-y-3">
                      {analytics.dropOffHeatmap.map((mod, index) => (
                        <div key={mod.moduleId} className="flex items-center space-x-3 group">
                          <div className="w-24 flex-shrink-0 text-right">
                            <span className="text-xs font-semibold text-gray-600 truncate block" title={mod.moduleTitle}>
                              {index + 1}. {mod.moduleTitle}
                            </span>
                          </div>
                          <div className="flex-1 relative">
                            <div className="w-full bg-gray-100 h-6 rounded-lg overflow-hidden">
                              <div
                                className="h-full rounded-lg transition-all duration-500 ease-out"
                                style={{
                                  width: `${Math.max(mod.stuckPercent, mod.stuckCount > 0 ? 3 : 0)}%`,
                                  backgroundColor: getHeatmapColor(mod.stuckPercent)
                                }}
                                title={`${mod.stuckCount} of ${mod.totalActive} active learners stuck here (${mod.stuckPercent}%)`}
                              />
                            </div>
                          </div>
                          <span className={`text-xs font-bold w-12 text-right ${mod.stuckPercent > 30 ? 'text-red-600' : mod.stuckPercent > 10 ? 'text-yellow-600' : 'text-gray-500'}`}>
                            {mod.stuckPercent}%
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-x-4 gap-y-2 mt-5 pt-4 border-t border-gray-100">
                      {[
                        { color: '#22c55e', label: '0-10%' },
                        { color: '#eab308', label: '10-30%' },
                        { color: '#f97316', label: '30-50%' },
                        { color: '#ef4444', label: '50%+' },
                      ].map(item => (
                        <div key={item.label} className="flex items-center space-x-1">
                          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                          <span className="text-[9px] text-gray-500">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-400 bg-white border border-gray-100 rounded-2xl shadow-sm italic">Failed to load analytics dashboard database.</div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminCourseDetail;

