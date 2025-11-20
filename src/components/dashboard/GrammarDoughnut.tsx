import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Doughnut } from "react-chartjs-2";
import { generateMockDoughnutData } from "@/data/grammar-doughnut-data";
import { Brain } from "lucide-react";

interface GrammarDoughnutProps {
  onTopicClick?: (topicName: string) => void;
}

const GrammarDoughnut = ({ onTopicClick }: GrammarDoughnutProps) => {
  const grammarData = generateMockDoughnutData();

  // 內圈：22個中分類
  const innerLabels = grammarData.flatMap((main) =>
    main.middleCategories.map((mid) => `(${mid.id}) ${mid.name}`)
  );
  const innerData = grammarData.flatMap((main) =>
    main.middleCategories.map((mid) => mid.accuracy || 0)
  );
  const innerColors = innerData.map((accuracy) => {
    if (accuracy >= 85) return 'rgba(34, 197, 94, 0.8)'; // green
    if (accuracy >= 70) return 'rgba(59, 130, 246, 0.8)'; // blue
    if (accuracy >= 60) return 'rgba(234, 179, 8, 0.8)'; // yellow
    return 'rgba(239, 68, 68, 0.8)'; // red
  });

  // 外圈：12個大分類
  const outerLabels = grammarData.map((main) => `${main.id}. ${main.name}`);
  const outerData = grammarData.map((main) => main.accuracy || 0);
  const outerColors = outerData.map((accuracy) => {
    if (accuracy >= 85) return 'rgba(34, 197, 94, 0.5)'; // green lighter
    if (accuracy >= 70) return 'rgba(59, 130, 246, 0.5)'; // blue lighter
    if (accuracy >= 60) return 'rgba(234, 179, 8, 0.5)'; // yellow lighter
    return 'rgba(239, 68, 68, 0.5)'; // red lighter
  });

  const doughnutData = {
    labels: [...innerLabels, ...outerLabels],
    datasets: [
      {
        label: '中分類準確度',
        data: innerData,
        backgroundColor: innerColors,
        borderWidth: 2,
        borderColor: '#fff',
      },
      {
        label: '大分類準確度',
        data: outerData,
        backgroundColor: outerColors,
        borderWidth: 2,
        borderColor: '#fff',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    onClick: (event: any, elements: any[]) => {
      if (elements.length > 0 && onTopicClick) {
        const element = elements[0];
        const datasetIndex = element.datasetIndex;
        const index = element.index;

        // datasetIndex 0 = inner ring (middle categories), 1 = outer ring (main categories)
        if (datasetIndex === 1) {
          // Outer ring clicked - navigate to main topic
          const mainTopic = grammarData[index];
          if (mainTopic) {
            onTopicClick(mainTopic.name);
          }
        }
      }
    },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          generateLabels: () => [
            { text: '優秀 (≥85%)', fillStyle: 'rgba(34, 197, 94, 0.8)', hidden: false, index: 0 },
            { text: '良好 (70-84%)', fillStyle: 'rgba(59, 130, 246, 0.8)', hidden: false, index: 1 },
            { text: '需加強 (60-69%)', fillStyle: 'rgba(234, 179, 8, 0.8)', hidden: false, index: 2 },
            { text: '待改善 (<60%)', fillStyle: 'rgba(239, 68, 68, 0.8)', hidden: false, index: 3 },
          ],
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.label || '';
            const value = context.parsed || 0;
            return `${label}: ${value.toFixed(1)}%`;
          },
        },
      },
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          文法分類總覽
        </CardTitle>
        <CardDescription>
          雙層同心圓：外圈為 12 個大分類，內圈為 22 個中分類
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-w-2xl mx-auto">
          <Doughnut data={doughnutData} options={options} />
        </div>
      </CardContent>
    </Card>
  );
};

export default GrammarDoughnut;
