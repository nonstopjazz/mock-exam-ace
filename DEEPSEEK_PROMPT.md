# DeepSeek 單字生成提示詞

## 任務說明
請生成 5545 個學測英文核心單字的完整資料，格式需符合以下規範以便直接匯入系統。

## 輸出格式要求

### JSON 格式（推薦）

```json
{
  ＂vocabularyPack＂: {
    ＂id＂: ＂PACK_GSAT_5545＂,
    ＂title＂: ＂學測核心 5545 單字＂,
    ＂theme＂: ＂學測必備單字＂,
    ＂description＂: ＂涵蓋學測所有必考單字，包含完整音標、例句、同反義詞＂,
    ＂difficulty＂: ＂mixed＂,
    ＂totalWords＂: 5545,
    ＂author＂: ＂DeepSeek AI＂,
    ＂datePublished＂: ＂2025-11-23＂
  },
  ＂words＂: [
    {
      ＂id＂: ＂1＂,
      ＂word＂: ＂abandon＂,
      ＂ipa＂: ＂/əˈbændən/＂,
      ＂translation＂: ＂放棄、遺棄＂,
      ＂partOfSpeech＂: ＂v.＂,
      ＂example＂: ＂They had to abandon their home due to the flood.＂,
      ＂exampleTranslation＂: ＂由於洪水，他們不得不放棄家園。＂,
      ＂synonyms＂: [＂desert＂, ＂forsake＂, ＂give up＂],
      ＂antonyms＂: [＂keep＂, ＂maintain＂, ＂continue＂],
      ＂difficulty＂: ＂intermediate＂,
      ＂category＂: ＂動詞＂,
      ＂level＂: 1,
      ＂tags＂: [＂學測＂, ＂Level 4＂]
    }
  ]
}
```

## 必填欄位清單

每個單字必須包含以下欄位：

### 核心欄位（必填）
- **id**: 流水號字串（＂1＂, ＂2＂, ...）
- **word**: 英文單字（小寫）
- **ipa**: 國際音標（使用 /.../ 格式）
- **translation**: 中文翻譯（可用頓號分隔多個意思）
- **example**: 英文例句（完整句子，首字母大寫，有句號）
- **exampleTranslation**: 例句的中文翻譯
- **level**: 熟練度等級（初始值統一設為 1）

### 重要欄位（強烈建議填寫）
- **partOfSpeech**: 詞性
  - 名詞: ＂n.＂
  - 動詞: ＂v.＂
  - 形容詞: ＂adj.＂
  - 副詞: ＂adv.＂
  - 介系詞: ＂prep.＂
  - 連接詞: ＂conj.＂
  - 代名詞: ＂pron.＂

- **synonyms**: 同義詞陣列（至少 2-3 個）
- **antonyms**: 反義詞陣列（至少 1-2 個，如無則用空陣列 []）
- **difficulty**: 難度等級
  - ＂beginner＂: Level 1-2（國中程度）
  - ＂intermediate＂: Level 3-4（高中基礎）
  - ＂advanced＂: Level 5-6（學測進階）

- **category**: 分類（與 partOfSpeech 對應）
  - ＂名詞＂, ＂動詞＂, ＂形容詞＂, ＂副詞＂ 等

- **tags**: 標籤陣列，包含：
  - ＂學測＂（固定標籤）
  - ＂Level X＂（對應 CEFR 或學測分級）
  - 主題標籤（如 ＂科技＂、＂環境＂、＂社會議題＂ 等）

## 範例資料（前 5 筆）

```json
{
  ＂vocabularyPack＂: {
    ＂id＂: ＂PACK_GSAT_5545＂,
    ＂title＂: ＂學測核心 5545 單字＂,
    ＂theme＂: ＂學測必備單字＂,
    ＂description＂: ＂完整收錄學測必考單字，包含 Level 1-6 分級＂,
    ＂difficulty＂: ＂mixed＂,
    ＂totalWords＂: 5545,
    ＂author＂: ＂DeepSeek AI＂,
    ＂datePublished＂: ＂2025-11-23＂
  },
  ＂words＂: [
    {
      ＂id＂: ＂1＂,
      ＂word＂: ＂abandon＂,
      ＂ipa＂: ＂/əˈbændən/＂,
      ＂translation＂: ＂放棄、遺棄＂,
      ＂partOfSpeech＂: ＂v.＂,
      ＂example＂: ＂They had to abandon their home due to the flood.＂,
      ＂exampleTranslation＂: ＂由於洪水，他們不得不放棄家園。＂,
      ＂synonyms＂: [＂desert＂, ＂forsake＂, ＂give up＂],
      ＂antonyms＂: [＂keep＂, ＂maintain＂, ＂continue＂],
      ＂difficulty＂: ＂intermediate＂,
      ＂category＂: ＂動詞＂,
      ＂level＂: 1,
      ＂tags＂: [＂學測＂, ＂Level 4＂, ＂生活＂]
    },
    {
      ＂id＂: ＂2＂,
      ＂word＂: ＂ability＂,
      ＂ipa＂: ＂/əˈbɪləti/＂,
      ＂translation＂: ＂能力、才能＂,
      ＂partOfSpeech＂: ＂n.＂,
      ＂example＂: ＂She has the ability to learn languages quickly.＂,
      ＂exampleTranslation＂: ＂她有快速學習語言的能力。＂,
      ＂synonyms＂: [＂capability＂, ＂capacity＂, ＂talent＂],
      ＂antonyms＂: [＂inability＂, ＂incapacity＂],
      ＂difficulty＂: ＂beginner＂,
      ＂category＂: ＂名詞＂,
      ＂level＂: 1,
      ＂tags＂: [＂學測＂, ＂Level 2＂, ＂教育＂]
    },
    {
      ＂id＂: ＂3＂,
      ＂word＂: ＂abolish＂,
      ＂ipa＂: ＂/əˈbɑːlɪʃ/＂,
      ＂translation＂: ＂廢除、廢止＂,
      ＂partOfSpeech＂: ＂v.＂,
      ＂example＂: ＂The government decided to abolish the outdated law.＂,
      ＂exampleTranslation＂: ＂政府決定廢除這條過時的法律。＂,
      ＂synonyms＂: [＂eliminate＂, ＂eradicate＂, ＂cancel＂],
      ＂antonyms＂: [＂establish＂, ＂create＂, ＂institute＂],
      ＂difficulty＂: ＂advanced＂,
      ＂category＂: ＂動詞＂,
      ＂level＂: 1,
      ＂tags＂: [＂學測＂, ＂Level 5＂, ＂法律＂, ＂社會議題＂]
    },
    {
      ＂id＂: ＂4＂,
      ＂word＂: ＂abroad＂,
      ＂ipa＂: ＂/əˈbrɔːd/＂,
      ＂translation＂: ＂在國外、到國外＂,
      ＂partOfSpeech＂: ＂adv.＂,
      ＂example＂: ＂Many students choose to study abroad.＂,
      ＂exampleTranslation＂: ＂許多學生選擇出國留學。＂,
      ＂synonyms＂: [＂overseas＂, ＂internationally＂],
      ＂antonyms＂: [＂domestically＂, ＂home＂],
      ＂difficulty＂: ＂beginner＂,
      ＂category＂: ＂副詞＂,
      ＂level＂: 1,
      ＂tags＂: [＂學測＂, ＂Level 2＂, ＂旅遊＂, ＂教育＂]
    },
    {
      ＂id＂: ＂5＂,
      ＂word＂: ＂absence＂,
      ＂ipa＂: ＂/ˈæbsəns/＂,
      ＂translation＂: ＂缺席、不在＂,
      ＂partOfSpeech＂: ＂n.＂,
      ＂example＂: ＂His absence from the meeting was noticed by everyone.＂,
      ＂exampleTranslation＂: ＂大家都注意到他沒有出席會議。＂,
      ＂synonyms＂: [＂nonattendance＂, ＂absenteeism＂],
      ＂antonyms＂: [＂presence＂, ＂attendance＂],
      ＂difficulty＂: ＂intermediate＂,
      ＂category＂: ＂名詞＂,
      ＂level＂: 1,
      ＂tags＂: [＂學測＂, ＂Level 3＂, ＂學校＂]
    }
  ]
}
```

## 品質要求

### 音標
- 使用標準國際音標（IPA）
- 格式：`/音標/`（兩側用斜線包覆）
- 美式發音優先

### 例句
- 長度：10-20 字為佳
- 難度：符合高中生理解程度
- 內容：生活化、實用、符合台灣情境
- 必須是完整句子（有主詞、動詞、結尾標點）

### 同反義詞
- 同義詞：至少 2-3 個
- 反義詞：至少 1-2 個（若無明確反義詞可留空陣列）
- 使用常見單字，避免過於艱深

### 標籤
- 每個單字至少包含：
  - ＂學測＂（固定）
  - ＂Level X＂（1-6 級）
  - 1-2 個主題標籤（如：科技、環境、健康、教育等）

## 輸出要求

1. **完整性**：確保所有 5545 個單字都包含所有必填欄位
2. **一致性**：格式、風格、難度分級保持一致
3. **正確性**：音標、翻譯、例句需經過驗證
4. **可用性**：生成的 JSON 檔案需能直接被程式解析

## 檔案命名

生成完成後，請將檔案命名為：
```
gsat_5545_vocabulary.json
```

## 驗證檢查

生成後請自我檢查：
- [ ] JSON 格式正確（可用 JSON validator 驗證）
- [ ] 總字數 = 5545
- [ ] 所有 id 唯一且連續（1-5545）
- [ ] 所有必填欄位都有填寫
- [ ] 音標格式統一（/.../ 格式）
- [ ] 例句都有中文翻譯
- [ ] difficulty 只有三種值：beginner/intermediate/advanced
- [ ] level 初始值都是 1

---

## CSV 格式（備選方案）

如果 JSON 生成困難，也可以使用 CSV 格式：

### CSV 表頭
```csv
id,word,ipa,translation,partOfSpeech,example,exampleTranslation,synonyms,antonyms,difficulty,category,level,tags
```

### CSV 範例（陣列使用 | 分隔）
```csv
1,abandon,/əˈbændən/,放棄、遺棄,v.,They had to abandon their home due to the flood.,由於洪水他們不得不放棄家園。,desert|forsake|give up,keep|maintain|continue,intermediate,動詞,1,學測|Level 4|生活
2,ability,/əˈbɪləti/,能力、才能,n.,She has the ability to learn languages quickly.,她有快速學習語言的能力。,capability|capacity|talent,inability|incapacity,beginner,名詞,1,學測|Level 2|教育
```

**注意**：
- 欄位若包含逗號，需用雙引號包覆
- 陣列類型（synonyms/antonyms/tags）使用 `|` 分隔
- 檔名：`gsat_5545_vocabulary.csv`

---

## 參考資源

- 學測單字分級：參考大考中心公告的 Level 1-6 單字表
- 音標來源：Cambridge Dictionary / Oxford Dictionary
- 例句難度：高中英文課本程度（約 CEFR A2-B2）

請按照此規範生成完整的 5545 個單字資料。生成完成後，我可以直接匯入到字卡系統中使用。
