# 🛠️ エンジニア向け技術ドキュメント

QuizMaster (QuizApp) の技術的な仕様、セットアップ手順、およびアーキテクチャについて解説します。
開発者やコントリビューターはこちらを参照してください。

## 🏗️ 技術スタック

*   **Frontend**: Vanilla JavaScript (ES Modules), HTML5, CSS3
*   **Backend (BaaS)**: [Supabase](https://supabase.com/)
    *   **Database**: PostgreSQL
    *   **Auth**: Supabase Auth (Google Provider)
    *   **Storage**: Supabase Storage
*   **AI Models**:
    *   **Text**: OpenAI `gpt-4o-mini`
    *   **Image**: Google `gemini-3-pro-image-preview` (via Proxy or Direct)
*   **Libraries**:
    *   `pdf.js`: PDF解析
    *   `marked.js`: Markdownレンダリング
    *   `lz-string`: 文字列圧縮
    *   `qrcodejs`: QRコード生成

## 📂 プロジェクト構成

```
QuizApp/
├── index.html          # エントリーポイント (SPAライクな構造)
├── styles.css          # グローバルスタイル (変数定義、ダークモード、Glassmorphism)
├── main.js             # アプリケーションの初期化、イベントリスナー設定
├── modules/            # 機能ごとに分割されたESモジュール
│   ├── api.js          # OpenAI/Gemini APIとの通信、フォールバック処理
│   ├── auth.js         # Supabase Authラッパー
│   ├── game.js         # クイズ実行画面のロジック
│   ├── library.js      # 教材一覧・詳細表示、削除機能
│   ├── settings.js     # 設定画面、データ管理
│   ├── share.js        # URLクエリパラメータ処理、共有機能
│   ├── state.js        # グローバル状態管理 (appState)
│   ├── stats.js        # 学習統計、グラフ描画
│   ├── storage.js      # データ永続化 (LocalStorage ⇄ Supabase Sync)
│   ├── supabase.js     # Supabaseクライアント初期化
│   └── ui.js           # 共通UI操作 (画面遷移、トーストなど)
└── supabase_storage.sql # Storageバケット作成用SQL
```

## 🚀 環境構築 & セットアップ

### 1. リポジトリのクローン
```bash
git clone https://github.com/165cm/QuizApp.git
cd QuizApp
```

### 2. ローカルサーバーの起動
Node.js環境がある場合:
```bash
npx http-server -p 8080 -o
```
または、VS Codeの「Live Server」拡張機能を使用してください。

### 3. Supabaseプロジェクトのセットアップ

本アプリはバックエンドにSupabaseを使用しています。以下の手順で独自のプロジェクトを作成してください。

#### A. プロジェクト作成
Supabaseダッシュボードで新規プロジェクトを作成します。

#### B. データベース構築 (SQL)
Supabaseの **SQL Editor** で、以下のSQLを順に実行してテーブルを作成してください。

```sql
-- 1. Profiles (ユーザー統計)
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  avatar_url text,
  total_answered integer default 0,
  correct_answers integer default 0,
  last_study_date timestamp with time zone,
  strength integer default 0,
  streak integer default 0,
  settings jsonb,
  updated_at timestamp with time zone
);

alter table public.profiles enable row level security;

create policy "Users can view own profile" on profiles
  for select using ( auth.uid() = id );
create policy "Users can update own profile" on profiles
  for update using ( auth.uid() = id );
create policy "Users can insert own profile" on profiles
  for insert with check ( auth.uid() = id );

-- 2. Materials (教材データ)
create table public.materials (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title text not null,
  content text,
  summary text,
  source_name text,
  upload_date timestamp with time zone default now(),
  tags text[],
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

alter table public.materials enable row level security;

create policy "Users can crud own materials" on materials
  for all using ( auth.uid() = user_id );

-- 3. Questions (問題データ)
create table public.questions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  material_id uuid references public.materials,
  question_text text,
  choices text[],
  correct_answer text,
  explanation text,
  review_count integer default 0,
  last_reviewed timestamp with time zone,
  ease_factor float default 2.5,
  image_url text,
  image_grid_index integer,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

alter table public.questions enable row level security;

create policy "Users can crud own questions" on questions
  for all using ( auth.uid() = user_id );

-- 4. Shared Quizzes (共有用)
create table public.shared_quizzes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users,
  material_data jsonb,
  questions_data jsonb,
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone
);

alter table public.shared_quizzes enable row level security;
create policy "Public read access" on shared_quizzes for select using (true);
create policy "Users can insert shared" on shared_quizzes for insert with check (auth.uid() = user_id);
```

#### C. Storage設定
1. メニューの **Storage** から `quiz-images` という名前で新しいPublicバケットを作成します。
2. 以下のポリシーを設定するか、リポジトリに含まれる `supabase_storage.sql` を実行してください。
    *   SELECT: Public (All users)
    *   INSERT/DELETE: Authenticated users only

#### D. Google Auth設定
1. メニューの **Authentication** -> **Providers** -> **Google** を有効化。
2. GCPコンソールでOAuthクライアントIDを取得し、設定してください。
3. **URL Configuration** の Site URL に、本番環境のURL（例: `https://your-username.github.io/QuizApp/`）とローカル開発用URL（例: `http://127.0.0.1:8080`）を追加してください。

### 4. アプリとSupabaseの接続
`modules/supabase.js` を開き、あなたのプロジェクトのURLとキーに書き換えてください。

```javascript
// modules/supabase.js
const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

## 🔄 データ同期の仕組み
このアプリは「ローカルファースト」かつ「クラウド同期」を採用しています。

1. **起動時 (`loadData`)**:
    *   まず `LocalStorage` からデータを読み込み、即座に画面を表示します。
    *   ログイン状態であれば、バックグラウンドで `syncWithSupabase` を実行します。
2. **同期 (`syncWithSupabase`)**:
    *   **PULL**: クラウド上の新しいデータをローカルに取り込みます。
    *   **PUSH**: ローカルで作成されたデータをクラウドに送信します。
    *   **Conflict Resolution**: 基本的に「新しい方」または「学習回数が多い方」を優先してマージします。

## 🧪 テスト・デバッグ
*   コンソールには重要なエラー (`console.error`) のみが出力されるようにし、デバッグ用の `console.log` はコミット前に削除してください。
*   `settings.js` のデータ管理機能を使用して、テストデータの削除やリセットを行うことができます。

## 🤝 コントリビューション
プルリクエストを作成する際は、以下を確認してください。
1. `console.log` の削除
2. 既存機能への影響確認 (特に同期周り)
3. コミットメッセージの形式 (`✨ Feature`, `🐛 Fix` など)

## 🤖 無料生成APIの仕様 (Free Tier)

APIキーを持たないユーザー向けに、Google Apps Script (GAS) をプロキシサーバーとして利用した無料生成枠を提供しています。

### 制限ロジック

1.  **1日あたりの総予算制限**: 500円
    *   この予算を超えると、その日の全生成（テキスト・画像）が停止します。
    *   計算上のコスト設定（安全マージン込み）:
        *   **テキスト生成**: 0.5円 / 回
        *   **画像生成**: 25円 / 回
        *   ※実際の課金（OpenAI/Google）とは異なる、利用制限管理用の仮想コストです。

2.  **画像生成の特別枠**:
    *   **先着10名 / 日** 限定
    *   毎朝 6:00 にリセット
    *   10名を超えると、テキスト生成のみ行われ、画像生成はスキップされます（またはエラーメッセージ表示）。

3.  **ユーザー制限**:
    *   同一端末（Device ID）につき、原則 **1回** のお試し生成のみ許可（設定値による）。
    *   ※現在はデバッグ・開発用に緩和されている場合があります。

### アーキテクチャ

*   **GAS Proxy**:
    *   クライアント (`api.js`) は APIキーがない場合、GASのエンドポイント (`exec`) にリクエストを送ります。
    *   GAS側で `OPENAI_API_KEY`, `GOOGLE_API_KEY` を保持し、各APIを代理呼び出しします。
    *   利用ログを Google Sheets に記録し、予算超過をチェックします。
