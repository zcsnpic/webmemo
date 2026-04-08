const Github = {
  BASE_URL: 'https://api.github.com',

  getConfig() {
    return {
      token: Storage.getGithubToken(),
      repo: Storage.getRepoName()
    };
  },

  isConfigured() {
    const config = this.getConfig();
    return config.token && config.repo;
  },

  async request(method, path, body = null) {
    const config = this.getConfig();
    if (!config.token || !config.repo) {
      throw new Error('GitHub未配置');
    }

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.BASE_URL}${path}`, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `GitHub API错误: ${response.status}`);
    }

    return data;
  },

  async validateConnection() {
    try {
      const config = this.getConfig();
      const user = await this.request('GET', '/user');
      const repo = await this.request('GET', `/repos/${config.repo}`);

      await this.ensureBasicStructure();

      return {
        success: true,
        user: user.login,
        repo: repo.full_name
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async ensureBasicStructure() {
    const config = this.getConfig();

    const requiredPaths = [
      'articles/.gitkeep',
      'conversations/.gitkeep',
      'glossary.json',
      'index.json'
    ];

    for (const path of requiredPaths) {
      try {
        await this.request('GET', `/repos/${config.repo}/contents/${path}`);
      } catch (e) {
        const content = path.endsWith('.json')
          ? path === 'glossary.json' ? '{"items":[],"updated_at":""}' : '{}'
          : '';
        await this.request('PUT', `/repos/${config.repo}/contents/${path}`, {
          message: `Initialize ${path}`,
          content: btoa(unescape(encodeURIComponent(content)))
        });
      }
    }
  },

  async getFile(path) {
    try {
      const config = this.getConfig();
      const data = await this.request('GET', `/repos/${config.repo}/contents/${path}`);
      if (data.content) {
        return {
          content: decodeURIComponent(escape(atob(data.content))),
          sha: data.sha
        };
      }
      return null;
    } catch (e) {
      if (e.message.includes('Not Found')) {
        return null;
      }
      throw e;
    }
  },

  async saveFile(path, content, message = 'Update file') {
    const config = this.getConfig();
    let sha = null;

    try {
      const existing = await this.request('GET', `/repos/${config.repo}/contents/${path}`);
      sha = existing.sha;
    } catch (e) {
      // 文件不存在，使用sha = null
    }

    const payload = {
      message: message,
      content: btoa(unescape(encodeURIComponent(content)))
    };

    if (sha) {
      payload.sha = sha;
    }

    return await this.request('PUT', `/repos/${config.repo}/contents/${path}`, payload);
  },

  async deleteFile(path, message = 'Delete file') {
    const config = this.getConfig();

    try {
      const existing = await this.request('GET', `/repos/${config.repo}/contents/${path}`);
      return await this.request('DELETE', `/repos/${config.repo}/contents/${path}`, {
        message,
        sha: existing.sha
      });
    } catch (e) {
      if (e.message.includes('Not Found')) {
        return { success: true };
      }
      throw e;
    }
  },

  getMemoryPath(memory) {
    const title = memory.title.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 50);
    const date = memory.date ? memory.date.substring(0, 10) : new Date().toISOString().substring(0, 10);
    return `articles/${memory.category}/${title}_${date}.md`;
  },

  async saveMemory(memory) {
    const index = Storage.getMemoryIndex();
    const memoryPath = this.getMemoryPath(memory);

    const frontmatter = this.generateFrontmatter(memory);
    const fileContent = frontmatter + '\n\n' + (memory.content || '');

    await this.saveFile(memoryPath, fileContent, `update: ${memory.title}`);

    const existing = index.findIndex(m => m.id === memory.id);
    if (existing >= 0) {
      index[existing] = {
        id: memory.id,
        title: memory.title,
        category: memory.category,
        date: memory.date,
        updatedAt: new Date().toISOString()
      };
    } else {
      index.push({
        id: memory.id,
        title: memory.title,
        category: memory.category,
        date: memory.date,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    Storage.setMemoryIndex(index);

    await this.saveIndex();

    return { success: true };
  },

  async deleteMemory(memory) {
    const index = Storage.getMemoryIndex();
    const memoryPath = this.getMemoryPath(memory);

    await this.deleteFile(memoryPath, `delete: ${memory.title}`);

    const newIndex = index.filter(m => m.id !== memory.id);
    Storage.setMemoryIndex(newIndex);

    await this.saveIndex();

    return { success: true };
  },

  generateFrontmatter(memory) {
    const lines = ['---'];

    lines.push(`title: "${memory.title}"`);
    if (memory.originalTitle) {
      lines.push(`original_title: "${memory.originalTitle}"`);
    }
    if (memory.date) {
      lines.push(`date: "${memory.date}"`);
    }
    if (memory.period) {
      lines.push(`period: "${memory.period}"`);
    }
    if (memory.location) {
      lines.push(`location: "${memory.location}"`);
    }
    if (memory.tags && memory.tags.length > 0) {
      lines.push(`tags: [${memory.tags.map(t => `"${t}"`).join(', ')}]`);
    }
    if (memory.characters && memory.characters.length > 0) {
      lines.push(`characters: [${memory.characters.map(c => `"${c}"`).join(', ')}]`);
    }
    if (memory.summary) {
      lines.push(`summary: "${memory.summary}"`);
    }
    if (memory.aiMode) {
      lines.push(`ai_mode: "${memory.aiMode}"`);
    }
    if (memory.dialogueTurns !== undefined) {
      lines.push(`dialogue_turns: ${memory.dialogueTurns}`);
    }

    lines.push(`created_at: "${memory.createdAt || new Date().toISOString()}"`);
    lines.push(`updated_at: "${new Date().toISOString()}"`);

    lines.push('---');

    return lines.join('\n');
  },

  parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) return { frontmatter: {}, body: content };

    const yamlStr = match[1];
    const body = content.slice(match[0].length);

    const frontmatter = {};
    const lines = yamlStr.split('\n');
    let currentKey = null;
    let currentArray = [];
    let inArray = false;

    for (const line of lines) {
      const keyMatch = line.match(/^(\w+):\s*(.*)$/);

      if (keyMatch) {
        if (inArray && currentKey) {
          frontmatter[currentKey] = currentArray;
          currentArray = [];
          inArray = false;
        }

        currentKey = keyMatch[1];
        const value = keyMatch[2].trim();

        if (value.startsWith('[') && value.endsWith(']')) {
          const arrayContent = value.slice(1, -1);
          if (arrayContent.trim()) {
            frontmatter[currentKey] = arrayContent.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
          } else {
            frontmatter[currentKey] = [];
          }
          currentKey = null;
        } else if (value) {
          frontmatter[currentKey] = value.replace(/^["']|["']$/g, '');
        }
      } else if (line.trim().startsWith('-')) {
        inArray = true;
        const value = line.trim().slice(1).trim().replace(/^["']|["']$/g, '');
        if (value) {
          currentArray.push(value);
        }
      } else if (line.trim() === '' && inArray) {
        frontmatter[currentKey] = currentArray;
        currentArray = [];
        inArray = false;
        currentKey = null;
      }
    }

    if (inArray && currentKey) {
      frontmatter[currentKey] = currentArray;
    }

    return { frontmatter, body };
  },

  async getIndex() {
    const data = await this.getFile('index.json');
    if (data) {
      return JSON.parse(data.content);
    }
    return { categories: [], memories: [], updated_at: '' };
  },

  async saveIndex() {
    const index = {
      categories: Storage.getCategories(),
      memories: Storage.getMemoryIndex(),
      updated_at: new Date().toISOString()
    };
    await this.saveFile('index.json', JSON.stringify(index, null, 2), 'update: index');
  },

  async syncGlossary(glossary) {
    const data = {
      items: glossary,
      updated_at: new Date().toISOString()
    };
    return await this.saveFile('glossary.json', JSON.stringify(data, null, 2), 'update: glossary');
  },

  async getGlossary() {
    const data = await this.getFile('glossary.json');
    if (data) {
      const parsed = JSON.parse(data.content);
      return parsed.items || [];
    }
    return [];
  },

  async saveConversation(memoryId, messages) {
    const path = `conversations/${memoryId}.json`;
    const data = {
      memoryId,
      messages,
      updated_at: new Date().toISOString()
    };
    return await this.saveFile(path, JSON.stringify(data, null, 2), `update conversation: ${memoryId}`);
  },

  async getConversation(memoryId) {
    const path = `conversations/${memoryId}.json`;
    const data = await this.getFile(path);
    if (data) {
      return JSON.parse(data.content);
    }
    return null;
  },

  async loadAllMemories() {
    const index = await this.getIndex();
    Storage.setCategories(index.categories || []);
    Storage.setMemoryIndex(index.memories || []);

    return {
      categories: index.categories || [],
      memories: index.memories || []
    };
  },

  async fullSync() {
    const indexData = await this.getIndex();
    Storage.setCategories(indexData.categories || []);
    Storage.setMemoryIndex(indexData.memories || []);

    const glossaryData = await this.getGlossary();
    Storage.setGlossary(glossaryData);

    return {
      categories: indexData.categories,
      memories: indexData.memories,
      glossary: glossaryData
    };
  }
};
