import { appState } from './state.js';
import { saveMaterials, saveQuestions } from './storage.js';
import { showScreen } from './ui.js';
import { shuffleArray } from './utils.js';

let filteredMaterials = [];
let currentView = 'list';

export function showMaterialsLibrary() {
    const container = document.getElementById('references-list');
    container.innerHTML = '';

    if (appState.materials.length === 0) {
        container.innerHTML = '<div class="empty-message">まだ教材が登録されていません。<br>PDFをアップロードしてクイズを生成してください。</div>';
        showScreen('references-screen');
        return;
    }

    filteredMaterials = applyFiltersAndSort();

    if (currentView === 'shared') {
        filteredMaterials = filteredMaterials.filter(m => m.isShared);
        if (filteredMaterials.length === 0) {
            container.innerHTML = '<div class="empty-message">まだ共有された教材がありません。</div>';
            showScreen('references-screen');
            return;
        }
    } else {
        filteredMaterials = filteredMaterials.filter(m => !m.isShared);
        if (filteredMaterials.length === 0) {
            container.innerHTML = '<div class="empty-message">まだ教材が登録されていません。<br>PDFをアップロードしてクイズを生成してください。</div>';
            showScreen('references-screen');
            return;
        }
    }

    container.className = 'materials-list';
    filteredMaterials.forEach(material => {
        const materialListItem = createMaterialListItem(material);
        container.appendChild(materialListItem);
    });

    showScreen('references-screen');
}

function createMaterialListItem(material) {
    const item = document.createElement('div');
    item.className = 'material-list-item';
    const dateStr = new Date(material.uploadDate).toLocaleDateString('ja-JP');
    const questions = appState.questions.filter(q => q.materialId === material.id);
    const questionCount = questions.length;
    const answeredQuestions = questions.filter(q => q.lastReviewed);
    const correctCount = answeredQuestions.filter(q => q.reviewCount > 0).length;
    const accuracy = answeredQuestions.length > 0 ? Math.round((correctCount / answeredQuestions.length) * 100) : 0;

    item.innerHTML = `
        <div class="material-list-main">
            <div class="material-list-title">${material.title}</div>
            <div class="material-list-date">${dateStr}</div>
        </div>
        <div class="material-list-stats">
            <span class="list-stat-item">📝 ${questionCount}問</span>
            <span class="list-stat-item">📊 ${accuracy}%</span>
        </div>
    `;

    item.addEventListener('click', () => {
        showMaterialDetail(material.id);
    });

    return item;
}

function applyFiltersAndSort() {
    let materials = [...appState.materials];
    const searchQuery = document.getElementById('material-search')?.value.toLowerCase();
    if (searchQuery) {
        materials = materials.filter(m =>
            m.title.toLowerCase().includes(searchQuery) ||
            m.summary.toLowerCase().includes(searchQuery) ||
            m.tags.some(tag => tag.toLowerCase().includes(searchQuery))
        );
    }
    const sortFilter = document.getElementById('sort-filter')?.value || 'date-desc';
    switch (sortFilter) {
        case 'date-desc': materials.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate)); break;
        case 'date-asc': materials.sort((a, b) => new Date(a.uploadDate) - new Date(b.uploadDate)); break;
        case 'title': materials.sort((a, b) => a.title.localeCompare(b.title, 'ja')); break;
    }
    return materials;
}

export function deleteMaterial(materialId) {
    const material = appState.materials.find(m => m.id === materialId);
    if (!material) return;
    const questionCount = appState.questions.filter(q => q.materialId === materialId).length;
    if (!confirm(`教材「${material.title}」とその問題${questionCount}問を削除しますか？\n\nこの操作は取り消せません。`)) return;

    appState.materials = appState.materials.filter(m => m.id !== materialId);
    saveMaterials();
    appState.questions = appState.questions.filter(q => q.materialId !== materialId);
    saveQuestions();
    showMaterialsLibrary();
    alert(`教材「${material.title}」を削除しました`);
}

export function showMaterialDetail(materialId) {
    const material = appState.materials.find(m => m.id === materialId);
    if (!material) return;
    appState.currentMaterialId = materialId;

    document.getElementById('detail-material-title').textContent = material.title;
    document.getElementById('detail-material-summary').textContent = material.summary;
    const tagsContainer = document.getElementById('detail-material-tags');
    tagsContainer.innerHTML = material.tags.map(tag => `<span class="tag">${tag}</span>`).join('') || '<span class="tag">未分類</span>';

    const dateStr = new Date(material.uploadDate).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    const questions = appState.questions.filter(q => q.materialId === materialId);
    document.getElementById('detail-upload-date').textContent = `📅 ${dateStr}`;
    document.getElementById('detail-question-count').textContent = `📝 ${questions.length}問`;

    updateOverviewTab(material, questions);
    updateQuestionsTab(material, questions);
    updateContentTab(material);

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="overview"]').classList.add('active');
    document.getElementById('tab-overview').classList.add('active');

    const shareBtn = document.getElementById('share-material-btn');
    if (shareBtn) {
        if (material.isShared || material.hasBeenShared) {
            shareBtn.disabled = true;
            shareBtn.style.opacity = '0.5';
            shareBtn.style.cursor = 'not-allowed';
            shareBtn.title = '共有された教材は再共有できません';
        } else {
            shareBtn.disabled = false;
            shareBtn.style.opacity = '1';
            shareBtn.style.cursor = 'pointer';
            shareBtn.title = '';
        }
        shareBtn.onclick = () => {
            // Logic handled by share module usually, but might need explicit trigger if not global
            // Actually currently handle in separate flow. But let's leave it.
            // Wait, main.js doesn't attach share listener for this specific button dynamically.
            // We should attach it here or use global listener.
            // copyShareURL is for currentMaterialId.
            document.getElementById('share-modal').classList.remove('hidden');
        };
    }

    const startBtn = document.getElementById('start-material-quiz-btn');
    if (startBtn) {
        startBtn.onclick = () => {
            // Set global state to this material
            appState.selectedMaterial = materialId;
            // Update UI to reflect (though we are jumping to quiz screen)
            // import { updateMaterialSelectUI } from './ui.js' is available
            // updateMaterialSelectUI(); // Optional but good for consistency if we return to home

            // Start Quiz
            import('./game.js').then(module => {
                module.startQuiz();
            });
        };
    }

    showScreen('material-detail-screen');
}

function updateOverviewTab(material, questions) {
    const total = questions.length;
    const answeredQuestions = questions.filter(q => q.lastReviewed);
    const correctCount = answeredQuestions.filter(q => q.reviewCount > 0).length;
    const accuracy = answeredQuestions.length > 0 ? Math.round((correctCount / answeredQuestions.length) * 100) : 0;
    const progress = total > 0 ? Math.round((answeredQuestions.length / total) * 100) : 0;

    document.getElementById('overview-total').textContent = `${total}問`;
    document.getElementById('overview-accuracy').textContent = `${accuracy}%`;
    document.getElementById('overview-progress').textContent = `${progress}%`;
}

function updateQuestionsTab(material, questions) {
    const container = document.getElementById('questions-list');
    container.innerHTML = '';
    if (questions.length === 0) {
        container.innerHTML = '<div class="empty-message">この教材には問題がありません</div>';
        return;
    }
    questions.forEach((q) => {
        const questionCard = document.createElement('div');
        questionCard.className = 'question-item-mini';
        const correctAnswer = q.choices[q.correctIndex];
        questionCard.innerHTML = `
            <div class="question-mini-row">
                <div class="question-mini-label">Q</div>
                <div class="question-mini-text">${q.question}</div>
            </div>
            <div class="question-mini-row answer-row">
                <div class="question-mini-label">A</div>
                <div class="question-mini-answer">${correctAnswer}</div>
                <button class="btn-icon-mini delete-question-btn" data-question-id="${q.id}" title="削除">🗑️</button>
            </div>
        `;
        // Setup delete handler here or delegate? Using specific handler manually
        questionCard.querySelector('.delete-question-btn').onclick = (e) => {
            e.stopPropagation();
            deleteQuestion(q.id, material.id);
        };
        container.appendChild(questionCard);
    });
}

function updateContentTab(material) {
    const container = document.getElementById('material-content');
    let content = material.content || 'この教材には本文が保存されていません。';

    // Check if content is Markdown (simple heuristic or just assume)
    // If it's old raw text, marked will just render it as paragraphs mostly, which is fine.

    // Configure marked options if needed (optional)
    // marked.use({ breaks: true }); // Enable line breaks

    try {
        container.innerHTML = marked.parse(content);
    } catch (e) {
        console.error('Markdown parsing failed', e);
        container.textContent = content; // Fallback
    }
}

function deleteQuestion(questionId, materialId) {
    if (!confirm('この問題を削除しますか？')) return;
    appState.questions = appState.questions.filter(q => q.id != questionId); // Using != loose comparison for ID if one is string one is number
    saveQuestions();
    showMaterialDetail(materialId); // Refresh
}

// Setup Event Listeners for Filter inputs when this module is loaded? 
// Ideally main.js should call an initLibrary function.
export function initLibrary() {
    document.getElementById('material-search')?.addEventListener('input', showMaterialsLibrary);
    document.getElementById('sort-filter')?.addEventListener('change', showMaterialsLibrary);

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentView = e.target.dataset.view;
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            showMaterialsLibrary();
        });
    });

    // Tab switching in detail view
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${tab}`).classList.add('active');
        });
    });
}
