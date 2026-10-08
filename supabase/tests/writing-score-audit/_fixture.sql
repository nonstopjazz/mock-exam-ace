-- 測試用的替身資料。🛑 只給本機臨時資料庫用，絕不在真實環境執行。
--
-- 只建 01/02/03 真正會讀到的欄位。
--
-- 🛑 這份 fixture 的重點是【讓重算與真函式可以對照】。
--    02/03 為了做 what-if，必須在查詢裡重算一次分數。重算只要有一點
--    不一樣（UNMEASURED 沒排除、類別內沒先取平均再 round），
--    「目前」那一欄就會跟學生真正看到的分數不同 ——
--    那時候整張對照表都是假的，而且看起來很合理。
DROP TABLE IF EXISTS public.writing_analyses;
DROP TABLE IF EXISTS public.writing_submissions;

CREATE TABLE public.writing_submissions (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL,
  title TEXT NOT NULL
);

CREATE TABLE public.writing_analyses (
  id UUID PRIMARY KEY,
  essay_id UUID NOT NULL REFERENCES public.writing_submissions(id),
  status TEXT NOT NULL,
  completed_at TIMESTAMPTZ,
  competency_analysis JSONB
);

/** 造一份 competency_analysis。每個類別一串 state，用逗號分隔多個 skill。 */
CREATE OR REPLACE FUNCTION t_comp(VARIADIC p_cats TEXT[]) RETURNS JSONB
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'taxonomy_version', 'writing-v1',
    'categories', jsonb_agg(
      jsonb_build_object(
        'code', 'W' || i,
        'skills', CASE WHEN p_cats[i] = 'EMPTY' THEN '[]'::jsonb ELSE (
            SELECT jsonb_agg(jsonb_build_object(
                     'code', 'x' || ord, 'state', btrim(st),
                     'reason', 'r', 'evidence', '[]'::jsonb))
              FROM unnest(string_to_array(p_cats[i], ',')) WITH ORDINALITY AS u(st, ord)
          ) END)
      ORDER BY i))
    FROM generate_subscripts(p_cats, 1) AS i;
$$;

INSERT INTO public.writing_submissions (id, student_id, title) VALUES
  ('11111111-0000-0000-0000-000000000001', 'aaaa0001-0000-0000-0000-000000000001', '全部 STRONG'),
  ('11111111-0000-0000-0000-000000000002', 'aaaa0001-0000-0000-0000-000000000001', '全部 ADEQUATE'),
  ('11111111-0000-0000-0000-000000000003', 'aaaa0001-0000-0000-0000-000000000001', '全部 DEVELOPING'),
  ('11111111-0000-0000-0000-000000000004', 'aaaa0001-0000-0000-0000-000000000001', '含 UNMEASURED'),
  ('11111111-0000-0000-0000-000000000005', 'aaaa0001-0000-0000-0000-000000000001', '類別內混合'),
  ('11111111-0000-0000-0000-000000000006', 'aaaa0001-0000-0000-0000-000000000001', '像那篇 18 分的'),
  ('11111111-0000-0000-0000-000000000007', 'aaaa0001-0000-0000-0000-000000000001', '每個類別剛好.5'),
  -- 🛑 下面三篇是 add_writing_state_minimal.sql 之後才可能出現的形狀。
  --    在 MINIMAL 之前，整個 0–6 區間算不出來。
  ('11111111-0000-0000-0000-000000000008', 'aaaa0001-0000-0000-0000-000000000001', '全部 MINIMAL'),
  ('11111111-0000-0000-0000-000000000009', 'aaaa0001-0000-0000-0000-000000000001', '爛但不是全爛'),
  ('11111111-0000-0000-0000-00000000000a', 'aaaa0001-0000-0000-0000-000000000001', 'MINIMAL 與未評量並存');

INSERT INTO public.writing_analyses (id, essay_id, status, completed_at, competency_analysis) VALUES
  -- A 全 STRONG → 20
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'COMPLETED', '2026-10-01 10:00:00+00',
   t_comp('STRONG','STRONG','STRONG','STRONG','STRONG')),
  -- B 全 ADEQUATE → 15
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002',
   'COMPLETED', '2026-10-01 11:00:00+00',
   t_comp('ADEQUATE','ADEQUATE','ADEQUATE','ADEQUATE','ADEQUATE')),
  -- C 全 DEVELOPING → 10（量表下限，不是 0）
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003',
   'COMPLETED', '2026-10-01 12:00:00+00',
   t_comp('DEVELOPING','DEVELOPING','DEVELOPING','DEVELOPING','DEVELOPING')),
  -- D 🛑 UNMEASURED 必須排除在分母外。重算漏了這點，分數會莫名偏低。
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000004',
   'COMPLETED', '2026-10-01 13:00:00+00',
   t_comp('STRONG','UNMEASURED','UNMEASURED','ADEQUATE','EMPTY')),
  -- E 🛑 類別內要先取平均再 round。STRONG+DEVELOPING 的平均是 3 → ADEQUATE 等值。
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000005',
   'COMPLETED', '2026-10-01 14:00:00+00',
   t_comp('STRONG,DEVELOPING','ADEQUATE,ADEQUATE','STRONG,STRONG,DEVELOPING',
          'DEVELOPING','ADEQUATE')),
  -- F 像那篇 18 分的：幾乎都 STRONG
  ('22222222-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000006',
   'COMPLETED', '2026-10-01 15:00:00+00',
   t_comp('STRONG','STRONG','STRONG','STRONG','ADEQUATE')),
  -- 🛑 還沒分析完的不該出現在任何一支裡
  ('22222222-0000-0000-0000-000000000099', '11111111-0000-0000-0000-000000000001',
   'QUEUED', NULL, NULL),
  -- 🛑 G 每個類別都是「一半 STRONG、一半 ADEQUATE」→ 平均剛好 3.5。
  --    numeric 的 round() 遠離零，所以 3.5 → 4，整個類別被算成【完全 STRONG】。
  --    這就是 2026-10-05 那篇 18 分作文的形狀：ADEQUATE 比 STRONG 還多，
  --    分數卻接近滿分。
  ('22222222-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000007',
   'COMPLETED', '2026-10-01 16:00:00+00',
   t_comp('STRONG,STRONG,ADEQUATE,ADEQUATE','STRONG,STRONG,ADEQUATE,ADEQUATE',
          'STRONG,STRONG,ADEQUATE,ADEQUATE','STRONG,STRONG,ADEQUATE,ADEQUATE',
          'STRONG,STRONG,ADEQUATE,ADEQUATE')),
  -- 🛑 H 全 MINIMAL → 0 分。這是新的量表下限。
  --    0 分是【有分數】的，與全 UNMEASURED 的「沒有分數」不是同一件事。
  ('22222222-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000008',
   'COMPLETED', '2026-10-01 17:00:00+00',
   t_comp('MINIMAL','MINIMAL','MINIMAL','MINIMAL','MINIMAL')),
  -- 🛑 I 三類 MINIMAL、兩類 DEVELOPING → 20 × 2/15 = 2.67 → 3 分。
  --    這一篇存在的理由：0–6 區間要【真的落得到中間的值】，
  --    不是只有「全爛 = 0」這個端點。
  ('22222222-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000009',
   'COMPLETED', '2026-10-01 18:00:00+00',
   t_comp('MINIMAL','MINIMAL','DEVELOPING','MINIMAL','DEVELOPING')),
  -- 🛑 J MINIMAL 與 UNMEASURED 同時出現 —— 最容易寫錯的組合。
  --    3+3+3+0 = 9，measured = 4（UNMEASURED 那類排除，MINIMAL 那類不排除）
  --    → 20 × 9/12 = 15。
  --    若誤把 MINIMAL 也排除，會變成 20 × 9/9 = 20 —— 差 5 分。
  ('22222222-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a',
   'COMPLETED', '2026-10-01 19:00:00+00',
   t_comp('STRONG','STRONG','STRONG','MINIMAL','UNMEASURED'))
;