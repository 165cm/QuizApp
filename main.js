
import { appState } from './modules/state.js';
import { loadData, saveApiKey, resetAllData } from './modules/storage.js';
import { showScreen, updateStatsUI, updateMaterialSelectUI, updateReportUI } from './modules/ui.js';
import { generateQuizFromText, generateQuizFromUrl, extractTextFromPDF, generateMaterialMetadata, generateQuestionsWithAI, generateImagesForQuestions, updateGeneratingStatus } from './modules/api.js';
import { startQuiz } from './modules/game.js';
import { initLibrary, showMaterialsLibrary } from './modules/library.js';
import { showReviewList } from './modules/review.js';
import { checkForSharedCertificate, checkForSharedMaterial, copyShareURL, generateQRCode } from './modules/share.js';
import { initAuth, signInWithGoogle, signOut } from './modules/auth.js';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initAuth(); // Initialize Supabase auth

    // Check for shared content
    const isShared = checkForSharedCertificate() || checkForSharedMaterial(startQuiz);

    if (!isShared) {
        initHomeScreen();
    }

    initLibrary(); // Setup library listeners
    setupEventListeners();

    // Auth event listeners
    document.getElementById('login-btn')?.addEventListener('click', signInWithGoogle);
    document.getElementById('logout-btn')?.addEventListener('click', signOut);
});

export function initHomeScreen() {
    updateStatsUI();
    updateMaterialSelectUI();
    showScreen('home-screen');
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.home-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.home-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.home-tab-content').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            const tabId = e.target.dataset.tab;
            document.getElementById(`tab-${tabId}`).classList.add('active');

            if (tabId === 'report') {
                updateReportUI();
            }
        });
    });

    document.querySelectorAll('.mode-tab-compact').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-tab-compact').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.input-mode').forEach(m => m.classList.remove('active'));
            e.target.classList.add('active');
            const mode = e.target.dataset.mode;
            document.getElementById(`${mode}-mode`).classList.add('active');
        });
    });

    // Start Quiz
    document.getElementById('start-quiz-btn')?.addEventListener('click', startQuiz);

    // Library & Review
    document.getElementById('manage-references-btn')?.addEventListener('click', showMaterialsLibrary);
    document.getElementById('review-count-card')?.addEventListener('click', showReviewList);
    document.getElementById('back-to-home-btn')?.addEventListener('click', initHomeScreen);
    document.getElementById('back-to-home-from-review-btn')?.addEventListener('click', initHomeScreen);
    document.getElementById('back-to-library-btn')?.addEventListener('click', showMaterialsLibrary);

    // API Key
    document.getElementById('save-api-key')?.addEventListener('click', () => {
        const key = document.getElementById('api-key-input').value.trim();
        if (key) {
            saveApiKey(key);
            document.getElementById('api-key-modal').classList.add('hidden');
            alert('APIキーを保存しました');
        }
    });
    document.getElementById('cancel-api-key')?.addEventListener('click', () => {
        document.getElementById('api-key-modal').classList.add('hidden');
    });

    // Share Modal
    document.getElementById('close-share-modal')?.addEventListener('click', () => {
        document.getElementById('share-modal').classList.add('hidden');
    });

    document.getElementById('copy-url-btn')?.addEventListener('click', () => {
        if (appState.currentMaterialId) copyShareURL(appState.currentMaterialId);
    });

    document.getElementById('show-qr-btn')?.addEventListener('click', () => {
        if (appState.currentMaterialId) {
            generateQRCode(appState.currentMaterialId);
            document.getElementById('qr-code-container').classList.remove('hidden');
        }
    });

    // Reset Data
    document.getElementById('reset-all-data-btn')?.addEventListener('click', () => {
        if (confirm('本当にすべてのデータを削除しますか？\nこの操作は取り消せません。')) {
            resetAllData();
            initHomeScreen();
            alert('データをリセットしました');
        }
    });

    document.querySelectorAll('.count-btn-compact').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.count-btn-compact').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            appState.questionCount = parseInt(e.target.dataset.count);
        });
    });

    // Result Screen
    document.getElementById('continue-btn')?.addEventListener('click', startQuiz);
    document.getElementById('home-btn')?.addEventListener('click', initHomeScreen);
    document.getElementById('quit-btn')?.addEventListener('click', initHomeScreen);

    // PDF Generation
    document.getElementById('pdf-input')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        document.getElementById('file-name').textContent = file.name;
        document.getElementById('generate-btn').disabled = false;
    });

    document.getElementById('generate-btn')?.addEventListener('click', async () => {
        const file = document.getElementById('pdf-input').files[0];
        if (!file) return;
        if (!appState.apiKey) {
            document.getElementById('api-key-modal').classList.remove('hidden');
            return;
        }

        try {
            showScreen('generating-screen');
            updateGeneratingStatus('PDFを読み込んでいます...', 10);
            const text = await extractTextFromPDF(file);
            // Use unified generation logic
            await generateQuizFromText(text, file.name);

        } catch (e) {
            console.error(e);
            alert('生成失敗: ' + e.message);
            initHomeScreen();
        }
    });

    document.getElementById('generate-from-text-btn')?.addEventListener('click', async () => {
        const inputEl = document.getElementById('text-input');
        const text = inputEl.value.trim();
        if (!text) {
            alert('テキストを入力してください');
            return;
        }
        if (!appState.apiKey) {
            document.getElementById('api-key-modal').classList.remove('hidden');
            return;
        }
        await generateQuizFromText(text, 'テキスト入力');
        inputEl.value = ''; // Clear input on success
    });

    document.getElementById('generate-from-url-btn')?.addEventListener('click', async () => {
        const url = document.getElementById('url-input').value.trim();
        if (!url) {
            alert('URLを入力してください');
            return;
        }
        if (!appState.apiKey) {
            document.getElementById('api-key-modal').classList.remove('hidden');
            return;
        }
        await generateQuizFromUrl(url);
    });
}
