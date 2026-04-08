const AI = {
  getAPIUrl() {
    return Storage.get('memoir_api_endpoint') || 'https://api.deepseek.com/v1/chat/completions';
  },

  getAPIKey() {
    return Storage.get('memoir_api_key') || '';
  },

  getModel() {
    return 'deepseek-chat';
  },

  getConfig() {
    return {
      role: Storage.getAiRole(),
      rules: Storage.getAiRules()
    };
  },

  async chat(messages, options = {}) {
    const { mode = 'L1', systemPrompt = null } = options;

    const rolePrompt = this.getConfig().role;
    const rulesPrompt = this.getConfig().rules;

    const systemMessage = systemPrompt || this.getSystemPrompt(mode, rolePrompt, rulesPrompt);

    const requestMessages = [
      { role: 'system', content: systemMessage },
      ...messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    ];

    const apiKey = this.getAPIKey();
    if (!apiKey) {
      return {
        success: false,
        error: '请先在设置中配置API密钥'
      };
    }

    try {
      const response = await fetch(this.getAPIUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: this.getModel(),
          messages: requestMessages,
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        let errorMsg = 'API请求失败';
        try {
          const error = await response.json();
          errorMsg = error.error?.message || error.message || `HTTP ${response.status}`;
        } catch (e) {
          errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      return {
        success: true,
        content: data.choices[0].message.content,
        usage: data.usage
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  getSystemPrompt(mode, role, rules) {
    let modeInstruction = '';

    switch (mode) {
      case 'L1':
        modeInstruction = `【模式：记录档】
你的回复要极其简短（5个字以内），仅表示收到，不做任何追问或评论。
例如回复："收到"、"嗯"、"好的，请继续"或"明白"。
禁止：不要提问、不要追问、不要评论内容、不要感叹。`;
        break;

      case 'L2':
        modeInstruction = `【模式：倾听档】
你的回复要简短（10-30字），表达简短共情，不提问。
例如回复："听起来很温馨"、"那确实很难忘"、"很感人的回忆"。
禁止：不要追问、不要长篇评论、保持简洁。`;
        break;

      case 'L3':
        modeInstruction = `【模式：互动档】
你的回复要自然流畅（30-80字），专注于引导用户顺畅地进行回忆和叙述。

回复要求：
1. 对用户讲述的内容给予温暖的情感回应
2. 用简短的话语鼓励用户继续说下去
3. 可以自然地提及用户刚说的某个细节，示意你在认真倾听
4. 适时用"后来呢？"/"那是什么时候的事？"/"还有吗？"等简短问句引导

示例回复：
"听起来那是一段很温暖的时光……后来还有发生什么吗？"

"那个场景真的很生动，能不能再多说一些？"

禁止：不要列出选项、不要让用户选择、不要一次问太多问题。`;
        break;
    }

    return `${role}

${rules}

${modeInstruction}

【名词库调用】
当你识别到用户提到的人物或地点时：
- 如果是模糊称谓（如"王刚"），在回复末尾标注：[名词待确认:王刚]
- 如果是全名，直接使用，不需要标注`;
  },

  async analyzeTime(naturalInput) {
    const config = this.getConfig();

    const prompt = `你是时间分析专家。请从用户的自然语言描述中提取时间信息。

用户输入：${naturalInput}

请按以下JSON格式返回分析结果（只返回JSON，不要其他内容）：
{
  "date": "如果能确定具体日期，格式YYYY-MM-DD，否则为null",
  "period": "时间段描述，如：1985年夏季、1990年代、童年时期等",
  "year": "如能确定年份，返回4位数字，否则为null"
}`;

    const result = await this.chat([
      { role: 'user', content: prompt }
    ], { mode: 'L1' });

    if (result.success) {
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error('Parse time analysis error:', e);
      }
    }

    return {
      date: null,
      period: naturalInput,
      year: null
    };
  },

  async detectNouns(text) {
    const prompt = `请分析以下文本，识别出所有人物和地点的专有名词（包括模糊称谓和全名）。

文本：${text}

请按以下JSON格式返回识别到的名词列表：
{
  "characters": [
    {"mention": "提到的称谓", "isAmbiguous": true/false, "note": "说明"}
  ],
  "locations": [
    {"mention": "提到的地名", "isAmbiguous": true/false, "note": "说明"}
  ]
}

只返回JSON，不要其他内容。`;

    const result = await this.chat([
      { role: 'user', content: prompt }
    ], { mode: 'L1' });

    if (result.success) {
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error('Parse noun detection error:', e);
      }
    }

    return { characters: [], locations: [] };
  },

  async refineContent(content, instruction) {
    const config = this.getConfig();

    const prompt = `你是一位专业的回忆录文字整理助手。请根据用户的指令调整文章内容。

【原文】
${content}

【指令】
${instruction}

请直接返回调整后的文章内容，不要解释，不要说明。`;

    const result = await this.chat([
      { role: 'user', content: prompt }
    ], { mode: 'L1' });

    if (result.success) {
      return {
        success: true,
        content: result.content
      };
    }

    return {
      success: false,
      error: result.error
    };
  },

  async generateFollowups(context) {
    const prompt = `基于以下对话内容，生成3个自然的追问问题，帮助用户深入挖掘更多细节。

对话上下文：
${context}

请按以下格式返回（只返回JSON，不要其他内容）：
{
  "followups": [
    "问题1",
    "问题2",
    "问题3"
  ]
}`;

    const result = await this.chat([
      { role: 'user', content: prompt }
    ], { mode: 'L1' });

    if (result.success) {
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]).followups || [];
        }
      } catch (e) {
        console.error('Parse followups error:', e);
      }
    }

    return [];
  }
};
