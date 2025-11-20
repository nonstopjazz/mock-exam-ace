import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 生成學測英文試卷上傳 Excel 模板
 * 使用方式：npm install xlsx 後執行 ts-node scripts/generate-exam-template.ts
 */

// 工作表 1: 試卷基本資訊
const examInfoHeaders = [
  '試卷ID*',
  '試卷名稱*',
  '年份*',
  '月份*',
  '難度*',
  '總分*',
  '建議時間(分鐘)',
  '上傳日期*',
  '備註'
];

const examInfoExample = [
  'EXAM_2024_001',
  '113年學測英文模擬試題',
  '2024',
  '1',
  '中等',
  '100',
  '100',
  '2024-03-15',
  '第一次模擬考'
];

// 工作表 2: 單字題
const vocabularyHeaders = [
  '題號*',
  '試卷ID*',
  '題目*',
  '選項A*',
  '選項B*',
  '選項C*',
  '選項D*',
  '正確答案*',
  '詳解*',
  'Level標籤*',
  '主題標籤*',
  '配分*'
];

const vocabularyExample = [
  '1',
  'EXAM_2024_001',
  'The company is ___ to expand its business overseas.',
  'eager',
  'anxious',
  'worried',
  'concerned',
  'A',
  'eager 表示「渴望的」，最符合積極擴展的語境。anxious 暗含焦慮不安，worried 表示擔心，concerned 表示關切，均不適合此處的正面語境。',
  '4',
  '商業,職場,企業管理',
  '2'
];

// 工作表 3: 克漏字組別
const clozeGroupHeaders = [
  '組別ID*',
  '試卷ID*',
  '組別序號*',
  '文章標題',
  '文章內容*',
  '文章翻譯',
  '主題標籤*'
];

const clozeGroupExample = [
  'CLOZE_G1',
  'EXAM_2024_001',
  '1',
  '全球暖化的影響',
  'In recent years, global warming __1__ a serious problem. Scientists __2__ that temperatures have been rising steadily. This trend __3__ to have significant impacts on our environment. Many species __4__ to adapt to these rapid changes. If we __5__ action now, the consequences could be devastating.',
  '近年來，全球暖化已成為嚴重問題。科學家指出溫度一直在穩定上升。這個趨勢預計會對我們的環境產生重大影響。許多物種正在努力適應這些快速變化。如果我們現在不採取行動，後果可能是毀滅性的。',
  '環境,氣候變遷,科學'
];

// 工作表 4: 克漏字題目
const clozeQuestionHeaders = [
  '題號*',
  '組別ID*',
  '空格序號*',
  '選項A*',
  '選項B*',
  '選項C*',
  '選項D*',
  '正確答案*',
  '詳解*',
  '文法標籤*',
  'Level標籤',
  '片語標籤',
  '配分*'
];

const clozeQuestionExample = [
  '11',
  'CLOZE_G1',
  '1',
  'has become',
  'have become',
  'was becoming',
  'had become',
  'A',
  '主詞 global warming 為單數不可數名詞，且表示已經持續至今的狀態，應使用現在完成式 has become。have become 用於複數主詞，was becoming 為過去進行式，had become 為過去完成式，均不適合。',
  '現在完成式,主動詞一致',
  '5',
  'become + adj',
  '2'
];

// 工作表 5: 文意選填組別
const wordFillGroupHeaders = [
  '組別ID*',
  '試卷ID*',
  '文章標題',
  '文章內容*',
  '文章翻譯',
  '選項數量*',
  '選項列表*',
  '主題標籤*'
];

const wordFillGroupExample = [
  'WORDFILL_G1',
  'EXAM_2024_001',
  '人工智慧的發展',
  'Artificial intelligence is __21__ rapidly in many fields. The technology has the potential to __22__ our daily lives significantly. However, some experts express __23__ about its impact on employment. Despite these concerns, most researchers believe that AI will create new opportunities for __24__.',
  '人工智慧在許多領域正在快速發展。這項技術有潛力顯著改變我們的日常生活。然而，一些專家對其對就業的影響表示擔憂。儘管有這些擔憂，大多數研究人員相信AI會為創新創造新機會。',
  '12',
  '(A)developing (B)rapidly (C)significantly (D)transform (E)innovation (F)concerns (G)employment (H)potential (I)technology (J)researchers (K)opportunities (L)impact',
  '科技,AI,創新'
];

// 工作表 6: 文意選填題目
const wordFillQuestionHeaders = [
  '題號*',
  '組別ID*',
  '空格序號*',
  '正確答案*',
  '詳解*',
  '文法標籤*',
  'Level標籤',
  '片語標籤',
  '配分*'
];

const wordFillQuestionExample = [
  '21',
  'WORDFILL_G1',
  '1',
  'A',
  '此處需要動詞的現在分詞形式，根據上下文「人工智慧正在發展」，應選擇 (A)developing。rapidly 為副詞不能單獨作謂語。',
  '現在進行式,動詞形式',
  '5',
  'be + V-ing',
  '2'
];

// 工作表 7: 篇章結構組別
const structureGroupHeaders = [
  '組別ID*',
  '試卷ID*',
  '文章標題',
  '文章內容*',
  '文章翻譯',
  '選項數量*',
  '選項A*',
  '選項B*',
  '選項C*',
  '選項D*',
  '選項E',
  '主題標籤*'
];

const structureGroupExample = [
  'STRUCT_G1',
  'EXAM_2024_001',
  '咖啡的歷史',
  'Coffee is one of the most popular beverages in the world. __41__ The plant was first discovered in Ethiopia centuries ago. __42__ From there, coffee cultivation spread to the Arabian Peninsula. __43__ Today, coffee is grown in more than 70 countries. __44__ The global coffee industry now employs millions of people worldwide.',
  '咖啡是世界上最受歡迎的飲料之一。這種植物在幾個世紀前首次在埃塞俄比亞被發現。從那裡，咖啡種植傳播到阿拉伯半島。今天，咖啡在70多個國家種植。全球咖啡產業現在在全世界雇用了數百萬人。',
  '5',
  'However, the exact origins of coffee remain somewhat mysterious.',
  'This discovery would change the beverage industry forever.',
  'Many people believe that coffee has significant health benefits.',
  'The coffee trade became an important part of global commerce.',
  'Different brewing methods can produce vastly different flavors.'
];

// 工作表 8: 篇章結構題目
const structureQuestionHeaders = [
  '題號*',
  '組別ID*',
  '空格序號*',
  '正確答案*',
  '詳解*',
  '題型標籤*',
  '配分*'
];

const structureQuestionExample = [
  '41',
  'STRUCT_G1',
  '1',
  'A',
  '空格前提到咖啡是最受歡迎的飲料，空格後提到首次在埃塞俄比亞被發現，選項A「然而，咖啡的確切起源仍有些神秘」以 However 轉折，最能連接前後文。',
  '轉折句,邏輯連貫',
  '2'
];

// 工作表 9: 閱讀測驗組別
const readingGroupHeaders = [
  '組別ID*',
  '試卷ID*',
  '組別序號*',
  '文章標題',
  '文章內容*',
  '文章翻譯',
  '文章類型',
  '主題標籤*'
];

const readingGroupExample = [
  'READ_G1',
  'EXAM_2024_001',
  '1',
  '再生能源的未來',
  'Renewable energy sources have become increasingly important in recent years. Solar and wind power are now cost-competitive with traditional fossil fuels in many regions. Governments worldwide are investing heavily in clean energy infrastructure. This transition is essential for reducing carbon emissions and combating climate change. However, challenges remain, including energy storage and grid integration. Despite these obstacles, experts predict that renewable energy will dominate the global energy market by 2050.',
  '再生能源近年來變得越來越重要。在許多地區，太陽能和風能現在在成本上與傳統化石燃料具有競爭力。世界各國政府正在大力投資清潔能源基礎設施。這一轉變對於減少碳排放和應對氣候變化至關重要。然而，挑戰依然存在，包括能源儲存和電網整合。儘管存在這些障礙，專家預測到2050年再生能源將主導全球能源市場。',
  '說明文',
  '能源,環保,科技'
];

// 工作表 10: 閱讀測驗題目
const readingQuestionHeaders = [
  '題號*',
  '組別ID*',
  '題目*',
  '選項A*',
  '選項B*',
  '選項C*',
  '選項D*',
  '正確答案*',
  '詳解*',
  '題型標籤*',
  'Level標籤',
  '片語標籤',
  '配分*'
];

const readingQuestionExample = [
  '45',
  'READ_G1',
  'What is the main idea of the passage?',
  'Renewable energy is too expensive',
  'Solar power is the best energy source',
  'Renewable energy is becoming more important',
  'Traditional energy should be completely abandoned',
  'C',
  '文章主旨在於說明再生能源日益重要（increasingly important），並提到成本競爭力、政府投資等支持論點。選項A與文中「cost-competitive」矛盾，選項B過於絕對，選項D文中未提及應完全放棄傳統能源，只有選項C最符合主旨。',
  '主旨題',
  '5',
  'become + adj',
  '2'
];

// 工作表 11: 混合題組別
const mixedGroupHeaders = [
  '組別ID*',
  '試卷ID*',
  '文章標題',
  '文章內容*',
  '附加圖表',
  '文章翻譯',
  '主題標籤*'
];

const mixedGroupExample = [
  'MIXED_G1',
  'EXAM_2024_001',
  '海洋塑膠污染',
  'Ocean plastic pollution has reached alarming levels. According to recent studies, approximately 8 million tons of plastic enter the oceans each year. The chart below shows plastic consumption by country in 2023. Asian countries account for 60% of global plastic waste. Marine life is severely affected, with countless species ingesting plastic debris.',
  '[圖表：2023年各國塑膠消耗量 - 中國35%, 印度15%, 美國10%, 其他亞洲國家20%, 歐洲12%, 其他8%]',
  '海洋塑膠污染已達到驚人的程度。根據最近的研究，每年約有800萬噸塑膠進入海洋。下面的圖表顯示了2023年各國的塑膠消耗量。亞洲國家佔全球塑膠廢物的60%。海洋生物受到嚴重影響，無數物種攝入塑膠碎片。',
  '環境,海洋,污染'
];

// 工作表 12: 混合題題目
const mixedQuestionHeaders = [
  '題號*',
  '組別ID*',
  '題目類型*',
  '題目*',
  '選項A',
  '選項B',
  '選項C',
  '選項D',
  '正確答案*',
  '詳解*',
  '題型標籤*',
  'Level標籤',
  '片語標籤',
  '配分*'
];

const mixedQuestionExample = [
  '57',
  'MIXED_G1',
  '選擇',
  'According to the chart, which region has the highest plastic consumption?',
  'China',
  'India',
  'United States',
  'Europe',
  'A',
  '根據圖表數據，中國的塑膠消耗量為35%，是所有國家/地區中最高的。印度15%、美國10%、歐洲12%均低於中國。',
  '圖表題,資訊統整',
  '4,5',
  'according to',
  '2'
];

// 工作表 13: 翻譯題
const translationHeaders = [
  '題號*',
  '試卷ID*',
  '中文題目*',
  '參考答案*',
  '評分標準*',
  '詳解*',
  '文法標籤*',
  'Level標籤',
  '片語標籤',
  '主題標籤*',
  '配分*'
];

const translationExample = [
  'T1',
  'EXAM_2024_001',
  '隨著科技進步，人們的生活變得更加便利。',
  'With the advancement of technology, people\'s lives have become more convenient.',
  '句型結構2分，單字使用2分，文法正確2分，整體流暢度2分',
  '重點：\n1.「隨著」可用 with, as, along with\n2.「進步」可用 advancement, progress, development\n3.「變得」用現在完成式 have become 表示持續至今的變化\n4.「便利」用 convenient 或 more convenient',
  '現在完成式,比較級,介系詞片語',
  '5,6',
  'with the advancement of, become + adj',
  '科技,生活',
  '8'
];

// 工作表 14: 作文題
const essayHeaders = [
  '題號*',
  '試卷ID*',
  '作文題目*',
  '作文類型*',
  '字數要求*',
  '評分標準*',
  '範文',
  '寫作提示',
  '錯誤類型標籤*',
  '主題標籤*',
  '配分*'
];

const essayExample = [
  'E1',
  'EXAM_2024_001',
  '請以「我最難忘的一次旅行」為題，寫一篇至少120字的英文作文。文章必須包含：1) 旅行的時間和地點 2) 發生的特別事件 3) 這次旅行對你的影響',
  '記敘文',
  '120',
  '內容(5分)、組織(5分)、文法(5分)、字彙(5分)、拼字標點(2分)\n\n評分細節：\n內容：切題性、完整性、創意性\n組織：段落分明、邏輯清晰、前後連貫\n文法：時態正確、句型多樣、無重大錯誤\n字彙：用字精確、拼字正確、詞彙豐富\n標點：標點符號使用正確',
  'Last summer, I had an unforgettable trip to Japan with my family. We visited Kyoto, a city famous for its ancient temples and beautiful gardens.\n\nThe most memorable experience was when we participated in a traditional tea ceremony. The host taught us the proper way to prepare and serve matcha tea. Although the process was complicated, it was fascinating to learn about Japanese culture firsthand.\n\nThis trip broadened my horizons and deepened my appreciation for different cultures. I realized that traveling is not just about sightseeing, but also about understanding and respecting cultural differences. This experience inspired me to learn more about world cultures and become a more open-minded person.',
  '寫作提示：\n1. 開頭：簡述旅行時間、地點\n2. 主體：詳細描述難忘的事件或經歷\n3. 結尾：反思這次旅行的意義或影響\n4. 注意使用過去式描述事件\n5. 可使用連接詞增加文章流暢度（however, although, moreover等）',
  '時態錯誤,主動詞一致,冠詞使用,拼字錯誤,標點符號,句子不完整,中式英文,詞彙誤用',
  '旅行,個人經驗,文化',
  '20'
];

function generateExcelTemplate() {
  // 創建新的工作簿
  const wb = XLSX.utils.book_new();

  // 工作表 1: 試卷基本資訊
  const ws1 = XLSX.utils.aoa_to_sheet([
    examInfoHeaders,
    examInfoExample,
    ['', '', '', '', '(簡單/中等/困難)', '', '', '(YYYY-MM-DD)', '']
  ]);
  XLSX.utils.book_append_sheet(wb, ws1, '1.試卷基本資訊');

  // 工作表 2: 單字題
  const ws2 = XLSX.utils.aoa_to_sheet([
    vocabularyHeaders,
    vocabularyExample,
    ['', '', '', '', '', '', '', '(A/B/C/D)', '', '(3-6)', '(多個用逗號分隔)', '']
  ]);
  XLSX.utils.book_append_sheet(wb, ws2, '2.單字題');

  // 工作表 3: 克漏字組別
  const ws3 = XLSX.utils.aoa_to_sheet([
    clozeGroupHeaders,
    clozeGroupExample,
    ['', '', '', '', '(用__1__, __2__標示空格)', '', '(多個用逗號分隔)']
  ]);
  XLSX.utils.book_append_sheet(wb, ws3, '3.克漏字組別');

  // 工作表 4: 克漏字題目
  const ws4 = XLSX.utils.aoa_to_sheet([
    clozeQuestionHeaders,
    clozeQuestionExample,
    ['', '', '', '', '', '', '', '(A/B/C/D)', '', '(多個用逗號分隔)', '(3-6)', '', '']
  ]);
  XLSX.utils.book_append_sheet(wb, ws4, '4.克漏字題目');

  // 工作表 5: 文意選填組別
  const ws5 = XLSX.utils.aoa_to_sheet([
    wordFillGroupHeaders,
    wordFillGroupExample,
    ['', '', '', '(用__21__, __22__標示空格)', '', '(10或12)', '(格式：(A)word (B)word...)', '(多個用逗號分隔)']
  ]);
  XLSX.utils.book_append_sheet(wb, ws5, '5.文意選填組別');

  // 工作表 6: 文意選填題目
  const ws6 = XLSX.utils.aoa_to_sheet([
    wordFillQuestionHeaders,
    wordFillQuestionExample,
    ['', '', '', '(A-L)', '', '(多個用逗號分隔)', '(3-6)', '', '']
  ]);
  XLSX.utils.book_append_sheet(wb, ws6, '6.文意選填題目');

  // 工作表 7: 篇章結構組別
  const ws7 = XLSX.utils.aoa_to_sheet([
    structureGroupHeaders,
    structureGroupExample,
    ['', '', '', '(用__41__, __42__標示空格)', '', '(4或5)', '', '', '', '', '(5個選項時填寫)', '(多個用逗號分隔)']
  ]);
  XLSX.utils.book_append_sheet(wb, ws7, '7.篇章結構組別');

  // 工作表 8: 篇章結構題目
  const ws8 = XLSX.utils.aoa_to_sheet([
    structureQuestionHeaders,
    structureQuestionExample,
    ['', '', '', '(A-E)', '', '(多個用逗號分隔)', '']
  ]);
  XLSX.utils.book_append_sheet(wb, ws8, '8.篇章結構題目');

  // 工作表 9: 閱讀測驗組別
  const ws9 = XLSX.utils.aoa_to_sheet([
    readingGroupHeaders,
    readingGroupExample,
    ['', '', '', '', '(完整文章)', '', '(說明文/議論文/記敘文)', '(多個用逗號分隔)']
  ]);
  XLSX.utils.book_append_sheet(wb, ws9, '9.閱讀測驗組別');

  // 工作表 10: 閱讀測驗題目
  const ws10 = XLSX.utils.aoa_to_sheet([
    readingQuestionHeaders,
    readingQuestionExample,
    ['', '', '', '', '', '', '', '(A/B/C/D)', '', '(主旨題/細節題/推論題/詞彙題)', '(3-6)', '', '']
  ]);
  XLSX.utils.book_append_sheet(wb, ws10, '10.閱讀測驗題目');

  // 工作表 11: 混合題組別
  const ws11 = XLSX.utils.aoa_to_sheet([
    mixedGroupHeaders,
    mixedGroupExample,
    ['', '', '', '(完整文章)', '(圖表描述或URL)', '', '(多個用逗號分隔)']
  ]);
  XLSX.utils.book_append_sheet(wb, ws11, '11.混合題組別');

  // 工作表 12: 混合題題目
  const ws12 = XLSX.utils.aoa_to_sheet([
    mixedQuestionHeaders,
    mixedQuestionExample,
    ['', '', '(選擇/填空/配對/排序)', '', '', '', '', '', '(依題型而定)', '', '(多個用逗號分隔)', '(3-6)', '', '']
  ]);
  XLSX.utils.book_append_sheet(wb, ws12, '12.混合題題目');

  // 工作表 13: 翻譯題
  const ws13 = XLSX.utils.aoa_to_sheet([
    translationHeaders,
    translationExample,
    ['', '', '', '', '', '', '(多個用逗號分隔)', '(3-6)', '', '(多個用逗號分隔)', '']
  ]);
  XLSX.utils.book_append_sheet(wb, ws13, '13.翻譯題');

  // 工作表 14: 作文題
  const ws14 = XLSX.utils.aoa_to_sheet([
    essayHeaders,
    essayExample,
    ['', '', '', '(記敘/議論/說明)', '(最少字數)', '', '', '', '(多個用逗號分隔)', '(多個用逗號分隔)', '']
  ]);
  XLSX.utils.book_append_sheet(wb, ws14, '14.作文題');

  // 設置欄寬
  const wscols = [
    { wch: 15 },  // 題號/ID
    { wch: 20 },  // 試卷ID/組別ID
    { wch: 60 },  // 內容/題目
    { wch: 30 },  // 選項
    { wch: 30 },
    { wch: 30 },
    { wch: 30 },
    { wch: 12 },  // 答案
    { wch: 80 },  // 詳解
    { wch: 25 },  // 標籤
    { wch: 25 },
    { wch: 10 }   // 配分
  ];

  // 為每個工作表設置欄寬
  [ws1, ws2, ws3, ws4, ws5, ws6, ws7, ws8, ws9, ws10, ws11, ws12, ws13, ws14].forEach(ws => {
    ws['!cols'] = wscols;
  });

  // 寫入文件
  const outputDir = path.join(process.cwd(), 'templates');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, '學測英文試卷上傳模板.xlsx');
  XLSX.writeFile(wb, outputPath);

  console.log('✅ Excel 模板已成功生成！');
  console.log(`📁 文件位置: ${outputPath}`);
  console.log('\n📝 使用說明：');
  console.log('1. 必填欄位標示 * 號');
  console.log('2. 標籤欄位使用英文逗號分隔多個值');
  console.log('3. 組別ID用於關聯文章和題目');
  console.log('4. 文章中用 __1__, __2__ 標示空格位置');
  console.log('5. 正確答案使用大寫字母 A/B/C/D/E');
  console.log('\n🎯 下一步：');
  console.log('1. 填寫試卷基本資訊');
  console.log('2. 依題型填寫對應工作表');
  console.log('3. 確保所有必填欄位都已填寫');
  console.log('4. 檢查格式符合規範');
  console.log('5. 上傳至系統');
}

// 執行生成
try {
  generateExcelTemplate();
} catch (error) {
  console.error('❌ 生成模板時發生錯誤:', error);
  process.exit(1);
}
