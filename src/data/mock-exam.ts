import { ExamPaper } from '@/types/exam';

export const MOCK_EXAM_PAPER: ExamPaper = {
  examId: 'mock-2025-01',
  title: '113 學年度學科能力測驗 英文科模擬試題',
  description: '本試卷包含選擇題與非選題，測驗時間 100 分鐘。',
  duration: 100,
  totalPoints: 100,
  sections: [
    // ===== 第壹部分：選擇題（72分）=====
    {
      sectionId: 'part-1',
      title: '第壹部分：選擇題',
      description: '共 72 分',
      totalPoints: 72,
      questions: [
        // 一、單選題（10題，10分）
        {
          id: 'mc-1',
          type: 'multiple-choice',
          points: 1,
          question: 'The new policy will _____ significant changes in the education system.',
          options: [
            { label: 'A', text: 'bring about' },
            { label: 'B', text: 'bring up' },
            { label: 'C', text: 'bring in' },
            { label: 'D', text: 'bring out' },
          ],
          correctAnswer: 'A',
        },
        {
          id: 'mc-2',
          type: 'multiple-choice',
          points: 1,
          question: '_____ the weather forecast, it will rain heavily tomorrow.',
          options: [
            { label: 'A', text: 'According to' },
            { label: 'B', text: 'Due to' },
            { label: 'C', text: 'In spite of' },
            { label: 'D', text: 'Regardless of' },
          ],
          correctAnswer: 'A',
        },
        {
          id: 'mc-3',
          type: 'multiple-choice',
          points: 1,
          question: 'The museum is _____ Tuesday to Sunday from 9 AM to 5 PM.',
          options: [
            { label: 'A', text: 'available' },
            { label: 'B', text: 'accessible' },
            { label: 'C', text: 'open' },
            { label: 'D', text: 'free' },
          ],
          correctAnswer: 'C',
        },
        {
          id: 'mc-4',
          type: 'multiple-choice',
          points: 1,
          question: 'She has a _____ for languages and can speak five fluently.',
          options: [
            { label: 'A', text: 'talent' },
            { label: 'B', text: 'interest' },
            { label: 'C', text: 'hobby' },
            { label: 'D', text: 'skill' },
          ],
          correctAnswer: 'A',
        },
        {
          id: 'mc-5',
          type: 'multiple-choice',
          points: 1,
          question: 'The company _____ a 20% increase in profits last year.',
          options: [
            { label: 'A', text: 'achieved' },
            { label: 'B', text: 'received' },
            { label: 'C', text: 'obtained' },
            { label: 'D', text: 'gained' },
          ],
          correctAnswer: 'A',
        },
        {
          id: 'mc-6',
          type: 'multiple-choice',
          points: 1,
          question: 'Please _____ your seat belts before the plane takes off.',
          options: [
            { label: 'A', text: 'tighten' },
            { label: 'B', text: 'fasten' },
            { label: 'C', text: 'secure' },
            { label: 'D', text: 'fix' },
          ],
          correctAnswer: 'B',
        },
        {
          id: 'mc-7',
          type: 'multiple-choice',
          points: 1,
          question: 'The teacher asked the students to _____ their homework on time.',
          options: [
            { label: 'A', text: 'hand in' },
            { label: 'B', text: 'hand out' },
            { label: 'C', text: 'hand over' },
            { label: 'D', text: 'hand down' },
          ],
          correctAnswer: 'A',
        },
        {
          id: 'mc-8',
          type: 'multiple-choice',
          points: 1,
          question: 'The project was _____ due to lack of funding.',
          options: [
            { label: 'A', text: 'called off' },
            { label: 'B', text: 'called on' },
            { label: 'C', text: 'called for' },
            { label: 'D', text: 'called up' },
          ],
          correctAnswer: 'A',
        },
        {
          id: 'mc-9',
          type: 'multiple-choice',
          points: 1,
          question: 'She _____ her dream of becoming a doctor after years of hard work.',
          options: [
            { label: 'A', text: 'realized' },
            { label: 'B', text: 'recognized' },
            { label: 'C', text: 'noticed' },
            { label: 'D', text: 'understood' },
          ],
          correctAnswer: 'A',
        },
        {
          id: 'mc-10',
          type: 'multiple-choice',
          points: 1,
          question: 'The new smartphone _____ advanced features that appeal to tech enthusiasts.',
          options: [
            { label: 'A', text: 'boasts' },
            { label: 'B', text: 'claims' },
            { label: 'C', text: 'declares' },
            { label: 'D', text: 'announces' },
          ],
          correctAnswer: 'A',
        },

        // 二、克漏字（2組×5題，10分）
        {
          id: 'cloze-set-1',
          type: 'cloze',
          setId: 'cloze-1',
          points: 5,
          passage: `Climate change is one of the most pressing issues of our time. Scientists have been {{1}} the effects of rising global temperatures for decades. The evidence is overwhelming: glaciers are {{2}}, sea levels are rising, and extreme weather events are becoming more {{3}}. Many experts believe that human activities, particularly the burning of fossil fuels, are the primary {{4}} of these changes. Governments around the world are now taking action to {{5}} carbon emissions and promote renewable energy sources.`,
          questions: [
            {
              blankNumber: 1,
              options: [
                { label: 'A', text: 'studying' },
                { label: 'B', text: 'ignoring' },
                { label: 'C', text: 'preventing' },
                { label: 'D', text: 'questioning' },
              ],
              correctAnswer: 'A',
            },
            {
              blankNumber: 2,
              options: [
                { label: 'A', text: 'expanding' },
                { label: 'B', text: 'melting' },
                { label: 'C', text: 'freezing' },
                { label: 'D', text: 'growing' },
              ],
              correctAnswer: 'B',
            },
            {
              blankNumber: 3,
              options: [
                { label: 'A', text: 'rare' },
                { label: 'B', text: 'frequent' },
                { label: 'C', text: 'predictable' },
                { label: 'D', text: 'mild' },
              ],
              correctAnswer: 'B',
            },
            {
              blankNumber: 4,
              options: [
                { label: 'A', text: 'solution' },
                { label: 'B', text: 'cause' },
                { label: 'C', text: 'benefit' },
                { label: 'D', text: 'result' },
              ],
              correctAnswer: 'B',
            },
            {
              blankNumber: 5,
              options: [
                { label: 'A', text: 'increase' },
                { label: 'B', text: 'maintain' },
                { label: 'C', text: 'reduce' },
                { label: 'D', text: 'ignore' },
              ],
              correctAnswer: 'C',
            },
          ],
        },
        {
          id: 'cloze-set-2',
          type: 'cloze',
          setId: 'cloze-2',
          points: 5,
          passage: `Artificial intelligence (AI) is {{6}} transforming various industries. From healthcare to transportation, AI applications are {{7}} new possibilities and efficiencies. However, this rapid advancement also raises important ethical questions. How do we ensure that AI systems are {{8}} and free from bias? Who is {{9}} when an AI makes a mistake? These are complex issues that society must {{10}} as AI becomes increasingly integrated into our daily lives.`,
          questions: [
            {
              blankNumber: 6,
              options: [
                { label: 'A', text: 'gradually' },
                { label: 'B', text: 'rarely' },
                { label: 'C', text: 'rapidly' },
                { label: 'D', text: 'slowly' },
              ],
              correctAnswer: 'C',
            },
            {
              blankNumber: 7,
              options: [
                { label: 'A', text: 'limiting' },
                { label: 'B', text: 'creating' },
                { label: 'C', text: 'destroying' },
                { label: 'D', text: 'preventing' },
              ],
              correctAnswer: 'B',
            },
            {
              blankNumber: 8,
              options: [
                { label: 'A', text: 'complicated' },
                { label: 'B', text: 'expensive' },
                { label: 'C', text: 'fair' },
                { label: 'D', text: 'slow' },
              ],
              correctAnswer: 'C',
            },
            {
              blankNumber: 9,
              options: [
                { label: 'A', text: 'responsible' },
                { label: 'B', text: 'invisible' },
                { label: 'C', text: 'available' },
                { label: 'D', text: 'suitable' },
              ],
              correctAnswer: 'A',
            },
            {
              blankNumber: 10,
              options: [
                { label: 'A', text: 'ignore' },
                { label: 'B', text: 'address' },
                { label: 'C', text: 'avoid' },
                { label: 'D', text: 'forget' },
              ],
              correctAnswer: 'B',
            },
          ],
        },

        // 三、文意選填（10空，12選項，10分）
        {
          id: 'fill-in-blank-1',
          type: 'fill-in-blank',
          points: 10,
          passage: `The concept of sustainable development has gained {{1}} attention in recent years. It refers to development that meets the needs of the present without {{2}} the ability of future generations to meet their own needs. This approach {{3}} economic growth, environmental protection, and social equity.

One key aspect of sustainability is the efficient use of {{4}} resources. Many countries are now investing in renewable energy sources such as solar and wind power. These alternatives are not only more {{5}} friendly but also increasingly cost-effective.

Another important factor is {{6}} consumption patterns. Consumers are becoming more {{7}} of the environmental impact of their purchases. Many are choosing to buy locally produced goods, which {{8}} carbon emissions from transportation.

Education plays a crucial {{9}} in promoting sustainability. By teaching young people about environmental issues, we can create a generation that is better {{10}} to address the challenges facing our planet.`,
          optionPool: [
            { label: 'A', text: 'significant' },
            { label: 'B', text: 'compromising' },
            { label: 'C', text: 'balances' },
            { label: 'D', text: 'natural' },
            { label: 'E', text: 'environmentally' },
            { label: 'F', text: 'changing' },
            { label: 'G', text: 'aware' },
            { label: 'H', text: 'reduces' },
            { label: 'I', text: 'role' },
            { label: 'J', text: 'equipped' },
            { label: 'K', text: 'traditional' },
            { label: 'L', text: 'increases' },
          ],
          blanks: [
            { blankNumber: 1, correctAnswer: 'A' },
            { blankNumber: 2, correctAnswer: 'B' },
            { blankNumber: 3, correctAnswer: 'C' },
            { blankNumber: 4, correctAnswer: 'D' },
            { blankNumber: 5, correctAnswer: 'E' },
            { blankNumber: 6, correctAnswer: 'F' },
            { blankNumber: 7, correctAnswer: 'G' },
            { blankNumber: 8, correctAnswer: 'H' },
            { blankNumber: 9, correctAnswer: 'I' },
            { blankNumber: 10, correctAnswer: 'J' },
          ],
        },

        // 四、篇章結構（4空，5句子，8分）
        {
          id: 'sentence-ordering-1',
          type: 'sentence-ordering',
          points: 8,
          passage: `The Industrial Revolution, which began in Britain in the late 18th century, marked a major turning point in human history. {{1}} This transition brought about profound changes in society, economy, and technology.

{{2}} Factories emerged as the primary means of production, replacing traditional cottage industries. Workers migrated from rural areas to cities in search of employment, leading to rapid urbanization.

{{3}} However, these advancements came at a cost. Working conditions in factories were often harsh, with long hours, low wages, and dangerous environments.

{{4}} Over time, labor movements and reforms improved conditions for workers and established many of the rights we take for granted today.`,
          sentences: [
            {
              label: 'A',
              text: 'It transformed societies from agrarian economies to industrial powerhouses.',
            },
            {
              label: 'B',
              text: 'The invention of the steam engine revolutionized transportation and manufacturing.',
            },
            {
              label: 'C',
              text: 'Child labor was common, and there were few safety regulations.',
            },
            {
              label: 'D',
              text: 'These developments led to significant increases in productivity and economic growth.',
            },
            {
              label: 'E',
              text: 'Educational opportunities expanded as societies recognized the need for skilled workers.',
            },
          ],
          blanks: [
            { blankNumber: 1, correctAnswer: 'A' },
            { blankNumber: 2, correctAnswer: 'B' },
            { blankNumber: 3, correctAnswer: 'C' },
            { blankNumber: 4, correctAnswer: 'D' },
          ],
        },

        // 五、閱讀測驗（3組×4題，24分）
        {
          id: 'reading-set-1',
          type: 'reading',
          setId: 'reading-1',
          points: 8,
          title: 'Passage 1: The Benefits of Bilingualism',
          passage: `Learning a second language offers numerous cognitive and social benefits. Research has shown that bilingual individuals often demonstrate enhanced problem-solving skills and creativity compared to monolinguals. This is because managing two language systems requires the brain to constantly switch between different linguistic rules and vocabulary, which strengthens executive function.

Moreover, bilingualism has been linked to delayed onset of dementia and Alzheimer's disease. Studies suggest that the mental exercise involved in using multiple languages helps build cognitive reserve, providing the brain with additional resources to compensate for age-related decline.

From a social perspective, being bilingual opens doors to new cultures and opportunities. It facilitates communication with a broader range of people and can enhance career prospects in our increasingly globalized world. Many employers value multilingual employees who can bridge cultural and linguistic gaps.

However, it's important to note that the benefits of bilingualism are most pronounced when both languages are actively used and maintained throughout life. Simply studying a language in school without regular practice may not yield the same cognitive advantages.`,
          questions: [
            {
              questionNumber: 1,
              question: 'According to the passage, what cognitive benefit do bilingual people typically have?',
              options: [
                { label: 'A', text: 'Better memory for names and faces' },
                { label: 'B', text: 'Enhanced problem-solving abilities' },
                { label: 'C', text: 'Faster reading speed' },
                { label: 'D', text: 'Improved mathematical skills' },
              ],
              correctAnswer: 'B',
            },
            {
              questionNumber: 2,
              question: 'How does bilingualism affect brain health in older age?',
              options: [
                { label: 'A', text: 'It increases brain size' },
                { label: 'B', text: 'It prevents all forms of dementia' },
                { label: 'C', text: 'It may delay cognitive decline' },
                { label: 'D', text: 'It improves physical coordination' },
              ],
              correctAnswer: 'C',
            },
            {
              questionNumber: 3,
              question: 'What is mentioned as a social advantage of being bilingual?',
              options: [
                { label: 'A', text: 'Making more friends in school' },
                { label: 'B', text: 'Better performance in sports' },
                { label: 'C', text: 'Improved career opportunities' },
                { label: 'D', text: 'Higher income immediately' },
              ],
              correctAnswer: 'C',
            },
            {
              questionNumber: 4,
              question: 'What condition is necessary to fully benefit from bilingualism?',
              options: [
                { label: 'A', text: 'Learning the language before age 5' },
                { label: 'B', text: 'Living in a foreign country' },
                { label: 'C', text: 'Regular use of both languages' },
                { label: 'D', text: 'Formal language certification' },
              ],
              correctAnswer: 'C',
            },
          ],
        },
        {
          id: 'reading-set-2',
          type: 'reading',
          setId: 'reading-2',
          points: 8,
          title: 'Passage 2: The Rise of Urban Farming',
          passage: `Urban farming, the practice of growing food in cities, is experiencing a renaissance. What began as small community gardens has evolved into sophisticated vertical farms and rooftop agriculture operations. This movement addresses several critical issues facing modern cities: food security, environmental sustainability, and community engagement.

One of the primary advantages of urban farming is the reduction in food miles—the distance food travels from farm to consumer. Traditional agriculture often involves transporting produce hundreds or thousands of miles, consuming fossil fuels and generating greenhouse gas emissions. Urban farms, by contrast, can deliver fresh produce to local markets within hours of harvest, significantly reducing environmental impact.

Technology is playing an increasingly important role in urban agriculture. Hydroponic and aeroponic systems allow crops to grow without soil, using nutrient-rich water solutions instead. These methods use up to 90% less water than conventional farming and can produce higher yields in smaller spaces. LED lighting systems tuned to specific wavelengths optimize plant growth while minimizing energy consumption.

Despite these advantages, urban farming faces challenges. Initial setup costs can be substantial, and not all crops are economically viable to grow in urban settings. Limited space and higher real estate costs mean that urban farms must focus on high-value crops to remain profitable. Additionally, questions about zoning regulations and building codes must be addressed as this practice becomes more widespread.`,
          questions: [
            {
              questionNumber: 5,
              question: 'What is the main topic of this passage?',
              options: [
                { label: 'A', text: 'Traditional farming methods' },
                { label: 'B', text: 'The growth of urban agriculture' },
                { label: 'C', text: 'Environmental problems in cities' },
                { label: 'D', text: 'Technology in rural areas' },
              ],
              correctAnswer: 'B',
            },
            {
              questionNumber: 6,
              question: 'How does urban farming benefit the environment?',
              options: [
                { label: 'A', text: 'It eliminates all pollution' },
                { label: 'B', text: 'It reduces food transportation distances' },
                { label: 'C', text: 'It removes buildings from cities' },
                { label: 'D', text: 'It increases crop variety' },
              ],
              correctAnswer: 'B',
            },
            {
              questionNumber: 7,
              question: 'What advantage do hydroponic systems have?',
              options: [
                { label: 'A', text: 'They require more space' },
                { label: 'B', text: 'They use less water' },
                { label: 'C', text: 'They need more sunlight' },
                { label: 'D', text: 'They produce smaller yields' },
              ],
              correctAnswer: 'B',
            },
            {
              questionNumber: 8,
              question: 'What challenge does urban farming face?',
              options: [
                { label: 'A', text: 'Lack of technology' },
                { label: 'B', text: 'Too much water available' },
                { label: 'C', text: 'High initial investment costs' },
                { label: 'D', text: 'Excessive government support' },
              ],
              correctAnswer: 'C',
            },
          ],
        },
        {
          id: 'reading-set-3',
          type: 'reading',
          setId: 'reading-3',
          points: 8,
          title: 'Passage 3: The Psychology of Social Media',
          passage: `Social media platforms have fundamentally changed how we communicate and share information. While these technologies offer unprecedented opportunities for connection, researchers are increasingly concerned about their psychological effects, particularly on younger users.

One significant issue is the phenomenon of "social comparison." When people view carefully curated posts showcasing others' achievements and happy moments, they may feel their own lives are inadequate by comparison. This can lead to decreased self-esteem and increased anxiety. The problem is exacerbated by the fact that social media often presents an unrealistic, filtered version of reality rather than everyday experiences.

Another concern is the addictive nature of these platforms. Social media companies employ sophisticated algorithms designed to maximize user engagement. Features like infinite scrolling, push notifications, and the intermittent rewards of likes and comments trigger dopamine releases in the brain, similar to gambling mechanisms. This can lead to compulsive checking behavior and difficulty disconnecting.

However, social media isn't inherently negative. When used mindfully, these platforms can strengthen relationships, provide emotional support, and facilitate meaningful connections across distances. The key lies in how we use them. Experts recommend setting time limits, being selective about content consumption, and remembering that online profiles rarely represent complete reality. As with many technologies, social media's impact depends largely on our approach to using it.`,
          questions: [
            {
              questionNumber: 9,
              question: 'What is "social comparison" as described in the passage?',
              options: [
                { label: 'A', text: 'Comparing different social media platforms' },
                { label: 'B', text: 'Measuring one\'s life against others\' posts' },
                { label: 'C', text: 'Analyzing social trends' },
                { label: 'D', text: 'Evaluating friendship quality' },
              ],
              correctAnswer: 'B',
            },
            {
              questionNumber: 10,
              question: 'Why are social media platforms compared to gambling?',
              options: [
                { label: 'A', text: 'Both involve winning money' },
                { label: 'B', text: 'Both are illegal for minors' },
                { label: 'C', text: 'Both trigger similar brain responses' },
                { label: 'D', text: 'Both require skill to succeed' },
              ],
              correctAnswer: 'C',
            },
            {
              questionNumber: 11,
              question: 'What is the author\'s overall stance on social media?',
              options: [
                { label: 'A', text: 'Completely negative' },
                { label: 'B', text: 'Entirely positive' },
                { label: 'C', text: 'Balanced—depends on usage' },
                { label: 'D', text: 'Neutral and indifferent' },
              ],
              correctAnswer: 'C',
            },
            {
              questionNumber: 12,
              question: 'What recommendation do experts make regarding social media use?',
              options: [
                { label: 'A', text: 'Quit all platforms immediately' },
                { label: 'B', text: 'Set time limits and be selective' },
                { label: 'C', text: 'Post more frequently' },
                { label: 'D', text: 'Only use one platform' },
              ],
              correctAnswer: 'B',
            },
          ],
        },

        // 六、混合題（10分）
        {
          id: 'hybrid-set-1',
          type: 'hybrid',
          setId: 'hybrid-1',
          points: 10,
          passage: `Recent studies on sleep patterns reveal important insights into human health. Adults require 7-9 hours of sleep per night for optimal functioning. Chronic sleep deprivation can lead to serious health problems including obesity, diabetes, and cardiovascular disease.

Sleep occurs in cycles, each lasting approximately 90 minutes. A complete night's sleep includes 4-6 cycles, progressing through different stages: light sleep, deep sleep, and REM (rapid eye movement) sleep. Each stage serves distinct physiological functions crucial for memory consolidation, tissue repair, and emotional regulation.`,
          questions: [
            {
              questionNumber: 1,
              question: 'How many hours of sleep do adults need per night?',
              questionType: 'single-choice',
              options: [
                { label: 'A', text: '5-6 hours' },
                { label: 'B', text: '7-9 hours' },
                { label: 'C', text: '10-12 hours' },
                { label: 'D', text: '4-5 hours' },
              ],
              correctAnswer: 'B',
            },
            {
              questionNumber: 2,
              question: 'What health problems can result from chronic sleep deprivation? (Select all that apply)',
              questionType: 'multiple-choice',
              options: [
                { label: 'A', text: 'Obesity' },
                { label: 'B', text: 'Common cold' },
                { label: 'C', text: 'Diabetes' },
                { label: 'D', text: 'Cardiovascular disease' },
                { label: 'E', text: 'Broken bones' },
              ],
              correctAnswer: ['A', 'C', 'D'],
            },
            {
              questionNumber: 3,
              question: 'How long does one sleep cycle last? (Fill in the number in minutes)',
              questionType: 'text-input',
              correctAnswer: '90',
            },
          ],
        },
      ],
    },

    // ===== 第貳部分：非選擇題（28分）=====
    {
      sectionId: 'part-2',
      title: '第貳部分：非選擇題',
      description: '共 28 分',
      totalPoints: 28,
      questions: [
        // 一、翻譯（8分）
        {
          id: 'translation-1',
          type: 'translation',
          questionNumber: 1,
          points: 4,
          chineseText: '隨著科技的進步，人們的生活變得更加便利。',
          correctAnswer: 'With the advancement of technology, people\'s lives have become more convenient.',
          keyPoints: [
            'advancement of technology / technological advancement',
            'people\'s lives',
            'become more convenient',
          ],
        },
        {
          id: 'translation-2',
          type: 'translation',
          questionNumber: 2,
          points: 4,
          chineseText: '保護環境是每個人的責任，我們應該從日常生活中做起。',
          correctAnswer: 'Protecting the environment is everyone\'s responsibility, and we should start from our daily lives.',
          keyPoints: [
            'protecting the environment',
            'everyone\'s responsibility',
            'start from daily lives',
          ],
        },

        // 二、作文（20分）
        {
          id: 'essay-1',
          type: 'essay',
          points: 20,
          prompt: `請根據以下提示寫一篇英文作文：

題目：The Impact of Artificial Intelligence on Education

說明：
人工智慧（AI）正在改變教育的方式。請以「人工智慧對教育的影響」為題，寫一篇至少 120 字的英文作文。文章須包含以下要點：

1. AI 如何改變傳統的教學方式
2. AI 在教育中的優點與挑戰
3. 你對 AI 在未來教育中角色的看法`,
          wordLimit: {
            min: 120,
            max: 180,
          },
          rubric: {
            content: 8,
            organization: 6,
            grammar: 4,
            vocabulary: 2,
          },
        },
      ],
    },
  ],
};
