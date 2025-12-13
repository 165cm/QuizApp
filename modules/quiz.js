import { appState } from './state.js';
import { shuffleArray } from './utils.js';

export function calculateUserLevel() {
    const stats = appState.userStats;
    if (stats.totalAnswered < 10) return 'basic';
    const accuracy = stats.correctAnswers / stats.totalAnswered;
    if (accuracy >= 0.8) return 'advanced';
    if (accuracy >= 0.6) return 'standard';
    return 'basic';
}

export function isReviewDue(question) {
    if (!question.nextReview) return false;
    return new Date(question.nextReview) <= new Date();
}

export function getReviewDueCount() {
    return appState.questions.filter(q => isReviewDue(q)).length;
}

export function updateQuestionStats(question, isCorrect) {
    const originalQuestion = appState.questions.find(q => q.id === question.id);
    if (!originalQuestion) return;

    originalQuestion.lastReviewed = new Date().toISOString();
    originalQuestion.reviewCount++;

    if (isCorrect) {
        if (originalQuestion.interval === 0) {
            originalQuestion.interval = 1;
        } else {
            originalQuestion.interval = Math.round(originalQuestion.interval * originalQuestion.easeFactor);
        }
        originalQuestion.easeFactor = Math.max(1.3, originalQuestion.easeFactor + 0.1);
    } else {
        originalQuestion.interval = 0;
        originalQuestion.easeFactor = Math.max(1.3, originalQuestion.easeFactor - 0.2);
    }

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + originalQuestion.interval);
    originalQuestion.nextReview = nextReviewDate.toISOString();
}

export function selectQuestionsForSession() {
    const activeQuestions = appState.questions.filter(q => !q.archived);

    if (appState.selectedMaterial === 'review-priority') {
        const reviewDue = activeQuestions.filter(q => isReviewDue(q));
        const count = Math.min(appState.questionCount, Math.max(reviewDue.length, activeQuestions.length));

        if (reviewDue.length >= count) {
            return shuffleArray(reviewDue).slice(0, count);
        } else {
            const remaining = count - reviewDue.length;
            const otherQuestions = activeQuestions.filter(q => !isReviewDue(q));
            return shuffleArray([...reviewDue, ...shuffleArray(otherQuestions).slice(0, remaining)]);
        }
    }

    let availableQuestions = appState.selectedMaterial === 'all'
        ? activeQuestions
        : activeQuestions.filter(q => q.materialId === appState.selectedMaterial);

    if (availableQuestions.length === 0) return [];

    // Adaptive difficulty logic could be here, but simpler random for now as per original code structure
    // (Actual original code had complex logic for Today's Quiz vs Normal Start. This mimics Start Quiz)

    const count = Math.min(appState.questionCount, availableQuestions.length);
    return shuffleArray(availableQuestions).slice(0, count);
}
