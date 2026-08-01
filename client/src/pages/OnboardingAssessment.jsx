import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../utils/api';
import { Loader, Sparkles, CheckCircle, ArrowRight } from 'lucide-react';
import clientLogger from '../utils/logger';

const OnboardingAssessment = () => {
  const { id: courseId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Local UI state (quiz navigation, not server state) ─────────────────
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});

  // ── Query: Fetch assessment questions for this course ──────────────────
  const {
    data: assessmentData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['assessment', courseId],
    queryFn: () => apiFetch(`/api/learner/courses/${courseId}/assessment`),
  });

  const courseTitle = assessmentData?.title || '';
  const questions = assessmentData?.questions || [];

  // ── Mutation: Submit assessment answers ────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: (formattedAnswers) =>
      apiFetch(`/api/learner/courses/${courseId}/submit-assessment`, {
        method: 'POST',
        body: JSON.stringify({ answers: formattedAnswers }),
      }),
    onSuccess: () => {
      // Invalidate learner data so Dashboard and Catalog reflect the new status
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['learnerCourses'] });
      navigate('/dashboard');
    },
    onError: (err) => {
      // Error is displayed via submitMutation.error in the JSX
    },
  });

  // ── Event handlers ─────────────────────────────────────────────────────
  const handleSelectOption = (questionId, option) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [questionId]: option
    }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleSubmit = () => {
    if (Object.keys(selectedAnswers).length < questions.length) {
      alert('Please answer all questions before submitting.');
      return;
    }

    const formattedAnswers = Object.keys(selectedAnswers).map(qId => ({
      questionId: qId,
      selectedAnswer: selectedAnswers[qId]
    }));

    submitMutation.mutate(formattedAnswers);
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader className="animate-spin h-10 w-10 text-indigo-600" />
        <p className="text-gray-500 font-medium">Loading placement quiz...</p>
      </div>
    );
  }

  // ── Submitting state (AI analysis animation) ───────────────────────────
  if (submitMutation.isPending) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
        <div className="relative flex items-center justify-center mb-6">
          <div className="animate-ping absolute inline-flex h-16 w-16 rounded-full bg-indigo-400 opacity-25"></div>
          <div className="bg-indigo-600 p-5 rounded-full relative">
            <Sparkles className="h-8 w-8 text-white animate-pulse" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Generating your customized learning path</h2>
        <p className="text-gray-500 max-w-md">
          Please wait a few seconds while we design your personalized timeline...
        </p>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const answeredCount = Object.keys(selectedAnswers).length;
  const progressPercent = questions.length > 0 ? Math.round(((currentQuestionIndex + 1) / questions.length) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-gray-900">{courseTitle} Placement Assessment</h1>
        <p className="text-sm text-gray-500 mt-1">
          Complete these quick questions. Your answers will identify skipped topics or custom timelines.
        </p>
        
        {/* Progress Bar */}
        <div className="mt-6">
          <div className="flex justify-between text-xs font-semibold text-gray-400 mb-2">
            <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
            <span>{progressPercent}% Complete</span>
          </div>
          <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      </div>

      {(error || submitMutation.error) && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-lg">
          <p className="text-sm text-red-700 font-medium">{(error || submitMutation.error).message}</p>
        </div>
      )}

      {currentQuestion && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-8 mb-8">
          <span className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
            Tag: {currentQuestion.skillTag}
          </span>
          <h2 className="text-xl font-bold text-gray-900 mt-4 mb-6">
            {currentQuestion.question}
          </h2>

          <div className="space-y-4">
            {currentQuestion.options.map((option, idx) => {
              const isSelected = selectedAnswers[currentQuestion._id] === option;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelectOption(currentQuestion._id, option)}
                  className={`w-full text-left p-4 rounded-xl border font-medium transition-all duration-200 flex items-center justify-between ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900 shadow-sm'
                      : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span>{option}</span>
                  {isSelected && (
                    <CheckCircle className="h-5 w-5 text-indigo-600 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={handlePrev}
          disabled={currentQuestionIndex === 0}
          className="bg-white border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>

        {currentQuestionIndex < questions.length - 1 ? (
          <button
            onClick={handleNext}
            disabled={!selectedAnswers[currentQuestion?._id]}
            className="bg-indigo-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-indigo-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <span>Next</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={answeredCount < questions.length}
            className="bg-indigo-600 text-white font-semibold px-8 py-3 rounded-xl hover:bg-indigo-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <span>Submit Assessment</span>
            <CheckCircle className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingAssessment;
