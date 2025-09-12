const OpenAI = require('openai');

class AIExtractor {
  constructor(apiKey) {
    this.openai = new OpenAI({
      apiKey: apiKey,
      // Add other OpenAI configuration as needed
    });
  }

  async extractTarget(htmlContent, userPrompt) {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a web automation expert. Extract the target element selector from the HTML content based on the user\'s request.'
          },
          {
            role: 'user',
            content: `HTML Content:\n${htmlContent}\n\nUser Request:\n${userPrompt}`
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error(`Error extracting target: ${error.message}`);
      throw error;
    }
  }
}

module.exports = AIExtractor;