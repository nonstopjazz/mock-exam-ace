-- =====================================================
-- 影片課程：發播放位址（整套唯一有安全後果的一支）
--
-- 🔴 這份 SQL 要執行兩次：先在 gsat-staging 執行並確認，再在 production 執行。
--
-- ⚠️ 先執行 create_learn_courses.sql 與 create_learn_course_rpcs.sql。
--
--
-- 【這支存在的理由】
--
--   大綱那支刻意不回傳 video_id。所以總得有一個地方把它交出去，
--   而那個地方就是這裡——交出去之前把權限【再驗一次】。
--
--   為什麼要驗兩次？因為大綱與播放是兩個不同的 HTTP 請求。只在大綱那邊
--   驗，等於相信客戶端「我剛剛有拿到大綱」這句話。
--
--
-- 🛑 Bunny 的金鑰不寫在這份 SQL 裡，也不寫在任何檔案裡
--
--   它放在 Supabase Vault，名稱 BUNNY_TOKEN_AUTH_KEY，由你自己在
--   Dashboard 設定。這支只在執行時去讀它。
--
--   金鑰【沒設定】而且 bunny_token_required = true 時，這支會【報錯】，
--   不會偷偷退回沒有簽章的網址。安靜降級成不設防，是最糟的失敗方式:
--   影片照播、你以為有保護、其實沒有，而且不會有任何徵兆。
--
-- 🛑 learn_bunny_token_key() 不開放給 authenticated
--
--   它只被這支 SECURITY DEFINER 函式在內部呼叫（以擁有者身分執行，
--   所以不需要 grant）。有 grant 的話，任何登入者都能把金鑰讀出來。
--
-- 回滾：supabase/migrations/create_learn_course_playback.rollback.sql
-- =====================================================

-- ── 設定（不是祕密的那一半）──────────────────────────
CREATE TABLE IF NOT EXISTS learn_course_config (
  -- 單列表：主鍵固定 true，所以插不進第二列
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),

  -- Bunny Stream 的 Video Library ID。它會出現在 embed 網址裡，不是祕密。
  bunny_library_id TEXT,

  -- 簽章有效期。預設 4 小時：夠看完一支長片，又不會讓轉貼的連結長命。
  bunny_token_ttl_seconds INTEGER NOT NULL DEFAULT 14400
    CHECK (bunny_token_ttl_seconds BETWEEN 60 AND 86400),

  -- 🛑 true = 沒有金鑰就報錯。改成 false 等於公開所有 Bunny 影片。
  bunny_token_required BOOLEAN NOT NULL DEFAULT true,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO learn_course_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE learn_course_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learn_course_config_service_all ON learn_course_config;
CREATE POLICY learn_course_config_service_all ON learn_course_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON learn_course_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON learn_course_config TO service_role;

COMMENT ON TABLE learn_course_config IS
  '影片課程的站台設定。🛑 只放不是祕密的東西——Bunny 的 Token Authentication Key 在 Vault，名稱 BUNNY_TOKEN_AUTH_KEY。';


-- ── 讀金鑰 ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION learn_bunny_token_key()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v TEXT;
BEGIN
  -- 本機測試資料庫沒有 vault schema。動態執行，讓這支在沒有 Vault 的
  -- 環境也載得起來（回 NULL），而不是整份 migration 掛掉。
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN NULL;
  END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1'
     INTO v USING 'BUNNY_TOKEN_AUTH_KEY';
  RETURN nullif(btrim(coalesce(v, '')), '');
END;
$$;

COMMENT ON FUNCTION learn_bunny_token_key IS
  'Bunny Token Authentication Key，來自 Vault。🛑 刻意【不】授權給 authenticated——只給 SECURITY DEFINER 的 learn_course_playback() 內部呼叫。';

-- 🛑 連 authenticated 都不給。這一行是這份 migration 最重要的一行。
REVOKE ALL ON FUNCTION learn_bunny_token_key() FROM PUBLIC, anon, authenticated;


-- ── 簽出 Bunny 的 embed 網址 ──────────────────────────
CREATE OR REPLACE FUNCTION learn_bunny_embed_url(p_video_id TEXT, p_expires BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key     TEXT := public.learn_bunny_token_key();
  v_lib     TEXT;
  v_req     BOOLEAN;
  v_token   TEXT;
BEGIN
  SELECT bunny_library_id, bunny_token_required
    INTO v_lib, v_req
    FROM public.learn_course_config WHERE id;

  IF v_lib IS NULL OR btrim(v_lib) = '' THEN
    RAISE EXCEPTION 'Bunny 的 Video Library ID 還沒設定（learn_course_config.bunny_library_id）'
      USING ERRCODE = '22023';
  END IF;

  IF v_key IS NULL THEN
    IF coalesce(v_req, true) THEN
      -- 🛑 報錯，不降級。見檔頭。
      RAISE EXCEPTION 'Bunny 的 Token Authentication Key 還沒設定（Vault 的 BUNNY_TOKEN_AUTH_KEY）'
        USING ERRCODE = '22023';
    END IF;
    RETURN format('https://iframe.mediadelivery.net/embed/%s/%s', v_lib, p_video_id);
  END IF;

  -- Bunny Stream 的 embed token：sha256_hex(key || videoId || expires)
  v_token := encode(sha256((v_key || p_video_id || p_expires::TEXT)::BYTEA), 'hex');

  RETURN format('https://iframe.mediadelivery.net/embed/%s/%s?token=%s&expires=%s',
                v_lib, p_video_id, v_token, p_expires);
END;
$$;

REVOKE ALL ON FUNCTION learn_bunny_embed_url(TEXT, BIGINT) FROM PUBLIC, anon, authenticated;


-- ── 發播放位址 ────────────────────────────────────────
CREATE OR REPLACE FUNCTION learn_course_playback(p_lesson_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_admin   BOOLEAN := coalesce(public.is_admin(), false);
  v_l       public.learn_course_lessons%ROWTYPE;
  v_sec_pos INTEGER;
  v_course_id UUID;
  v_course  public.learn_courses%ROWTYPE;
  v_allowed BOOLEAN;
  v_locked  BOOLEAN;
  v_expires BIGINT;
  v_ttl     INTEGER;
  v_url     TEXT;
  v_last    INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = '28000';
  END IF;

  SELECT l.* INTO v_l FROM public.learn_course_lessons l WHERE l.id = p_lesson_id;
  IF v_l.id IS NULL THEN
    RAISE EXCEPTION '找不到這支影片' USING ERRCODE = 'P0002';
  END IF;

  -- 兩段而不是一段：plpgsql 不允許同一個 INTO 混用純量與 ROWTYPE
  SELECT s.position, s.course_id INTO v_sec_pos, v_course_id
    FROM public.learn_course_sections s WHERE s.id = v_l.section_id;

  SELECT * INTO v_course FROM public.learn_courses WHERE id = v_course_id;

  -- 第一關：看得到這門課，或這支是試看
  v_allowed := public.learn_course_visible(v_course.id)
    OR (v_l.is_preview
        AND v_course.status = 'PUBLISHED'
        AND coalesce(public.learn_feature_enabled('course'), false));

  IF NOT v_allowed THEN
    -- 與「不存在」回同一個錯誤，不透露這支影片存在
    RAISE EXCEPTION '找不到這支影片' USING ERRCODE = 'P0002';
  END IF;

  -- 第二關：循序課的解鎖。規則與 learn_course_detail 的 locked 同一套——
  -- 🛑 兩邊不一致的話，畫面顯示鎖著、這支照發，等於沒鎖。
  v_locked := NOT v_admin
    AND NOT v_l.is_preview            -- 試看不受解鎖順序限制
    AND v_course.type = 'DRIP'
    AND EXISTS (
      SELECT 1
        FROM public.learn_course_sections s2
        JOIN public.learn_course_lessons  l2 ON l2.section_id = s2.id
        LEFT JOIN public.learn_lesson_progress p2
          ON p2.lesson_id = l2.id AND p2.student_id = v_uid
       WHERE s2.course_id = v_course.id
         AND s2.position < v_sec_pos
         AND p2.completed_at IS NULL
    );

  IF v_locked THEN
    RAISE EXCEPTION '這個單元還沒解鎖，請先完成前面的單元' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(last_position_seconds, 0) INTO v_last
    FROM public.learn_lesson_progress
   WHERE student_id = v_uid AND lesson_id = p_lesson_id;

  IF v_l.provider = 'BUNNY' THEN
    SELECT bunny_token_ttl_seconds INTO v_ttl FROM public.learn_course_config WHERE id;
    v_expires := extract(epoch FROM now())::BIGINT + coalesce(v_ttl, 14400);
    v_url := public.learn_bunny_embed_url(v_l.video_id, v_expires);
  ELSE
    v_expires := NULL;
    -- nocookie：學生還沒開始看就被 YouTube 種追蹤 cookie 是沒有必要的
    v_url := format('https://www.youtube-nocookie.com/embed/%s?rel=0&modestbranding=1',
                    v_l.video_id);
  END IF;

  RETURN jsonb_build_object(
    'lesson_id',             v_l.id,
    'title',                 v_l.title,
    'description',           v_l.description,
    'provider',              v_l.provider,
    'duration_seconds',      v_l.duration_seconds,
    'last_position_seconds', coalesce(v_last, 0),
    'embed_url',             v_url,
    -- Bunny 的簽章會過期。前端據此在過期前重新要一次，
    -- 而不是讓學生看到一半變成錯誤畫面。
    'expires_at', CASE WHEN v_expires IS NULL THEN NULL
                       ELSE to_jsonb(to_timestamp(v_expires)) END
  );
END;
$$;

COMMENT ON FUNCTION learn_course_playback IS
  '發一支影片的播放位址。🛑 會【重新】驗權限與解鎖狀態——不相信客戶端「我剛拿到大綱」。Bunny 走 Vault 裡的金鑰簽章；YouTube 走 nocookie。';

REVOKE ALL ON FUNCTION learn_course_playback(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION learn_course_playback(UUID) TO authenticated, service_role;


-- ── 驗證（唯讀）───────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'learn_course_config')   AS "設定表（應為 1）",
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('learn_bunny_token_key','learn_bunny_embed_url',
                        'learn_course_playback'))                           AS "新函式數（應為 3）",
  (SELECT count(*) FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN ('learn_bunny_token_key','learn_bunny_embed_url')
      AND grantee IN ('authenticated','anon','PUBLIC'))                     AS "🛑 金鑰函式的外部授權（必須為 0）",
  (SELECT bunny_library_id IS NOT NULL FROM learn_course_config WHERE id)   AS "Library ID 已設定",
  (learn_bunny_token_key() IS NOT NULL)                                     AS "Vault 金鑰讀得到";
