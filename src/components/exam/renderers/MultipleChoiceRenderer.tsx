import { MultipleChoiceQuestion } from '@/types/exam';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface Props {
  question: MultipleChoiceQuestion;
  answer: string;
  onAnswerChange: (answer: string) => void;
}

export const MultipleChoiceRenderer = ({ question, answer, onAnswerChange }: Props) => {
  return (
    <div className="space-y-4">
      <p className="text-lg font-medium">{question.question}</p>
      <RadioGroup value={answer || ''} onValueChange={onAnswerChange}>
        <div className="space-y-3">
          {question.options.map((option) => (
            <div
              key={option.label}
              className="flex items-center space-x-3 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
            >
              <RadioGroupItem value={option.label} id={`${question.id}-${option.label}`} />
              <Label
                htmlFor={`${question.id}-${option.label}`}
                className="flex-1 cursor-pointer text-base"
              >
                ({option.label}) {option.text}
              </Label>
            </div>
          ))}
        </div>
      </RadioGroup>
    </div>
  );
};
