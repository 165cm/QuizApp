export const appState = {
    apiKey: localStorage.getItem('openai_api_key') || '',
    googleApiKey: localStorage.getItem('google_api_key') || '',
    imageModel: localStorage.getItem('image_model') || 'nano-banana', // 'nano-banana' default
    questions: [],
    materials: [],
    userStats: {
        totalAnswered: 0,
        correctAnswers: 0,
        lastStudyDate: null,
        streak: 0
    },
    currentQuiz: [],
    currentQuestionIndex: 0,
    currentSession: {
        correct: 0,
        total: 0
    },
    selectedAnswer: null,
    currentMaterialId: null,
    previousQuestion: null,
    // defaults
    selectedMaterial: 'review-priority',
    questionCount: 10,

    // Shared Quiz State
    isSharedQuiz: false,
    sharedQuizTitle: '',

    // User Settings (Quiz Customization)
    quizSettings: {
        targetLevel: '一般', // Default level
        customInstructions: '' // Default instructions
    }
};

export function setState(key, value) {
    appState[key] = value;
}
