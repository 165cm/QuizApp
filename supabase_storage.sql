-- Create a storage bucket for quiz images
insert into storage.buckets (id, name, public)
values ('quiz-images', 'quiz-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow public read access
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'quiz-images' );

-- Policy: Allow authenticated users to upload
create policy "Authenticated users can upload"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'quiz-images' );

-- Policy: Allow authenticated users to delete (for cleanup)
create policy "Authenticated users can delete"
  on storage.objects for delete
  to authenticated
  using ( bucket_id = 'quiz-images' );
