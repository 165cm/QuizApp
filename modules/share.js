import { appState } from './state.js';
import { saveMaterials, saveQuestions } from './storage.js';
import { showScreen } from './ui.js';

// Access globals
const LZString = window.LZString;
const QRCode = window.QRCode;

// --- Certificate ---
// --- Certificate ---
export function showCertificate() {
    const { correct, total } = appState.currentSession;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const quizTitle = appState.sharedQuizTitle || 'クイズ';

    document.getElementById('cert-quiz-title').textContent = quizTitle;
    document.getElementById('cert-score').textContent = `${accuracy}%`;
    document.getElementById('cert-detail').textContent = `(${total}問中${correct}問正解)`;

    const now = new Date();
    document.getElementById('cert-date').textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

    // Rank Logic & UI
    const headerEl = document.querySelector('.certificate-header');

    // Clean up previous elements
    const existingShowcase = document.getElementById('rank-showcase');
    if (existingShowcase) existingShowcase.remove();
    const existingMainVisual = document.getElementById('rank-main-visual-container');
    if (existingMainVisual) existingMainVisual.remove();
    const oldImg = document.getElementById('cert-rank-image');
    if (oldImg) oldImg.style.display = 'none';

    // Default Images (Indices: Gold=9, Silver=10, Bronze=11)
    const ranks = [
        { label: '梅', score: 0, index: 11, color: '#64748b', class: 'rank-bronze' },
        { label: '竹', score: 60, index: 10, color: '#94a3b8', class: 'rank-silver' },
        { label: '松', score: 90, index: 9, color: '#fbbf24', class: 'rank-gold' }
    ];

    const firstQ = appState.currentQuiz ? appState.currentQuiz[0] : null;

    if (firstQ && firstQ.imageUrl && firstQ.imageGridIndex !== undefined) {

        let currentRank = ranks[0]; // Default Bronze
        if (accuracy >= 90) currentRank = ranks[2];
        else if (accuracy >= 60) currentRank = ranks[1];

        // Standard Style: 3 Rank Slots (Current=Large, Others=Small)
        // Adapted from game.js

        const showcase = document.createElement('div');
        showcase.id = 'rank-showcase';
        showcase.className = 'rank-showcase';
        showcase.style.display = 'flex';
        showcase.style.justifyContent = 'center';
        showcase.style.alignItems = 'center';
        showcase.style.gap = '12px';
        showcase.style.marginBottom = '1.5rem';

        ranks.forEach((rank) => {
            const slot = document.createElement('div');

            // Logic: Is this the current rank?
            const isCurrent = (rank.score === 90 && accuracy >= 90) ||
                (rank.score === 60 && accuracy >= 60 && accuracy < 90) ||
                (rank.score === 0 && accuracy < 60 && rank.label === '梅');

            // Logic: Is achieved (passed)?
            const isAchieved = accuracy >= rank.score;

            // Size Logic: Current Rank is HUGE (160px for share, maybe slightly smaller than game.js 180px to fit width? let's try 160px). Others 60px.
            // Game.js uses 180px / 60px.
            const size = isCurrent ? '180px' : '60px';

            slot.style.width = size;
            slot.style.height = size;
            slot.style.borderRadius = isCurrent ? '20px' : '12px';
            slot.style.position = 'relative';
            slot.style.overflow = 'hidden';
            slot.style.border = '2px solid rgba(255,255,255,0.1)';
            slot.style.background = '#1e293b';
            slot.style.flexShrink = '0'; // Prevent shrinking
            slot.style.transition = 'all 0.3s ease';

            const imgDiv = document.createElement('div');
            imgDiv.style.width = '100%';
            imgDiv.style.height = '100%';
            imgDiv.style.background = `url(${firstQ.imageUrl})`;
            imgDiv.style.backgroundSize = '420% 315%';

            const rCol = rank.index % 4;
            const rRow = Math.floor(rank.index / 4);
            const rX = (rCol / 3) * 100;
            const rY = (rRow / 2) * 100;
            imgDiv.style.backgroundPosition = `${rX}% ${rY}%`;

            if (isCurrent) {
                slot.style.border = `4px solid ${rank.color}`;
                slot.style.boxShadow = `0 10px 30px ${rank.color}60`;
                slot.style.zIndex = '10';

                // Shine for current
                const shine = document.createElement('div');
                shine.className = 'rank-visual-shine';
                slot.appendChild(shine);

            } else if (isAchieved) {
                imgDiv.style.filter = 'grayscale(0.6)';
                const check = document.createElement('div');
                check.textContent = '✓';
                check.style.position = 'absolute';
                check.style.bottom = '2px';
                check.style.right = '4px';
                check.style.color = '#10b981';
                check.style.fontWeight = 'bold';
                check.style.fontSize = '0.8rem';
                slot.appendChild(check);
            } else {
                imgDiv.style.filter = 'brightness(0) opacity(0.3)';
                const lock = document.createElement('div');
                lock.textContent = '?';
                lock.style.position = 'absolute';
                lock.style.top = '50%';
                lock.style.left = '50%';
                lock.style.transform = 'translate(-50%, -50%)';
                lock.style.fontSize = '1.2rem';
                lock.style.color = 'rgba(255,255,255,0.3)';
                slot.appendChild(lock);
            }

            slot.appendChild(imgDiv);
            showcase.appendChild(slot);
        });

        // Insert Showcase BEFORE the Body Name Section (Top of body)
        const certBody = document.querySelector('.certificate-body');
        const nameSection = document.querySelector('.certificate-name-section');
        certBody.insertBefore(showcase, nameSection);

    } else {
        // Fallback or No Image
        const rankImgEl = document.getElementById('cert-rank-image');
        if (rankImgEl) rankImgEl.style.display = 'block'; // Or hide, based on preference
    }

    showScreen('certificate-screen');
}

// --- Shared Certificate ---

export function generateCertificateShareURL() {
    const { correct, total } = appState.currentSession;
    const accuracy = Math.round((correct / total) * 100);
    const quizTitle = appState.sharedQuizTitle || 'クイズ';

    // Include Image Metadata
    const firstQ = appState.currentQuiz ? appState.currentQuiz[0] : null;
    const imgUrl = (firstQ && firstQ.imageUrl) ? firstQ.imageUrl : null;
    const isGrid = (firstQ && firstQ.imageGridIndex !== undefined);

    const certData = {
        version: 1, type: 'certificate',
        quizTitle, accuracy, correct, total,
        date: new Date().toISOString(),
        imgUrl, isGrid
    };
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(certData));
    const baseURL = window.location.href.split('?')[0]; // Use href to get full path including hash if needed
    // Better to use origin + pathname
    const cleanBaseURL = window.location.origin + window.location.pathname;
    return `${cleanBaseURL}?cert=${compressed}`;
}

export function checkForSharedCertificate() {
    const urlParams = new URLSearchParams(window.location.search);
    const cert = urlParams.get('cert');
    if (!cert) return false;

    try {
        const decompressed = LZString.decompressFromEncodedURIComponent(cert);
        if (!decompressed) throw new Error('URL invalid');
        const certData = JSON.parse(decompressed);
        if (certData.version !== 1 || certData.type !== 'certificate') throw new Error('Invalid version');

        showSharedCertificate(certData);
        return true;
    } catch (err) {
        console.error(err);
        alert('認定証の読み込みに失敗しました');
        window.history.replaceState({}, document.title, window.location.pathname);
        return false;
    }
}

function showSharedCertificate(certData) {
    const { quizTitle, accuracy, correct, total, date, imgUrl, isGrid } = certData;
    document.getElementById('cert-quiz-title').textContent = quizTitle;
    document.getElementById('cert-score').textContent = `${accuracy}%`;
    document.getElementById('cert-detail').textContent = `(${total}問中${correct}問正解)`;
    const certDate = new Date(date);
    document.getElementById('cert-date').textContent = `${certDate.getFullYear()}年${certDate.getMonth() + 1}月${certDate.getDate()}日`;

    // Rank Image Logic (Duplicated for shared view)
    // Note: In shared view, we depend on certData.imgUrl
    const headerEl = document.querySelector('.certificate-header');
    // Remove any existing dynamic rank div from previous views
    const existingRankDiv = document.getElementById('cert-rank-image-div');
    if (existingRankDiv) existingRankDiv.remove();

    // We expect the original IMG check
    let rankImgEl = document.getElementById('cert-rank-image');
    if (!rankImgEl) {
        // If missing (because we replaced it), recreate it or append to header
        rankImgEl = document.createElement('img');
        rankImgEl.id = 'cert-rank-image';
        rankImgEl.className = 'certificate-rank-image hidden';
        headerEl.prepend(rankImgEl); // Prepend to be at top
    }

    if (imgUrl && isGrid) {
        let rankImageIndex = 11; // Default
        let rankColor = '#64748b';

        if (accuracy >= 90) {
            rankImageIndex = 9;
            rankColor = '#fbbf24';
        } else if (accuracy >= 60) {
            rankImageIndex = 10;
            rankColor = '#94a3b8';
        }

        const rankDiv = document.createElement('div');
        rankDiv.className = 'certificate-rank-image';
        rankDiv.id = 'cert-rank-image-div';
        rankDiv.style.width = '160px';
        rankDiv.style.height = '120px';
        rankDiv.style.margin = '0 auto 1rem';
        rankDiv.style.borderRadius = '16px';
        rankDiv.style.background = `url(${imgUrl})`;
        rankDiv.style.backgroundSize = '420% 315%';
        rankDiv.style.border = `4px solid ${rankColor}`;
        rankDiv.style.boxShadow = '0 8px 20px rgba(0,0,0,0.3)';
        rankDiv.style.display = 'block';

        const col = rankImageIndex % 4;
        const row = Math.floor(rankImageIndex / 4);
        const colPos = (col / 3) * 100;
        const rowPos = (row / 2) * 100;
        rankDiv.style.backgroundPosition = `${colPos}% ${rowPos}%`;

        // Insert after badge or at start of header
        // Since we are replacing the IMG tag usually
        const target = document.getElementById('cert-rank-image');
        if (target) {
            target.style.display = 'none';
            target.parentNode.insertBefore(rankDiv, target);
        } else {
            headerEl.insertBefore(rankDiv, headerEl.firstChild);
        }
    } else {
        // Show Badge if no image
        // Reset display if needed
    }

    appState.isSharedQuiz = true;
    appState.sharedQuizTitle = quizTitle;
    appState.currentSession = { correct, total };

    // Buttons are always visible - users can navigate or share
    const tryAgainBtn = document.getElementById('try-again-btn');
    if (tryAgainBtn) tryAgainBtn.style.display = 'block';

    const shareCertBtn = document.getElementById('share-certificate-btn');
    if (shareCertBtn) {
        shareCertBtn.textContent = '📤 結果をシェア';
        shareCertBtn.style.display = 'block';
    }

    const createQuizBtn = document.getElementById('create-own-quiz-btn');
    if (createQuizBtn) createQuizBtn.style.display = 'block';
    showScreen('certificate-screen');
}

// --- Material Share ---

// --- Challenge Share (Called from Result Screen) ---
export function shareChallenge(correct, total, rankLabel, finalRankImageIndex, imgUrl) {
    // Set up state for certificate view
    appState.sharedQuizTitle = appState.currentMaterialId
        ? appState.materials.find(m => m.id === appState.currentMaterialId)?.title
        : 'クイズ';

    appState.currentSession = { correct, total };

    // We need to ensure currentQuiz has the image URL for the certificate to use
    // If imgUrl is passed, update the first question's imageUrl just in case
    if (imgUrl && appState.currentQuiz && appState.currentQuiz.length > 0) {
        appState.currentQuiz[0].imageUrl = imgUrl; // Ensure it sees the image
        // Also check if grid index is needed? Main visual logic handles it.
    }

    showCertificate();
}

// Get Supabase client (shared across app)
function getSupabase() {
    return window.supabaseClient;
}

// Generate a consistent hash key for share data (for deduplication)
async function generateShareKey(shareData) {
    const content = JSON.stringify({
        title: shareData.material.title,
        questions: shareData.questions.map(q => ({
            question: q.question,
            correctIndex: q.correctIndex
        }))
    });
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Increment view count for a shared quiz
async function incrementViewCount(quizId) {
    const supabase = getSupabase();
    if (!supabase) return;
    try {
        await supabase.rpc('increment_view_count', { quiz_id: quizId });
    } catch (e) {
        // RPC function might not exist yet, fallback to direct update
        try {
            await supabase
                .from('shared_quizzes')
                .update({ view_count: supabase.rpc('coalesce', ['view_count', 0]).add(1) })
                .eq('id', quizId);
        } catch (e2) {
            // Silently fail - view count is not critical
        }
    }
}

// Generate short share URL using Supabase storage
export async function generateShareURL(materialId) {


    const material = appState.materials.find(m => m.id === materialId);
    if (!material) {
        console.error('❌ Material not found in appState');
        return null;
    }
    const questions = appState.questions.filter(q => q.materialId === materialId);

    const shareData = {
        material: {
            title: material.title,
            summary: material.summary,
            tags: material.tags,
            fileName: material.fileName
        },
        questions: questions.map(q => ({
            question: q.question,
            choices: q.choices,
            correctIndex: q.correctIndex,
            explanation: q.explanation || '',
            difficulty: q.difficulty,
            sourceSection: q.sourceSection,
            tags: q.tags,
            imageUrl: q.imageUrl,
            imageGridIndex: q.imageGridIndex
        }))
    };

    const supabase = getSupabase();
    if (supabase) {
        try {
            // Generate a unique key based on content hash
            const shareKey = await generateShareKey(shareData);
            const baseURL = window.location.origin + window.location.pathname;

            // Check if this quiz was already shared (reuse existing URL)
            const { data: existing } = await supabase
                .from('shared_quizzes')
                .select('id')
                .eq('share_key', shareKey)
                .maybeSingle();

            if (existing) {
                // Return existing share URL
                return `${baseURL}?s=${existing.id}`;
            }

            // Create new share record
            const { data, error } = await supabase
                .from('shared_quizzes')
                .insert({
                    material_data: shareData.material,
                    questions_data: shareData.questions,
                    share_key: shareKey,
                    view_count: 0
                })
                .select('id')
                .single();

            if (error) {
                // 重複キーエラーの場合（23505）は既存レコードを取得
                if (error.code === '23505') {
                    console.log('Share key already exists, fetching existing record...');
                    const { data: existingRecord } = await supabase
                        .from('shared_quizzes')
                        .select('id')
                        .eq('share_key', shareKey)
                        .single();

                    if (existingRecord) {
                        return `${baseURL}?s=${existingRecord.id}`;
                    }
                }
                console.error('❌ Supabase insert error detailed:', error);
                throw error;
            }

            return `${baseURL}?s=${data.id}`;
        } catch (e) {
            console.error('Supabase share error:', e);
            // Fall back to LZ compression
        }
    }

    // Fallback: LZ compression (for offline or Supabase unavailable)
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify({ version: 1, ...shareData }));
    const baseURL = window.location.href.split('?')[0];
    return `${baseURL}?share=${compressed}`;
}

export async function checkForSharedMaterial(startQuizCallback) {


    const urlParams = new URLSearchParams(window.location.search);
    let shortId = urlParams.get('s');
    let share = urlParams.get('share');

    // Robust check: if params are missing in search, check hash (for #?s=... case)
    if (!shortId && !share && window.location.hash.includes('?')) {

        const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
        shortId = hashParams.get('s');
        share = hashParams.get('share');
    }



    // Check for Supabase short ID first (?s=)
    if (shortId) {
        try {
            const supabase = getSupabase();
            if (!supabase) throw new Error('Supabase not available');


            const { data, error } = await supabase
                .from('shared_quizzes')
                .select('material_data, questions_data, view_count')
                .eq('id', shortId)
                .single();

            if (error) throw error;

            // Increment view count asynchronously (don't wait)
            incrementViewCount(shortId);

            const shareData = {
                material: data.material_data,
                questions: data.questions_data,
                viewCount: (data.view_count || 0) + 1
            };

            const newMaterialId = importSharedMaterial(shareData);
            showSharedQuizLanding(newMaterialId, shareData, startQuizCallback);
            return true;
        } catch (err) {
            console.error('Supabase fetch error:', err);
            alert('共有クイズの読み込みに失敗しました。URLが無効か期限切れの可能性があります。');
            window.history.replaceState({}, document.title, window.location.pathname);
            return false;
        }
    }

    // Fallback: Check for legacy LZ compressed share (?share=)
    if (!share) return false;

    try {
        const decompressed = LZString.decompressFromEncodedURIComponent(share);
        if (!decompressed) throw new Error('URL invalid');
        const shareData = JSON.parse(decompressed);
        if (shareData.version !== 1) throw new Error('Invalid version');

        const newMaterialId = importSharedMaterial(shareData);
        showSharedQuizLanding(newMaterialId, shareData, startQuizCallback);
        return true;
    } catch (err) {
        console.error(err);
        alert('共有データの読み込みに失敗しました');
        window.history.replaceState({}, document.title, window.location.pathname);
        return false;
    }
}

function importSharedMaterial(shareData) {
    // Use UUID format for cloud sync compatibility
    const newMaterialId = crypto.randomUUID();
    const newReferenceId = crypto.randomUUID();
    const titleSuffix = shareData.material.title.endsWith(' (共有)') ? '' : ' (共有)';

    const newMaterial = {
        id: newMaterialId,
        title: shareData.material.title + titleSuffix,
        summary: shareData.material.summary,
        content: `# ${shareData.material.title}\n\n${shareData.material.summary}\n\n*この教材は共有URLからインポートされたため、元の本文は含まれていません。*`,
        tags: shareData.material.tags,
        fileName: shareData.material.fileName,
        uploadDate: new Date().toISOString(),
        questionIds: [],
        isShared: true
    };

    const newQuestions = shareData.questions.map((q, index) => ({
        id: crypto.randomUUID(),
        ...q,
        materialId: newMaterialId,
        lastReviewed: null,
        reviewCount: 0,
        easeFactor: 2.5,
        interval: 0,
        nextReview: null,
        reference: {
            id: newReferenceId,
            fileName: shareData.material.fileName,
            uploadDate: new Date().toISOString(),
            section: q.sourceSection || ''
        }
    }));

    newMaterial.questionIds = newQuestions.map(q => q.id);

    appState.materials.push(newMaterial);
    appState.questions.push(...newQuestions);
    saveMaterials();
    saveQuestions();

    return newMaterialId;
}

function showSharedQuizLanding(materialId, shareData, startQuizCallback) {
    const title = shareData.material.title;
    const questionCount = shareData.questions.length;

    document.getElementById('shared-quiz-title').textContent = title;
    document.getElementById('shared-quiz-count').textContent = questionCount;
    document.getElementById('shared-quiz-time').textContent = Math.ceil(questionCount / 2);

    // Show view count if available
    const viewCountEl = document.getElementById('shared-quiz-views');
    const viewCountStat = document.getElementById('view-count-stat');
    if (viewCountEl && viewCountStat && shareData.viewCount) {
        viewCountEl.textContent = shareData.viewCount;
        viewCountStat.style.display = 'flex';
    }

    showScreen('shared-quiz-landing');

    const startBtn = document.getElementById('start-shared-quiz-btn');
    // Remove old listeners by cloning
    const newBtn = startBtn.cloneNode(true);
    startBtn.parentNode.replaceChild(newBtn, startBtn);

    newBtn.addEventListener('click', () => {
        appState.currentMaterialId = materialId;
        appState.selectedMaterial = materialId;
        appState.isSharedQuiz = true;
        appState.sharedQuizTitle = title;
        if (startQuizCallback) startQuizCallback();
    });
}

export async function copyShareURL(materialId) {
    try {
        const url = await generateShareURL(materialId);
        if (!url) {
            alert('シェアURLの生成に失敗しました（データが見つからないかエラーが発生しました）');
            return;
        }

        await navigator.clipboard.writeText(url);

        // Clone material as "Shared" history instead of modifying original
        duplicateAsShared(materialId, url);

        // Original material remains untouched (unmarked) to allow re-sharing
        // const material = appState.materials.find(m => m.id === materialId);
        // if (material) {
        //    material.hasBeenShared = true;
        //    saveMaterials();
        // }

        // Show success message in UI
        document.getElementById('share-result')?.classList.remove('hidden');
        document.getElementById('share-success')?.classList.remove('hidden');
        document.getElementById('qr-code-container')?.classList.add('hidden');
    } catch (err) {
        console.error('Copy Share URL Error:', err);
        alert('エラーが発生しました: ' + (err.message || '詳細不明'));
    }
}

function duplicateAsShared(originalId, shareUrl) {
    const original = appState.materials.find(m => m.id === originalId);
    if (!original) return;

    // Avoid duplicating if a shared copy already exists for this URL? 
    // Maybe checking shareUrl in existing materials?
    // For now, simple duplication as user requested "Clone".

    // Create Clone
    const clone = JSON.parse(JSON.stringify(original));
    clone.id = `shared_${Date.now()}`;
    clone.title = `${original.title} (共有済み)`;
    clone.isShared = true; // This puts it in "Shared" tab
    clone.hasBeenShared = true;
    clone.shareUrl = shareUrl;
    clone.originalId = originalId;
    clone.uploadDate = new Date().toISOString();

    // Copy Questions
    const originalQuestions = appState.questions.filter(q => q.materialId === originalId);
    const newQuestions = originalQuestions.map(q => {
        const qClone = JSON.parse(JSON.stringify(q));
        qClone.id = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        qClone.materialId = clone.id;
        return qClone;
    });

    // Save
    appState.materials.push(clone);
    appState.questions.push(...newQuestions);
    saveMaterials();
    saveQuestions();
}

export async function generateQRCode(materialId) {
    const qrContainer = document.getElementById('qr-code');
    qrContainer.innerHTML = '<p style="color: #888;">生成中...</p>';

    const url = await generateShareURL(materialId);
    if (!url) {
        qrContainer.innerHTML = '<p style="color: #ef4444;">URL生成エラー</p>';
        return;
    }

    qrContainer.innerHTML = ''; // Clear loading message

    try {
        new QRCode(qrContainer, {
            text: url,
            width: 180,
            height: 180,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    } catch (e) {
        console.error('QR Generate Error', e);
        qrContainer.textContent = 'QRコード生成エラー';
    }

    const material = appState.materials.find(m => m.id === materialId);
    if (material) {
        material.hasBeenShared = true;
        saveMaterials();
    }
}

// Helper to copy text to clipboard with fallback
export function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text)
            .catch(err => {
                console.error('Async: Could not copy text: ', err);
                fallbackCopyTextToClipboard(text);
            });
    } else {
        fallbackCopyTextToClipboard(text);
        return Promise.resolve();
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;

    // Ensure it's not visible but part of DOM
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);

    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (!successful) console.error('Fallback: Copying text command was unsuccessful');
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }

    document.body.removeChild(textArea);
}

// --- Viral / Challenge Share ---
// (Previously contained shareChallenge logic, removed to avoid duplicate declaration and prefer certificate view flow)

// Helper to crop 4x3 grid panel (Exported just in case needed later, or can act as standalone utility)
export async function cropGridImage(base64Url, index) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const totalCols = 4;
            const totalRows = 3;

            // Calculate panel size
            const panelW = img.width / totalCols;
            const panelH = img.height / totalRows;

            canvas.width = panelW;
            canvas.height = panelH;

            const ctx = canvas.getContext('2d');

            const col = index % 4;
            const row = Math.floor(index / 4);

            const sX = col * panelW;
            const sY = row * panelH;

            ctx.drawImage(img, sX, sY, panelW, panelH, 0, 0, panelW, panelH);

            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        };
        img.onerror = () => resolve(null);
        img.src = base64Url;
    });
}
