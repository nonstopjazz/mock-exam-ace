-- 回滾：把人工確認的那 19 題 anchor 清掉（自動填的 269 題不動）
UPDATE public.reading_questions
   SET target_text = NULL, target_occurrence = NULL, updated_at = now()
 WHERE construct = 'VC'
   AND passage_id IN ('KR0001','KR0002','KR0032','KR0063','KR0109','KR0115',
                      'KR0153','KR0156','KR0161','KR0189','KR0190','KR0227',
                      'KR0266','KR0270','KR0275','KR0285','KR0290','KR0311','KR0315');
