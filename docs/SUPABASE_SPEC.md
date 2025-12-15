# Supabase 仕様書

> 最終更新: 2025-12-15

このドキュメントはQuizAppで使用しているSupabaseの設定を記録しています。

---

## 📊 テーブル構成

### materials（教材）
クイズの元となる教材データを保存。

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | text | NO | - | Primary Key (UUID形式) |
| user_id | uuid | YES | null | 作成者ID（未ログインはnull） |
| title | text | NO | - | 教材タイトル |
| content | text | YES | null | 教材本文（Markdown） |
| summary | text | YES | null | AI生成サマリー |
| source_type | text | YES | null | ソースタイプ |
| source_name | text | YES | null | ファイル名など |
| upload_date | timestamp | YES | null | アップロード日時 |
| created_at | timestamp | YES | now() | 作成日時 |
| deleted_at | timestamp | YES | null | 削除日時（論理削除） |
| tags | uuid[] | YES | null | タグ配列 |
| question_ids | uuid[] | YES | '{}' | 問題ID配列 |

---

### questions（問題）
クイズの問題データを保存。

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | text | NO | - | Primary Key (UUID形式) |
| user_id | uuid | YES | null | 作成者ID（未ログインはnull） |
| material_id | text | YES | null | 親教材ID (FK) |
| question_text | text | NO | - | 問題文 |
| choices | jsonb | NO | - | 選択肢配列 |
| correct_answer | text | NO | - | 正解 |
| explanation | text | YES | null | 解説 |
| review_count | integer | YES | 0 | 復習回数 |
| last_reviewed | timestamp | YES | null | 最終復習日時 |
| next_review | timestamp | YES | null | 次回復習予定 |
| ease_factor | double | YES | 2.5 | 難易度係数 |
| interval | integer | YES | 0 | 復習間隔（日） |
| image_url | text | YES | null | 画像URL/Base64 |
| image_grid_index | integer | YES | null | グリッド画像内の位置 |
| created_at | timestamp | YES | now() | 作成日時 |
| deleted_at | timestamp | YES | null | 削除日時（論理削除） |

---

### profiles（プロフィール）
ユーザープロフィールと統計。

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | uuid | NO | - | Primary Key (= auth.uid) |
| email | text | YES | null | メールアドレス |
| full_name | text | YES | null | 表示名 |
| avatar_url | text | YES | null | アバター画像URL |
| streak | integer | YES | 0 | 連続学習日数 |
| total_answered | integer | YES | 0 | 総回答数 |
| correct_answers | integer | YES | 0 | 正解数 |
| last_study_date | timestamp | YES | null | 最終学習日 |
| updated_at | timestamp | YES | now() | 更新日時 |

---

### shared_quizzes（共有クイズ）
シェア用のクイズデータ。

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | text | NO | gen_random_uuid() | Primary Key |
| material_data | jsonb | NO | - | 教材データ全体 |
| questions_data | jsonb | NO | - | 問題データ配列 |
| share_key | text | YES | null | コンテンツハッシュ（重複防止） |
| view_count | integer | YES | 0 | 閲覧数 |
| created_at | timestamp | YES | now() | 作成日時 |
| expires_at | timestamp | YES | now()+30days | 有効期限 |

---

## 🔐 RLS (Row Level Security) ポリシー

### materials
| ポリシー名 | 操作 | 条件 |
|-----------|------|------|
| Anyone can view materials | SELECT | true |
| Anyone can insert materials | INSERT | true |
| Anyone can update materials | UPDATE | true |
| Users can crud own materials | ALL | auth.uid() = user_id |

### questions
| ポリシー名 | 操作 | 条件 |
|-----------|------|------|
| Anyone can view questions | SELECT | true |
| Anyone can insert questions | INSERT | true |
| Anyone can update questions | UPDATE | true |
| Users can crud own questions | ALL | auth.uid() = user_id |

### profiles
| ポリシー名 | 操作 | 条件 |
|-----------|------|------|
| Users can view own profile | SELECT | auth.uid() = id |
| Users can insert own profile | INSERT | auth.uid() = id |
| Users can update own profile | UPDATE | auth.uid() = id |

### shared_quizzes
| ポリシー名 | 操作 | 条件 |
|-----------|------|------|
| Anyone can read shared quizzes | SELECT | true |
| Anyone can insert shared_quizzes | INSERT | true |

---

## 🔑 認証設定

- **プロバイダー**: Google OAuth
- **自動プロフィール作成**: auth.users への INSERT 時に profiles を自動作成（トリガー）

---

## 📝 設定確認用SQL

現在の設定を確認するには、Supabase SQLエディタで以下を実行：

```sql
-- テーブル一覧とカラム情報
SELECT 
    t.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;

-- RLSポリシー一覧
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- RLS有効化状況
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';
```

---

## ⚠️ 注意事項

1. **未ログインユーザー**: `user_id` は null で保存される
2. **みんなの広場**: `materials` と `questions` は誰でも閲覧・投稿可能
3. **プロフィール**: 本人のみ閲覧・編集可能
4. **共有クイズ**: 30日で自動期限切れ
