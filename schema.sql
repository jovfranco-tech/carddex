-- Copy and paste this into the Supabase SQL Editor to create the necessary tables.

-- Create a table for user collections
CREATE TABLE public.collections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

-- Create policies so users can only read/write their own collections
CREATE POLICY "Users can view their own collection"
    ON public.collections FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own collection"
    ON public.collections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own collection"
    ON public.collections FOR UPDATE
    USING (auth.uid() = user_id);

-- Create a function to automatically create a collection row when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.collections (user_id, state)
  VALUES (new.id, '{"version": 1, "cards": {}}');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create a table for distributed rate limiting
CREATE TABLE IF NOT EXISTS public.rate_limits (
    ip TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    reset_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Enable RLS on rate_limits (backend-only write, keep secure)
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allows anonymous select on rate_limits"
    ON public.rate_limits FOR SELECT
    USING (true);

-- Create a table for centralized telemetry and error logs
CREATE TABLE IF NOT EXISTS public.telemetry_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ip TEXT,
    type TEXT NOT NULL, -- 'error' or 'event'
    context TEXT,       -- e.g. error boundary context, or event name
    message TEXT,       -- error message or event metadata
    stack TEXT,         -- error call stack
    url TEXT,           -- client URL
    user_agent TEXT,    -- client UserAgent
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on telemetry_logs (allow anonymous inserts for public logger)
ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts to telemetry_logs"
    ON public.telemetry_logs FOR INSERT
    WITH CHECK (true);

