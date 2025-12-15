import { appState } from './state.js';
import { supabase } from './supabase.js';


// Load data from Storage or Supabase
// (Removed duplicate exports)

// Load data from Storage or Supabase
// 日本時間朝6時を基準にした「論理日」を取得
function getJSTLogicalDate() {
    const now = new Date();
    // 日本時間に変換 (UTC+9)
    const jstOffset = 9 * 60; // 分単位
    const utcMinutes = now.getTime() / 60000 + now.getTimezoneOffset();
    const jstMinutes = utcMinutes + jstOffset;
    const jstDate = new Date(jstMinutes * 60000);

    // 朝6時前なら「前日」として扱う
    if (jstDate.getHours() < 6) {
        jstDate.setDate(jstDate.getDate() - 1);
    }

    // YYYY-MM-DD形式で返す
    return jstDate.toISOString().split('T')[0];
}

export function getFreeGenCount() {
    const stored = localStorage.getItem('quiz_free_gen');
    if (!stored) return 0;

    try {
        const data = JSON.parse(stored);
        const today = getJSTLogicalDate();

        // 日付が違えばリセット（0を返す）
        if (data.date !== today) {
            return 0;
        }
        return data.count || 0;
    } catch {
        return 0;
    }
}

export function incrementFreeGenCount() {
    const today = getJSTLogicalDate();
    const data = {
        date: today,
        count: getFreeGenCount() + 1
    };
    localStorage.setItem('quiz_free_gen', JSON.stringify(data));
}

export function getDeviceId() {
    let id = localStorage.getItem('device_id');
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('device_id', id);
    }
    return id;
}

export async function loadData() {
    // 1. Always load local data first for speed
    const localQuestions = JSON.parse(localStorage.getItem('questions') || '[]');
    const localMaterials = JSON.parse(localStorage.getItem('materials') || '[]');
    const localStats = JSON.parse(localStorage.getItem('user_stats') || JSON.stringify({
        totalAnswered: 0,
        correctAnswers: 0,
        lastStudyDate: null,
        streak: 0
    }));

    appState.questions = localQuestions;
    appState.materials = localMaterials;
    appState.userStats = localStats;
    if (localQuestions) appState.questions = localQuestions;
    if (localMaterials) appState.materials = localMaterials;
    if (localStats) {
        // Merge with defaults to ensure all fields (like streak) exist
        appState.userStats = { ...appState.userStats, ...localStats };
    }
    appState.apiKey = localStorage.getItem('openai_api_key') || '';

    // Load quiz settings (customizations)
    const localSettings = JSON.parse(localStorage.getItem('quiz_settings') || 'null');
    if (localSettings) {
        appState.quizSettings = localSettings;
    }

    // 2. If logged in, fetch latest from Supabase and merge
    if (appState.currentUser) {
        await syncWithSupabase();
    }
}

// Sync local data with Supabase
export async function syncWithSupabase() {
    if (!appState.currentUser) return;
    const userId = appState.currentUser.id;

    // --- PROFILES (Stats) ---
    try {
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError && profileError.code !== 'PGRST116') {
            console.error('Profile fetch error:', profileError);
        }

        if (profile) {
            // Merge stats: use higher value (progress never decreases)
            const mergedStats = {
                totalAnswered: Math.max(profile.total_answered || 0, appState.userStats.totalAnswered || 0),
                correctAnswers: Math.max(profile.correct_answers || 0, appState.userStats.correctAnswers || 0),
                lastStudyDate: profile.last_study_date || appState.userStats.lastStudyDate,
                streak: Math.max(profile.streak || 0, appState.userStats.streak || 0)
            };
            appState.userStats = mergedStats;
            localStorage.setItem('user_stats', JSON.stringify(appState.userStats));

            // Merge Settings (Quiz Customization)
            if (profile.settings && profile.settings.quizSettings) {
                appState.quizSettings = profile.settings.quizSettings;
                localStorage.setItem('quiz_settings', JSON.stringify(appState.quizSettings));
            }

            // Push merged stats and settings back to server
            // Use try-catch for update specifically to avoid blocking if schema mismatch
            try {
                await supabase.from('profiles').update({
                    total_answered: mergedStats.totalAnswered,
                    correct_answers: mergedStats.correctAnswers,
                    // streak: mergedStats.streak, 
                    settings: { quizSettings: appState.quizSettings },
                    updated_at: new Date().toISOString()
                }).eq('id', userId);
            } catch (updateErr) {
                console.warn('Profile update failed (schema mismatch?):', updateErr);
            }
        } else {
            // No profile exists, create from local
            try {
                await supabase.from('profiles').insert({
                    id: userId,
                    email: appState.currentUser.email,
                    full_name: appState.currentUser.user_metadata?.full_name,
                    avatar_url: appState.currentUser.user_metadata?.avatar_url,
                    total_answered: appState.userStats.totalAnswered,
                    correct_answers: appState.userStats.correctAnswers,
                    last_study_date: appState.userStats.lastStudyDate,
                    // streak: appState.userStats.streak,
                    settings: { quizSettings: appState.quizSettings }
                });
            } catch (insertErr) {
                console.warn('Profile insert failed:', insertErr);
            }
        }
    } catch (e) {
        console.error('Profile Sync Error:', e);
    }

    // --- MATERIALS ---
    try {
        const { data: remoteMaterials } = await supabase
            .from('materials')
            .select('*')
            .eq('user_id', userId);

        const serverMaterialIds = new Set((remoteMaterials || []).map(m => String(m.id)));
        const localMaterialIds = new Set(appState.materials.map(m => String(m.id)));

        // PULL: Handle server items
        (remoteMaterials || []).forEach(rm => {
            if (rm.deleted_at) {
                appState.materials = appState.materials.filter(m => String(m.id) !== String(rm.id));
                appState.questions = appState.questions.filter(q => q.materialId !== rm.id);
            } else if (!localMaterialIds.has(String(rm.id))) {
                // New item from cloud → add to local with mapping
                const localMat = {
                    id: rm.id,
                    title: rm.title,
                    content: rm.content,
                    summary: rm.summary || '',
                    fileName: rm.source_name,
                    uploadDate: rm.upload_date || rm.created_at || new Date().toISOString(),
                    tags: rm.tags || [],
                    deleted_at: null
                };
                appState.materials.push(localMat);
            }
        });

        // PUSH: Upload local items
        const materialsToUpload = appState.materials.filter(m => !serverMaterialIds.has(String(m.id)));
        for (const m of materialsToUpload) {
            await saveMaterialToCloud(m);
        }
        saveMaterials();
    } catch (e) {
        console.error('Materials Sync Error:', e);
    }

    // --- QUESTIONS ---
    try {
        const { data: remoteQuestions } = await supabase
            .from('questions')
            .select('*')
            .eq('user_id', userId);

        const serverQuestionIds = new Set((remoteQuestions || []).map(q => String(q.id)));
        const localQuestionIds = new Set(appState.questions.map(q => String(q.id)));

        // PULL: Handle server items
        (remoteQuestions || []).forEach(rq => {
            if (rq.deleted_at) {
                appState.questions = appState.questions.filter(q => String(q.id) !== String(rq.id));
            } else if (!localQuestionIds.has(String(rq.id))) {
                // Ignore broken data on pull
                if (rq.question_text === 'No question text') return;

                // Map cloud format to local format
                const localFormat = {
                    id: rq.id,
                    question: rq.question_text,
                    choices: rq.choices || [],
                    correctIndex: rq.choices?.indexOf(rq.correct_answer) ?? 0,
                    explanation: rq.explanation || '',
                    materialId: rq.material_id,
                    imageUrl: rq.image_url,
                    imageGridIndex: rq.image_grid_index,
                    reviewCount: rq.review_count || 0,
                    lastReviewed: rq.last_reviewed,
                    easeFactor: rq.ease_factor || 2.5
                };
                appState.questions.push(localFormat);
            } else {
                // Merge logic...
                const localQ = appState.questions.find(q => String(q.id) === String(rq.id));
                if (localQ && (rq.review_count || 0) > (localQ.reviewCount || 0)) {
                    localQ.reviewCount = rq.review_count;
                    localQ.lastReviewed = rq.last_reviewed;
                    localQ.easeFactor = rq.ease_factor;
                }
            }
        });

        // Cleanup local broken questions just in case
        const initialCount = appState.questions.length;
        appState.questions = appState.questions.filter(q => q.question !== 'No question text');
        if (appState.questions.length !== initialCount) {

        }

        // PUSH: Upload local items
        const questionsToUpload = appState.questions.filter(q => !serverQuestionIds.has(String(q.id)));
        for (const q of questionsToUpload) {
            await saveQuestionToCloud(q);
        }
        saveQuestions();
    } catch (e) {
        console.error('Questions Sync Error:', e);
    }
}

export async function saveQuestions() {
    try {
        localStorage.setItem('questions', JSON.stringify(appState.questions));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.warn('LocalStorage quota exceeded, cleaning up old images...');

            // 古い問題から画像を削除（最新10件以外）
            const sortedQuestions = [...appState.questions].sort((a, b) =>
                new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
            );

            let cleaned = 0;
            for (let i = 10; i < sortedQuestions.length; i++) {
                if (sortedQuestions[i].imageUrl && sortedQuestions[i].imageUrl.startsWith('data:')) {
                    // Base64画像を削除
                    const q = appState.questions.find(q => q.id === sortedQuestions[i].id);
                    if (q) {
                        q.imageUrl = null;
                        cleaned++;
                    }
                }
            }

            if (cleaned > 0) {
                console.log(`Cleaned ${cleaned} old images, retrying save...`);
                try {
                    localStorage.setItem('questions', JSON.stringify(appState.questions));
                    return; // 成功
                } catch (e2) {
                    // まだ容量オーバーなら全画像を削除
                    console.warn('Still over quota, removing all base64 images...');
                    appState.questions.forEach(q => {
                        if (q.imageUrl && q.imageUrl.startsWith('data:')) {
                            q.imageUrl = null;
                        }
                    });
                    try {
                        localStorage.setItem('questions', JSON.stringify(appState.questions));
                        alert('容量を確保するため、古い問題の画像を削除しました。');
                        return;
                    } catch (e3) {
                        // それでもダメならユーザーに通知
                    }
                }
            }

            alert('保存容量が不足しています。「データ管理」から不要なデータを削除してください。');
            console.error('LocalStorage Quota Exceeded after cleanup attempt');
        } else {
            console.error('Save Questions Error:', e);
        }
    }

    // Cloud Sync
    if (appState.currentUser) {
        // ...
    }
}

// New explicit helper to save a single question to cloud
export async function saveQuestionToCloud(question) {
    // Skip legacy IDs (non-UUID format) to prevent FK errors
    const isUUID = (id) => typeof id === 'string' && id.includes('-');
    if (!isUUID(String(question.id))) {
        return; // Silently skip legacy format
    }
    if (question.materialId && !isUUID(String(question.materialId))) {
        return; // Silently skip legacy format
    }

    // Map correctIndex (number) to correct_answer (string) if needed
    let correctAnswer = question.correctAnswer;
    if (correctAnswer === undefined || correctAnswer === null) {
        // Try correctIndex - convert number to the actual answer text
        if (question.correctIndex !== undefined && question.choices) {
            correctAnswer = question.choices[question.correctIndex];
        } else {
            correctAnswer = String(question.correctIndex || 0);
        }
    }

    const qData = {
        id: String(question.id), // Ensure ID is string
        user_id: appState.currentUser?.id || null,  // 未ログインの場合はnull
        material_id: question.materialId ? String(question.materialId) : null,
        question_text: question.question || question.text || 'No question text',
        choices: question.choices || [],
        correct_answer: correctAnswer || 'Unknown',
        explanation: question.explanation || '',
        review_count: question.reviewCount || 0,
        last_reviewed: question.lastReviewed || null,
        ease_factor: question.easeFactor || 2.5,
        image_url: question.imageUrl || null,
        image_grid_index: question.imageGridIndex !== undefined ? question.imageGridIndex : null
    };

    try {
        const { error } = await supabase.from('questions').upsert(qData);
        if (error) {
            console.error('Cloud Save Q Error:', error.message, error.details, 'Question:', question.id);
        }
    } catch (e) {
        console.error('Cloud Save Q Exception:', e);
    }
}

export async function saveMaterials() {
    localStorage.setItem('materials', JSON.stringify(appState.materials));
}

// Helper to save new material to cloud
export async function saveMaterialToCloud(material) {
    // Skip legacy IDs (non-UUID format)
    const isUUID = (id) => typeof id === 'string' && id.includes('-');
    if (!isUUID(String(material.id))) {
        return; // Silently skip legacy format
    }

    const mData = {
        id: material.id,
        user_id: appState.currentUser?.id || null,  // 未ログインの場合はnull
        title: material.title,
        content: material.content,
        summary: material.summary || '',
        source_name: material.fileName,
        upload_date: material.uploadDate,
        tags: material.tags || [],
        question_ids: material.questionIds || []  // 問題IDリストを保存
    };

    try {
        const { error } = await supabase.from('materials').upsert(mData);
        if (error) {
            console.error('Cloud Save Material Error:', error);
            // エラーを投げずにログだけ出す（未ログインでも続行）
        } else {
            console.log('✅ Material saved to cloud:', material.id);
        }
    } catch (e) {
        console.error('Cloud Save Material Exception:', e);
    }
}

export async function saveUserStats() {
    localStorage.setItem('user_stats', JSON.stringify(appState.userStats));

    // Cloud Sync
    if (appState.currentUser) {
        const { error } = await supabase.from('profiles').update({
            total_answered: appState.userStats.totalAnswered,
            correct_answers: appState.userStats.correctAnswers,
            last_study_date: appState.userStats.lastStudyDate,
            // streak: appState.userStats.streak, // Comment out to fix 400 error if column missing
            updated_at: new Date().toISOString()
        }).eq('id', appState.currentUser.id);

        if (error) console.error('Cloud Stats Error:', error.message, error.details);
    }
}

export function saveApiKey(key) {
    localStorage.setItem('openai_api_key', key);
    appState.apiKey = key;
}

export async function saveSettings() {
    localStorage.setItem('quiz_settings', JSON.stringify(appState.quizSettings));

    // Cloud Sync
    if (appState.currentUser) {
        const { error } = await supabase.from('profiles').update({
            settings: { quizSettings: appState.quizSettings },
            updated_at: new Date().toISOString()
        }).eq('id', appState.currentUser.id);

        if (error) console.error('Cloud Settings Save Error:', error);
    }
}

export async function resetAllData() {
    localStorage.removeItem('questions');
    localStorage.removeItem('materials');
    localStorage.removeItem('user_stats');

    if (appState.currentUser) {
        // Optional: clear cloud data too?
        // Probably safer NOT to delete cloud data on a simple reset button unless explicit.
    }

    appState.questions = [];
    appState.materials = [];
    appState.userStats = {
        totalAnswered: 0,
        correctAnswers: 0,
        lastStudyDate: null,
        streak: 0
    };
}

// Reset Stats Only
export async function resetUserStats() {
    // Keep streak? If user wants to reset stats, usually means everything related to performance.
    // The requirement says "正解率や連続学習記録をリセット". So streak is reset.
    // But maybe keep settings?

    appState.userStats = {
        totalAnswered: 0,
        correctAnswers: 0,
        lastStudyDate: null, // Keep date? No, reset behavior.
        streak: 0
    };
    await saveUserStats();
}

// Reset Materials Only (Library Clear)
export async function resetMaterials() {
    if (appState.currentUser) {
        // Soft delete all materials on cloud
        // Getting all material IDs first
        const materialIds = appState.materials.map(m => m.id);

        // It's inefficient to call deleteFromCloud loop.
        // Better to batch update.
        // But for simplicity and consistency with existing logic:
        const now = new Date().toISOString();

        // Bulk update materials
        await supabase
            .from('materials')
            .update({ deleted_at: now })
            .eq('user_id', appState.currentUser.id);

        // Bulk update questions
        await supabase
            .from('questions')
            .update({ deleted_at: now })
            .eq('user_id', appState.currentUser.id);
    }

    appState.materials = [];
    appState.questions = [];
    saveMaterials();
    saveQuestions();
}

// Delete from device only (local)
export function deleteFromDevice(materialId) {
    appState.materials = appState.materials.filter(m => m.id !== materialId);
    appState.questions = appState.questions.filter(q => q.materialId !== materialId);
    saveMaterials();
    saveQuestions();
}

// Delete from cloud (soft delete) + local
export async function deleteFromCloud(materialId) {
    // Soft delete on Supabase (set deleted_at)
    if (appState.currentUser) {
        const now = new Date().toISOString();
        const { error: qError } = await supabase
            .from('questions')
            .update({ deleted_at: now })
            .eq('material_id', materialId);
        if (qError) console.error('Cloud Soft Delete Questions Error:', qError);

        const { error } = await supabase
            .from('materials')
            .update({ deleted_at: now })
            .eq('id', materialId);
        if (error) console.error('Cloud Soft Delete Material Error:', error);
    }

    // Also remove from local
    deleteFromDevice(materialId);
}

// Legacy function - now uses soft delete
// Restoration of deleted function
export async function deleteMaterialFromCloud(materialId) {
    // This assumes deleteFromCloud was available or logic was here. 
    // Looking at previous context, it called deleteFromCloud(materialId).
    // Let's implement it carefully or revert to calling the main delete logic.
    // If deleteFromCloud is not exported, we might need to find where it is.
    // Assuming deleteFromCloud is defined in this file (storage.js) as it was called before.
    // Let's check if deleteFromCloud exists.
    if (typeof deleteFromCloud === 'function') {
        await deleteFromCloud(materialId);
    } else {
        console.warn('deleteFromCloud function not found, skipping cloud delete');
    }
}

// Upload image to Supabase Storage and return Public URL
export async function uploadImage(base64Data, materialId) {
    if (!appState.currentUser) return null; // Can't upload if not logged in

    try {
        // 1. Convert Base64 to Blob
        const byteString = atob(base64Data.split(',')[1]);
        const mimeString = base64Data.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });

        // 2. Generate unique filename
        const fileExt = mimeString.split('/')[1];
        const timestamp = Date.now();
        // Use materialId in filename for easier association
        const fileName = `${materialId}_${timestamp}.${fileExt}`;

        // 3. Upload
        const { data, error } = await supabase.storage
            .from('quiz-images')
            .upload(fileName, blob, {
                contentType: mimeString,
                upsert: true
            });

        if (error) throw error;

        // 4. Get Public URL
        const { data: publicUrlData } = supabase.storage
            .from('quiz-images')
            .getPublicUrl(fileName);

        return publicUrlData.publicUrl;

    } catch (e) {
        console.error('Image Upload Error:', e);
        // Fallback to Base64 (return original) or null?
        // If upload fails, better to keep base64 locally so user sees something, 
        // OR warn user. For now, return null to avoid mixing types if strict.
        // But to be safe, let's return null and log error.
        return null;
    }
}

// Cleanup old images (older than 30 days)
export async function cleanupOldImages() {
    if (!appState.currentUser) return;

    try {

        const now = new Date();
        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

        let deletedCount = 0;
        const filesToDelete = [];

        // 1. Identify old materials
        appState.materials.forEach(m => {
            const uploadDate = new Date(m.uploadDate);
            if (uploadDate < thirtyDaysAgo) {
                // This material is old. Check its questions for Storage URLs.
                const relatedQuestions = appState.questions.filter(q => q.materialId === m.id);

                relatedQuestions.forEach(q => {
                    if (q.imageUrl && q.imageUrl.includes('supabase.co')) {
                        // Extract filename from URL
                        // URL: .../quiz-images/filename.jpg
                        const parts = q.imageUrl.split('/');
                        const fileName = parts[parts.length - 1];
                        filesToDelete.push(fileName);

                        // Clear URL from local state
                        q.imageUrl = null;
                        deletedCount++;
                    }
                });
            }
        });

        if (filesToDelete.length > 0) {


            // 2. Delete from Supabase Storage
            const { error } = await supabase.storage
                .from('quiz-images')
                .remove(filesToDelete);

            if (error) {
                console.error('Storage Cleanup Error:', error);
            } else {

                // 3. Save updated questions (with null imageUrls)
                saveQuestions();
            }
        } else {

        }

    } catch (e) {
        console.error('Cleanup Logic Error:', e);
    }
}
