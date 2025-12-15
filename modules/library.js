import { appState } from './state.js';
import { saveMaterials, saveQuestions, deleteMaterialFromCloud, deleteFromDevice, deleteFromCloud, saveMaterialToCloud, saveQuestionToCloud } from './storage.js';
import { showScreen } from './ui.js';
import { shuffleArray } from './utils.js';
import { supabase } from './supabase.js';
// We need startQuiz. Circular dep risk? No, game.js imports state, ui. library.js imports game.js is fine if game.js doesn't import library.js functions at top level.
// Checked game.js: imports { showScreen } from './ui.js' and { appState } from './state.js'.
// It does NOT import library.js. Safe.
import { startQuiz } from './game.js';

let filteredMaterials = [];
let currentView = 'list';

let isSelectionMode = false;
let selectedMaterialIds = new Set();
let isBulkDeleteMode = false;

// --- Public Library Logic ---
export async function showPublicLibrary() {
    const listContainer = document.getElementById('public-list');
    if (!listContainer) return;

    showScreen('public-library-screen');
    listContainer.innerHTML = '<div class="loader-spinner"></div><p style="text-align:center; color:var(--text-secondary); width:100%;">新着クイズを読み込んでいます...</p>';

    try {
        // Fetch materials (limit 20, newest first)
        // Note: RLS might block this. If so, user feels nothing but empty list.
        const { data: materials, error } = await supabase
            .from('materials')
            .select('*')
            .limit(20)
            .order('created_at', { ascending: false });

        if (error) throw error;

        listContainer.innerHTML = '';

        if (!materials || materials.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-message">
                    <p>公開されているクイズがまだありません。</p>
                    <p style="font-size:0.9rem; margin-top:0.5rem;">自分で作ったクイズをシェアすると、ここに表示されるかも？</p>
                </div>`;
            return;
        }

        materials.forEach(material => {
            // Supabaseのカラム名（スネークケース）→ クライアント側（キャメルケース）
            material.questionIds = material.question_ids || material.questionIds;
            material.uploadDate = material.upload_date || material.uploadDate;
            material.fileName = material.source_name || material.fileName;

            const card = createPublicMaterialCard(material);
            listContainer.appendChild(card);
        });

    } catch (err) {
        console.error('Public Fetch Error:', err);
        // Fallback: Show local materials as "My Gallery" mock if online fails?
        // Or just error message.
        listContainer.innerHTML = `
            <div class="empty-message">
                <p>クイズの読み込みに失敗しました。</p>
                <button class="btn btn-secondary" id="retry-public-btn" style="margin-top:1rem;">再読み込み</button>
            </div>`;
        document.getElementById('retry-public-btn')?.addEventListener('click', showPublicLibrary);
    }
}

function createPublicMaterialCard(material) {
    const card = document.createElement('div');
    card.className = 'public-quiz-card';

    // Random gradient for visual variety
    const gradients = [
        'linear-gradient(135deg, #6366f1, #8b5cf6)',
        'linear-gradient(135deg, #3b82f6, #0ea5e9)',
        'linear-gradient(135deg, #10b981, #059669)',
        'linear-gradient(135deg, #f59e0b, #d97706)',
        'linear-gradient(135deg, #ec4899, #f43f5e)',
        'linear-gradient(135deg, #14b8a6, #06b6d4)'
    ];
    const bg = gradients[Math.floor(Math.random() * gradients.length)];

    const qCount = material.questionIds ? material.questionIds.length : '?';
    const title = (material.title || '無題').substring(0, 25) + (material.title?.length > 25 ? '...' : '');
    const summary = (material.summary || 'AI生成クイズ').substring(0, 40) + (material.summary?.length > 40 ? '...' : '');

    card.innerHTML = `
        <div class="public-card-bg" style="background: ${bg};"></div>
        <div class="public-card-content">
            <div class="public-card-title">${title}</div>
            <div class="public-card-summary">${summary}</div>
            <div class="public-card-meta">${qCount}問</div>
        </div>
    `;

    // カードにdata属性でIDを記録
    card.dataset.materialId = material.id;
    card.dataset.materialTitle = material.title;

    card.addEventListener('click', () => importPublicAndStart(material));

    return card;
}

async function importPublicAndStart(material) {
    // 1. Check if we already have this material AND its questions
    const existing = appState.materials.find(m => m.id === material.id);
    const existingQuestions = appState.questions.filter(q => q.materialId === material.id);

    if (existing && existingQuestions.length > 0) {
        appState.currentMaterialId = existing.id;
        appState.selectedMaterial = existing.id;
        startQuiz();
        return;
    }

    // 2. Fetch Questions
    const loadOverlay = document.createElement('div');
    loadOverlay.className = 'loading-overlay';
    loadOverlay.innerHTML = '<div class="loader-spinner"></div><p style="color:white; margin-top:1rem;">クイズデータをダウンロード中...</p>';
    document.body.appendChild(loadOverlay);

    try {
        let qIds = material.questionIds;
        if (!qIds || qIds.length === 0) throw new Error('No questions linked');

        const { data: questions, error } = await supabase
            .from('questions')
            .select('*')
            .in('id', qIds);

        if (error) throw error;

        // Supabaseのカラム名（スネークケース）→ クライアント側（キャメルケース）
        questions.forEach(q => {
            // material_idが未設定の場合は、この教材のIDを使用
            q.materialId = q.material_id || q.materialId || material.id;
            q.question = q.question_text || q.question;
            q.correctIndex = q.choices?.indexOf(q.correct_answer);
            q.correctAnswer = q.correct_answer || q.correctAnswer;
            q.imageUrl = q.image_url || q.imageUrl;
            q.imageGridIndex = q.image_grid_index ?? q.imageGridIndex;
            q.reviewCount = q.review_count || q.reviewCount || 0;
            q.lastReviewed = q.last_reviewed || q.lastReviewed;
            q.easeFactor = q.ease_factor || q.easeFactor || 2.5;
        });



        // 3. Save to local state
        if (!existing) {
            appState.materials.push(material);
        }
        appState.questions.push(...questions);

        // Save to local storage
        saveMaterials();
        saveQuestions();

        appState.currentMaterialId = material.id;
        appState.selectedMaterial = material.id;  // ← これが重要！

        loadOverlay.remove();
        startQuiz();

    } catch (err) {
        console.error('Import Error:', err);
        loadOverlay.remove();
        alert('クイズのダウンロードに失敗しました。');
    }
}

export function showMaterialsLibrary() {
    const container = document.getElementById('references-list');
    container.innerHTML = '';

    // Update selection mode UI
    const selectBtn = document.getElementById('toggle-selection-btn');
    const actionBar = document.getElementById('selection-action-bar');

    // Add listener if not exists (check by ensuring we don't add multiple times, or just re-add)
    // Actually initLibrary adds listeners. We just update UI state here.
    if (selectBtn) {
        selectBtn.classList.toggle('active', isSelectionMode);
        selectBtn.textContent = isSelectionMode ? '❌ キャンセル' : '✅ 選択';
    }
    if (actionBar) {
        if (isSelectionMode) actionBar.classList.remove('hidden');
        else actionBar.classList.add('hidden');
        updateSelectionCount();
    }

    if (appState.materials.length === 0) {
        container.innerHTML = '<div class="empty-message">まだ教材が登録されていません。<br>PDFをアップロードしてクイズを生成してください。</div>';
        showScreen('references-screen');
        return;
    }

    filteredMaterials = applyFiltersAndSort();

    // Filter shared if needed
    if (currentView === 'shared') {
        filteredMaterials = filteredMaterials.filter(m => m.isShared);
    } else {
        filteredMaterials = filteredMaterials.filter(m => !m.isShared);
    }

    if (filteredMaterials.length === 0) {
        container.innerHTML = '<div class="empty-message">表示する教材がありません。</div>';
        showScreen('references-screen');
        return;
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

    // Shared View Logic (Simple list)
    if (currentView === 'shared') {
        item.classList.add('shared-item');
        item.style.cursor = 'default';

        const dateStr = new Date(material.uploadDate).toLocaleDateString('ja-JP');
        const shareUrl = material.shareUrl || '';

        item.innerHTML = `
            <div class="material-list-Main-Wrapper" style="padding: 0.5rem 0;">
                <div class="material-list-main" style="flex: 1;">
                    <div class="material-list-title" style="font-weight: 600; font-size: 1rem;">${material.title}</div>
                    <div class="material-list-date" style="font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">
                        ${dateStr} <span style="margin: 0 8px;">|</span> 閲覧数: <span class="view-count-val">-</span>
                    </div>
                </div>
                <div class="material-list-actions" style="display: flex; gap: 12px; align-items: center;">
                    <button class="btn-icon-mini copy-url-btn" title="URLをコピー" style="background: rgba(99, 102, 241, 0.1); color: #6366f1; border-radius: 8px; padding: 6px 12px;">🔗 コピー</button>
                    <button class="btn-delete-inline" data-id="${material.id}" title="削除">🗑️</button>
                </div>
            </div>
        `;

        // Copy Handler
        const copyBtn = item.querySelector('.copy-url-btn');
        if (copyBtn) {
            copyBtn.onclick = async (e) => {
                e.stopPropagation();
                if (shareUrl) {
                    try {
                        await navigator.clipboard.writeText(shareUrl);
                        // Provide visual feedback
                        copyBtn.textContent = '✅ Copied!';
                        setTimeout(() => copyBtn.textContent = '🔗 コピー', 2000);
                    } catch (err) {
                        alert('コピーに失敗しました');
                    }
                } else {
                    alert('URLが見つかりません');
                }
            };
        }

        // Delete Handler
        const deleteBtn = item.querySelector('.btn-delete-inline');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showDeleteModal(material.id);
            });
        }

        return item;
    }

    // Normal Selection / List View Logic
    if (isSelectionMode) {
        item.classList.add('selection-mode');
        if (selectedMaterialIds.has(material.id)) {
            item.classList.add('selected');
        }
    }

    const dateStr = new Date(material.uploadDate).toLocaleDateString('ja-JP');
    const questions = appState.questions.filter(q => q.materialId === material.id);
    const questionCount = questions.length;
    const answeredQuestions = questions.filter(q => q.lastReviewed);
    const correctCount = answeredQuestions.filter(q => q.reviewCount > 0).length;
    const accuracy = answeredQuestions.length > 0 ? Math.round((correctCount / answeredQuestions.length) * 100) : 0;

    // Checkbox HTML
    const checkboxHtml = isSelectionMode ?
        `<div class="material-checkbox-container">
            <input type="checkbox" class="material-checkbox" ${selectedMaterialIds.has(material.id) ? 'checked' : ''}>
         </div>` : '';

    item.innerHTML = `
        ${checkboxHtml}
        <div class="material-list-Main-Wrapper">
            <div class="material-list-main">
                <div class="material-list-title">${material.title}</div>
                <div class="material-list-date">${dateStr}</div>
            </div>
            <div class="material-list-stats">
                <span class="list-stat-item">📝 ${questionCount}問</span>
                <span class="list-stat-item">📊 ${accuracy}%</span>
            </div>
            ${!isSelectionMode ? `<button class="btn-delete-inline" data-id="${material.id}" title="削除">🗑️</button>` : ''}
        </div>
    `;

    item.addEventListener('click', (e) => {
        if (isSelectionMode) {
            // Toggle selection
            const checkbox = item.querySelector('.material-checkbox');
            if (selectedMaterialIds.has(material.id)) {
                selectedMaterialIds.delete(material.id);
                item.classList.remove('selected');
                if (checkbox) checkbox.checked = false;
            } else {
                selectedMaterialIds.add(material.id);
                item.classList.add('selected');
                if (checkbox) checkbox.checked = true;
            }
            updateSelectionCount();
        } else {
            showMaterialDetail(material.id);
        }
    });

    // Also handle checkbox click specifically to avoid double toggle if bubble logic fails?
    // Actually the click on item covers it. But checkbox click might propagate.
    const checkbox = item.querySelector('.material-checkbox');
    if (checkbox) {
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop propagation to item click
            if (checkbox.checked) {
                selectedMaterialIds.add(material.id);
                item.classList.add('selected');
            } else {
                selectedMaterialIds.delete(material.id);
                item.classList.remove('selected');
            }
            updateSelectionCount();
        });
    }

    // Handle inline delete button click
    const deleteBtn = item.querySelector('.btn-delete-inline');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showDeleteModal(material.id);
        });
    }

    return item;
}

function updateSelectionCount() {
    const label = document.getElementById('selected-count-label');
    if (label) label.textContent = `${selectedMaterialIds.size}件選択中`;
}

export function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    selectedMaterialIds.clear(); // Clear on toggle? Usually clear when entering or exiting not sure. User preference. Let's clear when select mode starts/ends.
    showMaterialsLibrary();
}

export function selectAllMaterials() {
    // Select all visible materials
    filteredMaterials.forEach(m => {
        selectedMaterialIds.add(m.id);
    });
    showMaterialsLibrary();
}

export function deleteSelectedMaterials() {
    if (selectedMaterialIds.size === 0) return;

    // Show modal for bulk delete
    showBulkDeleteModal();
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

    deleteMaterialFromCloud(materialId);

    appState.materials = appState.materials.filter(m => m.id !== materialId);
    saveMaterials();
    appState.questions = appState.questions.filter(q => q.materialId !== materialId);
    saveQuestions();
    showMaterialsLibrary();
    alert(`教材「${material.title}」を削除しました`);
}

// Show delete modal with Kindle-style options
let pendingDeleteMaterialId = null;

export function showDeleteModal(materialId) {
    const material = appState.materials.find(m => m.id === materialId);
    if (!material) return;

    pendingDeleteMaterialId = materialId;

    const modal = document.getElementById('delete-modal');
    const titleSpan = document.getElementById('delete-modal-title');

    if (titleSpan) titleSpan.textContent = material.title;
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
}

export function hideDeleteModal() {
    const modal = document.getElementById('delete-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    pendingDeleteMaterialId = null;
    isBulkDeleteMode = false;
}

export function handleDeleteFromDevice() {
    if (!pendingDeleteMaterialId) return;
    deleteFromDevice(pendingDeleteMaterialId);
    hideDeleteModal();
    showMaterialsLibrary();
}

export async function handleDeleteFromCloud() {
    if (!pendingDeleteMaterialId) return;
    await deleteFromCloud(pendingDeleteMaterialId);
    hideDeleteModal();
    showMaterialsLibrary();
}

// Bulk delete modal
export function showBulkDeleteModal() {
    if (selectedMaterialIds.size === 0) return;

    isBulkDeleteMode = true;

    const modal = document.getElementById('delete-modal');
    const titleSpan = document.getElementById('delete-modal-title');

    if (titleSpan) titleSpan.textContent = `${selectedMaterialIds.size}件の教材`;
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
}

export function handleBulkDeleteFromDevice() {
    if (!isBulkDeleteMode) return;

    selectedMaterialIds.forEach(id => deleteFromDevice(id));

    selectedMaterialIds.clear();
    isSelectionMode = false;
    isBulkDeleteMode = false;
    hideDeleteModal();
    showMaterialsLibrary();
}

export async function handleBulkDeleteFromCloud() {
    if (!isBulkDeleteMode) return;

    for (const id of selectedMaterialIds) {
        await deleteFromCloud(id);
    }

    selectedMaterialIds.clear();
    isSelectionMode = false;
    isBulkDeleteMode = false;
    hideDeleteModal();
    showMaterialsLibrary();
}

// Updated handlers to support both single and bulk delete
export function handleDeleteDeviceClick() {
    if (isBulkDeleteMode) {
        handleBulkDeleteFromDevice();
    } else {
        handleDeleteFromDevice();
    }
}

export async function handleDeleteCloudClick() {
    if (isBulkDeleteMode) {
        await handleBulkDeleteFromCloud();
    } else {
        await handleDeleteFromCloud();
    }
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

    // Expiration Info
    const uploadDate = new Date(material.uploadDate);
    const expirationDate = new Date(uploadDate);
    expirationDate.setDate(uploadDate.getDate() + 30);
    const now = new Date();
    const daysLeft = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));

    const expInfoEl = document.getElementById('detail-expiration-info');
    if (expInfoEl) {
        if (daysLeft > 0) {
            expInfoEl.textContent = `⚠️ 画像の保存期限: ${expirationDate.toLocaleDateString()} (あと${daysLeft}日)`;
            expInfoEl.classList.remove('expired');
        } else {
            expInfoEl.textContent = `⚠️ 画像の保存期限: 終了しました (画像は自動削除されました)`;
            expInfoEl.classList.add('expired');
        }
    }

    updateOverviewTab(material, questions);
    updateQuestionsTab(material, questions);
    updateContentTab(material);

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="overview"]').classList.add('active');
    document.getElementById('tab-overview').classList.add('active');

    const shareBtn = document.getElementById('share-material-btn');
    if (shareBtn) {
        // Shared materials can be re-shared (cloned again)
        shareBtn.disabled = false;
        shareBtn.style.opacity = '1';
        shareBtn.style.cursor = 'pointer';
        shareBtn.title = '';

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

    // Configure marked options
    if (typeof marked !== 'undefined') {
        marked.use({
            breaks: true, // Enable line breaks
            gfm: true     // Enable GitHub Flavored Markdown
        });
        try {
            container.innerHTML = marked.parse(content);
        } catch (e) {
            console.error('Markdown parsing failed', e);
            container.textContent = content;
        }
    } else {
        // Fallback if marked is not loaded
        container.style.whiteSpace = 'pre-wrap';
        container.textContent = content;
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
            if (!e.target.dataset.view) return; // Skip buttons without view data (like selection toggle)
            currentView = e.target.dataset.view;
            document.querySelectorAll('.view-btn').forEach(b => {
                if (b.dataset.view) b.classList.remove('active');
            });
            e.target.classList.add('active');
            showMaterialsLibrary();
        });
    });

    // Selection Mode Listeners
    document.getElementById('toggle-selection-btn')?.addEventListener('click', toggleSelectionMode);
    document.getElementById('select-all-btn')?.addEventListener('click', selectAllMaterials);
    document.getElementById('delete-selected-btn')?.addEventListener('click', deleteSelectedMaterials);

    // Delete Modal Listeners
    document.getElementById('close-delete-modal')?.addEventListener('click', hideDeleteModal);
    document.getElementById('delete-device-btn')?.addEventListener('click', handleDeleteDeviceClick);
    document.getElementById('delete-cloud-btn')?.addEventListener('click', handleDeleteCloudClick);

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
