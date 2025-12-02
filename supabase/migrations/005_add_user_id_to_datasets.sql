-- Add user_id column to datasets table
-- This migration ties datasets to users for proper authentication and authorization

-- Add user_id column (nullable initially to handle existing data)
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Add foreign key constraint to user table
ALTER TABLE datasets 
  ADD CONSTRAINT fk_datasets_user_id 
  FOREIGN KEY (user_id) 
  REFERENCES "user"(id) 
  ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_datasets_user_id ON datasets(user_id);

-- Note: Existing datasets will have NULL user_id
-- These should be cleaned up or assigned to users manually if needed
-- For new datasets, user_id will be required

