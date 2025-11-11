import { Question } from '@/types/exam';
import { MultipleChoiceRenderer } from './renderers/MultipleChoiceRenderer';
import { ClozeRenderer } from './renderers/ClozeRenderer';
import { FillInBlankRenderer } from './renderers/FillInBlankRenderer';
import { SentenceOrderingRenderer } from './renderers/SentenceOrderingRenderer';
import { ReadingRenderer } from './renderers/ReadingRenderer';
import { HybridRenderer } from './renderers/HybridRenderer';
import { TranslationRenderer } from './renderers/TranslationRenderer';
import { EssayRenderer } from './renderers/EssayRenderer';

interface QuestionRendererProps {
  question: Question;
  answer: any;
  onAnswerChange: (answer: any) => void;
}

export const QuestionRenderer = ({ question, answer, onAnswerChange }: QuestionRendererProps) => {
  switch (question.type) {
    case 'multiple-choice':
      return <MultipleChoiceRenderer question={question} answer={answer} onAnswerChange={onAnswerChange} />;
    case 'cloze':
      return <ClozeRenderer question={question} answer={answer} onAnswerChange={onAnswerChange} />;
    case 'fill-in-blank':
      return <FillInBlankRenderer question={question} answer={answer} onAnswerChange={onAnswerChange} />;
    case 'sentence-ordering':
      return <SentenceOrderingRenderer question={question} answer={answer} onAnswerChange={onAnswerChange} />;
    case 'reading':
      return <ReadingRenderer question={question} answer={answer} onAnswerChange={onAnswerChange} />;
    case 'hybrid':
      return <HybridRenderer question={question} answer={answer} onAnswerChange={onAnswerChange} />;
    case 'translation':
      return <TranslationRenderer question={question} answer={answer} onAnswerChange={onAnswerChange} />;
    case 'essay':
      return <EssayRenderer question={question} answer={answer} onAnswerChange={onAnswerChange} />;
    default:
      return <div>未支援的題型</div>;
  }
};
