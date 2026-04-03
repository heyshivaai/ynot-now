'use strict';
// lib/services/anthropic.js — Anthropic API client

var ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || '';
var CLAUDE_MODEL = 'claude-sonnet-4-20250514';

/**
 * Standard Claude API call.
 * @param {string} system    - System prompt
 * @param {string} user      - User message
 * @param {number} maxTokens - Max tokens (default 1200)
 * @returns {Promise<string>} - Response text
 */
async function claudeCall(system, user, maxTokens) {
  var r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens || 1200,
      system: system,
      messages: [{ role: 'user', content: user }]
    })
  });
  if (!r.ok) {
    var t = await r.text().catch(function() { return ''; });
    var err = new Error('Claude ' + r.status + ': ' + t);
    err.status = r.status;
    throw err;
  }
  var data = await r.json();
  return data.content[0].text.trim();
}

/**
 * Claude API call with extended thinking (for Null and Weave agents).
 * Falls back to standard call on failure.
 * @param {string} system        - System prompt
 * @param {string} user          - User message
 * @param {number} maxTokens     - Max tokens for response (default 1200)
 * @param {number} thinkingBudget - Thinking token budget (default 4000)
 * @returns {Promise<string>}    - Response text
 */
async function claudeCallWithThinking(system, user, maxTokens, thinkingBudget) {
  var budget = thinkingBudget || 4000;
  var totalTokens = budget + (maxTokens || 1200);
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interleaved-thinking-2025-05-14'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: totalTokens,
        thinking: { type: 'enabled', budget_tokens: budget },
        system: system,
        messages: [{ role: 'user', content: user }]
      })
    });
    if (!r.ok) {
      var t = await r.text().catch(function() { return ''; });
      console.warn('[YNOT] Extended thinking failed (' + r.status + '), falling back: ' + t.substring(0, 200));
      return claudeCall(system, user, maxTokens);
    }
    var data = await r.json();
    var textBlock = (data.content || []).find(function(b) { return b.type === 'text'; });
    if (!textBlock) throw new Error('no text block in extended thinking response');
    return textBlock.text.trim();
  } catch(e) {
    console.warn('[YNOT] Extended thinking error: ' + e.message + ' — falling back');
    return claudeCall(system, user, maxTokens);
  }
}

module.exports = {
  claudeCall: claudeCall,
  claudeCallWithThinking: claudeCallWithThinking,
  CLAUDE_MODEL: CLAUDE_MODEL
};
