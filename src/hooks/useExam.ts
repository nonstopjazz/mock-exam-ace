import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// =============================================
// Types - 對應 Supabase Schema
// =============================================

export type ExamStatus = 'draft' | 'published' | 'archived';
export type DifficultyLevel = '簡單' | '中等' | '困難';
export type QuestionGroupType = 'cloze' | 'contextual' | 'structure' | 'reading' | 'mixed';
export type MixedQuestionType = '選擇' | '填空' | '配對' | '排序';
export type EssayType = '記敘文' | '議論文' | '說明文';

// 試卷
export interface Exam {
  id: string;
  title: string;
  year: number;
  month?: number;
  difficulty: DifficultyLevel;
  totalScore: number;
  durationMinutes: number;
  notes?: string;
  status: ExamStatus;
  createdAt: string;
  updatedAt: string;
}

// 單字題
export interface VocabularyQuestion {
  id: string;
  examId: string;
  questionNumber: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation?: string;
  levelTag?: number;
  topicTags?: string[];
  score: number;
}

// 題組
export interface QuestionGroup {
  id: string;
  examId: string;
  groupType: QuestionGroupType;
  groupOrder: number;
  title?: string;
  content: string;
  contentImage?: string; // 閱讀測驗本文圖片
  contentTranslation?: string;
  optionCount?: number;
  optionList?: string;
  structureOptionA?: string;
  structureOptionB?: string;
  structureOptionC?: string;
  structureOptionD?: string;
  structureOptionE?: string;
  articleType?: string;
  chartDescription?: string;
  topicTags?: string[];
  questions?: GroupQuestion[];
}

// 題組內題目
export interface GroupQuestion {
  id: string;
  groupId: string;
  questionNumber: number;
  blankNumber?: number;
  questionText?: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  optionsType?: 'text' | 'image'; // 選項類型：文字或圖片URL
  correctAnswer: string;
  explanation?: string;
  mixedType?: MixedQuestionType;
  grammarSmall?: string;
  grammarMedium?: string;
  grammarLarge?: string;
  levelTag?: number;
  phraseTag?: string;
  questionTypeTag?: string;
  score: number;
}

// 翻譯題
export interface TranslationQuestion {
  id: string;
  examId: string;
  questionNumber: string;
  chineseText: string;
  referenceAnswer: string;
  scoringCriteria?: string;
  explanation?: string;
  grammarTags?: string[];
  levelTag?: number;
  phraseTag?: string;
  topicTags?: string[];
  score: number;
}

// 作文題
export interface EssayQuestion {
  id: string;
  examId: string;
  questionNumber: string;
  prompt: string;
  promptImage?: string; // 作文題目圖片
  essayType: EssayType;
  wordCountRequirement: number;
  scoringCriteria?: string;
  sampleEssay?: string;
  writingTips?: string;
  errorTypeTags?: string[];
  topicTags?: string[];
  score: number;
}

// 完整考試（含所有題目）
export interface FullExam extends Exam {
  vocabularyQuestions: VocabularyQuestion[];
  questionGroups: QuestionGroup[];
  translationQuestions: TranslationQuestion[];
  essayQuestions: EssayQuestion[];
}

// 考試統計
export interface ExamStatistics {
  id: string;
  title: string;
  year: number;
  status: ExamStatus;
  vocabCount: number;
  clozeGroupCount: number;
  contextualGroupCount: number;
  structureGroupCount: number;
  readingGroupCount: number;
  mixedGroupCount: number;
  translationCount: number;
  essayCount: number;
  attemptCount: number;
}

// 作答記錄
export interface ExamAttempt {
  id: string;
  userId: string;
  examId: string;
  startedAt: string;
  submittedAt?: string;
  timeSpentSeconds?: number;
  vocabularyScore: number;
  clozeScore: number;
  contextualScore: number;
  structureScore: number;
  readingScore: number;
  mixedScore: number;
  translationScore: number;
  essayScore: number;
  totalScore: number;
  status: 'in_progress' | 'submitted' | 'graded';
}

// =============================================
// Helper: 轉換 snake_case -> camelCase
// =============================================

function transformExam(data: any): Exam {
  return {
    id: data.id,
    title: data.title,
    year: data.year,
    month: data.month,
    difficulty: data.difficulty,
    totalScore: parseFloat(data.total_score),
    durationMinutes: data.duration_minutes,
    notes: data.notes,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformVocabularyQuestion(data: any): VocabularyQuestion {
  return {
    id: data.id,
    examId: data.exam_id,
    questionNumber: data.question_number,
    questionText: data.question_text,
    optionA: data.option_a,
    optionB: data.option_b,
    optionC: data.option_c,
    optionD: data.option_d,
    correctAnswer: data.correct_answer,
    explanation: data.explanation,
    levelTag: data.level_tag,
    topicTags: data.topic_tags,
    score: parseFloat(data.score),
  };
}

function transformQuestionGroup(data: any): QuestionGroup {
  return {
    id: data.id,
    examId: data.exam_id,
    groupType: data.group_type,
    groupOrder: data.group_order,
    title: data.title,
    content: data.content,
    contentImage: data.content_image,
    contentTranslation: data.content_translation,
    optionCount: data.option_count,
    optionList: data.option_list,
    structureOptionA: data.structure_option_a,
    structureOptionB: data.structure_option_b,
    structureOptionC: data.structure_option_c,
    structureOptionD: data.structure_option_d,
    structureOptionE: data.structure_option_e,
    articleType: data.article_type,
    chartDescription: data.chart_description,
    topicTags: data.topic_tags,
    questions: data.group_questions?.map(transformGroupQuestion) || [],
  };
}

function transformGroupQuestion(data: any): GroupQuestion {
  return {
    id: data.id,
    groupId: data.group_id,
    questionNumber: data.question_number,
    blankNumber: data.blank_number,
    questionText: data.question_text,
    optionA: data.option_a,
    optionB: data.option_b,
    optionC: data.option_c,
    optionD: data.option_d,
    optionsType: data.options_type || 'text',
    correctAnswer: data.correct_answer,
    explanation: data.explanation,
    mixedType: data.mixed_type,
    grammarSmall: data.grammar_small,
    grammarMedium: data.grammar_medium,
    grammarLarge: data.grammar_large,
    levelTag: data.level_tag,
    phraseTag: data.phrase_tag,
    questionTypeTag: data.question_type_tag,
    score: parseFloat(data.score),
  };
}

function transformTranslationQuestion(data: any): TranslationQuestion {
  return {
    id: data.id,
    examId: data.exam_id,
    questionNumber: data.question_number,
    chineseText: data.chinese_text,
    referenceAnswer: data.reference_answer,
    scoringCriteria: data.scoring_criteria,
    explanation: data.explanation,
    grammarTags: data.grammar_tags,
    levelTag: data.level_tag,
    phraseTag: data.phrase_tag,
    topicTags: data.topic_tags,
    score: parseFloat(data.score),
  };
}

function transformEssayQuestion(data: any): EssayQuestion {
  return {
    id: data.id,
    examId: data.exam_id,
    questionNumber: data.question_number,
    prompt: data.prompt,
    promptImage: data.prompt_image,
    essayType: data.essay_type,
    wordCountRequirement: data.word_count_requirement,
    scoringCriteria: data.scoring_criteria,
    sampleEssay: data.sample_essay,
    writingTips: data.writing_tips,
    errorTypeTags: data.error_type_tags,
    topicTags: data.topic_tags,
    score: parseFloat(data.score),
  };
}

// =============================================
// Hook: useExams - 取得考試列表
// =============================================

export function useExams(options?: { status?: ExamStatus; year?: number }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchExams() {
      setLoading(true);
      setError(null);

      let query = supabase.from('exams').select('*').order('year', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }
      if (options?.year) {
        query = query.eq('year', options.year);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setExams((data || []).map(transformExam));
      }
      setLoading(false);
    }

    fetchExams();
  }, [options?.status, options?.year]);

  return { exams, loading, error };
}

// =============================================
// Hook: useExam - 取得單一考試（含所有題目）
// =============================================

export function useExam(examId: string | undefined) {
  const [exam, setExam] = useState<FullExam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!examId) {
      setLoading(false);
      return;
    }

    async function fetchExam() {
      setLoading(true);
      setError(null);

      try {
        // 1. 取得試卷基本資訊
        const { data: examData, error: examError } = await supabase
          .from('exams')
          .select('*')
          .eq('id', examId)
          .single();

        if (examError) throw examError;

        // 2. 取得單字題
        const { data: vocabData } = await supabase
          .from('vocabulary_questions')
          .select('*')
          .eq('exam_id', examId)
          .order('question_number');

        // 3. 取得題組（含題目）
        const { data: groupsData } = await supabase
          .from('question_groups')
          .select(`
            *,
            group_questions (*)
          `)
          .eq('exam_id', examId)
          .order('group_order');

        // 4. 取得翻譯題
        const { data: translationData } = await supabase
          .from('translation_questions')
          .select('*')
          .eq('exam_id', examId)
          .order('question_number');

        // 5. 取得作文題
        const { data: essayData } = await supabase
          .from('essay_questions')
          .select('*')
          .eq('exam_id', examId)
          .order('question_number');

        const fullExam: FullExam = {
          ...transformExam(examData),
          vocabularyQuestions: (vocabData || []).map(transformVocabularyQuestion),
          questionGroups: (groupsData || []).map(transformQuestionGroup),
          translationQuestions: (translationData || []).map(transformTranslationQuestion),
          essayQuestions: (essayData || []).map(transformEssayQuestion),
        };

        setExam(fullExam);
      } catch (err: any) {
        setError(err.message);
      }
      setLoading(false);
    }

    fetchExam();
  }, [examId]);

  return { exam, loading, error };
}

// =============================================
// Hook: useExamStatistics - 取得考試統計
// =============================================

export function useExamStatistics() {
  const [statistics, setStatistics] = useState<ExamStatistics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatistics() {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('exam_statistics')
        .select('*');

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setStatistics(
          (data || []).map((d: any) => ({
            id: d.id,
            title: d.title,
            year: d.year,
            status: d.status,
            vocabCount: d.vocab_count,
            clozeGroupCount: d.cloze_group_count,
            contextualGroupCount: d.contextual_group_count,
            structureGroupCount: d.structure_group_count,
            readingGroupCount: d.reading_group_count,
            mixedGroupCount: d.mixed_group_count,
            translationCount: d.translation_count,
            essayCount: d.essay_count,
            attemptCount: d.attempt_count,
          }))
        );
      }
      setLoading(false);
    }

    fetchStatistics();
  }, []);

  return { statistics, loading, error };
}

// =============================================
// Hook: useExamAdmin - 管理考試 CRUD
// =============================================

export function useExamAdmin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 建立新試卷
  const createExam = useCallback(async (exam: Omit<Exam, 'createdAt' | 'updatedAt'>) => {
    setLoading(true);
    setError(null);

    const { data, error: createError } = await supabase
      .from('exams')
      .insert({
        id: exam.id,
        title: exam.title,
        year: exam.year,
        month: exam.month,
        difficulty: exam.difficulty,
        total_score: exam.totalScore,
        duration_minutes: exam.durationMinutes,
        notes: exam.notes,
        status: exam.status,
      })
      .select()
      .single();

    setLoading(false);
    if (createError) {
      setError(createError.message);
      return null;
    }
    return transformExam(data);
  }, []);

  // 更新試卷
  const updateExam = useCallback(async (examId: string, updates: Partial<Exam>) => {
    setLoading(true);
    setError(null);

    const updateData: any = {};
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.year !== undefined) updateData.year = updates.year;
    if (updates.month !== undefined) updateData.month = updates.month;
    if (updates.difficulty !== undefined) updateData.difficulty = updates.difficulty;
    if (updates.totalScore !== undefined) updateData.total_score = updates.totalScore;
    if (updates.durationMinutes !== undefined) updateData.duration_minutes = updates.durationMinutes;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.status !== undefined) updateData.status = updates.status;
    updateData.updated_at = new Date().toISOString();

    const { data, error: updateError } = await supabase
      .from('exams')
      .update(updateData)
      .eq('id', examId)
      .select()
      .single();

    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return null;
    }
    return transformExam(data);
  }, []);

  // 刪除試卷
  const deleteExam = useCallback(async (examId: string) => {
    setLoading(true);
    setError(null);

    const { error: deleteError } = await supabase
      .from('exams')
      .delete()
      .eq('id', examId);

    setLoading(false);
    if (deleteError) {
      setError(deleteError.message);
      return false;
    }
    return true;
  }, []);

  // 發布試卷
  const publishExam = useCallback(async (examId: string) => {
    return updateExam(examId, { status: 'published' });
  }, [updateExam]);

  // 封存試卷
  const archiveExam = useCallback(async (examId: string) => {
    return updateExam(examId, { status: 'archived' });
  }, [updateExam]);

  // 新增單字題
  const addVocabularyQuestion = useCallback(async (question: Omit<VocabularyQuestion, 'id'>) => {
    setLoading(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('vocabulary_questions')
      .insert({
        exam_id: question.examId,
        question_number: question.questionNumber,
        question_text: question.questionText,
        option_a: question.optionA,
        option_b: question.optionB,
        option_c: question.optionC,
        option_d: question.optionD,
        correct_answer: question.correctAnswer,
        explanation: question.explanation,
        level_tag: question.levelTag,
        topic_tags: question.topicTags,
        score: question.score,
      })
      .select()
      .single();

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return null;
    }
    return transformVocabularyQuestion(data);
  }, []);

  // 批次新增單字題
  const addVocabularyQuestions = useCallback(async (questions: Omit<VocabularyQuestion, 'id'>[]) => {
    setLoading(true);
    setError(null);

    const insertData = questions.map((q) => ({
      exam_id: q.examId,
      question_number: q.questionNumber,
      question_text: q.questionText,
      option_a: q.optionA,
      option_b: q.optionB,
      option_c: q.optionC,
      option_d: q.optionD,
      correct_answer: q.correctAnswer,
      explanation: q.explanation,
      level_tag: q.levelTag,
      topic_tags: q.topicTags,
      score: q.score,
    }));

    const { data, error: insertError } = await supabase
      .from('vocabulary_questions')
      .insert(insertData)
      .select();

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return null;
    }
    return (data || []).map(transformVocabularyQuestion);
  }, []);

  // 新增題組
  const addQuestionGroup = useCallback(async (group: Omit<QuestionGroup, 'id' | 'questions'>) => {
    setLoading(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('question_groups')
      .insert({
        id: `${group.groupType.toUpperCase()}_G${group.groupOrder}`,
        exam_id: group.examId,
        group_type: group.groupType,
        group_order: group.groupOrder,
        title: group.title,
        content: group.content,
        content_image: group.contentImage, // 文章圖片 URL
        content_translation: group.contentTranslation,
        option_count: group.optionCount,
        option_list: group.optionList,
        structure_option_a: group.structureOptionA,
        structure_option_b: group.structureOptionB,
        structure_option_c: group.structureOptionC,
        structure_option_d: group.structureOptionD,
        structure_option_e: group.structureOptionE,
        article_type: group.articleType,
        chart_description: group.chartDescription,
        topic_tags: group.topicTags,
      })
      .select()
      .single();

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return null;
    }
    return transformQuestionGroup(data);
  }, []);

  // 新增題組內題目
  const addGroupQuestion = useCallback(async (question: Omit<GroupQuestion, 'id'>) => {
    setLoading(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('group_questions')
      .insert({
        group_id: question.groupId,
        question_number: question.questionNumber,
        blank_number: question.blankNumber,
        question_text: question.questionText,
        option_a: question.optionA,
        option_b: question.optionB,
        option_c: question.optionC,
        option_d: question.optionD,
        options_type: question.optionsType || 'text', // 選項類型：text 或 image
        correct_answer: question.correctAnswer,
        explanation: question.explanation,
        mixed_type: question.mixedType,
        grammar_small: question.grammarSmall,
        grammar_medium: question.grammarMedium,
        grammar_large: question.grammarLarge,
        level_tag: question.levelTag,
        phrase_tag: question.phraseTag,
        question_type_tag: question.questionTypeTag,
        score: question.score,
      })
      .select()
      .single();

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return null;
    }
    return transformGroupQuestion(data);
  }, []);

  // 新增翻譯題
  const addTranslationQuestion = useCallback(async (question: Omit<TranslationQuestion, 'id'>) => {
    setLoading(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('translation_questions')
      .insert({
        exam_id: question.examId,
        question_number: question.questionNumber,
        chinese_text: question.chineseText,
        reference_answer: question.referenceAnswer,
        scoring_criteria: question.scoringCriteria,
        explanation: question.explanation,
        grammar_tags: question.grammarTags,
        level_tag: question.levelTag,
        phrase_tag: question.phraseTag,
        topic_tags: question.topicTags,
        score: question.score,
      })
      .select()
      .single();

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return null;
    }
    return transformTranslationQuestion(data);
  }, []);

  // 新增作文題
  const addEssayQuestion = useCallback(async (question: Omit<EssayQuestion, 'id'>) => {
    setLoading(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('essay_questions')
      .insert({
        exam_id: question.examId,
        question_number: question.questionNumber,
        prompt: question.prompt,
        prompt_image: question.promptImage, // 作文題目圖片 URL
        essay_type: question.essayType,
        word_count_requirement: question.wordCountRequirement,
        scoring_criteria: question.scoringCriteria,
        sample_essay: question.sampleEssay,
        writing_tips: question.writingTips,
        error_type_tags: question.errorTypeTags,
        topic_tags: question.topicTags,
        score: question.score,
      })
      .select()
      .single();

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return null;
    }
    return transformEssayQuestion(data);
  }, []);

  // 更新題組（含圖片）
  const updateQuestionGroup = useCallback(async (groupId: string, updates: Partial<QuestionGroup>) => {
    setLoading(true);
    setError(null);

    const updateData: any = {};
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.contentImage !== undefined) updateData.content_image = updates.contentImage;
    if (updates.contentTranslation !== undefined) updateData.content_translation = updates.contentTranslation;
    if (updates.articleType !== undefined) updateData.article_type = updates.articleType;
    if (updates.chartDescription !== undefined) updateData.chart_description = updates.chartDescription;
    if (updates.topicTags !== undefined) updateData.topic_tags = updates.topicTags;

    const { data, error: updateError } = await supabase
      .from('question_groups')
      .update(updateData)
      .eq('id', groupId)
      .select()
      .single();

    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return null;
    }
    return transformQuestionGroup(data);
  }, []);

  // 更新題組內題目（含選項圖片）
  const updateGroupQuestion = useCallback(async (questionId: string, updates: Partial<GroupQuestion>) => {
    setLoading(true);
    setError(null);

    const updateData: any = {};
    if (updates.questionText !== undefined) updateData.question_text = updates.questionText;
    if (updates.optionA !== undefined) updateData.option_a = updates.optionA;
    if (updates.optionB !== undefined) updateData.option_b = updates.optionB;
    if (updates.optionC !== undefined) updateData.option_c = updates.optionC;
    if (updates.optionD !== undefined) updateData.option_d = updates.optionD;
    if (updates.optionsType !== undefined) updateData.options_type = updates.optionsType;
    if (updates.correctAnswer !== undefined) updateData.correct_answer = updates.correctAnswer;
    if (updates.explanation !== undefined) updateData.explanation = updates.explanation;

    const { data, error: updateError } = await supabase
      .from('group_questions')
      .update(updateData)
      .eq('id', questionId)
      .select()
      .single();

    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return null;
    }
    return transformGroupQuestion(data);
  }, []);

  // 更新作文題（含圖片）
  const updateEssayQuestion = useCallback(async (questionId: string, updates: Partial<EssayQuestion>) => {
    setLoading(true);
    setError(null);

    const updateData: any = {};
    if (updates.prompt !== undefined) updateData.prompt = updates.prompt;
    if (updates.promptImage !== undefined) updateData.prompt_image = updates.promptImage;
    if (updates.essayType !== undefined) updateData.essay_type = updates.essayType;
    if (updates.wordCountRequirement !== undefined) updateData.word_count_requirement = updates.wordCountRequirement;
    if (updates.scoringCriteria !== undefined) updateData.scoring_criteria = updates.scoringCriteria;
    if (updates.sampleEssay !== undefined) updateData.sample_essay = updates.sampleEssay;
    if (updates.writingTips !== undefined) updateData.writing_tips = updates.writingTips;

    const { data, error: updateError } = await supabase
      .from('essay_questions')
      .update(updateData)
      .eq('id', questionId)
      .select()
      .single();

    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return null;
    }
    return transformEssayQuestion(data);
  }, []);

  return {
    loading,
    error,
    createExam,
    updateExam,
    deleteExam,
    publishExam,
    archiveExam,
    addVocabularyQuestion,
    addVocabularyQuestions,
    addQuestionGroup,
    addGroupQuestion,
    addTranslationQuestion,
    addEssayQuestion,
    updateQuestionGroup,
    updateGroupQuestion,
    updateEssayQuestion,
  };
}

// =============================================
// Hook: useExamAttempt - 考試作答
// =============================================

export function useExamAttempt(examId: string | undefined) {
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 開始考試
  const startAttempt = useCallback(async () => {
    if (!examId) return null;
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('請先登入');
      setLoading(false);
      return null;
    }

    const { data, error: insertError } = await supabase
      .from('exam_attempts')
      .insert({
        user_id: user.id,
        exam_id: examId,
        status: 'in_progress',
      })
      .select()
      .single();

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return null;
    }

    const newAttempt: ExamAttempt = {
      id: data.id,
      userId: data.user_id,
      examId: data.exam_id,
      startedAt: data.started_at,
      submittedAt: data.submitted_at,
      timeSpentSeconds: data.time_spent_seconds,
      vocabularyScore: parseFloat(data.vocabulary_score),
      clozeScore: parseFloat(data.cloze_score),
      contextualScore: parseFloat(data.contextual_score),
      structureScore: parseFloat(data.structure_score),
      readingScore: parseFloat(data.reading_score),
      mixedScore: parseFloat(data.mixed_score),
      translationScore: parseFloat(data.translation_score),
      essayScore: parseFloat(data.essay_score),
      totalScore: parseFloat(data.total_score),
      status: data.status,
    };

    setAttempt(newAttempt);
    return newAttempt;
  }, [examId]);

  // 儲存答案
  const saveAnswer = useCallback(async (
    attemptId: string,
    questionType: 'vocabulary' | 'group' | 'translation' | 'essay',
    questionId: string,
    answer: string,
    timeSpentSeconds: number
  ) => {
    setError(null);

    const insertData: any = {
      attempt_id: attemptId,
      user_answer: answer,
      time_spent_seconds: timeSpentSeconds,
    };

    if (questionType === 'vocabulary') {
      insertData.vocabulary_question_id = questionId;
    } else if (questionType === 'group') {
      insertData.group_question_id = questionId;
    } else if (questionType === 'translation') {
      insertData.translation_question_id = questionId;
    } else if (questionType === 'essay') {
      insertData.essay_question_id = questionId;
    }

    const { error: insertError } = await supabase
      .from('exam_user_answers')
      .upsert(insertData, {
        onConflict: 'attempt_id,vocabulary_question_id',
      });

    if (insertError) {
      setError(insertError.message);
      return false;
    }
    return true;
  }, []);

  // 提交考試
  const submitAttempt = useCallback(async (attemptId: string, timeSpentSeconds: number) => {
    setLoading(true);
    setError(null);

    const { data, error: updateError } = await supabase
      .from('exam_attempts')
      .update({
        submitted_at: new Date().toISOString(),
        time_spent_seconds: timeSpentSeconds,
        status: 'submitted',
      })
      .eq('id', attemptId)
      .select()
      .single();

    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return null;
    }

    return data;
  }, []);

  return {
    attempt,
    loading,
    error,
    startAttempt,
    saveAnswer,
    submitAttempt,
  };
}

// =============================================
// Hook: useUserExamHistory - 使用者考試歷史
// =============================================

export function useUserExamHistory() {
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('exam_attempts')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setAttempts(
          (data || []).map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            examId: d.exam_id,
            startedAt: d.started_at,
            submittedAt: d.submitted_at,
            timeSpentSeconds: d.time_spent_seconds,
            vocabularyScore: parseFloat(d.vocabulary_score),
            clozeScore: parseFloat(d.cloze_score),
            contextualScore: parseFloat(d.contextual_score),
            structureScore: parseFloat(d.structure_score),
            readingScore: parseFloat(d.reading_score),
            mixedScore: parseFloat(d.mixed_score),
            translationScore: parseFloat(d.translation_score),
            essayScore: parseFloat(d.essay_score),
            totalScore: parseFloat(d.total_score),
            status: d.status,
          }))
        );
      }
      setLoading(false);
    }

    fetchHistory();
  }, []);

  return { attempts, loading, error };
}
