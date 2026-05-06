-- =====================================================
-- Push Subscriptions: Web Push 通知訂閱管理
-- =====================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscriptions"
  ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own subscriptions"
  ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions"
  ON push_subscriptions FOR UPDATE USING (auth.uid() = user_id);
